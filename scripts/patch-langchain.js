// Patches @langchain/core to add ./runnables/remote export
// Required because langchain@0.3.x (transitive via @copilotkit/runtime) 
// imports this subpath which was removed in @langchain/core@1.x
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const coreDir = path.join(projectRoot, 'node_modules', '@langchain', 'core');
const pkgPath = path.join(coreDir, 'package.json');
const distDir = path.join(coreDir, 'dist', 'runnables');

if (!fs.existsSync(pkgPath)) {
  console.log('[patch-langchain] @langchain/core not found, skipping');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

if (pkg.exports?.['./runnables/remote']) {
  console.log('[patch-langchain] Already patched');
  process.exit(0);
}

// Add export entry
pkg.exports['./runnables/remote'] = {
  require: {
    types: './dist/runnables/remote.d.cts',
    default: './dist/runnables/remote.cjs',
  },
  import: {
    types: './dist/runnables/remote.d.ts',
    default: './dist/runnables/remote.js',
  },
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Create shim files
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const cjsContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var all = require("../index.cjs");
for (var key in all) {
  if (key !== "default" && !Object.prototype.hasOwnProperty.call(exports, key)) {
    exports[key] = all[key];
  }
}
`;

const esmContent = `export * from '../index.js';\n`;

fs.writeFileSync(path.join(distDir, 'remote.cjs'), cjsContent);
fs.writeFileSync(path.join(distDir, 'remote.js'), esmContent);
fs.writeFileSync(path.join(distDir, 'remote.d.ts'), esmContent);
fs.writeFileSync(path.join(distDir, 'remote.d.cts'), esmContent);

console.log('[patch-langchain] Patched @langchain/core with ./runnables/remote export');
