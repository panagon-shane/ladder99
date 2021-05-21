// mtconnect application
// capture agent data and write to database

import fetch from 'node-fetch'
import pg from 'pg' // postgres driver - import { Client } from 'pg' gives error
const { Client } = pg
import * as logic from './logic.js'

console.log(`MTConnect Application starting`)
console.log(`---------------------------------------------------`)

// get envars
const baseUrl = process.env.AGENT_BASE_URL || 'http://localhost:5000'
const interval = Number(process.env.INTERVAL || 2000) // msec

;(async function () {
  // get postgres connection
  const client = new Client()
  await client.connect() // uses envars PGHOST, PGPORT, etc

  // // test connection
  // const res = await client.query('SELECT $1::text as message', ['Hello world!'])
  // console.log(res.rows[0].message) // Hello world!

  await setupTables(client)

  // start polling
  setInterval(() => shovel(client), interval)
})()

async function setupTables(client) {
  const json = await getData('probe')
  console.log(json)
  if (json) {
    // traverse the json tree and create tables if not already there
    logic.traverse(json, async dataItems => {
      dataItems.forEach(async dataItem => {
        const { id, name } = dataItem.DataItem
        const tableName = id //+ (name ? '_' + name : '')
        const sql = `
CREATE TABLE IF NOT EXISTS "${tableName}" (
  time timestamptz NOT NULL,
  value json
);
SELECT create_hypertable("${tableName}", 'time');
`
        console.log(sql)
        await client.query(sql)
      })
    })
  }
  console.log('done')
}

async function shovel(client) {
  // const from = 1
  // const count = 200
  // const json = await getData('sample', from, count)
  const json = await getData('current')

  // traverse the json tree and output state
  logic.traverse(json, async dataItems => {
    // if (dataItems[0].type === 'Execution') {
    const dataItem = dataItems[0] //. just one for /current
    // console.log(dataItem.value)
    // write value to db
    //. add try block
    // const sql = `INSERT INTO execution(time, value) VALUES($1, $2) RETURNING *`
    const { id, timestamp, value } = dataItem
    const tableName = id
    const type = typeof value === 'string' ? 'text' : 'numeric'
    const sql = `INSERT INTO "${tableName}" (time, value) VALUES($1, to_json($2::${type}));`
    const values = [timestamp, value]
    console.log(sql, { values })
    await client.query(sql, values)
    // }
  })
}

async function getData(type, from, count) {
  const url = getUrl(type, from, count)
  console.log('getData', url)
  try {
    // get json from agent
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const json = await response.json()
    return json
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log(`Agent not found at ${url} - waiting...`)
    } else {
      throw error
    }
  }
  return null
}

function getUrl(type, from, count) {
  const url =
    type === 'sample'
      ? `${baseUrl}/${type}?from=${from}&count=${count}`
      : `${baseUrl}/${type}`
  return url
}
