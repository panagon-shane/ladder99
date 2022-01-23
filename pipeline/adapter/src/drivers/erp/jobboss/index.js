// jobboss driver

// for jobboss table structure see jobboss.jpg in this directory, or
// https://docs.google.com/spreadsheets/d/13RzXxUNby6-jIO4JUjKVCNG7ALc__HDkBhcnNfyK5-s/edit?usp=sharing

import mssql from 'mssql' // ms sql server driver https://github.com/tediousjs/node-mssql
import * as lib from '../../../lib.js'

const initialDelay = 6000 // ms
const jobPollInterval = 5000 // ms - ie poll for job num every 5 secs
const schedulePollInterval = 1 * 60 * 1000 // ms - ie poll for schedule change every 1 minute

export class AdapterDriver {
  constructor() {
    this.client = null
    this.devices = null
    this.cache = null
    this.pool = null
  }

  // note - device here is the jobboss object from setup yaml -
  // this code will iterate over all devices in setup yaml to find ones with
  // jobbossId values and check their schedules and jobnums.
  async init({
    client,
    deviceId,
    device,
    protocol,
    cache,
    inputs,
    socket,
    connection, // { server, port, database, user, password } - set in setup.yaml
    devices, // from setup.yaml
  }) {
    console.log(`JobBoss - initialize driver...`)

    this.client = client
    this.devices = devices
    this.cache = cache

    // need to wait a bit to make sure the cutter cache items are setup before
    // writing to them. they're setup via the cutter/marumatsu module.
    //. better - check they are there in a loop with delay...
    //  ieg check cache.get('c-start') etc for existence?
    console.log(`JobBoss - waiting a bit...`)
    await lib.sleep(initialDelay)

    while (!this.pool) {
      try {
        console.log(`JobBoss - connecting to database...`, connection.server)
        // this.pool = await mssql.connect(connection)
        this.pool = await mssql.connect({
          ...connection,
          port: Number(connection.port), // mssql driver insists on a number here
        })
        console.log(`JobBoss - connected`)
        // this.setAvailable()

        // get schedule info
        // will check jobboss schedule info for each device in devices
        // await this.backfillSchedule()
        await this.pollSchedule() // do initial poll
        setInterval(this.pollSchedule.bind(this), schedulePollInterval) // start poll timer

        // get job info
        // will check jobnum for each device in devices
        // await this.backfillJob()
        await this.pollJob() // do initial poll
        setInterval(this.pollJob.bind(this), jobPollInterval) // start poll timer
      } catch (error) {
        console.log(error)
        console.log(`JobBoss - no db - waiting a bit to try again...`)
        await new Promise(resolve => setTimeout(resolve, 4000))
      }
    }
  }

  // poll the jobboss schedule information for current day,
  // and write to the cache
  async pollSchedule() {
    // const datetime = new Date() // now
    // since the server is set to GMT time, need to 'trick' it to thinking it's 6 hrs earlier
    const datetime = new Date(
      new Date().getTime() +
        (this.client.timezoneOffsetHrs || 0) * 60 * 60 * 1000
    )
    for (let device of this.devices) {
      if (device.jobbossId) {
        // //. test getschedule fn for set of days
        // for (let day = 1; day <= 19; day++) {
        //   const datetime = new Date()
        //   datetime.setDate(day)
        //   const schedule = await this.getSchedule(device, datetime) // get { start, stop }
        //   console.log('JobBoss schedule', schedule)
        // }
        const schedule = await this.getSchedule(device, datetime) // get { start, stop }
        console.log('JobBoss schedule', schedule)
        // write start/stop times to cache for this device
        // eg start is a STRING like '2022-01-23T05:00:00' with NO Z!
        // that way, it will be interpreted by new Date(start) as a local time.
        this.cache.set(`${device.id}-start`, schedule.start)
        this.cache.set(`${device.id}-complete`, schedule.stop)
      }
    }
  }

