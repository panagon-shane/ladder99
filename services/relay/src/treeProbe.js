// companion functions for dataProbe.js

import * as lib from './common/lib.js'

// these are the only elements we want to pick out of the probe xml.
//. add Description elements - will add to Device obj
const appendTags = lib.getSet('Device,DataItem,Composition')

// don't recurse down these elements - not interested in them or their children
const skipTags = lib.getSet('Agent')

// ignore these element types for path parts - they don't add much info to the path,
// as they're just containers.
const ignoreTags = lib.getSet(
  'Adapters,AssetCounts,Components,Compositions,Configurations,DataItems,Devices,Filters,Specifications'
)

//. assume for now there there is only one of these in path, so can just lower case them
//. in future, do two passes to determine if need to uniquify them,
// eg add name in brackets eg 'tank[high]'
//. or use an aliases table to refer by number or name or id to a dataitem?
// 2022-03-17 removed PartOccurrence,ProcessOccurrence,Systems from set
const plainTags = lib.getSet(
  // 'Axes,Controller,EndEffector,Feeder,PartOccurrence,Path,Personnel,ProcessOccurrence,Resources,Systems'
  'Axes,Controller,EndEffector,Feeder,Path,Personnel,Resources'
)

// started to do this, but no need to call these out explicitly -
// the default behavior is to do this for any unknown tag - so can just
// remove from plainTags above.
// const useNameOrIdTags = lib.getSet('PartOccurrence,ProcessOccurrence,Systems')

// ignore these DataItem attributes - not necessary to identify an element
// in a path step, are accounted for explicitly, or are redundant.
// any other attributes would be included, eg '-statistic=average'
//. maybe do other way around - list of attributes to include?
const ignoreAttributes = lib.getSet(
  'id,name,type,subType,compositionId,category,discrete,_key,tag,parents,units,nativeUnits,device'
)

//

// get flat list of elements from given json by recursing through probe structure.
// just gets Device and DataItem elements for now.
// eg json = { MTConnectDevices: { Header, Devices: { Agent, Device }}}
//   with Device = { _attributes, Description, DataItems, Components: { Axes, Controller, Systems }}
//   and DataItems = { DataItem: [ { _attributes: { id:'avail', type, category }}, ...]}
// returns [{
//   node_type: 'DataItem',
//   path: 'availability',
//   id: 'avail',
//   type: 'AVAILABILITY',
//   category: 'EVENT',
//   device: 'Device(VMC-3Axis, 000)'
// }, ...]
export function getElements(json) {
  const objs = []
  recurse(json, objs)
  // transform the json objects a bit
  const elements = objs.map(obj => {
    const node_type = obj.tag // eg 'Device', 'DataItem'
    const path = obj.steps && obj.steps.filter(step => !!step).join('/')
    const element = { node_type, path, ...obj } // copy object, put node_type and path first
    // remove unneeded attributes
    delete element.tag
    delete element.steps
    return element
  })
  return elements
}

// // transform json tree to flat list of object structures,
// // filtering out unwanted elements.
// // eg for json = { MTConnectDevices: { Devices: { Device: [...] }}}
// // returns [
// //   { node_type: 'Device', path, id, name, uuid },
// //   { node_type: 'DataItem', path, id, name, category, type, subType },
// // ...]
// //. merge this with getElements or getNodes? this doesn't do much, adds confusion
// export function getObjects(elements) {
//   const objs = elements.map(element => {
//     const node_type = element.tag // eg 'Device', 'DataItem'
//     const path = element.steps && element.steps.filter(step => !!step).join('/')
//     const obj = { node_type, path, ...element } // copy object, put node_type and path first
//     // remove unneeded attributes
//     delete obj.tag
//     delete obj.steps
//     return obj
//   })
//   return objs
// }

// do nothing fn - used as default/fallback
const ignore = () => {}

