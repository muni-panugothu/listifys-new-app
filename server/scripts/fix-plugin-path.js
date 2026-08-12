const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'models');
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.model.js')) continue;
  const fp = path.join(dir, f);
  let c = fs.readFileSync(fp, 'utf8');
  if (!c.includes("../plugins/listing-videos.plugin")) continue;
  c = c.replace(
    /require\(['"]\.\.\/plugins\/listing-videos\.plugin['"]\)/g,
    "require('./plugins/listing-videos.plugin')",
  );
  fs.writeFileSync(fp, c);
  console.log('fixed', f);
}
