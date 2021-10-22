// adapter
// polls or subscribes to data via plugins, updates cache,
// updates shdr strings, passes them to agent via tcp.

// when adapter.js is run, it expects config in /data/setup and /data/models.
// /data/setup includes setup.yaml, which includes a list of devices to setup.

import net from 'net' // node lib for tcp
// import { v4 as uuid } from 'uuid' // see https://github.com/uuidjs/uuid - may be used by inputs/outputs yaml js
import * as lib from './lib.js'
import { Cache } from './cache.js'
import { getMacros, compileExpressions } from './helpers.js'

// default server if none provided in model.yaml
const defaultServer = { protocol: 'shdr', host: 'adapter', port: 7878 }

// file system inputs
const driversFolder = './drivers' // eg mqtt-json - must start with '.'
// these folders are defined in pipeline.yaml with docker volume mappings
const setupFolder = '/data/setup' // incls setup.yaml etc
const modulesFolder = `/data/modules` // incls print-apply/module.xml etc

console.log(`Ladder99 Adapter`)
console.log(`Polls/subscribes to data, writes to cache, transforms to SHDR,`)
console.log(`posts to TCP.`)
console.log(`----------------------------------------------------------------`)

async function main() {
  // read /data/setup/setup.yaml file
  const setup = readSetupYaml()

  // define cache shared across all devices and sources
  const cache = new Cache()

  // iterate over device definitions from setup.yaml file
  const { devices } = setup
  for (const device of devices) {
    console.log(`Device`, device)
    const deviceId = device.id
    const deviceName = device.name

    // each device gets a tcp connection to the agent
    console.log(`Creating TCP server for Agent to connect to...`)
    const tcp = net.createServer()

    // handle tcp connection from agent.
    // need to do this BEFORE registering plugins because those need the socket,
    // so know where to send SHDR strings.
    tcp.on('connection', async socket => {
      const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`
      console.log('New client connection from Agent at', remoteAddress)

      // each device can have multiple sources.
      // iterate over sources, load driver for that source, call init on it.
      for (const source of device.sources) {
        console.log(`Source`, source)
        const { module, driver, protocol, host, port } = source

        // import driver plugin
        const pathDriver = `${driversFolder}/${driver}.js` // eg './drivers/mqtt-json.js'
        console.log(`Importing driver code: ${pathDriver}...`)
        const { AdapterDriver } = await import(pathDriver)
        const plugin = new AdapterDriver()

        // get input handlers
        const pathInputs = `${modulesFolder}/${module}/inputs.yaml`
        console.log(`Reading ${pathInputs}...`)
        const inputs = lib.importYaml(pathInputs) || {}

        // get output handlers
        // output yamls should all follow the same format, unlike input yamls.
        const pathOutputs = `${modulesFolder}/${module}/outputs.yaml`
        console.log(`Reading ${pathOutputs}...`)
        const outputTemplates = (lib.importYaml(pathOutputs) || {}).outputs

        // get types, if any
        const pathTypes = `${modulesFolder}/${module}/types.yaml`
        console.log(`Reading ${pathTypes}...`)
        const types = (lib.importYaml(pathTypes) || {}).types

        if (outputTemplates) {
          // compile value js strings from outputs.yaml.
          // outputs is array of {key: string, value: function, dependsOn: string[]}.
          // eg [{ key: 'ac1-power_condition', value: 'FAULT', dependsOn: ['ac1-power_fault', 'ac1-power_warning'] }, ...]
          const outputs = getOutputs({
            templates: outputTemplates,
            types,
            deviceId,
          })

          // add outputs for each source to cache
          cache.addOutputs(outputs, socket)
        }

        //. transform input values to input value fns here if needed?
        // ie value:=<on>+<off> would be translated to a fn with those cache lookups.
        // vs value:'%M56.1' which would use the lookup fn
        // or stick .valueFn onto the input object, which call with cache.
        // might want to provide types in the closure also, when call eval.
        if (inputs.handlers) {
          // iterate over handlers
          const handlers = Object.values(inputs.handlers)
          for (let handler of handlers) {
            // // iterate over keys and parts
            // const keys = Object.keys(handler.inputs || {})
            // for (let key of keys) {
            //   const part = handler.inputs[key]
            //   console.log('key,part', key, part)
            //   // replace part with { code, valueFn } if starts with '='
            //   if (typeof part === 'string' && part.startsWith('=')) {
            //     const code = part.slice(1) // eg '<foo> + 1'
            //     const { value, dependsOn } = getValueFn(deviceId, code, types)
            //     handler.inputs[key] = { code, value }
            //   }
            // }

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
          }
        }

        // initialize driver plugin
        // note: this must be done AFTER getOutputs and addOutputs,
        // as that is where the dependsOn values are set, and this needs those.
        console.log(`Initializing driver for ${driver}...`)
        plugin.init({
          deviceId,
          deviceName,
          driver,
          protocol,
          host,
          port,
          cache,
          inputs,
          socket,
          types,
        })
      }

      // handle incoming data - get PING from agent, return PONG
      socket.on('data', pingPong)

      function pingPong(buffer) {
        const str = buffer.toString().trim()
        if (str === '* PING') {
          const response = '* PONG 5000' //. msec - where get from?
          console.log(`Received PING from Agent - sending PONG:`, response)
          socket.write(response + '\n')
        } else {
          console.log('Received data:', str.slice(0, 20), '...')
        }
      }
    })

    // start tcp server for Agent to listen to, eg at adapter:7878
    //. rename to server(s)
    const { destinations } = device
    //. just handle one server/destination for now
    const server = destinations ? destinations[0] : defaultServer
    console.log(`Listen for Agent on TCP socket at`, server, `...`)
    // try {
    tcp.listen(server.port, server.host, () => {
      console.log(`Listening...`)
    })
    // } catch (error) {
    //   if (error.code === 'ENOTFOUND') {
    //     console.log(
    //       `TCP socket at ${destination.host}:${destination.port} not found.`
    //     )
    //   } else {
    //     throw error
    //   }
    // }
  }
}

main()

// get cache outputs from from outputs.yaml templates - do substitutions etc.
// each element defines a shdr output.
// templates is from outputs.yaml - array of { key, category, type, value, ... }.
// types is from types.yaml - object of objects with key:values.
// returns array of {key: string, value: int|str, dependsOn: string[]}.
// eg [{ key: 'ac1-power_condition', value: 'FAULT', dependsOn: ['ac1-power_fault', 'ac1-power_warning']}, ...]
// note: types IS used - it's in the closure formed by eval(str).
function getOutputs({ templates, types, deviceId }) {
  // console.log('getOutputs - iterate over output templates')
  const outputs = templates.map(template => {
    const { value, dependsOn } = getValueFn(deviceId, template.value, types)
    // get output object
    // eg {
    //   key: 'ac1-power_condition',
    //   value: cache => cache.get('pr1-avail').value,
    //   dependsOn: ['ac1-power_fault', 'ac1-power_warning'],
    //   category: 'CONDITION',
    //   type: 'VOLTAGE_DC',
    //   representation: undefined,
    // }
    const output = {
      // this is key in sense of shdr key
      //. assume each starts with deviceId? some might end with a number instead
      //. call this id, as it's such in the agent.xml
      key: `${deviceId}-${template.key}`,
      value, //. getValue or valueFn
      dependsOn,
      //. currently these need to be defined in the outputs.yaml file,
      // instead of using the types in the module.xml file -
      // will need to fix that.
      category: template.category, // needed for cache getShdr fn
      type: template.type, // ditto
      representation: template.representation, // ditto
      nativeCode: template.nativeCode, //. ?
    }
    return output
  })
  return outputs
}

// get valueFn and dependsOn array from a js code statement
// eg "<foo>" becomes cache=>cache.get(`${deviceId}-foo`)
//. call this getReferences - let caller do the fn eval - that's out of place here
function getValueFn(deviceId, code = '', types = {}) {
  // replace all occurrences of <key> with `cache.get('...')`.
  // eg <status_faults> => cache.get(`${deviceId}-status_faults`)
  // note: .*? is a non-greedy match, so doesn't eat other occurrences also.
  const regexp1 = /(<(.*?)>)/gm
  // eg "<power_fault> ? 'FAULT' : <power_warning> ? 'WARNING' : 'NORMAL'"
  // eg "cache.get('ac1-power_fault') ? 'FAULT' : cache.get('ac1-power_warning') ? 'WARNING' : 'NORMAL'"
  // should be okay to ditch replaceAll because we have /g for the regexp
  // valueStr = valueStr.replaceAll( // needs node15
  //. test this with two cache refs in a string "<foo> + <bar>" etc
  code = code.replace(
    regexp1,
    `cache.get('${deviceId}-$2')` // $2 is the matched substring
  )
  if (code.includes('\n')) {
    code = '{\n' + code + '\n}'
  }

  // define the value function //. call it valueFn?
  const value = (cache, $, keyvalues) => eval(code)

  // get list of cache ids this calculation depends on.
  // get AFTER transforms, because user could specify a cache get manually.
  // eg dependsOn = ['ac1-power_fault', 'ac1-power_warning']
  const dependsOn = []
  const regexp2 = /cache\.get\('(.*?)'\)/gm
  let match
  while ((match = regexp2.exec(code)) !== null) {
    const key = match[1]
    dependsOn.push(key)
  }
  //. sort/uniquify dependsOn array
  return { value, dependsOn }
}

// load setup, eg from setups/ccs-pa/setup.yaml
function readSetupYaml() {
  const yamlfile = `${setupFolder}/setup.yaml`
  console.log(`Reading ${yamlfile}...`)
  const yamltree = lib.importYaml(yamlfile)
  const setup = yamltree
  if (!setup) {
    console.log(`No ${yamlfile} available - please add one.`)
    process.exit(1)
  }
  return setup
}