// we've read the xml and converted it to json, and the way the library stores
// attributes and text is with _attributes and _text properties.
// these fns pull that data out from the `value` and stick them into the `obj`.
//. pull out fns?
const elementHandlers = {
  // handle attributes - append attributes from the object `value` to obj
  // eg obj = { foo: 123 }
  // value = { id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
  // obj becomes { foo: 123, id: 'd1', name: 'M12346', uuid: 'M80104K162N'}
  _attributes: (obj, value) =>
    Object.keys(value).forEach(key => (obj[key] = value[key])),
  // handle text/value, eg value = 'Mill w/Smooth-G'
  _text: (obj, value) => (obj.value = value),
}

//

// traverse a tree of elements, adding them to an array
// el can be an object, an array, or an atomic value, eg
//   { MTConnectDevices: { Header, Devices: { Agent, Device }}}
// objs is a growing flat list of objects we're interested in from the els,
//   eg [{ tag: 'DataItem', path, category, id, name }, ...]
// tag is the key for the current element, eg 'DataItem' - blank for root element.
// parents is a list of parent elements that grows as we recurse through the tree.
//. refactor
//. handle parents differently - do in separate pass?
function recurse(el, objs, tag = '', parents = []) {
  // handle object with keyvalue pairs
  if (lib.isObject(el)) {
    // make object, which translates the json element to something usable.
    // tag is eg 'DataItem'
    // parents is list of ancestors - will be deleted before return.
    // start object, eg { tag: 'DataItem', parents: [ {}, {}, {}, ... ] }
    let obj = { tag, parents }

    // add obj to list if one of certain tags (eg Device, DataItem)
    if (appendTags.has(tag)) objs.push(obj)

    // get keyvalue pairs to recurse, skipping some tags (eg Agent)
    const pairs = Object.entries(el).filter(([key]) => !skipTags.has(key))

    // iterate over keyvalue pairs, handling each as needed
    // eg if el is a Device element
    // with key='_attributes', value={ id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
    // this would add those attributes to the object obj,
    // giving { tag, parents, id, name, uuid }.
    // then recurse with the value as the element el.
    for (const [key, value] of pairs) {
      const handler = elementHandlers[key] || ignore // get keyvalue handler
      handler(obj, value) // adds value data to obj
      const newparents = [...parents, obj] // push obj onto parents path list
      recurse(value, objs, key, newparents) // recurse
    }

    // get steps (path parts) for devices and dataitems
    if (tag === 'Device') {
      // for Device get single step as an array, eg ['cnc1']
      obj.steps = [obj].map(getPathStep)
      //
    } else {
      // for DataItem, Composition, or other,
      // save device element, eg { tag, id, name, uuid }
      obj.device = getPathStep(obj.parents[3])

      // save steps for rest of path to an array
      // will convert this to a full path string later
      // eg ['axes', 'x', 'position-actual']
      obj.steps = [...obj.parents.slice(4), obj].map(getPathStep)
    }

    // get rid of the parents array
    delete obj.parents
    //
  } else if (Array.isArray(el)) {
    // handle array of subelements
    for (const subel of el) {
      recurse(subel, objs, tag, parents) // recurse
    }
  } else {
    // ignore atomic values
    // console.log('>>what is this?', { el })
  }
}

//----------------------------------------------------------

