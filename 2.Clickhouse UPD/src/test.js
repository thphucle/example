const udp = require('dgram');
var client = udp.createSocket('udp4');
const HOST = 'localhost';
const PORT = 6514;
const {DateFormat, base64encode} = require('./helper');

// Test data
const {hour, minute, date, dateTime} = DateFormat();
const host = 'localhost';
const target = 'syslog';

console.log({date, dateTime, hour, minute});
const data = {
  host,
  target,
  timestamp: new Date().toISOString(),
  logs: [1, null, null, 'update', 'Wheel', 'abc', 1, 'def'],
};

client.on('message',function(msg,info){
  console.log('Data received from server : ' + msg.toString());
  console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
});

// sending msg
client.send(Buffer.from(JSON.stringify(data)), PORT, HOST, function(error){
  if(error){
    client.close();
  }else{
    console.log('Data sent !!!');
    client.close();
  }
});