  // get workcenter schedule for given device and datetime.
  // returns as { start, stop } times, which can be strings like
  // '2022-01-23 05:00:00' (with no Z! it's local time), or null
  // (eg Sunday), or 'HOLIDAY'.
  async getSchedule(device, datetime) {
    console.log(`JobBoss - getSchedule for`, device.name, datetime)

    const workcenter = device.jobbossId // eg '8EE4B90E-7224-4A71-BE5E-C6A713AECF59' for Marumatsu
    const sequence = datetime.getDay() // day of week with 0=sunday, 1=monday. this works even if Z time is next day.
    const dateString = getLocalDateFromDateTime(datetime) // eg '2022-01-18' - works even if Z time is next day.

    // lookup workcenter and date in wc shift override table
    const result1 = await this.pool.query`
      select Shift_ID, Is_Work_Day 
      from WCShift_Override
      where WorkCenter_OID=${workcenter} and cast(Date as date)=${dateString}
    `
    console.log(result1)

    let start = null
    let stop = null

    if (result1.recordset.length === 0) {
      //
      console.log(`JobBoss - no override record, so get standard schedule...`)
      // if no record then lookup workcenter in WCShift_Standard
      //   get shift_id, look that up with sequencenum in shift_day table for start/end
      // (or do a join query)
      const result2 = await this.pool.query`
        select cast(Start_Time as time) start, cast(End_Time as time) stop
        from WCShift_Standard wss
          join Shift_Day sd on wss.Shift_ID=sd.Shift
        where WorkCenter_OID=${workcenter} and Sequence=${sequence}
      `
      console.log(result2)
      if (result2.recordset.length > 0) {
        start = result2.recordset[0].start // eg 1970-01-01T05:00:00Z - note the Z
        stop = result2.recordset[0].stop // eg 1970-01-01T13:30:00Z
      }
    } else if (result1.recordset[0].Is_Work_Day) {
      //
      console.log(`JobBoss - work day override - get schedule...`)
      // if isworkday then lookup hours in shift_day table -
      //   get shift_id, lookup in shift_day table with dayofweek for sequencenum
      //   get start/end times from record
      const result3 = await this.pool.query`
        select cast(Start_Time as time) start, cast(End_Time as time) stop
        from WCShift_Override wso
          join Shift_Day sd on wso.Shift_ID = sd.Shift
        where WorkCenter_OID=${workcenter} 
          and Date=${dateString} and Sequence=${sequence}
      `
      console.log(result3)
      if (result3.recordset.length > 0) {
        start = result3.recordset[0].start // eg 1970-01-01T05:00:00Z - note the Z
        stop = result3.recordset[0].stop
      }
    } else {
      //
      // if isworkday=0 then not a workday - might have 2 records, one for each shift
      //   for now just say the whole day is a holiday - no start/end times
      //. does that mean don't write anything? or unavail? or holiday?
      console.log(`JobBoss - day is holiday (isworkday=0)...`)
      start = 'HOLIDAY'
      stop = 'HOLIDAY'
    }

    // these all use local time, not Z time
    if (start && typeof start === 'object') {
      // start = new Date(
      //   date + 'T' + start.toISOString().split('T')[1].replace('Z', '')
      // )
      // start.setFullYear(datetime.getFullYear())
      // start.setMonth(datetime.getMonth())
      // start.setDate(datetime.getDate())
      // start = start.toISOString().replace('Z', '')
      start = getTimeAsLocalDateTimeString(start, datetime, dateString)
    }
    if (stop && typeof stop === 'object') {
      // stop = new Date(
      //   dateString + 'T' + stop.toISOString().split('T')[1].replace('Z', '')
      // )
      // stop.setFullYear(datetime.getFullYear())
      // stop.setMonth(datetime.getMonth())
      // stop.setDate(datetime.getDate())
      // stop = stop.toISOString().replace('Z', '')
      stop = getTimeAsLocalDateTimeString(stop, datetime, dateString)
    }
    return { start, stop }
  }

  // async backfillSchedule() {
  //   console.log(`JobBoss backfilling any missed dates...`)
  //   const today = getToday()
  //   console.log(today)
  //   // loop over devices from setup.yaml
  //   for (let device of devices) {
  //     // just want those with a jobboss id (workcenter uuid)
  //     if (device.jobbossId) {
  //       // get last day scheduled for this device
  //       const lastDay = await getLastDay(device)
  //       // lookup missing days and set values
  //       for (let day = lastDay; day < today; day++) {
  //         const times = await getTimes(device, day) // { start, stop }
  //         // cache.set(`${device.id}-start`, '2022-01-11 03:00:00')
  //         // cache.set(`${device.id}-complete`, '2022-01-11 15:30:00')
  //         cache.set(`${device.id}-start`, '2022-01-11 03:00:00')
  //         cache.set(`${device.id}-complete`, '2022-01-11 15:30:00')
  //       }
  //     }
  //   }
  // }

  // //. get last day written to our pg db
  // // how do we get that?
  // async getLastDay(device) {
  //   // return new Date()
  // }

  async pollJob() {
    console.log(`JobBoss - polling for job info...`)

    //. test - works
    // this.cache.set(`${deviceId}-job`, Math.floor(Math.random() * 1000))

    // iterate over all devices, check if has a jobboss ID //. call it workcenterId?
    for (let device of this.devices) {
      if (device.jobbossId) {
        // get the most recently started job for this workcenter/device
        const sql = `
          select top 1
            job
          from
            job_operation
          where
            -- work_center = 'MARUMATSU'
            workcenter_oid = '${device.jobbossId}'
            --workcenter_oid = cast('${device.jobbossId}' as uniqueidentifier)
          order by
            actual_start desc
        `
        console.log(sql)
        const result = await this.pool.query(sql)
        console.log(`JobBoss result`, result)
        const job = result.recordset.length > 0 && result.recordset[0].job
        this.cache.set(`${device.id}-job`, job)
      }
    }
  }

  //. method doesn't exist, but is in the readme
  // mssql.on('error', err => {
  //   // ... error handler
  // })

  //  setAvailable() {
  //   cache.set(`${deviceId}-availability`, 'AVAILABLE')
  // }

  //  setUnavailable() {
  //   cache.set(`${deviceId}-availability`, 'UNAVAILABLE')
  //   cache.set(`${deviceId}-job`, 'UNAVAILABLE')
  // }
}

// get a date string from a datetime value,
// eg 2022-01-18T14:24:00 -> '2022-01-18'
// accounts for timezone offset, which is in minutes
function getLocalDateFromDateTime(dt) {
  const date = new Date(dt.getTime() - dt.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .split('T')[0]
  return date
}

// given a time like 1970-01-01T05:00:00Z from jobboss,
// and a datetime like 2022-01-23T12:13:09Z,
// return a string like '2022-01-23T05:00:00' with NO Z!
// ie assign the date of the datetime value to the time value.
function getTimeAsLocalDateTimeString(time, datetime, dateString) {
  // const date = getLocalDateFromDateTime(datetime)
  const local = new Date(
    dateString + 'T' + time.toISOString().split('T')[1].replace('Z', '')
  )
  //. why do we need this?
  local.setFullYear(datetime.getFullYear())
  local.setMonth(datetime.getMonth())
  local.setDate(datetime.getDate())
  const s = local.toISOString().replace('Z', '')
  return s
}