// get path step for the given object
// eg, for a Device element, return 'Device(Mazak31, M41283-12A)'
// for a DataItem element, return 'position-actual'
function getPathStep(obj) {
  let params = []
  if (!obj) return ''
  if (ignoreTags.has(obj.tag)) return ''
  // handle plain tags, eg Path - for now just convert to 'path'.
  //. will want to do two passes - if >1 of same path, add name in brackets, eg 'path[x]'?
  if (plainTags.has(obj.tag)) return lib.getCamelCase(obj.tag) // eg 'processOccurrence'
  let step = ''
  switch (obj.tag) {
    case 'Device':
      // standard says name might be optional in future versions,
      // so could just use uuid, eg step = `Device(${obj.uuid})`.
      // BUT for the mazak machines, uuid is not actually unique across the installation -
      // they seem to be using it for model number. so name helps uniquify this.
      // step = `Device(${obj.name}, ${obj.uuid})`
      // step = `Device[${obj.name}, ${obj.uuid}]` //. try this
      step = `Device[${obj.name || obj.uuid}]` //. how about this?
      break

    case 'DataItem':
      // add primary params
      params = [obj.type] // eg ['position']
      if (obj.subType) params.push(obj.subType) // eg ['position', 'actual']

      //. follow compositionId to get the type
      // if path still not unique, will add composition name in brackets also

      //. do this later
      // // add named params to help uniquify the path, eg ['temperature', 'statistic=average']
      // let namedParams = []
      // for (const key of Object.keys(obj)) {
      //   if (!ignoreAttributes.has(key)) {
      //     namedParams.push(key + '=' + obj[key])
      //   }
      // }
      // namedParams.sort()
      // for (const namedParam of namedParams) {
      //   params.push(namedParam)
      // }

      // add condition to end
      if (obj.category === 'CONDITION') {
        params.push('condition')
      }

      // now convert the list of parameters to a path step string,
      // eg ['foo_bar', 'baz'] -> 'foo_bar-baz'
      step = getParamsStep(params)
      break

    // case 'Specification':
    // case 'Composition':
    //   // params = [obj.type]
    //   // if (obj.subType) params.push(obj.subType)
    //   step = '?'
    //   break

    default:
      // params = [obj.name || obj.id || '']
      //..
      step = (obj.name || obj.id || '').toLowerCase()
      break
  }
  return step
}

// get step string for the given array of params.
// eg ['temperature', 'statistic=average'] => 'temperature-statistic=average'
function getParamsStep(params) {
  const paramsStr =
    // params.length > 0 && params[0].length > 0
    params.length > 0 && params[0] && params[0].length > 0
      ? params.map(getParamString).join('-')
      : ''
  const step = `${paramsStr}`
  return step
}

// get string representation of a parameter
// eg 'x:SOME_TYPE' -> 'some_type'
function getParamString(param) {
  // const str = param.replace('x:', '').replaceAll('_', '-').toLowerCase() // needs node15
  // const regexp = new RegExp('_', 'g')
  // const str = param.toLowerCase() // leave x: and underscores as is
  // const str = param.replace('x:', '').replace(regexp, '-').toLowerCase()
  const str = param.replace('x:', '').toLowerCase() // leave underscores
  return str
}

//------------------------------------------------------------------------

// get nodes from elements.
// nodes includes devices and dataitems with unique paths, ready to write to db.
// elements is the more complete list.
// eg for elements = [{ node_type, id, name, device, path, category, type }, ...]
// returns [{
//   node_type: 'DataItem',
//   path: 'availability',
//   category: 'EVENT',
//   type: 'AVAILABILITY'
// }, ...]
// note that id, name, device were removed
export function getNodes(elements) {
  let nodes = []

  // handle path collisions by adding more type or name info as needed.
  //. might need indexes first?
  makeUniquePaths(elements)

  for (const element of elements) {
    const node = { ...element } // copy element
    if (node.node_type === 'Device') {
      // node.name_uuid = `${node.name} (${node.uuid})`
    } else if (node.node_type === 'DataItem') {
      // remove any unneeded attributes
      delete node.id
      delete node.name
      delete node.device
      // leave these in dataitem
      // delete node.compositionId //. will need this to obtain compositionType - delete later?
      // delete node.discrete
      // delete node.units
      // delete node.nativeUnits
      // delete node.coordinateSystem
      // delete node.representation
    } else if (node.node_type === 'Composition') {
      continue // don't add to node list
    }
    nodes.push(node)
  }

  // need to get list of unique nodes, because we're processing the whole
  // xml probe file, which may have multiple devices, with the same dataitems
  // and paths.
  nodes = getUniqueByPath(nodes)

  return nodes
}

