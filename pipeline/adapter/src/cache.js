// cache
// manages a set of key-item pairs.

// this is an intermediary between the raw device data and the shdr output.

// when a key-item value is set, the cache will perform any associated output
// calculations and send shdr output to attached tcp socket, IF value changed.

//. eg ___

// import { lightFormat } from 'date-fns'
// import { formatISO9075 } from 'date-fns'
import dayjs from 'dayjs'

// const includeTimestamp = true
const includeTimestamp = false // save some time/space by not including in shdr

export class Cache {
  constructor() {
    this._map = new Map() // key-item pairs //. why not just {} ?
    this._mapKeyToOutputs = {} // list of outputs assoc with each key
  }

  // addOutputs
  // each cache key can have multiple output calculations associated with it.
  // this builds a map from a key to a list of outputs.
  // each output goes to the same socket.
  // output is [{ key, category, type, representation, socket, dependsOn, value }, ...]
  // eg [{ key: 'ac1-power_condition', value: (fn), dependsOn: ['ac1-power_fault', 'ac1-power_warning'] }, ...]
  addOutputs(outputs, socket) {
    console.log(`cache.addOutputs - add ${outputs.length} outputs`)
    for (const output of outputs) {
      // console.log(output.key, output.dependsOn)
      output.socket = socket // attach tcp socket to each output also
      // add dependsOn eg ['ac1-power_fault', 'ac1-power_warning']
      for (const key of output.dependsOn) {
        if (this._mapKeyToOutputs[key]) {
          this._mapKeyToOutputs[key].push(output)
        } else {
          this._mapKeyToOutputs[key] = [output]
        }
      }
    }
  }

  // set a key-value pair in the cache.
  // eg set('ac1-power_warning', true)
  set(key, value) {
    console.log('cache.set', key, String(value).slice(0, 99))
    // update the cache value
    this._map.set(key, value)
    // get list of outputs associated with this key
    // eg ['ac1-power_condition']
    const outputs = this._mapKeyToOutputs[key] || []
    // calculate outputs and send dependent shdr values to tcp
    for (const output of outputs) {
      // calculate value of this cache output
      const value = getValue(this, output)
      // send shdr to agent via tcp socket if value changed
      if (value !== output.lastValue) {
        const shdr = getShdr(this, output, value)
        // console.log('shdr', shdr)
        console.log(`shdr changed - sending to tcp - ${shdr.slice(0, 60)}...`)
        output.socket.write(shdr + '\n')
        output.lastValue = value
      }
    }
  }

  // get a value from cache
  // eg get('pr1-avail')
  get(key) {
    return this._map.get(key)
  }
}

// calculate value for the given cache output (can use other cache keyvalues)
function getValue(cache, output) {
  //. rename .value to .getValue or .valueFn
  const { value: getValue } = output
  const value = getValue(cache) // do calculation
  return value
}

// calculate SHDR using the given output object.
// cache is the Cache object.
// output has { key, category, type, representation, value, shdr, ... }.
//. eg ____
function getShdr(cache, output, value) {
  const timestamp = new Date().toISOString() //. get from item
  // const timestamp = dayjs().format()
  // const timestamp = lightFormat(new Date(), "yyyy-MM-dd'T'HH:mm:ss") //. get from item
  // const timestamp = formatISO9075(new Date()) // datetime but uses zulu time
  const head = includeTimestamp ? timestamp + '|' : '' // timestamp is optional for cppagent
  const { key, category, type, subType, representation, nativeCode } = output
  let shdr = ''
  // handle different shdr types and representations
  // this first is the default representation, so don't require category to be defined in outputs.yaml
  if (category === 'EVENT' || category === 'SAMPLE' || category === undefined) {
    if (type === 'MESSAGE') {
      // The next special format is the Message. There is one additional field,
      // native_code, which needs to be included:
      // 2014-09-29T23:59:33.460470Z|message|CHG_INSRT|Change Inserts
      // From https://github.com/mtconnect/cppagent#adapter-agent-protocol-version-17 -
      shdr = `${head}${key}|${nativeCode}|${value}`
    } else {
      //. shouldn't this be dataitemId, not key?
      shdr = `${head}${key}|${value}`
    }
  } else if (category === 'CONDITION') {
    //. pick these values out of the value, which should be an object
    //. also, can have >1 value for a condition - how handle?
    const level = value // eg 'WARNING' -> element 'Warning'
    const nativeCode = 'nativeCode'
    const nativeSeverity = 'nativeSeverity'
    const qualifier = 'qualifier'
    // const message = value + ' (msg here)'
    const message = value
    shdr = `${head}${key}|${level}|${nativeCode}|${nativeSeverity}|${qualifier}|${message}`
  } else {
    console.warn(`warning: unknown category '${category}'`)
  }
  return shdr
}
