const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const source = findBuiltAddon(root);
const crashDir = path.join(root, '.segfault');
const firstCopy = path.join(crashDir, 'a.node');
const secondCopy = path.join(crashDir, 'b.node');

fs.rmSync(crashDir, { recursive: true, force: true });
fs.mkdirSync(crashDir);
fs.copyFileSync(source, firstCopy);
fs.copyFileSync(source, secondCopy);

console.log('source:', source);
console.log('first copy:', describe(firstCopy));
console.log('second copy:', describe(secondCopy));
console.log('requiring first physical copy');
const a = require(firstCopy);
console.log('first copy loaded', a.mimallocVersion(), a.initCount());

console.log('requiring second physical copy; macOS should segfault here');
const b = require(secondCopy);
console.log('second copy loaded', b.mimallocVersion(), b.initCount());
console.log('no segfault on this platform');

function findBuiltAddon(searchRoot) {
  const candidates = fs.readdirSync(searchRoot)
    .filter((name) => name.startsWith('napi-mimalloc-repro.') && name.endsWith('.node'))
    .map((name) => path.join(searchRoot, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (candidates.length === 0) {
    throw new Error('No built .node file found; run `npm run build` first.');
  }

  return candidates[0];
}

function describe(file) {
  const stat = fs.statSync(file);
  return `${file} dev=${stat.dev} ino=${stat.ino} size=${stat.size}`;
}
