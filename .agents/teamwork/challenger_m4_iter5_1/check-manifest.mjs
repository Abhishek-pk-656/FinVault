import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('apps/web/.next/server/pages-manifest.json');
console.log('Manifest path:', manifestPath);

const content = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(content);
console.log('Manifest entries:', Object.keys(manifest).length);

for (const [route, relFile] of Object.entries(manifest)) {
  const fullPath = path.resolve('apps/web/.next/server', relFile);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : -1;
  console.log(`Route [${route}] -> ${relFile} (exists: ${exists}, size: ${size} bytes)`);
  if (!exists || size <= 0) {
    console.error(`ERROR: Target file ${fullPath} is invalid!`);
    process.exit(1);
  }
}

// Also check that no malformed directory exists
const bogusChunkServer = path.resolve('apps/web/.next/server/chunks/server');
const bogusExists = fs.existsSync(bogusChunkServer);
console.log(`Checking bogus server/chunks/server path: exists = ${bogusExists}`);
if (bogusExists) {
  console.error(`ERROR: Malformed directory detected: ${bogusChunkServer}`);
  process.exit(1);
}

// Check webpack-runtime.js
const webpackRuntime = path.resolve('apps/web/.next/server/webpack-runtime.js');
const wrExists = fs.existsSync(webpackRuntime);
const wrSize = wrExists ? fs.statSync(webpackRuntime).size : -1;
console.log(`webpack-runtime.js: exists = ${wrExists}, size = ${wrSize} bytes`);
if (!wrExists || wrSize <= 0) {
  console.error(`ERROR: webpack-runtime.js is missing or empty!`);
  process.exit(1);
}

console.log('ALL MANIFEST POINTERS AND CRITICAL ASSETS EMPIRICALLY CONFIRMED VALID ON DISK!');
