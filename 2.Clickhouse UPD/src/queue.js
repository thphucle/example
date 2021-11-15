require('dotenv').config();

const { LOGS } = process.env;
const DEFAULT_LOGS = 'function,request,audit';

function createQueue(name) {
  let processing = false;
  const q = [];
  return {
    get name() {
      return name;
    },
    get isProcessing() {
      return processing;
    },
    push: function(row) {
      q.push(row);
    },
    fetch: function(n) {
      return q.splice(0, n);
    },
    start: function() {
      processing = true;
    },
    complete: function() {
      processing = false;
    },
  }
}

function queues() {
  const logs = ( LOGS || DEFAULT_LOGS).split(',');
  return logs.reduce((acc, log) => {
    acc[log] = createQueue(log);
    return acc;
  }, {});
}

module.exports = queues();