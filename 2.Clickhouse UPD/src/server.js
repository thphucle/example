require('dotenv').config();
const dgram = require('dgram');
const stream = require('stream');
const server = dgram.createSocket('udp4');
const ClickHouse = require('@apla/clickhouse');
const queues = require('./queue');
const { parse } = require('./helper');

const TARGETS = [];
const PORT = process.env.UDP_PORT || 6514;
const {DB_HOST, DB_NAME, DB_PASSWORD, DB_USER, DB_PORT} = process.env;

const db = new ClickHouse({
  host: DB_HOST,
  port: DB_PORT, 
  user: DB_USER, 
  password: DB_PASSWORD,
})

server.on('error', (err) => {
  console.error(`server error:\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) => {
  console.log(`${rinfo.address}:${rinfo.port} >> ${msg}`);
  const { target, message } = parse(msg, TARGETS);
  if (queues[target]) {
    queues[target].push(message);
  }
});

server.on('listening', () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
  console.log('queues:', queues);
  for (const log of Object.keys(queues)) {
    TARGETS.push(log);
    setInterval(workerFactory(log), 5000);
  }
});
server.bind(PORT);


function workerFactory(target) {
  return function() {
    const queue = queues[target];
    if (!queue || queue.isProcessing) {
      return;
    }
    const rows = queue.fetch(100);
    if (!rows.length) {
      return;
    }
    queue.start();
    console.log(`>>${target}:\t ${rows.length} records`);
    const stream = db.query(
      'INSERT INTO log_' + target,
      { format: "TSV", queryOptions: { database: DB_NAME } },
      (err, result) => { if (err) { console.error(err); } },
    );
    console.log('--row--');
    for (let row of rows) {
      console.log(row);
      stream.write(row + '\n');
    }
    stream.end();
    queue.complete();
    console.log('--end--');
  }
}
