// The case files under cases/ and the plain numbered list they are chosen from.

const fs = require('fs');
const path = require('path');
const { CASES_DIR } = require('./paths');
const { ask } = require('./console');

// ---------------- Case selection ----------------
// Every case file under cases/, at any depth. dir is the folder of a case inside cases/ ('' = directly in it):
// QA exports one folder per spec, i.e. per lifecycle event (cases/trade-cancellation/TC-....json)
function listCases(dir = CASES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) // the same order on every computer
    .flatMap((e) => {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) return listCases(file);
      if (!e.name.toLowerCase().endsWith('.json')) return [];
      const rel = path.relative(CASES_DIR, file).split(path.sep);
      const where = { file, id: rel.at(-1).slice(0, -'.json'.length), dir: rel.slice(0, -1).join('/') };
      try {
        return [{ ...where, doc: JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) }];
      } catch (err) {
        return [{ ...where, error: err.message }];
      }
    });
}

// A list longer than this is cut: with hundreds of cases the PO narrows it by typing text instead of scrolling
const LIST_MAX = 40;
const inFolder = (c, dir) => !dir || c.dir === dir || c.dir.startsWith(`${dir}/`);

// What a folder shows: its sub-folders (with the number of cases below each), then the cases directly in it
function folderEntries(cases, dir) {
  const folders = new Map();
  const here = [];
  for (const c of cases.filter((x) => inFolder(x, dir))) {
    if (c.dir === dir) { here.push(c); continue; }
    const name = c.dir.slice(dir ? dir.length + 1 : 0).split('/')[0];
    folders.set(name, (folders.get(name) || 0) + 1);
  }
  return [...[...folders].map(([name, count]) => ({ folder: dir ? `${dir}/${name}` : name, name, count })), ...here];
}

// The cases in a folder (and below it) that contain every word typed, in their ID, folder, name or description
function searchCases(cases, dir, text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return cases.filter((c) => {
    if (!inFolder(c, dir)) return false;
    const hay = `${c.dir} ${c.id} ${c.doc.name || ''} ${c.doc.description || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function printEntries(entries, dir) {
  const shown = entries.slice(0, LIST_MAX);
  const detailed = shown.length <= 20; // descriptions only in a short list, a long one stays one line per case
  shown.forEach((e, i) => {
    const no = `  ${String(i + 1).padStart(2)}. `;
    if (e.folder) {
      console.log(`${no}${e.name}/   (${e.count} case${e.count === 1 ? '' : 's'})`);
      return;
    }
    const name = e.doc.name || e.id;
    console.log(`${no}${name}${name.includes(e.id) ? '' : `   [${e.id}.json]`}${e.dir === dir ? '' : `   (in ${e.dir})`}`);
    if (detailed && e.doc.description) console.log(`      ${e.doc.description}`);
  });
  if (entries.length > shown.length) console.log(`\n  ... and ${entries.length - shown.length} more. Type text to narrow the list.`);
  return shown;
}

// The numbered list, for where the tree further down cannot be shown (piped input, a very small window,
// OREO_PLAIN_MENU=1): it only prints lines and reads typed answers.
// Where the PO is in the case list: the folder, the folders above it and the search text. Kept while the window is
// open, so that after a run the list comes back at the same place: the next case is usually next to the one just run
let place = null;

async function chooseCase(cases) {
  console.log(`\nFound ${cases.length} case(s) in ${CASES_DIR}:`);

  // A folder that holds nothing but one sub-folder is not worth a question
  const open = (dir) => {
    for (;;) {
      const entries = folderEntries(cases, dir);
      if (entries.length !== 1 || !entries[0].folder) return dir;
      dir = entries[0].folder;
    }
  };
  // The case files may have changed since the last run in this window: a folder that is gone means starting at the top
  if (!place || !cases.some((c) => inFolder(c, place.dir))) place = { dir: open(''), back: [], search: '' };
  let { dir, search } = place;
  const back = place.back; // the folders the PO came through, for B
  if (search && !searchCases(cases, dir, search).length) search = '';
  let shown, question;
  for (let list = true; ; ) {
    if (list) {
      const entries = search ? searchCases(cases, dir, search) : folderEntries(cases, dir);
      if (search) console.log(`\n${entries.length} case(s) match "${search}"${dir ? ` in ${dir}` : ''}:\n`);
      else console.log(dir ? `\n${dir}/  (${cases.filter((c) => inFolder(c, dir)).length} case(s)):\n` : '');
      shown = printEntries(entries, dir);
      const hasFolders = shown.some((e) => e.folder), hasCases = shown.some((e) => !e.folder);
      const what = hasFolders && hasCases ? 'open a folder or run a case' : hasFolders ? 'open a folder' : 'run a case';
      question = `\nEnter a number to ${what} (${shown.length > 1 ? `1-${shown.length}; ` : ''}just Enter = 1), `
        + `or type ${search ? 'other text to search again' : 'text to search, e.g. a product or part of a case ID'}`
        + `${search || back.length ? ', or B to go back' : ''}: `;
    }
    const answer = await ask(question);
    list = true;

    if ((search || back.length) && /^b$/i.test(answer)) {
      if (search) search = ''; else dir = back.pop();
      continue;
    }
    // A number picks from the list; anything else is searched for, also digits with a leading zero such as 001
    if (answer !== '' && !/^[1-9]\d*$/.test(answer)) {
      if (searchCases(cases, dir, answer).length) { search = answer; continue; }
      console.log(`\nNo case matches "${answer}"${dir ? ` in ${dir}` : ''}.`);
      list = false; // ask again under the list that is already on the screen
      continue;
    }
    const picked = shown[answer === '' ? 0 : Number(answer) - 1];
    if (!picked) {
      console.log(`\nThere is no number ${answer} in this list.`);
      list = false;
      continue;
    }
    if (!picked.folder) {
      console.log(`\nSelected: ${picked.doc.name || picked.id}`);
      place = { dir, back, search };
      return picked;
    }
    back.push(dir);
    dir = open(picked.folder);
    search = '';
  }
}

module.exports = { listCases, inFolder, folderEntries, searchCases, chooseCase };
