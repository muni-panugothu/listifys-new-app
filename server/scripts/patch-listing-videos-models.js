const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '..', 'models');
const pluginRequire =
  "const { attachListingVideosField } = require('../plugins/listing-videos.plugin');";
const skip = new Set([
  'servicereview.model.js',
  'message.model.js',
  'conversation.model.js',
  'user.model.js',
  'notification.model.js',
]);

const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith('.model.js'));

for (const file of files) {
  const fp = path.join(modelsDir, file);
  let content = fs.readFileSync(fp, 'utf8');
  if (content.includes('attachListingVideosField')) continue;
  if (!content.includes('images:')) continue;
  if (skip.has(file)) continue;

  const schemaMatch = content.match(/const (\w+Schema) =/);
  if (!schemaMatch) {
    console.log('skip (no schema):', file);
    continue;
  }
  const schemaName = schemaMatch[1];

  if (!content.includes(pluginRequire)) {
    content = content.replace(
      'const { attachSlugPlugin }',
      `${pluginRequire}\nconst { attachSlugPlugin }`,
    );
  }

  if (content.includes('attachSlugPlugin')) {
    content = content.replace(
      new RegExp(`attachSlugPlugin\\(${schemaName}\\);`),
      `attachListingVideosField(${schemaName});\nattachSlugPlugin(${schemaName});`,
    );
  } else {
    content = content.replace(
      /module\.exports = mongoose\.model/,
      `attachListingVideosField(${schemaName});\n\nmodule.exports = mongoose.model`,
    );
    if (!content.includes(pluginRequire)) {
      content = content.replace(
        /const mongoose = require\([^)]+\);/,
        `$&\n${pluginRequire}`,
      );
    }
  }

  fs.writeFileSync(fp, content);
  console.log('patched', file);
}