// make element paths unique by adding more type or name info as needed.
//. eg elements = [{path:'temp'},{path:'temp'},{path:'temp'}]
// returns [{}]
function makeUniquePaths(elements) {
  const d = {}
  const collisions = {}
  for (const element of elements) {
    const fullpath = element.device + '/' + element.path
    // console.log(fullpath)
    if (d[fullpath]) {
      // collision - add these elements to list as needing uniquification
      if (collisions[fullpath]) {
        collisions[fullpath].push(element)
      } else {
        collisions[fullpath] = [d[fullpath], element]
      }
    } else {
      d[fullpath] = element
    }
  }
  console.log('collisions', collisions)

  // attributes to try for uniquification, in order of preference
  const attributesToTry = 'compositionId,statistic,name'.split(',')

  // get index on elements by id
  const elementById = {}
  Object.keys(elements).forEach(
    key => (elementById[elements[key].id] = elements[key])
  )

  // iterate over list of collisions
  // fullpath is device/path/to/type
  for (const fullpath of Object.keys(collisions)) {
    // each collision is an array of elements with same fullpath (device and path)
    const collision = collisions[fullpath]
    const n = collision.length
    // iterate over attributes to try and see if n-1 elements have one
    for (const attribute of attributesToTry) {
      const nitemsWithAttribute = collision.filter(el => !!el[attribute]).length
      // check if at least n-1 items have attribute - if so use that for unique path
      if (nitemsWithAttribute >= n - 1) {
        //. do as switch with fallthroughs
        if (attribute === 'compositionId') {
          // if items have compositionId find the composition elements referenced
          // and use those types eg 'motor'.
          for (const el of collision) {
            if (el[attribute]) {
              const compositionId = el[attribute]
              const composition = elementById[compositionId]
              const compositionType = composition.type.toLowerCase() // eg 'motor'
              el.path += '-' + compositionType
            }
          }
          //
          //. if paths still not unique, add name in brackets also eg '[high]'.
          //. use name || id, in case no name?
          break
        } else if (attribute === 'statistic') {
          for (const el of collision) {
            // check if has attribute (one of the array might not)
            if (el[attribute]) {
              el.path += '-statistic=' + el[attribute].toLowerCase()
            }
          }
          break
        } else if (attribute === 'name') {
          // use name as last resort - makes dashboards harder to share
          for (const el of collision) {
            if (el[attribute]) {
              el.path += '[' + el[attribute].toLowerCase() + ']'
            }
          }
          break
        }
      }
    }
  }
}

// uniquify nodes by their path
// eg given nodes = [{path:'foo'}, {path:'foo'}...]
// returns [{path:'foo'}, ...]
function getUniqueByPath(nodes) {
  const d = {}
  nodes.forEach(node => (d[node.path] = node))
  return Object.values(d)
}

// get indexes for given nodes and elements: nodeByNodeId, nodeByPath, elementById.
// eg for
//   nodes = [{ node_id: 3, id: 'foo', path: 'bar' }, ...]
//   elements = [{ id: 'foo' }, ...]
// returns
//   { nodeByNodeId: { 3:... }, nodeByPath: { bar:... }, elementById: { foo:... } }
//. explain why we need each index
export function getIndexes(nodes, elements) {
  // init indexes
  const nodeByNodeId = {}
  const nodeByPath = {}
  const elementById = {}

  // add nodes
  for (let node of nodes) {
    nodeByNodeId[node.node_id] = node
    nodeByPath[node.path] = node
  }

  // add elements
  elements.forEach(element => {
    if (element.node_type !== 'Device') {
      elementById[element.id] = element
    }
  })

  return { nodeByNodeId, nodeByPath, elementById }
}

// assign device_id and dataitem_id to dataitem elements.
// will use these to write values to history and bins tables.
export function assignNodeIds(elements, indexes) {
  elements.forEach(element => {
    if (element.node_type === 'DataItem') {
      element.device_id = indexes.nodeByPath[element.device].node_id
      element.dataitem_id = indexes.nodeByPath[element.path].node_id
    }
  })
}
