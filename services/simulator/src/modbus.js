// simulate some modbus counters

import ModbusRTU from 'modbus-serial' // see https://github.com/yaacov/node-modbus-serial

// const mbHost = 'simulator'
// const mbHost = 'host.docker.internal' // access host from docker container
// const mbHost = 'localhost'
const mbHost = '0.0.0.0'
const mbPort = 502
const mbId = 1

export class Simulator {
  //
  async start() {
    console.log('Modbus start')

    let low = false // ie start off with high word

    const vector = {
      getInputRegister: function (addr, unitID) {
        // Synchronous handling
        return addr
      },
      getHoldingRegister: function (addr, unitID, callback) {
        // handle uint32be
        //. how distinguish low and high word?
        //. this gives eg <Buffer 00 00 00 00> and <Buffer 00 n 00 00>
        if (addr === 5000) {
          // const value = low ? counter : 0
          // console.log('Modbus getHoldingRegister', addr, low, value)
          // low = !low // switch between low and high word
          // callback(null, value) // write error, value
          callback(null, counter) //. this seems to only handle 16bit values, so changed setup.yaml to uint16be
        } else {
          callback(null, 0)
        }
      },
      getCoil: function (addr, unitID) {
        // Asynchronous handling (with Promises, async/await supported)
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(addr % 2 === 0)
          }, 10)
        })
      },
      setRegister: function (addr, value, unitID) {
        // Asynchronous handling supported also here
        console.log('set register', addr, value, unitID)
        return
      },
      setCoil: function (addr, value, unitID) {
        // Asynchronous handling supported also here
        console.log('set coil', addr, value, unitID)
        return
      },
      readDeviceIdentification: function (addr) {
        return {
          0x00: 'MyVendorName',
          0x01: 'MyProductCode',
          0x02: 'MyMajorMinorRevision',
          0x05: 'MyModelName',
          0x97: 'MyExtendedObject1',
          0xab: 'MyExtendedObject2',
        }
      },
    }

    const serverTCP = new ModbusRTU.ServerTCP(vector, {
      host: mbHost,
      port: mbPort,
      unitID: mbId,
      debug: true,
    })

    serverTCP.on('socketError', function (err) {
      // Handle socket error if needed, can be ignored
      console.log(err)
    })

    // loop and 'publish' incrementing and looping counter
    let counter = 0
    const counterMax = 99
    setInterval(() => {
      const delta = Math.floor(Math.random() * 3)
      counter += delta
      if (counter > counterMax) counter = 0 // loop around
      console.log('Modbus counter', counter)
    }, 1000)
  }
}
