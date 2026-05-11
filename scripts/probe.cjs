const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = findBuiltAddon(root);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napi-rs-mimalloc-repro-'));
const aPath = path.join(tmpDir, 'a.node');
const bPath = path.join(tmpDir, 'b.node');
const hardlinkPath = path.join(tmpDir, 'c-hardlink.node');

fs.copyFileSync(source, aPath);
fs.copyFileSync(source, bPath);

let hardlinkReady = false;
try {
  fs.linkSync(aPath, hardlinkPath);
  hardlinkReady = true;
} catch (error) {
  console.log(`hardlink setup skipped: ${error.message}`);
}

const cases = [
  {
    name: 'single-source',
    code: `
      const addon = require(${JSON.stringify(source)});
      console.log('single-source ok', addon.mimallocVersion(), addon.initCount());
    `,
  },
  {
    name: 'same-source-twice',
    code: `
      const a = require(${JSON.stringify(source)});
      console.log('first source ok', a.mimallocVersion(), a.initCount());
      const b = require(${JSON.stringify(source)});
      console.log('second source ok', b.mimallocVersion(), b.initCount());
    `,
  },
  {
    name: 'copied-a-b',
    code: `
      const a = require(${JSON.stringify(aPath)});
      console.log('a copy ok', a.mimallocVersion(), a.initCount());
      const b = require(${JSON.stringify(bPath)});
      console.log('b copy ok', b.mimallocVersion(), b.initCount());
    `,
  },
  {
    name: 'copied-a-b-touch',
    code: `
      const a = require(${JSON.stringify(aPath)});
      console.log('a copy ok', a.mimallocVersion(), a.initCount());
      const b = require(${JSON.stringify(bPath)});
      console.log('b copy ok', b.mimallocVersion(), b.initCount());
      console.log('a touch', a.touch().toString(16), a.lastAllocation());
      console.log('b touch', b.touch().toString(16), b.lastAllocation());
    `,
  },
];

if (hardlinkReady) {
  cases.push({
    name: 'hardlink-a-c',
    code: `
      const a = require(${JSON.stringify(aPath)});
      console.log('a copy ok', a.mimallocVersion(), a.initCount());
      const c = require(${JSON.stringify(hardlinkPath)});
      console.log('hardlink copy ok', c.mimallocVersion(), c.initCount());
    `,
  });
}

console.log('# napi-rs mimalloc physical-copy repro');
console.log();
console.log(`node: \`${process.version}\``);
console.log(`platform: \`${process.platform}\``);
console.log(`arch: \`${process.arch}\``);
console.log(`native addon: \`${source}\``);
console.log(`native sha256: \`${sha256(source)}\``);
console.log();
console.log('| file | inode/dev | size |');
console.log('| --- | --- | --- |');
for (const file of [source, aPath, bPath, hardlinkReady ? hardlinkPath : null].filter(Boolean)) {
  const stat = fs.statSync(file);
  console.log(`| \`${path.basename(file)}\` | \`${stat.dev}:${stat.ino}\` | ${stat.size} |`);
}
console.log();
console.log('| case | result | status |');
console.log('| --- | --- | --- |');

const outputs = [];
let singleOk = true;

for (const testCase of cases) {
  const output = childProcess.spawnSync(process.execPath, ['-e', testCase.code], {
    encoding: 'utf8',
  });
  const status = describeStatus(output);
  const ok = output.status === 0 && output.signal === null;
  const result = ok ? 'ok' : 'crashed/failed';
  console.log(`| \`${testCase.name}\` | ${result} | \`${status}\` |`);
  outputs.push([testCase.name, status, output]);

  if (testCase.name === 'single-source' && !ok) {
    singleOk = false;
  }
}

console.log();
console.log('## child output');
for (const [name, status, output] of outputs) {
  console.log();
  console.log(`### ${name} (${status})`);
  printStream('stdout', output.stdout);
  printStream('stderr', output.stderr);
}

if (!singleOk) {
  process.exitCode = 1;
}

function findBuiltAddon(searchRoot) {
  const matches = [];
  visit(searchRoot, matches);
  const releaseMatches = matches.filter((file) => file.includes(`${path.sep}release${path.sep}`));
  const candidates = releaseMatches.length > 0 ? releaseMatches : matches;
  if (candidates.length === 0) {
    throw new Error(`No built .node file found under ${searchRoot}; run npm run build first`);
  }
  return candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function visit(dir, matches) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      visit(file, matches);
    } else if (entry.isFile() && entry.name.endsWith('.node')) {
      matches.push(file);
    }
  }
}

function describeStatus(output) {
  if (output.signal) {
    return `signal ${output.signal}`;
  }
  return `exit ${output.status}`;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function printStream(name, value) {
  if (!value) {
    return;
  }
  console.log('```text');
  console.log(`${name}:`);
  process.stdout.write(value);
  if (!value.endsWith('\n')) {
    console.log();
  }
  console.log('```');
}
