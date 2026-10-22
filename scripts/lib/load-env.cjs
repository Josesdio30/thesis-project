const path = require('node:path');
const { loadEnvConfig } = require('@next/env');

/** Same file precedence, quoting, expansion and process-env priority as Next.js. */
function loadProjectEnv(root = path.resolve(__dirname, '../..')) {
  return loadEnvConfig(root, process.env.NODE_ENV !== 'production');
}
module.exports = { loadProjectEnv };
