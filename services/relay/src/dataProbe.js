// Probe
// read probe endpoint data and write to db - called from agentReader

import { Data } from './data.js'
import * as tree from './treeProbe.js'

export class Probe extends Data {
  type = 'probe' // used by this.read()

  constructor(setup, agent) {
    super()
    this.setup = setup
    this.agent = agent
  }

  // read xml into this.jsTree, this.header, then parse jsTree into flat list of .nodes.
  async read() {
    await super.read(...arguments) // gets this.jsTree - see base class in data.js

    // get flat list of devices, descriptions, dataitems, compositions from xml/js.
    // eg [{node_type, path, category}, ...]
    this.nodes = tree.getNodes(this.jsTree, this.agent) // see treeProbe.js

    // check for path collisions - in which case stop the service with a message
    // to add translation step to setup.yaml.
    await this.checkForCollisions()
  }

  async checkForCollisions() {
    const d = {}
    for (let node of this.nodes) {
      if (d[node.path]) {
        d[node.path].push(node)
      } else {
        d[node.path] = [node]
      }
    }
    // console.log(d)
    const collisions = []
    for (let key of Object.keys(d)) {
      if (d[key].length > 1) {
        collisions.push(d[key])
      }
    }
    // console.log(collisions)
    if (collisions.length > 0) {
      console.log(`
Relay error: The following dataitems have duplicate paths, 
ie same positions in the XML tree and type+subtype. 
Please add translations for them in setup.yaml for this project.
`)
      console.log(collisions.map(collision => collision.map(node => node.path)))
      await new Promise(resolve => setTimeout(resolve, 5000))
      process.exit(1)
    }
  }

  // write probe data in jsTree to db instance, get indexes
  async write(db) {
    //
    // add/get nodes to db - devices and dataitems
    for (let node of this.nodes) {
      node.node_id = await db.upsert(node) // write/read db and save resulting node_id
    }

    // get indexes - nodeByNodeId, nodeByUid
    //. why do we need those indexes? explain
    //. nodeByNodeId - gives node object for a given node_id, eg 3 -> {}
    //. nodeByUid - gives node object for given uid, eg 'main/d1/avail' -> {}
    this.indexes = tree.getIndexes(this.nodes)

    // assign device_id and dataitem_id to dataitem elements.
    // will need these to write values from current/sample endpoints
    // to history and bins tables.
    tree.assignNodeIds(this.nodes, this.indexes)

    // console.log('indexes', this.indexes)
  }
}
