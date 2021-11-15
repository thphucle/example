require('dotenv').config()
const fastify = require('fastify');
const server = fastify({ logger: process.env.DEBUG == "1" });
const fs = require('fs-extra');
const path = require('path');
const shelljs = require('shelljs');
const nunjucks = require('nunjucks');


/** environment variables */
/* PORT
/* DEBUG
/* BEARER_TOKEN
/* NGINX_DATA_CONF
/* NGINX_DATA_WWW
/* NGINX_CONTAINER
/* SSL_MODE
/* REMOVE_STATIC_DIR
*********/

if (process.env.BEARER_TOKEN) {
  const bearer_auth = require('fastify-bearer-auth')
  const keys = new Set([process.env.BEARER_TOKEN]);
  
  server.register(bearer_auth, { keys })
} else {
  console.warn(`Running in unsecure mode, specify BEARER_TOKEN env if you wana run bearer authentication`);
}

const dataDir = path.join(__dirname, 'data/app-data');
let dataFile = path.join(dataDir, 'nginx-config-manage.json');
fs.mkdirpSync(dataDir);

let data = require('prettiest')({ json: dataFile });

let defaultSettings = {};

data.sites = data.sites || [];
let settings = defaultSettings;

fs.mkdirpSync(settings.conf);
fs.mkdirpSync(settings.static_dir);

if (!fs.existsSync(settings.template)) {
  console.error(`Missing template.conf file`);
  process.exit(1);
}

function restartNginx() {
  return new Promise(function(resolve, reject) {
    const r = shelljs.exec(`docker exec ${settings.nginx_container} nginx -s reload`);
    if (r.code != 0) {
      return reject(r.stderr);
    }
    resolve(true);
  });
}

function existPathInContainer(path) {
  return shelljs.exec(`docker exec -T ${settings.nginx_container} ls ${path}`).code === 0;
}

function mkdirPathInContainer(path) {
  return shelljs.exec(`docker exec -T ${settings.nginx_container} mkdir -p ${path}`).code === 0;
}

function checkNginxConf() {
    return shelljs.exec(`docker exec ${settings.nginx_container} nginx -t`).code === 0;
}

async function nginx(siteInfo) {
  const {domain, root_path: static_path, https} = siteInfo;
  let root_path = static_path.replace(/^\/.*/, '');
  let host_path = path.join(settings.static_dir, root_path);
  const container_path = path.join(settings.nginx_static_dir, root_path);
  try {
    fs.mkdirpSync(host_path);
  } catch (error) {
    console.error(error);
    if (!existPathInContainer(container_path)) {
      mkdirPathInContainer(container_path);
    }
  }
  const template = fs.readFileSync(settings.template, 'utf8');
  const output = nunjucks.renderString(template, {
    domain,
    root_path: container_path,
    https,
  });
  fs.writeFileSync(path.join(settings.conf, domain + '.conf'), output);
  if (!checkNginxConf()) {
    fs.removeSync(path.join(settings.conf, domain + '.conf'));
    throw new Error(`install nginx failed: conf invalid`);
  }
  await restartNginx();
  return {};
}

async function upsert(domain) {
  const install_SSL = shelljs.exec(`./init-letsencrypt.sh ${domain} ./certbot 0`);
  if (install_SSL.code != 0) {
    throw new Error(`install ssl failed: ${install_SSL.stderr}`);
  }
  current_site.https = true;
  return {};
}

/** Routes */
server.route({
  url: '/',
  method: 'PUT',
  schema: {
    body: {
      type: 'object',
      required: ['domain', 'root_path'],
      properties: {
        domain: { type: 'string' },
        root_path: { type: 'string' },
        https: { type: 'boolean', default: false }  
      }
    }
  },
  handler: async function(req, res) {
    server.log.info(req.body);
    await nginx(req.body);
    res.send({});
  },
});

server.route({
  url: '/:domain/ssl',
  method: 'PUT',
  schema: {
    params: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: { type: 'string' }
      }
    }
  },
  handler: async function(req, res) {
    return upsert(req.params.domain);
  },
});
async function start() {
  const port = parseInt(process.env.PORT || 3000);
  await server.listen(port, '0.0.0.0');
  server.log.info(`Server is listening on port ${port}`);
}

start();

/** signal handler */
const signals = {
  'SIGHUP': 1,
  'SIGINT': 2,
  'SIGTERM': 15,
};

// Do any necessary shutdown logic for our application here
const shutdown = (signal, value) => {
  console.log("shutdown!");
  server.close(() => {
    console.log(`server stopped by ${signal} with value ${value}`);
    process.exit(128 + value);
  });
};

// Create a listener for each of the signals that we want to handle
Object.keys(signals).forEach((signal) => {
  process.on(signal, () => {
    console.log(`process received a ${signal} signal`);
    shutdown(signal, signals[signal]);
  });
});
