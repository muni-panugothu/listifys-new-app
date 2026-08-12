const fs = require('fs');
const path = require('path');

const controllers = [
  'electronics.controller.js',
  'vehicles.controller.js',
  'events.controller.js',
  'jobs.controller.js',
  'forsale.controller.js',
  'takecare.controller.js',
  'properties.controller.js',
  'servicelisting.controller.js',
];

const controllersDir = path.join(__dirname, '..', 'controllers');

for (const file of controllers) {
  const fp = path.join(controllersDir, file);
  if (!fs.existsSync(fp)) continue;
  let content = fs.readFileSync(fp, 'utf8');
  let changed = false;

  if (!content.includes('videos,')) {
    content = content.replace(/(\s+images,\n)/, '$1      videos,\n');
    changed = true;
  }

  if (content.includes('images: images || []') && !content.includes('videos:')) {
    content = content.replace(
      /images: images \|\| \[\],/g,
      'images: images || [],\n      videos: videos || [],',
    );
    changed = true;
  }

  if (file === 'takecare.controller.js' && content.includes('images: Array.isArray(images) ? images : []')) {
    content = content.replace(
      'images: Array.isArray(images) ? images : [],',
      'images: Array.isArray(images) ? images : [],\n      videos: Array.isArray(videos) ? videos : [],',
    );
    changed = true;
  }

  if (file === 'properties.controller.js' && content.includes('images,\n      bedrooms')) {
    content = content.replace(
      /images,\n(\s+bedrooms)/,
      'images,\n      videos: videos || [],\n$1',
    );
    if (!content.includes('videos,')) {
      content = content.replace(/(\s+images,\n)/, '$1      videos,\n');
    }
    changed = true;
  }

  if (file === 'servicelisting.controller.js') {
    if (!content.includes('videos,')) {
      content = content.replace(
        /title, description, category, subcategory, price, location, phone, phoneCode, currency, countryCode, images,/,
        'title, description, category, subcategory, price, location, phone, phoneCode, currency, countryCode, images, videos,',
      );
      changed = true;
    }
    if (!content.includes('videos: Array.isArray(videos)')) {
      content = content.replace(
        /images: normalisedImages,/,
        'images: normalisedImages,\n      videos: Array.isArray(videos) ? videos : [],',
      );
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(fp, content);
    console.log('patched controller', file);
  } else {
    console.log('no changes', file);
  }
}
