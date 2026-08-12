const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'routes');
const entityMap = {
  'electronics.routes.js': 'electronics',
  'events.routes.js': 'events',
  'vehicles.routes.js': 'vehicles',
  'properties.routes.js': 'properties',
  'jobs.routes.js': 'jobs',
  'takecare.routes.js': 'takecare',
  'forsale.routes.js': 'forsale',
  'beauty.routes.js': 'beauty',
  'books.routes.js': 'books',
  'collectibles.routes.js': 'collectibles',
  'fashion.routes.js': 'fashion',
  'furniture.routes.js': 'furniture',
  'mobiles.routes.js': 'mobiles',
  'others.routes.js': 'others',
  'pets.routes.js': 'pets',
  'sports.routes.js': 'sports',
  'toys.routes.js': 'toys',
  'servicelisting.routes.js': 'services',
};

const registerLine = (entity) =>
  `\nconst { registerListingVideoUpload } = require("../utils/register-listing-video-upload.js");\nregisterListingVideoUpload(router, "${entity}");\n`;

for (const [file, entity] of Object.entries(entityMap)) {
  const fp = path.join(routesDir, file);
  if (!fs.existsSync(fp)) {
    console.log('missing', file);
    continue;
  }
  let content = fs.readFileSync(fp, 'utf8');
  if (content.includes('registerListingVideoUpload')) {
    console.log('already patched', file);
    continue;
  }
  if (!content.includes('/upload-images')) {
    console.log('no upload-images in', file);
    continue;
  }

  content = content.replace(
    /router\.post\(\s*\n?\s*"\/upload-images"[\s\S]*?\);\s*\n/,
    (match) => `${match}${registerLine(entity)}`,
  );

  fs.writeFileSync(fp, content);
  console.log('patched route', file);
}
