// companion functions for dataProbe.js
//. move there

import * as libapp from './libapp.js'

//. add elements of this type to return list
//. handle Description elements - add to Device obj
const appendTags = libapp.getSet('Device,DataItem')

// don't recurse down these elements - not interested in them
const skipTags = libapp.getSet('Agent')

// ignore these element types for path parts - don't add much info to the path
const ignoreTags = libapp.getSet(
  'Adapters,AssetCounts,Components,DataItems,Devices,Filters,Specifications'
)

//. assume for now there there is only one of these in path, so can just lower case them
//. in future, do two passes to determine if need to uniquify them with nums or names?
//. or use aliases table to refer by number or name or id to a dataitem
const plainTags = libapp.getSet(
  'Axes,Controller,EndEffector,Feeder,PartOccurrence,Path,Personnel,ProcessOccurrence,Resources,Systems'
)

// ignore these DataItem attributes - not necessary to identify an element,
// are accounted for explicitly, or are redundant.
const ignoreAttributes = libapp.getSet(
  'id,name,type,subType,compositionId,category,discrete,_key,tag,parents,units,nativeUnits,device'
)

// get flat list of elements from given json tree (just devices and dataitems).
// eg json = { MTConnectDevices: { Header, Devices: { Agent, Device }}}
// with Device = { _attributes, Description, DataItems, Components: { Axes, Controller, Systems }}
// and DataItems = { DataItem: [ { _attributes: { id:'avail', type, category }}, ...]}
//. returns [{
//   node_type: 'DataItem',
//   path: 'availability',
//   id: 'avail',
//   type: 'AVAILABILITY',
//   category: 'EVENT',
//   device: 'Device(VMC-3Axis, 000)'
// }, ...]
export function getElements(json) {
  const elements = []
  recurse(json, elements)
  return elements
}

// do nothing fn
const ignore = () => {}

