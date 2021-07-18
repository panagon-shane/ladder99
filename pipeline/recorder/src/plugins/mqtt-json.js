// mqtt-json player/recorder

import fs from 'fs' // node lib for filesystem
import mqttlib from 'mqtt' // see https://github.com/mqttjs/MQTT.js
import parse from 'csv-parse/lib/sync.js' // see https://github.com/adaltas/node-csv-parse
import * as common from '../common.js'

export class Plugin {
  init({ deviceId, mode, host, port, folder, loop, topic }) {
    console.log(`Mode: ${mode}`)

    const clientId = `recorder-${Math.random()}`
    // const config = { host, port, clientId, reconnectPeriod: 0 }
    const config = { host, port, clientId }

    console.log(`Connecting to MQTT broker on`, config)
    const mqtt = mqttlib.connect(config)

    mqtt.on('connect', async function onConnect() {
      console.log(`Connected...`)
      if (mode === 'play') {
        await play()
      } else {
        await record()
      }
      console.log(`Closing MQTT connection...`)
      mqtt.end()
    })

    async function play() {
      console.log(`Reading list of files in folder '${folder}'...`)
      let csvfiles
      try {
        csvfiles = fs
          .readdirSync(folder)
          .filter(csvfile => csvfile.endsWith('.csv'))
          .sort()
      } catch (error) {
        console.log(
          `Problem reading files - does the folder '${folder}' exist?`
        )
        process.exit(1)
      }
      if (csvfiles.length === 0) {
        console.log(`No csv files found in folder '${folder}'.`)
        process.exit(1)
      }

      // do while loop
      do {
        console.log(`Looping over files...`)
        for (const csvfile of csvfiles) {
          const csvpath = `${folder}/${csvfile}`

          console.log(`Reading and publishing ${csvpath}...`)
          let csv = await fs.readFileSync(csvpath).toString()
          // @ts-ignore
          csv = csv.replaceAll('${deviceId}', deviceId)

          // const rows = parse(csv, { columns })
          const rows = parse(csv, { columns: true, skip_empty_lines: true })

          for (const row of rows) {
            // process.stdout.write('.')
            const { topic, message, qos, retain, time_delta } = row
            // console.log(`Publishing topic ${topic}: ${message.slice(0, 40)}`)
            //. mosquitto closes with "disconnected due to protocol error" when send qos
            // mqtt.publish(topic, payload, { qos, retain })
            mqtt.publish(topic, message, { retain })
            await common.sleep(time_delta * 1000) // pause between messages
          }
          console.log()
          await common.sleep(1000) // pause between csv files
        }
        await common.sleep(1000) // pause between loops
      } while (loop)
    }

    async function record() {
      console.log(`Subscribing to MQTT topics (${topic})...`)
      mqtt.subscribe(topic, null, onSubscribe)

      let fd // file descriptor

      // subscribed - granted is array of { topic, qos }
      function onSubscribe(err, granted) {
        console.log('Subscribed to', granted, '...')

        // open file for writing
        const datetime = new Date()
          .toISOString()
          // @ts-ignore
          .replaceAll(':', '')
          .slice(0, 17)
        const filename = datetime + '.csv'
        const filepath = `${folder}/${filename}`
        console.log(`Recording MQTT messages to '${filepath}'...`)
        try {
          fd = fs.openSync(filepath, 'w')
        } catch (error) {
          console.log(
            `Problem opening file - does the folder '${folder}' exist?`
          )
          process.exit(1)
        }
        let time_last = Number(new Date()) / 1000 // seconds

        const row = `topic,message,qos,retain,time_now,time_delta\n`
        fs.writeSync(fd, row)

        mqtt.on('message', onMessage)
        console.log(`Listening...`)

        // message received - add to file
        function onMessage(topic, message, packet) {
          message = message.toString()
          console.log('Message received:', topic, message.slice(0, 60))
          message = message.replaceAll('"', '""') // make ready to write as json string
          const { qos, retain } = packet
          const time_now = Number(new Date()) / 1000 // seconds
          const time_delta = time_now - time_last // seconds
          time_last = time_now
          topic = topic.replace(deviceId, '${deviceId}') //. ok? dubious
          // write each message
          //. or write to array and flush every n msgs
          const row = `${topic},"${message}",${qos},${retain},${time_now},${time_delta}\n`
          fs.writeSync(fd, row)
        }
      }

      do {
        await common.sleep(2000)
      } while (true)
    }
  }
}
