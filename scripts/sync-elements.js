// Refreshes elements/ from the Java + Cucumber E2E project, where the element locators are maintained:
//   npm run sync:elements -- "C:\path\to\the-e2e-project"     (or set OREO_E2E_DIR; its elements folder works too)
// Every *.json under <project>/src/test/resources/elements is copied to the same place under elements/, and a json
// that no longer exists there is removed here. Then elements/ is checked against framework/ (without a path, this
// check is all it does): elements the page objects use that are not defined, and hand-written testids that an
// element defines, i.e. locators that can be replaced with element('<name>').

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'elements');
const IN_PROJECT = path.join('src', 'test', 'resources', 'elements');
// Keep in step with FIND_BY in framework/elements.ts
const SUPPORTED = ['testId'];
// A locator file has no reason to hold a server address, and this repo must never contain one
const ADDRESS = /https?:\/\/|\b\d{1,3}(?:\.\d{1,3}){3}\b/i;

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/** Paths of the files with that extension under dir, relative to it, with forward slashes */
function filesUnder(dir, ext, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(file, ext, base);
    return entry.name.endsWith(ext) ? [path.relative(base, file).replace(/\\/g, '/')] : [];
  }).sort();
}

function parseList(text, label) {
  let list;
  try {
    list = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(`${label} is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(list)) fail(`${label} must be a list of { name, lookupDetails }`);
  return list;
}

function sync(from) {
  const inProject = path.join(from, IN_PROJECT);
  const src = path.resolve(fs.existsSync(inProject) ? inProject : from);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) fail(`Not a folder: ${src}`);
  const files = filesUnder(src, '.json');
  if (!files.length) fail(`No element json was found under ${src}`);

  // Read and check everything first, so that a problem leaves elements/ untouched
  const texts = new Map(files.map((file) => [file, fs.readFileSync(path.join(src, file), 'utf-8')]));
  const unsafe = files.filter((file) => ADDRESS.test(texts.get(file)));
  if (unsafe.length) fail(`Nothing was copied. These files seem to contain a server address, which must not get into this repo: ${unsafe.join(', ')}`);
  for (const file of files) parseList(texts.get(file), file);

  console.log(`Source: ${src}`);
  const counts = { added: 0, changed: 0, removed: 0 };
  const note = (what, file) => { counts[what]++; console.log(`  ${what.padEnd(8)}${file}`); };
  for (const file of files) {
    const dest = path.join(DEST, file);
    const old = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf-8') : undefined;
    if (old === texts.get(file)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, texts.get(file));
    note(old === undefined ? 'added' : 'changed', file);
  }
  for (const file of filesUnder(DEST, '.json').filter((f) => !texts.has(f))) {
    fs.rmSync(path.join(DEST, file));
    note('removed', file);
  }
  const total = counts.added + counts.changed + counts.removed;
  console.log(total ? `  ${files.length} files: ${counts.added} added, ${counts.changed} changed, ${counts.removed} removed` : `  elements/ is already up to date (${files.length} files)`);
  return total > 0;
}

/** Compares elements/ with what framework/ refers to. Found by text, which is enough for the way pages are written */
function check() {
  const defined = new Map(); // name -> { file, findBy, value }
  const byTestId = new Map(); // testid -> name
  const files = filesUnder(DEST, '.json');
  for (const file of files) {
    for (const item of parseList(fs.readFileSync(path.join(DEST, file), 'utf-8'), `elements/${file}`)) {
      if (!item || typeof item.name !== 'string') continue;
      const { findBy, value } = item.lookupDetails || {};
      defined.set(item.name, { file, findBy, value });
      if (findBy === 'testId' && !byTestId.has(value)) byTestId.set(value, item.name);
    }
  }

  const used = new Map(); // name -> source file
  const handWritten = []; // testids written in a page object or component
  for (const file of filesUnder(path.join(ROOT, 'framework'), '.ts')) {
    const text = fs.readFileSync(path.join(ROOT, 'framework', file), 'utf-8');
    for (const m of text.matchAll(/\belement(?:\(|:)\s*'([^']+)'/g)) if (!used.has(m[1])) used.set(m[1], file);
    for (const m of text.matchAll(/\btestId:\s*'([^']+)'/g)) handWritten.push({ file, testId: m[1] });
  }

  console.log(`\nelements/: ${defined.size} elements in ${files.length} files; framework/ uses ${used.size} of them`);

  const others = new Map(); // findBy -> how many elements
  for (const { findBy } of defined.values()) if (!SUPPORTED.includes(findBy)) others.set(findBy, (others.get(findBy) || 0) + 1);
  if (others.size) {
    console.log(`\nFound by something else than ${SUPPORTED.join(' / ')} (to use one, add its kind to FIND_BY in framework/elements.ts):`);
    for (const [findBy, count] of others) console.log(`  ${findBy}: ${count}`);
  }

  const replaceable = handWritten.filter((h) => byTestId.has(h.testId));
  if (replaceable.length) {
    console.log('\nHand-written testids that an element defines; use the element instead:');
    for (const h of replaceable) console.log(`  framework/${h.file}: '${h.testId}'  ->  element('${byTestId.get(h.testId)}')`);
  }

  const problems = [];
  for (const [name, file] of used) {
    const element = defined.get(name);
    if (!element) problems.push(`framework/${file}: element '${name}' is not defined`);
    else if (!SUPPORTED.includes(element.findBy)) problems.push(`framework/${file}: element '${name}' (${element.file}) is found by "${element.findBy}", which is not supported yet`);
  }
  if (problems.length) fail(`The page objects cannot find their elements (renamed in the E2E project? then change the name in the page object):\n  ${problems.join('\n  ')}`);
  console.log('\n✔ Every element the page objects use is defined');
}

const from = process.argv[2] || process.env.OREO_E2E_DIR;
const changed = from ? sync(from) : false;
if (!from) console.log('No E2E project given (path argument or OREO_E2E_DIR): checking elements/ only');
check();
if (changed) console.log('Run the cases (npx playwright test) and commit elements/');