//. explain / pull out fns
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
//. refactor, add comments
//. handle parents differently - do in separate pass?
//. el can be an object, an array, or an atomic value, eg
//   { MTConnectDevices: { Header, Devices: { Agent, Device }}}
//. objs is a growing flat list of objects we're interested in from the els,
// eg [{ tag: 'DataItem', path, category, id, name }, ...]
//. tag is
//. parents is
function recurse(el, objs, tag = '', parents = []) {
  // handle object with keyvalue pairs
  if (libapp.isObject(el)) {
    // make object, which translates the json element to something usable.
    // tag is eg 'DataItem'
    // parents is list of ancestors - will be deleted before return.
    // start object, eg { tag: 'DataItem', parents: [ {}, {}, {}, ... ] }
    let obj = { tag, parents }

    // add obj to return list if one of certain tags (eg Device, DataItem)
    if (appendTags.has(tag)) objs.push(obj)

    // get keyvalue pairs, skipping some tags (eg Agent)
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
    if (tag === 'DataItem') {
      // save device path
      obj.device = getPathStep(obj.parents[3]) // eg { tag, id, name, uuid }
      // save steps for rest of path to an array
      // will convert this to a full path string later
      // eg ['axes', 'x', 'position-actual']
      obj.steps = [...obj.parents.slice(4), obj].map(getPathStep)
    } else {
      // for non-dataitems (ie Devices), get steps array
      // eg ['cnc1']
      obj.steps = [obj].map(getPathStep)
    }

    // get rid of the parents list
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
// eg for a Device element, return 'Device(Mazak31, M41283-12A)'
// for a DataItem element, return 'position'
function getPathStep(obj) {
  let params = []
  if (!obj) return ''
  if (ignoreTags.has(obj.tag)) return ''
  //. for plain tags, eg Path, will want to do two passes - first to see how many Paths there are,
  // then to assign numbers to the steps, eg path vs path1, path2.
  if (plainTags.has(obj.tag)) return obj.tag[0].toLowerCase() + obj.tag.slice(1)
  let step = ''
  switch (obj.tag) {
    case 'Device':
    case 'Agent':
      // params = [obj.uuid] // standard says name may be optional in future versions, so use uuid
      // step = `Device(${obj.uuid})`
      // but for the mazak machines, uuid is not actually unique across the installation -
      // they seem to be using it for model number. so name helps uniquify this.
      step = `Device(${obj.name}, ${obj.uuid})`
      break
    case 'DataItem':
      // add primary params
      params = [obj.type]
      if (obj.subType) params.push(obj.subType)
      // add named params to help uniquify the path
      let namedParams = []
      for (const key of Object.keys(obj)) {
        if (!ignoreAttributes.has(key)) {
          namedParams.push(key + '=' + obj[key])
        }
      }
      namedParams.sort()
      for (const namedParam of namedParams) {
        params.push(namedParam)
      }
      // if (obj.category === 'CONDITION') {
      //   step = getParamsStep(params) + '-condition'
      // } else {
      //   step = getParamsStep(params)
      // }
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
  // const paramsStr =
  //   params.length > 0 && params[0].length > 0
  //     ? '(' + params.map(param => param.toLowerCase()).join(',') + ')'
  //     : ''
  // const step = `${obj.tag}${paramsStr}`
  return step
}

// get step for the given array of params
// eg ['position'] => '
function getParamsStep(params) {
  const paramsStr =
    // params.length > 0 && params[0].length > 0
    params.length > 0 && params[0] && params[0].length > 0
      ? params.map(getParamString).join('-')
      : ''
  const step = `${paramsStr}`
  return step
}

// get string representation of a param
// eg 'x:SOME_TYPE' -> 'some-type'
function getParamString(param) {
  // const str = param.replace('x:', '').replaceAll('_', '-').toLowerCase() // needs node15
  // const regexp = new RegExp('_', 'g')
  // const str = param.replace('x:', '').replace(regexp, '-').toLowerCase()
  const str = param.toLowerCase() // leave x: and underscores as is
  //. change chars AFTER '-' to uppercase - how do?
  // const str2 = str
  //   .split()
  //   .map(c => {
  //     if (c === '-') return ''
  //     return c
  //   })
  //   .join('')
  return str
}

//------------------------------------------------------------------------

// transform json to elements to object structures
// eg
//. json =
//. elements =
//. objects =
export function getObjects(json) {
  const elements = getElements(json)
  const objs = elements.map(element => {
    // const obj = { ...element } // copy object
    // obj.node_type = element.tag === 'DataItem' ? 'PropertyDef' : element.tag
    // obj.path = element.steps && element.steps.filter(step => !!step).join('/')
    const node_type = element.tag
    const path = element.steps && element.steps.filter(step => !!step).join('/')
    const obj = { node_type, path, ...element } // copy object, with node_type and path first
    delete obj.tag
    delete obj.steps
    return obj
  })
  return objs
}

// get nodes from objects
//. eg
// objects =
// nodes =
export function getNodes(objs) {
  let nodes = []
  for (const obj of objs) {
    const node = { ...obj } // copy object
    if (node.node_type === 'Device') {
      node.name_uuid = `${node.name} (${node.uuid})`
      // } else if (node.node_type === 'PropertyDef') {
    } else if (node.node_type === 'DataItem') {
      // remove any unneeded attributes
      delete node.id
      delete node.name
      delete node.device
      // leave these in propdef
      // delete node.compositionId //. uhh, will need this only to obtain compositionType - delete later?
      // delete node.discrete
      // delete node.units
      // delete node.nativeUnits
      // delete node.coordinateSystem
      // delete node.representation
    }
    nodes.push(node)
  }
  nodes = getUniqueByPath(nodes)
  return nodes
}

// uniquify nodes by their path
//. eg
// nodes =
// returns
function getUniqueByPath(nodes) {
  const d = {}
  nodes.forEach(node => (d[node.path] = node))
  return Object.values(d)
}

// get indexes for given nodes, objects
//. eg
// nodes =
// objs =
// returns { nodeById, nodeByPath, objById }
export function getIndexes(nodes, objs) {
  // initialize indexes
  const indexes = {
    nodeById: {},
    nodeByPath: {},
    objById: {},
  }

  for (let node of nodes) {
    indexes.nodeById[node.node_id] = node
    indexes.nodeByPath[node.path] = node
  }

  // assign device_id and dataitem_id to dataitems
  objs.forEach(obj => {
    // if (obj.type === 'DataItem') {
    // if (obj.node_type === 'PropertyDef') {
    if (obj.node_type === 'DataItem') {
      indexes.objById[obj.id] = obj
      obj.device_id = indexes.nodeByPath[obj.device].node_id
      // obj.property_id = indexes.nodeByPath[obj.path].node_id
      obj.dataitem_id = indexes.nodeByPath[obj.path].node_id
    }
  })
  return indexes
}
