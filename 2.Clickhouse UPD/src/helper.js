function DateFormat(x) {
  const d = x ? new Date(x) : new Date();
  const timeStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .substr(0, 19)
    .replace("T", " ");
  return {
    date: timeStr.substr(0, 10),
    dateTime: timeStr,
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}
function parse(data, targets) {
  const row = parseData(data);
  if (!row) {
    console.error(`Can not parse target >> SKIP`);
  }
  const { target, timestamp, host, context, logs } = row;
  if (!targets.includes(target)) {
    console.error(`Target not found: ${target} >> SKIP`);
    return { target: 'notfound', message: '' };
  }
  const { hour, minute, date, dateTime } = DateFormat(timestamp);
  const values = typeof logs === "string" ? logs.split(',') : logs;
  const message = [date, dateTime, hour, minute, host].concat(values).join("\t");
  return { target, message };
}

function base64decode(data) {
  const buff = Buffer.from(data, "base64");
  return buff.toString("utf-8");
}

function base64encode(data) {
  const buff = Buffer.from(data);
  return buff.toString("base64");
}

function parseData(data) {
  try {
    return JSON.parse(data.toString());
  } catch (error) {
    console.error(`Parse data failed: ${error.message}`);
  }
  return false;
}

module.exports = { DateFormat, parse, base64decode, base64encode };
