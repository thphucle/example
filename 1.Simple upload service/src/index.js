const fastify = require('fastify')({ bodyLimit: 50 * 1024 * 1024 });
const fs = require('fs');
const path = require('path')
const { v4 } = require('uuid');
const multer = require('fastify-multer');
const resize = require('./resize');

let TEMP_DIR = '/tmp';
let UPLOAD_DIR = '/upload';

if (process.env.UPLOAD_DIR) {
  const env_upload_dir = process.env.UPLOAD_DIR;
  UPLOAD_DIR = path.isAbsolute(env_upload_dir) ? env_upload_dir : path.join(process.cwd(), env_upload_dir);
}

if (process.env.TEMP_DIR) {
  const env_temp_dir = process.env.TEMP_DIR;
  TEMP_DIR = path.isAbsolute(env_temp_dir) ? env_temp_dir : path.join(process.cwd(), env_temp_dir);
}

const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FIELD_SIZE = 5 * 1024 * 1024;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const KEEP_ORIGIN = process.env.KEEP_ORIGIN !== undefined ? (process.env.KEEP_ORIGIN === '1' || process.env.KEEP_ORIGIN === 1) : true;
const DEFAULT_MAX_SIZE = process.env.DEFAULT_MAX_SIZE !== undefined ? parseInt(process.env.DEFAULT_MAX_SIZE, 10) : 1024;

const SIZES = (() => {
  let image_sizes = {
    large: 1024,
    medium: 680,
    small: 460,
    thumbnail: 240,
  };
  if (process.env.SIZES) {
    //large:1024,medium:680,small:460,thumbnail:240
    const list_sizes = process.env.SIZES.split(',') || [];
    image_sizes = list_sizes.reduce((sizes, s) => {
      const [name, size] = s.split(':');
      sizes[name] = parseInt(size, 10);
      return sizes;
    }, {});
  }
  return image_sizes;
})();

console.log('IMAGE SIZES', SIZES);

if (!BASE_URL) {
  throw new Error('Missing BASE_URL');
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (req, file, cb) {
    cb(null,  `${Date.now()}-${v4()}-${file.originalname}`);
  }
})

const upload = multer({ 
  storage, 
  limits: {
    fieldSize: MAX_FIELD_SIZE,
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT,
  },
});

/**
 * { fieldname: 'file',
  originalname: 'Screen Shot 2019-07-07 at 18.07.42.png',
  encoding: '7bit',
  mimetype: 'image/png',
  destination: '/tmp',
  filename: '1563179819341-Screen Shot 2019-07-07 at 18.07.42.png',
  path: '/tmp/1563179819341-Screen Shot 2019-07-07 at 18.07.42.png',
  size: 2115047 }
 */
function base64MimeType(encoded) {
  let result = null;
  if (typeof encoded !== 'string') {
    return result;
  }
  const mime = encoded.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  if (mime && mime.length) {
    result = mime[1];
  }
  return result;
}

function saveBase64(base64_str) {
  const filename = Date.now() + '-base64.png';
  const data = Buffer.from(base64_str.substring(base64_str.indexOf(',') + 1), 'base64');
  return new Promise((resolve, reject) => {
    const path = `${TEMP_DIR}/${filename}`;
    fs.writeFile(path, data, function (err) {
      if (err) {
        console.error(err);
        return reject(err);
      }
      resolve({
        mimetype: base64MimeType(base64_str),
        destination: TEMP_DIR,
        filename,
        path,
        size: data.length,
      });
    });
  })
}

fastify.register(multer.contentParser);

fastify.register(require('fastify-static'), {
  root: UPLOAD_DIR,
  prefix: '/file/', // optional: default '/'
})

fastify.get('/', function(req, res) {
  res.send({message: 'hello'});
})

fastify.route({
  method: 'POST',
  url: '/upload',
  preHandler: upload.any(10),
  handler: async function (req, res) {
    if (!req.body) {
      throw new Error('Invalid input params');
    }
    if (req.body.base64) {
      let arr_base64 = req.body.base64;
      if (!Array.isArray(arr_base64)) {
        arr_base64 = [arr_base64];
      }
      const files = await Promise.all(arr_base64.map(base64 => saveBase64(base64)));
      req.files = req.files ? req.files.concat(files) : files;
    }
    const result = await Promise.all(req.files.map(async (file) => {
      file.destination = UPLOAD_DIR;
      const resized_files = await resize(file, SIZES, KEEP_ORIGIN, DEFAULT_MAX_SIZE);
      const public_paths = resized_files.reduce((src_hash, src_obj) => {
        const public_src = encodeURI(BASE_URL + '/file/' + src_obj.filename);
        src_hash[src_obj.size] = public_src;
        return src_hash;
      }, {});
      public_paths['filename'] = file.filename;
      return public_paths;
    }));
    res.send(result);
  }
});

fastify.listen(process.env.PORT || 80, '0.0.0.0', err => {
  if (err) {
    throw err;
  }
  console.log(`server listening on ${fastify.server.address().port}`)
})
