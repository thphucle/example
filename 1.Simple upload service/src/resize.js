const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

module.exports = async function (file, image_sizes, keep_origin = true, default_max_size = 1024) {
  try {
    if (!file || !file.path) {
      throw new Error('File not found');
    }
    const filename_segments = file.filename.split('.');
    const image_meta = await sharp(file.path).metadata();
    let ext = filename_segments.pop();
    let max_size = keep_origin ? image_meta.width : Math.min(image_meta.width, default_max_size);
    if (ext === 'png' && image_meta.hasAlpha) {
      ext = 'png';
    } else {
      ext = 'jpg';
    }
    const filename = filename_segments.join('.');
    const resized_files = await Promise.all(
      Object.keys(image_sizes).map(async size_name => {
        const size = Math.min(image_sizes[size_name], image_meta.width);
        max_size = keep_origin ? max_size : Math.max(size, max_size);
        const resize_fn = sharp(file.path).rotate().resize(size)[ext === 'png' ? 'png' : 'jpeg']();
        const filename_size = `${filename}_${image_sizes[size_name]}.${ext}`;
        await resize_fn.toFile(path.join(`${file.destination}`, filename_size));
        return {filename: filename_size, size: size_name};
      })
    );
    const origin_func = sharp(file.path).rotate().resize(max_size)[ext === 'png' ? 'png' : 'jpeg']();
    await origin_func.toFile(path.join(file.destination, `${filename}.${ext}`));
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.log(err);
    }
    resized_files.push({size: 'origin', filename: `${filename}.${ext}`});
    return resized_files;
  } catch (e) {
    throw e;
  }
}