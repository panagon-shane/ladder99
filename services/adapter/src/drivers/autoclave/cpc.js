// cpc autoclave driver

// CPC (Composite Processing Control) is ASC's flagship software and
// control system designed specifically for control of composite
// processes in autoclaves, ovens, presses, formers, and bond tools.
// Since its creation, CPC has been at the forefront of composite technology.
// CPC has evolved over the last 31-years and is now the leader in the
// control of autoclaves and ovens. Most Tier I, II, and III aerospace
// companies standardize their controls on CPC. Every day, more than
// 1500 pieces of equipment are controlled by CPC.

import net from 'net' // node lib for tcp - https://nodejs.org/api/net.html

const pollInterval = 2000 // msec

// these functions transform values received from cpc depending on
// the type specified in eg modules/autoclave/asc/inputs.yaml.
const typeFns = {
  undefined: value => value,
  boolean: value => value === 'True',
  message: value => value.split('\r\n')[0], // just keep first line of msg
}

export class AdapterDriver {
  init({ deviceId, host, port, cache, inputs }) {
    console.log(`CPC Initialize driver...`)
    cache.set(`${deviceId}-avail`, 'UNAVAILABLE')

    // get ids and query string
    const ids = inputs.inputs.map(input => `${deviceId}-${input.key}`) // eg ['ac1-operator_name', 'ac1-recipe_description', ...]
    const paths = inputs.inputs.map(input => input.path).join(',') // the cpc property path string, eg '.Autoclave.Alarms.ControlPower...,...'
    const types = inputs.inputs.map(input => input.type) // eg [undefined, undefined, boolean, ...]
    const query = `PathListGet:ReadValues:${paths}` // eg 'PathListGet:ReadValues:.Autoclave.Alarms.ControlPower\Condition,...'
    console.log('CPC ids', ids)
    console.log('CPC query', query)

    console.log(`CPC driver connecting to TCP server at`, { host, port }, '...')
    const client = net.connect(port, host)

    // connected to device - poll it for data by writing a command
    client.on('connect', () => {
      console.log(`CPC driver connected...`)
      cache.set(`${deviceId}-avail`, 'AVAILABLE')
      poll() // first poll
      setInterval(poll, pollInterval) // subsequent polls
    })

    // receive data from device, write to cache, output shdr to agent
    client.on('data', data => {
      const str = data.toString() // eg 'PathListGet:ReadValues:=,True,Joshau Schneider,254.280816,,0'
      console.log(`CPC driver received ${str.slice(0, 255)}...`)
      const valuesStr = str.split(':=')[1]
      // note: for the list of messages, it sends one after the other -
      // after the first one it doesn't include the :=, so this will return null.
      // so can ignore those, since we just want the first line.
      if (valuesStr) {
        const values = valuesStr.split(',') // eg ['', 'True', 'Joshau Schneider', ...]
        // write values to cache, which will output shdr to agent
        ids.forEach((id, i) => {
          const type = types[i] // eg 'boolean'
          const typeFn = typeFns[type] // eg value => value==='True'
          const value = typeFn(values[i]) // eg true
          cache.set(id, value) // set cache value, which triggers shdr output
        })
      }
    })

    client.on('error', error => {
      console.log(error)
    })

    client.on('end', () => {
      console.log('CPC driver disconnected from server...')
    })

    // 'poll' device using tcp client.write - will receive data in 'data' events
    function poll() {
      console.log(`CPC driver writing ${query}...`)
      client.write(query + '\r\n')
    }
  }
}