// test adapter

// when adapter.js is run, it expects config in /data/setup and /data/models.
// /data/setup includes setup.yaml, which includes a list of devices to setup.

import { Cache } from './cache.js'
import { AdapterDriver } from './drivers/cpc.js'

console.log(Cache)
console.log(AdapterDriver)
