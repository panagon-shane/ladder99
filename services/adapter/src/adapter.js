// adapter
// polls or subscribes to data via plugins, updates cache,
// updates shdr strings, passes them to agent via tcp.

import net from 'net' // node lib for tcp
import * as lib from './lib.js'
import { Cache } from './cache.js'
import {
  getOutputs,
  getPlugin,
  getMacros,
  compileExpressions,
} from './helpers.js'

// default server if none provided in model.yaml
const defaultServer = { protocol: 'shdr', host: 'adapter', port: 7878 }

// file system inputs
const driversFolder = './drivers' // eg mqtt-json - must start with '.'

// these folders may be defined in compose.yaml with docker volume mappings.
// when adapter.js is run, it expects config in /data/setup and /data/models.
// /data/setup includes setup.yaml, which includes a list of devices to setup.
const setupFolder = process.env.L99_SETUP_FOLDER || `/data/setup`
const modulesFolder = process.env.L99_MODULES_FOLDER || `/data/modules` // incls print-apply/module.xml etc

console.log()
console.log(`Ladder99 Adapter`)
console.log(`Polls/subscribes to data, writes to cache, transforms to SHDR,`)
console.log(`posts to TCP.`)
console.log(`----------------------------------------------------------------`)

async function main() {
  // read client setup.yaml file
  const setup = lib.readSetup(setupFolder)

  // define cache shared across all devices and sources
  const cache = new Cache()

  // iterate over device definitions from setup.yaml file
  const client = setup.client || {}
  const devices = setup.devices || []
  for (const device of devices) {
    //
    // console.log(`Device`, device) // don't print - might have passwords
    const deviceId = device.id
    const deviceName = device.name

    // each device gets a separate tcp connection to the agent
    console.log(`Adapter - creating TCP server for Agent to connect to...`)
    const tcp = net.createServer()
    tcp.on('connection', onConnection) // handle connection from agent

    // each device can have multiple sources.
    // iterate over sources, load driver for that source, call init on it.
    for (const source of device.sources) {
      // console.log(`source`, source) // don't print - might have password etc
      const { module, driver, protocol, host, port, connection } = source

      // import driver plugin
      const plugin = await getPlugin(driversFolder, driver)

      // get input handlers
      // these are interpreted by the driver
      const pathInputs = `${modulesFolder}/${module}/inputs.yaml`
      console.log(`Adapter reading ${pathInputs}...`)
      const inputs = lib.importYaml(pathInputs) || {}

      // get output handlers
      // output yamls should all follow the same format, unlike input yamls.
      const pathOutputs = `${modulesFolder}/${module}/outputs.yaml`
      console.log(`Adapter reading ${pathOutputs}...`)
      const outputTemplates = (lib.importYaml(pathOutputs) || {}).outputs

      // get types, if any
      const pathTypes = `${modulesFolder}/${module}/types.yaml`
      console.log(`Adapter reading ${pathTypes}...`)
      const types = (lib.importYaml(pathTypes) || {}).types

      if (outputTemplates) {
        // compile value js strings from outputs.yaml.
        // source.outputs is array of {key: string, value: function, dependsOn: string[]}.
        // eg [{ key: 'ac1-power_condition', value: 'FAULT', dependsOn: ['ac1-power_fault', 'ac1-power_warning'] }, ...]
        // save those outputs onto the source object, so can call setSocket later.
        source.outputs = getOutputs({
          templates: outputTemplates,
          types,
          deviceId,
        })

        // add outputs for each source to cache
        cache.addOutputs(source.outputs)
      }

      // iterate over handlers
      const handlers = Object.values(inputs.handlers || [])
      for (let handler of handlers) {
        // get macros (regexs to extract references from code)
        const prefix = deviceId + '-'
        const macros = getMacros(prefix, handler.accessor)

        // parse input handler code, get dependency graph, compile fns
        // eg maps could be { addr: { '%Z61.0': Set(1) { 'has_current_job' } }, ...}
        // use like
        //   const keys = [...maps.addr['%Z61.0']] // = ['has_current_job', 'foo_bar']
        // so can know what formulas need to be evaluated for some given addr
        const { augmentedExpressions, maps } = compileExpressions(
          handler.expressions,
          macros
        )
        handler.augmentedExpressions = augmentedExpressions
        handler.maps = maps

        // get set of '=' exprs to always run
        handler.alwaysRun = new Set()
        for (let key of Object.keys(augmentedExpressions)) {
          const expr = augmentedExpressions[key]
          if (expr.always) {
            handler.alwaysRun.add(key)
          }
        }
      }

      // initialize driver plugin
      // note: this must be done AFTER getOutputs and addOutputs,
      // as that is where the dependsOn values are set, and this needs those.
      console.log(`Adapter initializing driver for ${driver}...`)
      plugin.init({
        client,
        deviceId,
        deviceName,
        //. why not just pass the whole device object? incl connection object etc
        device,
        driver,
        //. pass whole drivers array here also, in case driver needs to know other devices?
        // eg for jobboss - needs to know what workcenters/devices to look for.
        devices,
        //. will consolidate some of this stuff into a connection object
        protocol,
        host,
        port,
        cache,
        inputs,
        //.. socket, // usually drivers communicate with agent via cache, but this is useful for testing etc
        types,
        connection,
      })
    }

    async function onConnection(socket) {
      const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`
      console.log('Adapter - new client connection from Agent', remoteAddress)

      // tell cache about this socket
      for (let source of device.sources) {
        cache.setSocket(source.outputs, socket)
      }

      // handle incoming data - get PING from agent, return PONG
      socket.on('data', onData)

      socket.on('error', onError)

      // handle errors
      // eg "This socket has been ended by the other party"
      function onError(error) {
        console.log(error)
        //. now try to reconnect
      }

      // handle ping/pong messages to/from agent,
      // so agent knows we're alive.
      function onData(buffer) {
        const str = buffer.toString().trim()
        if (str === '* PING') {
          const response = '* PONG 5000' //. msec - where get from?
          // console.log(`Received PING from Agent - sending PONG:`, response)
          socket.write(response + '\n')
        } else {
          console.log('Received data:', str.slice(0, 20), '...')
        }
      }
    }

    // start tcp server for Agent to listen to, eg at adapter:7878
    //. rename to server(s)?
    const { destinations } = device

    //. just handle one server/destination for now
    const server = destinations ? destinations[0] : defaultServer
    console.log(`Adapter - listen for Agent on TCP socket at`, server, `...`)

    // begin accepting connections on the specified port and host from agent.
    tcp.listen(server.port, server.host)
  }
}

main()
