#!/usr/bin/env node
// PO-side runner: reads case files from cases/ and really executes them in the local browser.
// Usage:
//   double-click run-case.bat               -> the folders under cases/ as a list: the arrow keys move, Right / Left open
//                                              or close a folder, typing searches, Enter runs the case. Space ticks
//                                              cases or a whole folder, which Enter then runs together: one after
//                                              another, or several at the same time. After a run the window goes back
//                                              to the list for the next case
//   drag a case .json onto run-case.bat     -> run that case directly
//   drag a folder or several case files     -> run all those cases together
//   node runner/runner.js cases/<folder>/xxx.json
//   node runner/runner.js cases/<folder>
//   double-click view-trace.bat             -> serve reports and full replays (trace viewer) of earlier runs
// Where the list cannot be redrawn (piped input, a very small window) or with OREO_PLAIN_MENU=1, the cases are
// offered as numbered folders instead: a number opens a folder or runs a case, text searches.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('@playwright/test');
const { FORMAT_VERSION, executeStep, savedValues, describeStep, showPlaceholders, resolveDataFile, dataFilesOf } = require('../core/actions');
const { loadConfig, launchOptions, secretEntries } = require('../core/config');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'cases');
const EVIDENCE_DIR = path.join(ROOT, 'evidence');

// ---------------- Command-line interaction ----------------
// No history: readline would keep every answer, also a password typed at a hidden prompt, and show it again when
// the Up key is pressed at a later prompt
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
let muted = false;
// While the case is running on a real console, typed keys are not echoed (they would garble the step log)
let quietKeys = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
const interactive = !!process.stdin.isTTY;

// Read line by line through the async iterator: input is buffered, so no line is lost to prompt timing
const lines = rl[Symbol.asyncIterator]();
let typedLines = 0, readLines = 0;
// Set once the input has ended (piped input used up, console closed): nothing more can be asked
let inputEnded = false;
rl.on('line', () => { typedLines++; });
async function readLine(q, hidden, optional) {
  rl.output.write(q);
  muted = hidden;
  const { value, done } = await lines.next();
  readLines++;
  muted = quietKeys;
  if (hidden) rl.output.write('\n');
  if (done) {
    inputEnded = true;
    if (optional) { rl.output.write('\n'); return ''; }
    throw new Error('Input ended before the required information was provided');
  }
  return value;
}
const ask = async (q) => (await readLine(q, false)).trim();
const askHidden = (q) => readLine(q, true);
// For prompts that have a default: when the input has ended (piped input, closed window) the default is used
const askOptional = async (q) => (await readLine(q, false, true)).trim();

// Throw away whatever was typed while the case was running, so that a stray Enter cannot answer the next prompt.
// Only on a real console: piped input is buffered up front and every line of it is an intended answer.
async function discardTyped() {
  if (!interactive) return;
  while (readLines < typedLines) { await lines.next(); readLines++; }
  rl.line = '';
  rl.cursor = 0;
}
function setQuietKeys(on) { quietKeys = interactive && on; muted = quietKeys; }
const fmtSec = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`);
const plural = (n) => `${n} case${n === 1 ? '' : 's'}`;

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

// ---------------- Case selection: the tree (console) ----------------
// On a console the cases are a tree that is redrawn in place: at first only the folders (one per lifecycle event), a
// folder opens to show its cases, and the keyboard picks what to run. With hundreds of cases the screen stays short:
// closed folders hide them and typing filters them.
const QUIT = Symbol('quit'); // the PO closed the list with Ctrl+C
const LOOSE = '/'; // key of the row holding the case files that lie directly in cases/; a real folder key never is '/'
// Kept while the window is open, so that after a run the list comes back as it was left
const tree = { open: null, filter: '', cursor: '', top: 0, ticked: new Set() };

// The cursor is hidden while the list is shown. However the runner ends, the console gets it back
let cursorHidden = false;
process.on('exit', () => { if (cursorHidden) process.stdout.write('\x1b[?25h'); });

// The tree needs single key presses and a screen it can redraw: everything else gets the numbered list above
const useTree = () => interactive && process.stdout.isTTY && !process.env.OREO_PLAIN_MENU
  && process.stdout.rows >= 15 && process.stdout.columns >= 60;

// Columns a text takes on a console: East Asian wide characters take two
const isWide = (cp) => cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
  || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || cp >= 0x1f300);
const textWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
// One console line: no line breaks or control characters, cut with "..." when it is longer than width
function fit(text, width) {
  const s = String(text).replace(/[\x00-\x1f\x7f]+/g, ' ');
  if (textWidth(s) <= width) return s;
  let out = '', w = 0;
  for (const ch of s) {
    const cw = isWide(ch.codePointAt(0)) ? 2 : 1;
    if (w + cw > width - 3) break;
    out += ch;
    w += cw;
  }
  return `${out}...`;
}
const padTo = (s, width) => s + ' '.repeat(Math.max(0, width - textWidth(s)));
// A text broken at spaces into at most max lines of the given width; what does not fit is cut
function wrapText(text, width, max) {
  const lines = [];
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last === undefined || textWidth(last) + 1 + textWidth(word) > width) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  return [...lines.slice(0, max - 1), ...(lines.length >= max ? [lines.slice(max - 1).join(' ')] : [])].map((l) => fit(l, width));
}
// Short texts put on as few lines as possible, three spaces apart
function flowText(items, width) {
  const lines = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last === undefined || textWidth(last) + 3 + textWidth(item) > width) lines.push(item);
    else lines[lines.length - 1] = `${last}   ${item}`;
  }
  return lines.map((l) => fit(l, width));
}

// The rows of the tree as it is now: every folder, and below an open folder what it holds. With a search text only
// the matching cases are left and every folder that holds one is shown open.
function treeRows(cases, st) {
  const shown = st.filter ? searchCases(cases, '', st.filter) : cases;
  const grouped = cases.some((c) => c.dir);
  const rows = [];
  const folderRow = (folder, name, list, depth) => {
    const open = !!st.filter || st.open.has(folder);
    rows.push({ key: `d:${folder}`, folder, name, cases: list, depth, open });
    return open;
  };
  const caseRow = (c, depth) => rows.push({ key: `c:${c.file}`, case: c, depth });
  const walk = (dir, depth) => {
    for (const e of folderEntries(shown, dir)) {
      if (e.folder) { if (folderRow(e.folder, e.name, shown.filter((c) => inFolder(c, e.folder)), depth)) walk(e.folder, depth + 1); }
      else if (dir || !grouped) caseRow(e, depth);
    }
  };
  walk('', 0);
  // Case files directly in cases/ (the layout before folders) get a row of their own after the folders, so that the
  // first screen is the folders only. Without any folder the cases are simply listed.
  const loose = grouped ? shown.filter((c) => !c.dir) : [];
  if (loose.length && folderRow(LOOSE, '(not in a folder)', loose, 0)) for (const c of loose) caseRow(c, 1);
  return { rows, shown };
}

/** Resolves to the cases to run (one, or the ticked ones), or to QUIT */
function pickCases(cases) {
  const out = process.stdout;
  const st = tree;
  // First time: only the folders, closed. A single folder is opened, there is nothing else to choose from
  if (!st.open) {
    const top = folderEntries(cases, '');
    st.open = new Set(top.length === 1 && top[0].folder ? [top[0].folder] : []);
  }
  let rows = [], shown = [], cur = 0, drawn = 0, win = 1;

  // The folders above a row, nearest first: where the cursor goes with Left, or when its row is no longer shown
  const parents = (key) => {
    let dir = key.slice(2);
    if (key.startsWith('c:')) {
      const c = cases.find((x) => x.file === dir);
      if (!c) return [];
      if (!c.dir) return [`d:${LOOSE}`];
      dir = `${c.dir}/`;
    }
    const list = [];
    while (dir.includes('/') && dir !== LOOSE) list.push(`d:${dir = dir.slice(0, dir.lastIndexOf('/'))}`);
    return list;
  };
  const rebuild = (toFirstCase) => {
    ({ rows, shown } = treeRows(cases, st));
    const at = (key) => rows.findIndex((r) => r.key === key);
    let i = toFirstCase ? rows.findIndex((r) => r.case) : at(st.cursor);
    for (const p of i < 0 && st.cursor ? parents(st.cursor) : []) if ((i = at(p)) >= 0) break;
    cur = Math.max(0, Math.min(i < 0 ? cur : i, rows.length - 1));
    st.cursor = rows[cur] ? rows[cur].key : '';
  };
  const moveTo = (i) => {
    cur = Math.max(0, Math.min(i, rows.length - 1));
    st.cursor = rows[cur] ? rows[cur].key : '';
  };

  const build = () => {
    const W = Math.max(20, (out.columns || 80) - 1); // one column less than the window, so that no line ever wraps
    const H = out.rows || 24;
    const ticked = st.ticked.size;
    const hints = flowText([
      'Up/Down: move',
      !st.filter && 'Right/Left: open or close a folder',
      ticked ? `Enter: run the ${plural(ticked)} you ticked` : 'Enter: run the case',
      'Space: tick a case or a whole folder, to run several',
      st.filter ? 'Esc: clear the search' : 'Type: search',
      !st.filter && ticked && 'Esc: untick all',
      'Ctrl+C: close',
    ].filter(Boolean), W - 2).map((l) => `  ${l}`);
    const detail = H >= 20; // the description of the highlighted case, when the window has room for it
    const room = Math.max(3, H - 1 - (3 + hints.length + (detail ? 3 : 0)));
    const scroll = rows.length > room;
    win = scroll ? room - 2 : room;
    st.top = Math.max(0, Math.min(Math.max(Math.min(st.top, cur), cur - win + 1), rows.length - win));

    const lines = [fit(st.filter
      ? `Search: ${st.filter}   (${shown.length} of ${plural(cases.length)}${ticked ? `, ${ticked} ticked` : ''})`
      : `Choose a case to run   (${plural(cases.length)}${ticked ? `, ${ticked} ticked` : ''})`, W), ''];
    if (!rows.length) lines.push(fit(`  No case matches "${st.filter}".`, W));
    const part = rows.slice(st.top, st.top + win);
    const idWidth = Math.min(48, Math.max(0, ...rows.filter((r) => r.case).map((r) => textWidth(r.case.id))));
    if (scroll) lines.push(st.top > 0 ? `      ... ${st.top} more above` : '');
    part.forEach((r, i) => {
      const here = st.top + i === cur;
      const n = r.folder ? r.cases.filter((c) => st.ticked.has(c.file)).length : 0;
      const indent = '  '.repeat(r.depth);
      let text;
      if (r.folder) {
        const box = n === 0 ? '[ ]' : n === r.cases.length ? '[x]' : '[-]';
        text = `${indent}${r.open ? '-' : '+'} ${box} ${r.folder === LOOSE ? r.name : `${r.name}/`}   (${plural(r.cases.length)}${n ? `, ${n} ticked` : ''})`;
      } else {
        const name = r.case.doc.name || '';
        // the ID is its own column, so it is not repeated in front of the name
        const title = name.startsWith(`[${r.case.id}]`) ? name.slice(r.case.id.length + 2).trim() : name === r.case.id ? '' : name;
        text = `${indent}  ${st.ticked.has(r.case.file) ? '[x]' : '[ ]'} ${padTo(fit(r.case.id, idWidth), idWidth)}   ${title}`.trimEnd();
      }
      const line = fit(`${here ? '>' : ' '} ${text}`, W);
      lines.push(here ? `\x1b[7m${padTo(line, W)}\x1b[0m` : line);
    });
    if (scroll) {
      const below = rows.length - st.top - win;
      lines.push(below > 0 ? `      ... ${below} more below` : '');
    }
    lines.push('');
    if (detail) {
      const text = rows[cur] && rows[cur].case ? wrapText(rows[cur].case.doc.description || '', W - 4, 2) : [];
      lines.push(`    ${text[0] || ''}`, `    ${text[1] || ''}`, '');
    }
    return [...lines, ...hints];
  };
  // Only the list itself is redrawn (cursor up to its first line, erase from there, write), never the whole screen:
  // what the earlier runs printed stays above it. These are the sequences readline itself uses, so they work on a
  // Windows console as well.
  const erase = () => `${drawn ? `\x1b[${drawn}A` : ''}\x1b[1G\x1b[0J`;
  const paint = () => {
    const lines = build();
    out.write(`${erase()}${lines.join('\n')}\n`);
    drawn = lines.length;
  };
  // A window of another size has wrapped or cut the lines that are on the screen, so their number is no longer
  // known: the list starts again on an empty screen
  const onResize = () => {
    out.write('\x1b[2J\x1b[H');
    drawn = 0;
    paint();
  };

  return new Promise((resolve) => {
    const done = (result) => {
      process.stdin.off('keypress', onKey);
      out.off('resize', onResize);
      out.write(`${erase()}\x1b[?25h`);
      cursorHidden = false;
      delete rl._ttyWrite;
      muted = quietKeys;
      rl.line = '';
      rl.cursor = 0;
      resolve(result);
    };
    const onKey = (s, key) => {
      key = key || {};
      const row = rows[cur];
      if (key.ctrl) {
        if (key.name === 'c') done(QUIT);
        return;
      }
      let toFirstCase = false;
      switch (key.name) {
        case 'up': moveTo(cur - 1); break;
        case 'down': moveTo(cur + 1); break;
        case 'pageup': moveTo(cur - win); break;
        case 'pagedown': moveTo(cur + win); break;
        case 'home': moveTo(0); break;
        case 'end': moveTo(rows.length - 1); break;
        case 'right':
          if (!row || !row.folder) break;
          if (!row.open) st.open.add(row.folder);
          else if (rows[cur + 1] && rows[cur + 1].depth > row.depth) moveTo(cur + 1);
          break;
        case 'left':
          if (!row) break;
          if (row.folder && row.open && !st.filter) st.open.delete(row.folder);
          else if (parents(row.key).length) st.cursor = parents(row.key)[0];
          break;
        case 'return':
        case 'enter': {
          // Ticked cases are run together, in the order of the list; without ticks Enter means the highlighted row
          const picked = st.ticked.size ? cases.filter((c) => st.ticked.has(c.file)) : row && row.case ? [row.case] : null;
          if (picked) {
            st.ticked.clear(); // a tick that is forgotten in a closed folder would turn the next Enter into a batch
            done(picked);
            return;
          }
          if (row && row.folder && !st.filter) {
            if (st.open.has(row.folder)) st.open.delete(row.folder); else st.open.add(row.folder);
          }
          break;
        }
        case 'space': {
          if (!row) break;
          const list = row.case ? [row.case] : row.cases;
          const all = list.every((c) => st.ticked.has(c.file));
          for (const c of list) { if (all) st.ticked.delete(c.file); else st.ticked.add(c.file); }
          break;
        }
        case 'backspace':
          if (!st.filter) return;
          st.filter = st.filter.slice(0, -1);
          toFirstCase = !!st.filter;
          break;
        case 'escape':
          if (st.filter) st.filter = '';
          else if (st.ticked.size) st.ticked.clear();
          else return;
          break;
        default:
          // Any other character is searched for. A space cannot be part of it: Space ticks
          if (key.meta || typeof s !== 'string' || [...s].length !== 1 || s <= ' ' || s === '\x7f') return;
          st.filter += s;
          toFirstCase = true;
      }
      rebuild(toFirstCase);
      paint();
    };

    // While the list is shown readline must not see the keys: it would echo them, collect them as a typed line and
    // answer the next prompt with it, and close the input on Ctrl+C or Ctrl+D
    rl._ttyWrite = () => {};
    muted = true;
    for (const f of [...st.ticked]) if (!cases.some((c) => c.file === f)) st.ticked.delete(f);
    if (st.filter && !searchCases(cases, '', st.filter).length) st.filter = '';
    out.write('\n\x1b[?25l');
    cursorHidden = true;
    rebuild(false);
    paint();
    process.stdin.on('keypress', onKey);
    out.on('resize', onResize);
  });
}

function printSelected(list) {
  console.log(`Selected ${list.length} cases:`);
  for (const c of list.slice(0, 20)) console.log(`  ${c.id || path.basename(c.file, '.json')}`);
  if (list.length > 20) console.log(`  ... and ${list.length - 20} more`);
}

/** The cases the PO wants to run: null when there are none to choose from, QUIT when the PO closes the list */
async function chooseCases() {
  const cases = listCases().filter((c) => !c.error);
  if (!cases.length) {
    console.log(`\nThere are no cases in the cases folder. Put the .json case files provided by QA into:\n  ${CASES_DIR}\n`);
    return null;
  }
  if (!useTree()) return [await chooseCase(cases)];
  const picked = await pickCases(cases);
  if (picked === QUIT) return QUIT;
  if (picked.length === 1) console.log(`Selected: ${picked[0].doc.name || picked[0].id}`);
  else printSelected(picked);
  return picked;
}

// Cases named on the command line: a case file or a folder dragged onto run-case.bat, or several of them.
// A folder stands for every case below it.
function casesFromArgs(args) {
  const list = [];
  for (const arg of args) {
    const file = path.resolve(arg);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      for (const c of listCases(file)) {
        if (c.error) console.log(`Skipped ${path.basename(c.file)}: it is not a case file (${c.error.split('\n')[0]})`);
        else list.push(c);
      }
    } else {
      list.push({ file, id: path.basename(file, '.json'), doc: JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) });
    }
  }
  const cases = list.filter((c, i) => list.findIndex((x) => x.file === c.file) === i);
  if (!cases.length) {
    console.log(`\nThere are no case files in: ${args.join(', ')}\n`);
    return null;
  }
  if (cases.length > 1) { console.log(''); printSelected(cases); }
  return cases;
}

// ---------------- Report ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Step titles written as Given / When / Then get the keyword emphasized, so the report reads like a BDD scenario
const bdd = (title) => esc(title).replace(/^(Given|When|Then|And|But)\b/, '<b class="kw">$1</b>');

const STATUS_TEXT = { passed: 'Passed', failed: 'Failed', skipped: 'Not run' };

// Group the recorded actions by BDD step: a titled action starts a new group and the untitled ones after it belong to it.
// A substep (a step of the flow behind the case's step) is a heading inside the group's action list
function groupSteps(steps) {
  const groups = [];
  steps.forEach((s, i) => {
    if (s.title || !groups.length) groups.push({ title: s.title || '', actions: [] });
    groups[groups.length - 1].actions.push({ ...s, no: i + 1 });
  });
  for (const g of groups) {
    const failed = g.actions.find((a) => a.status === 'failed');
    g.status = failed ? 'failed' : g.actions.every((a) => a.status === 'passed') ? 'passed' : g.actions.some((a) => a.status === 'passed') ? 'failed' : 'skipped';
    g.error = failed && failed.error;
    // The screenshot that represents the step: where it failed, otherwise how the page looked when it finished
    g.screenshot = (failed || [...g.actions].reverse().find((a) => a.screenshot) || {}).screenshot;
    // What the step read or received (e.g. the ID of a trade it created), shown in its row
    g.saved = Object.assign({}, ...g.actions.map((a) => a.saved || {}));
    g.pausedSec = g.actions.reduce((sum, a) => sum + (a.pausedSec || 0), 0);
    g.paused = g.actions.some((a) => a.pausedSec !== undefined);
  }
  return groups;
}

function writeReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const shot = (file) => (file ? `<a href="${esc(file)}" target="_blank"><img src="${esc(file)}"></a>` : '');
  const groups = groupSteps(run.steps);
  const rows = groups.map((g, i) => {
    const actions = g.actions.map((a) => `
          ${a.substep ? `<li class="sub">${bdd(a.substep)}</li>` : ''}<li class="${a.status}"><span class="no">${a.no}.</span> ${esc(a.desc)} <span class="st">${STATUS_TEXT[a.status]}</span>${a.screenshot ? ` <a href="${esc(a.screenshot)}" target="_blank">screenshot</a>` : ''}${a.pausedSec !== undefined ? `<div class="paused">Paused for ${fmtSec(a.pausedSec)} after this action</div>` : ''}</li>`).join('');
    return `
    <tr class="${g.status}">
      <td>${i + 1}</td>
      <td><div class="step">${bdd(g.title) || esc(g.actions[0].desc)}</div>${Object.entries(g.saved).map(([k, v]) => `<div class="saved">${esc(k)}: <b>${esc(v)}</b></div>`).join('')}${g.error ? `<pre>${esc(g.error)}</pre>` : ''}${g.paused ? `<div class="paused">Paused for ${fmtSec(g.pausedSec)} during this step</div>` : ''}
        <details${g.status === 'failed' ? ' open' : ''}><summary>${g.actions.length} action${g.actions.length === 1 ? '' : 's'}</summary><ul>${actions}</ul></details></td>
      <td>${STATUS_TEXT[g.status]}</td>
      <td>${shot(g.screenshot)}</td>
    </tr>`;
  }).join('');
  const count = (st) => groups.filter((g) => g.status === st).length;
  const summary = `${groups.length} step${groups.length === 1 ? '' : 's'}: ${count('passed')} passed${count('failed') ? `, ${count('failed')} failed` : ''}${count('skipped') ? `, ${count('skipped')} not run` : ''}`;
  // The data the case ran with; a value the PO changed for this run is flagged, with the value of the case file
  const caseData = run.caseData && run.caseData.length ? `<table class="data"><caption>Case data</caption><tbody>${run.caseData.map((d) => `
    <tr><td>${esc(d.name)}</td><td>${esc(d.value)}${d.changedFrom !== undefined ? ` <span class="changed">changed for this run (case file: ${esc(d.changedFrom)})</span>` : ''}</td></tr>`).join('')}
</tbody></table>
` : '';
  // What the run read or received from the system, above all the IDs of what it created
  const values = Object.entries(run.values || {});
  const runValues = values.length ? `<table class="data"><caption>Values from this run</caption><tbody>${values.map(([k, v]) => `
    <tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
</tbody></table>
` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(run.caseName)} - Execution Report</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .kw{color:#1d4ed8} .desc{font-size:13px;margin:0 0 6px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:13px}
  .badge.passed{background:#16a34a} .badge.failed{background:#dc2626}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  tr.failed td{background:#fef2f2} tr.skipped td{color:#9ca3af}
  .step{font-size:14px} li.sub{list-style:none;margin:6px 0 2px -14px;font-weight:600;color:#374151}
  details{margin-top:6px;color:#4b5563;font-size:12px} summary{cursor:pointer;color:#6b7280}
  ul{list-style:none;margin:6px 0 0;padding:0} li{padding:2px 0} li.skipped{color:#9ca3af}
  .no{color:#9ca3af} .st{color:#16a34a} li.failed .st{color:#dc2626} li.skipped .st{color:#9ca3af}
  img{max-width:240px;border:1px solid #e5e7eb;border-radius:4px}
  pre{white-space:pre-wrap;color:#b91c1c;font-size:12px;margin:6px 0 0}
  .paused{color:#b45309;font-size:12px;margin-top:6px} .saved{font-size:12px;margin-top:4px;color:#374151}
  table.data{width:auto;margin-bottom:16px} table.data caption{text-align:left;font-weight:600;padding:0 8px 2px}
  table.data td{padding:4px 8px} table.data td:first-child{color:#6b7280} .changed{color:#b45309}
  video{max-width:100%;margin-top:16px;border:1px solid #e5e7eb}
</style></head><body>
<h1><span class="kw">Scenario:</span> ${esc(run.caseName)} <span class="badge ${run.status}">${run.status === 'passed' ? 'Passed' : 'Failed'}</span></h1>
${run.description ? `<p class="desc">${esc(run.description)}</p>` : ''}
<div class="meta">${summary} · Machine: ${esc(run.machine)} · Started: ${esc(run.startedAt)} · Duration: ${fmtSec(run.durationSec)}${run.pausedSec ? ` (plus ${fmtSec(run.pausedSec)} paused)` : ''}${run.stepByStep ? ' · Mode: step by step' : ''} · Case source: ${esc(run.source)} · Version: ${esc(run.codeVersion)}</div>
${caseData}${runValues}<table><thead><tr><th>#</th><th>Step</th><th>Result</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>
${run.video ? `<video src="${esc(run.video)}" controls></video>` : ''}
<p class="meta">Full replay: <a href="${esc(run.traceUrl)}">Open trace viewer</a><br>
Opens the trace viewer (every action with page snapshots, console and network). The link works while the runner window is still open; later, double-click view-trace.bat first. The same data is in trace.zip in this folder.</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

function openFile(file) {
  try {
    const { spawn } = require('child_process');
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* fine if it cannot be opened; the path has already been printed */ }
}

// ---------------- Report and trace viewer links ----------------
// Playwright's trace viewer is a static web app shipped inside playwright-core, but it needs http (a service
// worker), so a file:// link cannot open it. A tiny local-only server serves the viewer and the evidence
// folder, which gives every report and every trace.zip a URL.
const VIEW_HOST = '127.0.0.1';
const viewPort = (config) => Number(process.env.OREO_VIEW_PORT) || Number(config?.evidence?.viewPort) || 9400;
const viewBase = (config) => `http://${VIEW_HOST}:${viewPort(config)}`;
const reportUrl = (config, runDir) => `${viewBase(config)}/evidence/${encodeURIComponent(runDir)}/report.html`;
// By default the viewer bundled with playwright-core is used, which needs no internet access. With
// "evidence": { "traceViewer": "official" } the link opens https://trace.playwright.dev instead. Nothing is
// uploaded either way: the viewer runs in the browser and reads trace.zip from this computer.
const OFFICIAL_VIEWER = 'https://trace.playwright.dev';
const officialViewer = (config) => config?.evidence?.traceViewer === 'official';
const traceUrl = (config, runDir) =>
  `${officialViewer(config) ? OFFICIAL_VIEWER + '/' : viewBase(config) + '/trace/index.html'}?trace=${encodeURIComponent(`${viewBase(config)}/evidence/${encodeURIComponent(runDir)}/trace.zip`)}`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.zip': 'application/zip', '.ttf': 'font/ttf', '.webm': 'video/webm', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};

function evidenceIndex(config) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const runs = fs.existsSync(EVIDENCE_DIR)
    ? fs.readdirSync(EVIDENCE_DIR).filter((d) => fs.existsSync(path.join(EVIDENCE_DIR, d, 'report.html')))
        .sort((a, b) => b.slice(-19).localeCompare(a.slice(-19))) // newest first: folder names end with the run timestamp
    : [];
  const rows = runs.map((d) => {
    let status = '';
    try { status = JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, d, 'result.json'), 'utf-8')).status; } catch { /* older run */ }
    const trace = fs.existsSync(path.join(EVIDENCE_DIR, d, 'trace.zip')) ? `<a href="${esc(traceUrl(config, d))}">Full replay</a>` : '';
    return `<tr><td>${esc(d)}</td><td>${esc(status)}</td><td><a href="${esc(reportUrl(config, d))}">Report</a></td><td>${trace}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>UAT runs</title>
<style>body{font-family:system-ui;margin:24px;color:#111}table{border-collapse:collapse;font-size:13px}td,th{padding:6px 14px;border-bottom:1px solid #e5e7eb;text-align:left}</style></head>
<body><h1>UAT runs</h1>${runs.length ? `<table><thead><tr><th>Run</th><th>Result</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No runs yet.</p>'}</body></html>`;
}

/** Resolves to the server, or to null when the port is taken (normally by another runner window that already serves the links) */
function startViewServer(config) {
  const viewerDir = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib', 'vite', 'traceViewer');
  const roots = { trace: viewerDir, evidence: EVIDENCE_DIR };
  // the official viewer is another origin, so it may read the evidence only when it has been chosen
  const cors = officialViewer(config)
    ? { 'access-control-allow-origin': OFFICIAL_VIEWER, 'access-control-allow-private-network': 'true', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': '*' }
    : {};
  const server = require('http').createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, viewBase(config)).pathname); } catch { res.writeHead(400); return res.end(); }
    if (pathname === '/') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(evidenceIndex(config)); }
    const [, top, ...rest] = pathname.split('/');
    const root = roots[top];
    const file = root && path.resolve(root, rest.join('/'));
    // never serve anything outside the viewer and evidence folders
    if (!file || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', ...(top === 'evidence' ? cors : {}) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.once('error', () => resolve(null));
    server.listen(viewPort(config), VIEW_HOST, () => resolve(server));
  });
}

/** Keep the links alive until the PO presses Enter (console only: with piped input there is nobody to wait for) */
async function serveUntilEnter(config, pendingEnter) {
  const server = await startViewServer(config);
  if (!server) {
    console.log(`   (Port ${viewPort(config)} is already in use - normally by another runner or view-trace window, which keeps the links working.)`);
    return;
  }
  // pendingEnter: a prompt that is already waiting for Enter (asking again would need a second Enter)
  if (pendingEnter) { console.log('\nThe links above work while this window stays open. Press Enter to close.'); await pendingEnter; }
  else if (interactive) await askOptional('\nThe links above work while this window stays open. Press Enter to close: ');
  server.closeAllConnections?.();
  server.close();
}

// ---------------- Saving settings ----------------
// Update only the given keys in the config file and leave everything else in it untouched.
function saveConfig(file, values) {
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) : {};
  for (const [key, v] of Object.entries(values)) {
    const parts = key.split('.');
    let o = doc;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {};
    o[parts.at(-1)] = v;
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

// ---------------- Execution ----------------
const isSecret = (key) => /password|secret|token/i.test(key);
const isEmpty = (v) => v === undefined || v === '';
const getCfg = (config, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
function setCfg(config, key, v) {
  const parts = key.split('.');
  let o = config;
  for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
  o[parts.at(-1)] = v;
}

// Case data (version 2 case files): the values the case types or selects
const paramsOf = (doc) => Object.fromEntries(Object.entries(doc.params || {}).map(([k, v]) => [k, String(v)]));
// The data a run used, for the report: a value that points at local config is shown by its name, and a value the PO
// changed for the run comes with the one of the case file
const caseDataOf = (doc, params) => Object.keys(params).map((name) => {
  const original = String(doc.params[name]);
  return { name, value: showPlaceholders(params[name]), ...(params[name] !== original ? { changedFrom: showPlaceholders(original) } : {}) };
});

// Fails when this runner cannot run the case, before anything is asked or opened
function checkCase({ file, doc }) {
  if (!doc || !Array.isArray(doc.steps)) throw new Error(`${path.basename(file)} is not a case file (it has no steps)`);
  if (Number(doc.formatVersion) > FORMAT_VERSION) {
    throw new Error(`${path.basename(file)} is case format version ${doc.formatVersion}; this runner supports up to version ${FORMAT_VERSION}. Ask QA for the current UAT-Runner package.`);
  }
  // A file the case uploads or sends to the API that did not come with the package
  for (const s of doc.steps) for (const f of dataFilesOf(s)) resolveDataFile(ROOT, f);
}

// The local settings the cases need. For several cases: each setting once, the API address first as in a case file
function requiredOf(list) {
  if (list.length === 1) return list[0].doc.requiredConfig || [];
  const all = [...new Set(list.flatMap((c) => c.doc.requiredConfig || []))];
  return [...all.filter((k) => k === 'apiBaseUrl'), ...all.filter((k) => k !== 'apiBaseUrl')];
}

/**
 * Everything that is asked before a run: shows the settings (and, for a single case, its case data), lets the PO
 * change them and asks for what is missing. Several cases are asked once, for the settings they need together.
 * Returns the case data to run with and the function that asks for a setting a step turns out to need.
 */
async function askSettings(list, config) {
  const single = list.length === 1 ? list[0].doc : null;
  const required = requiredOf(list);
  const toSave = {}; // non-secret values typed in during this run, offered for saving afterwards
  const get = (key) => getCfg(config, key);
  const set = (key, v) => setCfg(config, key, v);

  // Ask the PO at run time for missing config (e.g. passwords); kept in memory only
  const askConfig = async (key) => {
    const v = isSecret(key)
      ? await askHidden(`Enter ${key} (input is hidden): `)
      : await ask(key === 'apiBaseUrl' ? 'Enter the API address, with its path prefix (e.g. https://xxx:port/api/v1): ' : `Enter ${key}: `);
    set(key, v);
    if (!isSecret(key) && v !== '') toSave[key] = v;
    return v;
  };

  // The PO can change the case data of a single case for this run; the case file itself is never modified.
  // Several cases run with the data of their own files: the same name can mean another value in each of them.
  const params = single ? paramsOf(single) : {};
  const paramNames = Object.keys(params);
  const showData = (v) => showPlaceholders(v); // a value that points at local config is shown by its name

  // When settings are already provided, show them and let the PO switch environment or account without editing
  // any file. config is the same object for every run of this window, so a change stays for the cases run after it.
  const editable = ['baseUrl', ...required.filter((k) => !isSecret(k))];
  const hasSettings = editable.some((k) => !isEmpty(get(k)));
  if (hasSettings) {
    console.log('\nSettings for this run:');
    // a password is listed too, masked: one that is set is used without asking, C lets the PO type it again
    for (const k of ['baseUrl', ...required]) console.log(`  ${k}: ${isEmpty(get(k)) ? '(not set)' : isSecret(k) ? '******' : get(k)}`);
  }
  if (paramNames.length) {
    console.log('\nCase data:');
    for (const k of paramNames) console.log(`  ${k}: ${showData(params[k])}`);
  }
  if (!single && list.some((c) => Object.keys(c.doc.params || {}).length)) {
    console.log('\nCase data: each case runs with the values of its own case file. To change a value, run that case on its own.');
  }
  if (hasSettings || paramNames.length) {
    const choices = [hasSettings && 'C to change the environment or account', paramNames.length && 'D to change the case data'].filter(Boolean).join(', ');
    const answer = (await ask(`\nPress Enter to continue${hasSettings ? ' with these settings' : ''}, or type ${choices}: `)).toLowerCase();
    const chose = (letter) => /^[cd\s,+]+$/.test(answer) && answer.includes(letter);
    if (hasSettings && chose('c')) {
      console.log('\nType a new value, or just press Enter to keep the current one.');
      const secrets = required.filter(isSecret);
      for (const k of editable) {
        const cur = get(k);
        const v = await ask(`  ${k} [${isEmpty(cur) ? 'not set' : cur}]: `);
        if (v === '' || v === cur) continue;
        set(k, v);
        toSave[k] = v;
        // A saved password belongs to the old environment/account: drop it so it is asked for again
        // instead of being sent to the wrong place.
        const scope = k === 'baseUrl' ? '' : k.slice(0, k.lastIndexOf('.') + 1);
        for (const s of secrets) if (s.startsWith(scope)) { set(s, ''); toSave[s] = ''; }
      }
      // A password is not shown, but it can be typed again: the one of an earlier run in this window is still in use,
      // also when that run failed on it. A password that was just dropped above is asked for below anyway.
      for (const s of secrets) {
        if (isEmpty(get(s))) continue;
        const v = await askHidden(`  ${s} [Enter keeps the current one; input is hidden]: `);
        if (v !== '') set(s, v);
      }
    }
    if (paramNames.length && chose('d')) {
      console.log('\nType a new value, or just press Enter to keep the current one. Changes apply to this run only.');
      for (const k of paramNames) {
        const v = await ask(`  ${k} [${showData(params[k])}]: `);
        if (v !== '') params[k] = v;
      }
    }
  }

  // Collect all required config up front so the run does not stop halfway
  if (!config.baseUrl) {
    config.baseUrl = await ask('Enter the system address (e.g. https://xxx:8088): ');
    if (config.baseUrl) toSave.baseUrl = config.baseUrl;
  }
  for (const key of required) {
    if (isEmpty(get(key))) await askConfig(key);
  }

  // Offer to remember what was typed in, so the next run starts from it. Passwords are never written:
  // the only secret entries in toSave are blanked ones, which remove a password that no longer matches.
  if (Object.keys(toSave).some((k) => !isSecret(k))) {
    const name = path.basename(config.__file);
    const answer = await ask(`\nSave the address and account to ${name} for next time? Passwords are not saved. (y/N): `);
    if (/^y(es)?$/i.test(answer)) {
      try {
        saveConfig(config.__file, toSave);
        console.log(`  Saved to ${config.__file}`);
      } catch (e) {
        console.log(`  Could not save (${String(e.message).split('\n')[0]}); the settings still apply while this window is open.`);
      }
    } else {
      console.log('  Not saved; the settings apply until this window is closed.');
    }
  }
  return { params, askConfig };
}

// A new folder evidence/<name>_<timestamp>. The timestamp has seconds only, so two runs of one case that start in
// the same second (cases running at the same time) would share a folder: the later one gets the next free second.
function evidenceDir(name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  for (let t = Date.now(); ; t += 1000) {
    const dir = path.join(EVIDENCE_DIR, `${name}_${new Date(t).toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
    try { fs.mkdirSync(dir); return dir; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

// Browsers that run at the same time open a little apart, so that every window can be seen and reached
function launchFor(config, slot) {
  const options = launchOptions(config);
  if (slot > 0 && !(options.args || []).some((a) => String(a).startsWith('--window-position'))) {
    options.args = [...(options.args || []), `--window-position=${slot * 60},${slot * 40}`];
  }
  return options;
}

// The number of runs that are under way. Ctrl+C means "stop the run" only then; at a prompt it closes the window
let openRuns = 0;

/**
 * Runs one case in a browser of its own and writes its evidence folder. With quiet nothing is printed and nothing
 * is asked (cases running at the same time: the batch prints one line per case).
 */
async function executeCase({ file, doc }, config, { params = paramsOf(doc), stepByStep = false, askConfig, quiet = false, slot = 0 } = {}) {
  const caseData = caseDataOf(doc, params);
  const say = (text) => { if (!quiet) console.log(text); };
  // Created only now, after everything was asked: the timestamp is the start of the run, and a run that is given up
  // at a prompt leaves no empty folder behind
  const dir = evidenceDir(path.basename(file, '.json'));

  say(`\n▶ Scenario: ${doc.name}\n  Evidence folder: ${dir}`);
  if (stepByStep) say('  Mode: step by step');
  for (const d of caseData) if (d.changedFrom !== undefined) say(`  Case data changed for this run: ${d.name} = ${d.value} (case file: ${d.changedFrom})`);
  if (interactive) say('  Tip: press P in this window at any time to pause after the current step.');
  say('');
  const run = {
    caseName: doc.name, description: doc.description, caseFile: path.basename(file), source: doc.source, codeVersion: doc.codeVersion,
    machine: require('os').hostname(), startedAt: new Date().toLocaleString(), status: 'passed', stepByStep, pausedSec: 0, steps: [],
    values: {}, // what the steps read or received during the run (name -> value), e.g. createdTradeId
    traceUrl: traceUrl(config, path.basename(dir)),
    ...(caseData.length ? { caseData } : {}),
  };
  const t0 = Date.now();

  const viewport = { width: 1280, height: 720 };
  let browser, context, page, onKey;
  openRuns++;
  // However the run ends (also with an error, e.g. a browser closed by hand): the browser is closed and the
  // keyboard given back, since the window goes on with the next case
  try {
    browser = await chromium.launch(launchFor(config, slot));
    if (config.evidence?.video === true) {
      try {
        context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
        page = await context.newPage();
      } catch (e) {
        // Missing ffmpeg does not block execution; there is just no video (screenshots and trace are still saved).
        // Relaunch a clean browser so the failed context cannot affect the rest of the run.
        await browser.close().catch(() => {});
        browser = await chromium.launch(launchFor(config, slot));
        context = undefined;
        say(`  (Note: video recording is unavailable; only screenshots and trace will be saved. Reason: ${String(e.message).split('\n')[0]})\n`);
      }
    }
    if (!context) {
      context = await browser.newContext({ viewport });
      page = await context.newPage();
    }
    await context.tracing.start({ screenshots: true, snapshots: true });
    const ctx = { config, vars: {}, params, askConfig: quiet ? undefined : askConfig, rootDir: ROOT };

    // Pausing only ever happens between steps, never in the middle of an action.
    // P is picked up as a single key press (console only); the run stops once the current step has finished.
    let pauseRequested = false, pausing = false;
    if (interactive && !quiet) {
      onKey = (s, key) => {
        if (pausing || pauseRequested || !key || key.ctrl || key.meta || key.name !== 'p') return;
        pauseRequested = true;
        console.log('\n    (Pause requested: the run will stop after the current step)');
      };
      process.stdin.on('keypress', onKey);
    }
    if (!quiet) setQuietKeys(true);
    let pausedMs = 0;
    const pause = async (rec, n) => {
      pausing = true;
      await discardTyped();
      setQuietKeys(false);
      console.log(`\n  ⏸ Paused after step ${n}/${doc.steps.length}. The browser stays open so you can look at the page.`);
      console.log('    Note: operating the page by hand, or waiting until the session expires, may make the remaining steps fail.');
      const t = Date.now();
      await askOptional('    Press Enter to continue: ');
      const ms = Date.now() - t;
      pausedMs += ms;
      rec.pausedSec = Math.round(ms / 1000);
      console.log('');
      setQuietKeys(true);
      pauseRequested = false;
      pausing = false;
    };

    let failed = false;
    for (let i = 0; i < doc.steps.length; i++) {
      const step = doc.steps[i];
      const desc = describeStep(step, ctx.vars, ctx.params);
      const rec = { title: step.title, desc, status: 'skipped' };
      if (step.substep) rec.substep = step.substep;
      run.steps.push(rec);
      if (failed) continue;

      if (step.title) say(`  ■ ${step.title}`);
      if (step.substep) say(`    - ${step.substep}`);
      if (!quiet) process.stdout.write(`    [${i + 1}/${doc.steps.length}] ${desc} ... `);
      try {
        const r = await executeStep(page, step, ctx);
        rec.status = 'passed';
        if (step.action === 'read') rec.desc += ` (read: ${r})`;
        else if (step.capture) rec.desc += ` (captured: ${r})`;
        else if (step.action === 'api' && r && Object.keys(r).length) rec.desc += ` (saved: ${Object.entries(r).map(([k, v]) => `${k} = ${v}`).join(', ')})`;
        say('✔');
        // What the step read or received, e.g. the ID of the trade it created: shown right away and kept for the report
        const saved = savedValues(step, r);
        if (Object.keys(saved).length) {
          rec.saved = saved;
          Object.assign(run.values, saved);
          for (const [k, v] of Object.entries(saved)) say(`          ${k} = ${v}`);
        }
      } catch (e) {
        rec.status = 'failed';
        rec.error = String(e.message || e).split('\n').slice(0, 6).join('\n');
        failed = true;
        run.status = 'failed';
        say('✘');
        say(`\n    Failure reason: ${rec.error}\n`);
      }
      // An API call does not touch the page, so it has no picture: what it sent and received is in the trace
      if (step.action !== 'api') {
        try {
          const shot = `step-${String(i + 1).padStart(2, '0')}.png`;
          await page.screenshot({ path: path.join(dir, shot) });
          rec.screenshot = shot;
        } catch { /* ignore cases such as the page already being closed */ }
      }

      const next = doc.steps[i + 1];
      if (!quiet && !failed && next && (pauseRequested || (stepByStep && (next.title || next.substep)))) await pause(rec, i + 1);
    }

    await context.tracing.stop({ path: path.join(dir, 'trace.zip') });
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      try {
        const vp = await video.path();
        const target = path.join(dir, 'video.webm');
        fs.renameSync(vp, target);
        run.video = 'video.webm';
      } catch { /* ignore */ }
    }
    // Time spent paused is reported separately, so the duration reflects the run itself
    run.pausedSec = Math.round(pausedMs / 1000);
    run.durationSec = Math.round((Date.now() - t0 - pausedMs) / 1000);
    if (!Object.keys(run.values).length) delete run.values;
    writeReport(dir, run);
  } finally {
    openRuns--;
    if (onKey) process.stdin.off('keypress', onKey);
    if (!quiet) setQuietKeys(false);
    if (browser) await browser.close().catch(() => {});
  }

  say(run.status === 'passed' ? '\n✅ Run passed' : '\n❌ Run failed');
  for (const [k, v] of Object.entries(run.values || {})) say(`   ${k}: ${v}`);
  say(`   Report:      ${reportUrl(config, path.basename(dir))}`);
  say('   Full replay: "Open trace viewer" link at the bottom of the report');
  say(`   Folder:      ${dir}`);
  return { run, dir };
}

/** One case: its settings and case data are asked, then it runs with every step shown */
async function runCase(chosen, config) {
  checkCase(chosen);
  const { params, askConfig } = await askSettings([chosen], config);
  // Step-by-step mode stops after each titled group (Given / When / Then ...) and each substep, so the PO can look at the page
  const stepByStep = /^s/i.test(await askOptional('\nPress Enter to run, or type S to run step by step (pause after each Given / When / Then): '));
  return executeCase(chosen, config, { params, stepByStep, askConfig });
}

// ---------------- Running several cases ----------------
// A folder or the cases the PO ticked run as a batch: the settings are asked once, then the cases run one after
// another or, when the PO asks for it, several at the same time, each in a browser of its own. Every case still gets
// its own evidence folder; the batch adds a summary with a link to each of them.
const MAX_PARALLEL = 8; // browsers open at the same time: more than that only slows an office computer down
let activeBatch = null; // set while a batch runs, so that Ctrl+C can still write its summary

async function runBatch(list, config) {
  const firstLine = (e) => String((e && e.message) || e).split('\n')[0];
  const items = list.map((chosen) => ({
    chosen, id: chosen.id || path.basename(chosen.file, '.json'), name: (chosen.doc && chosen.doc.name) || '', status: 'notrun',
  }));
  for (const it of items) {
    try { checkCase(it.chosen); } catch (e) { it.error = firstLine(e); }
  }
  const ready = items.filter((it) => !it.error);
  const bad = items.filter((it) => it.error);
  if (bad.length) {
    console.log(`\n${bad.length} of the ${plural(items.length)} cannot be run and ${bad.length === 1 ? 'is' : 'are'} left out:`);
    for (const it of bad) console.log(`  ${it.id}: ${it.error}`);
  }
  if (!ready.length) throw new Error('None of the selected cases can be run');
  const total = ready.length;
  const { params, askConfig } = await askSettings(ready.map((it) => it.chosen), config);

  // One after another unless the PO asks for more: whether the system takes the same account working in several
  // browsers at once is for the PO to decide
  const most = Math.min(total, MAX_PARALLEL);
  let parallel = 1, stepByStep = false;
  if (most < 2) {
    stepByStep = /^s/i.test(await askOptional('\nPress Enter to run, or type S to run step by step (pause after each Given / When / Then): '));
  } else {
    const together = most === 2 ? 'type 2 to run both at the same time' : `type a number (2-${most}) to run that many at the same time`;
    for (;;) {
      const answer = await askOptional(`\nPress Enter to run the ${total} cases one after another, or ${together}, or S to run them step by step: `);
      if (answer === '') break;
      if (/^s/i.test(answer)) { stepByStep = true; break; }
      if (/^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= most) { parallel = Number(answer); break; }
      console.log(`  Please type ${most === 2 ? '2' : `a number from 2 to ${most}`}, S, or just press Enter.`);
    }
  }

  const startedAt = new Date().toLocaleString();
  const t0 = Date.now();
  let halt = ''; // why no further case is started
  let finished = null;
  const finish = (interrupted) => {
    if (finished) return finished;
    activeBatch = null;
    if (interrupted) halt = 'the batch was stopped';
    for (const it of items) {
      if (it.status === 'running') { it.status = 'notrun'; it.error = 'stopped before it finished'; }
      else if (it.status === 'notrun' && !it.error) it.error = `not started: ${halt || 'the batch ended early'}`;
    }
    const count = (status) => items.filter((it) => it.status === status).length;
    const result = {
      mode: 'batch', caseName: `Batch of ${plural(items.length)}`, status: count('passed') === items.length ? 'passed' : 'failed',
      machine: require('os').hostname(), startedAt, durationSec: Math.round((Date.now() - t0) / 1000), parallel, stepByStep,
      ...(interrupted ? { interrupted: true } : {}),
      cases: items.map((it) => ({
        caseFile: path.basename(it.chosen.file), caseName: it.name, status: it.status, durationSec: it.durationSec,
        values: it.values, evidence: it.evidence, error: it.error,
      })),
    };
    // Created only now, so that the list of all runs (newest first) shows the batch above its cases
    const dir = evidenceDir('batch');
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2), 'utf-8');
    writeBatchReport(dir, result, config);

    const counts = `${count('passed')} passed, ${count('failed')} failed${count('notrun') ? `, ${count('notrun')} not run` : ''}`;
    console.log(`\n===== Batch ${interrupted ? 'stopped' : 'finished'}: ${counts} (${fmtSec(result.durationSec)}) =====`);
    // Up to 20 cases are all listed; of more, only the ones that need a look
    const listed = items.length <= 20 ? items : items.filter((it) => it.status !== 'passed');
    for (const it of listed) console.log(`  ${RESULT_TEXT[it.status]} ${it.id}${resultNote(it) ? `   ${resultNote(it)}` : ''}`);
    if (listed.length < items.length) console.log(`  (the ${plural(items.length - listed.length)} that passed ${items.length - listed.length === 1 ? 'is' : 'are'} in the summary)`);
    // After Ctrl+C the runner ends at once and its links with it: the file is named instead
    console.log(`   Summary:     ${interrupted ? path.join(dir, 'report.html') : reportUrl(config, path.basename(dir))}`);
    console.log(`   Folder:      ${dir}`);
    return (finished = { status: result.status, dir });
  };
  activeBatch = { finish };

  // Runs one case and keeps its outcome. A case that fails, or cannot be run at all, never ends the batch - except
  // when the browser cannot be started: every other case would end the same way.
  const runOne = async (it, options) => {
    it.status = 'running';
    const t = Date.now();
    try {
      const { run, dir } = await executeCase(it.chosen, config, options);
      it.status = run.status;
      it.durationSec = run.durationSec;
      it.values = run.values;
      it.evidence = path.basename(dir);
      const at = run.steps.findIndex((s) => s.status === 'failed');
      if (at >= 0) it.error = `step ${at + 1} of ${run.steps.length}: ${String(run.steps[at].error).split('\n')[0]}`;
    } catch (e) {
      it.status = 'failed';
      it.durationSec = Math.round((Date.now() - t) / 1000);
      it.error = firstLine(e);
      const noBrowser = /browserType\.launch/.test(it.error);
      if (!options.quiet || (noBrowser && !halt)) printError(e);
      if (noBrowser) halt = 'the browser could not be started';
    }
  };

  console.log(`\n===== Running ${plural(total)}${parallel > 1 ? `, ${parallel} at the same time` : stepByStep ? ', step by step' : ''} =====`);
  if (parallel === 1) {
    for (const [i, it] of ready.entries()) {
      if (halt) break;
      console.log(`\n===== Case ${i + 1} of ${total}: ${it.id} =====`);
      await runOne(it, { stepByStep, askConfig, ...(total === 1 ? { params } : {}) });
    }
  } else {
    console.log('  Each case runs in its own browser window and only its result is shown here; the steps are in its report.');
    console.log('  Pausing (P) and step by step are not available while cases run at the same time. Ctrl+C stops the batch.\n');
    setQuietKeys(true);
    const tag = (i) => `  [${String(i + 1).padStart(String(total).length)}/${total}]`;
    let next = 0;
    const worker = async (slot) => {
      while (!halt && next < total) {
        const i = next++;
        const it = ready[i];
        console.log(`${tag(i)} started   ${it.id}`);
        await runOne(it, { quiet: true, slot });
        console.log(`${tag(i)} ${RESULT_TEXT[it.status]} ${it.id}   (${fmtSec(it.durationSec)})${resultNote(it) ? `   ${resultNote(it)}` : ''}`);
      }
    };
    try {
      await Promise.all(Array.from({ length: parallel }, (_, slot) => worker(slot)));
    } finally {
      setQuietKeys(false);
    }
  }
  return finish(false);
}

const RESULT_TEXT = { passed: 'passed   ', failed: 'FAILED   ', notrun: 'not run  ' };
// What is worth knowing about a case of a batch in one line: why it did not pass, or the values it produced
const resultNote = (it) => (it.status === 'passed'
  ? Object.entries(it.values || {}).map(([k, v]) => `${k} = ${v}`).join(', ')
  : it.error || '');

function writeBatchReport(dir, result, config) {
  const text = { passed: 'Passed', failed: 'Failed', notrun: 'Not run' };
  const count = (status) => result.cases.filter((c) => c.status === status).length;
  const rows = result.cases.map((c, i) => {
    const id = c.caseFile.replace(/\.json$/i, '');
    const name = c.caseName.startsWith(`[${id}]`) ? c.caseName.slice(id.length + 2).trim() : c.caseName;
    const values = Object.entries(c.values || {}).map(([k, v]) => `<div class="saved">${esc(k)}: <b>${esc(v)}</b></div>`).join('');
    // The reports are neighbours of this folder, so the link also works when the file is opened without the runner
    const links = c.evidence
      ? `<a href="../${esc(encodeURIComponent(c.evidence))}/report.html">Report</a> · <a href="${esc(traceUrl(config, c.evidence))}">Full replay</a>`
      : '';
    return `
    <tr class="${c.status === 'notrun' ? 'skipped' : c.status}">
      <td>${i + 1}</td>
      <td><div class="step">${esc(id)}</div>${name ? `<div class="name">${esc(name)}</div>` : ''}</td>
      <td>${text[c.status]}</td>
      <td>${c.durationSec === undefined ? '' : fmtSec(c.durationSec)}</td>
      <td>${values}${c.error ? `<pre>${esc(c.error)}</pre>` : ''}</td>
      <td>${links}</td>
    </tr>`;
  }).join('');
  const summary = `${plural(result.cases.length)}: ${count('passed')} passed${count('failed') ? `, ${count('failed')} failed` : ''}${count('notrun') ? `, ${count('notrun')} not run` : ''}`;
  const mode = result.parallel > 1 ? `${result.parallel} cases at the same time` : result.stepByStep ? 'one after another, step by step' : 'one after another';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(result.caseName)} - Execution Report</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:13px}
  .badge.passed{background:#16a34a} .badge.failed{background:#dc2626}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  tr.failed td{background:#fef2f2} tr.skipped td{color:#9ca3af}
  .step{font-size:14px} .name{color:#6b7280;margin-top:2px} .saved{font-size:12px;color:#374151}
  pre{white-space:pre-wrap;color:#b91c1c;font-size:12px;margin:0} tr.skipped pre{color:#9ca3af}
  td:last-child{white-space:nowrap}
</style></head><body>
<h1>${esc(result.caseName)} <span class="badge ${result.status}">${result.status === 'passed' ? 'Passed' : 'Failed'}</span></h1>
<div class="meta">${summary}${result.interrupted ? ' · Stopped with Ctrl+C before it finished' : ''} · Machine: ${esc(result.machine)} · Started: ${esc(result.startedAt)} · Duration: ${fmtSec(result.durationSec)} · Mode: ${mode}</div>
<table><thead><tr><th>#</th><th>Case</th><th>Result</th><th>Duration</th><th>Values / failure</th><th></th></tr></thead><tbody>${rows}</tbody></table>
<p class="meta">Report: every step of the case with its screenshots. Full replay: the trace viewer, which works while the runner window is still open; later, double-click view-trace.bat first.</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

// ---------------- Ctrl+C ----------------
// readline keeps the console in raw mode, so Ctrl+C arrives as a key and is reported here instead of ending the
// process (in the case tree the keys do not reach readline: Ctrl+C is handled there, with the same result).
// - While cases run it stops them: the summary of a batch is still written. Exit code 130.
// - While a session is recorded it ends the input, i.e. the session, like Enter: what was recorded is saved.
// - At any other prompt it closes the window. It must not end the input there: the prompts that have a default
//   (settings, run mode) would take it, and the case the PO wanted to give up would run.
let sessionFailed = false; // a run of this window failed: the exit code, however the window is closed
let recording = false;
rl.on('SIGINT', () => {
  if (recording) { rl.close(); return; }
  if (openRuns || activeBatch) {
    console.log('\n\nStopped with Ctrl+C.');
    if (activeBatch) activeBatch.finish(true);
    else console.log('The run did not finish: its evidence folder has no report.');
    process.exit(130); // Playwright closes the browsers it started when the process ends
  }
  console.log('\n\nClosed with Ctrl+C.');
  process.exit(sessionFailed ? 1 : 0);
});

// ---------------- Recording a manual session ----------------
// No case is run: the browser opens with tracing on and the PO works by hand, e.g. to reproduce a bug. The trace
// only knows about actions made through Playwright, so a script in the page reports what the user does and each
// report becomes a named entry in the trace (with a page snapshot) and a row in the report.

// Runs inside every page. Listens on the document in the capture phase and reads composedPath(), because the
// OREO controls live in open shadow roots.
function watchUserActions() {
  if (window.__oreoWatching) return;
  window.__oreoWatching = true;
  // a long text means a container was hit, not a control: its text would only mislead
  const clean = (s) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return t.length > 60 ? '' : t; };
  const describe = (ev) => {
    const els = ev.composedPath().filter((n) => n.nodeType === 1);
    const el = els[0];
    if (!el) return null;
    const holder = els.find((n) => n.getAttribute('data-testid'));
    const control = els.find((n) => /^(BUTTON|A|LABEL)$/.test(n.tagName) || /button|menuitem|option|link|tab|checkbox|radio/.test(n.getAttribute('role') || '') || /-/.test(n.tagName)) || el;
    return {
      el,
      testId: holder ? holder.getAttribute('data-testid') : '',
      // a button inside a shadow root has no text of its own (it is slotted), so fall back to the host
      text: clean(control.innerText) || clean(holder && holder.innerText) || clean(el.getAttribute('aria-label') || el.getAttribute('placeholder')),
      tag: el.tagName.toLowerCase(),
    };
  };
  const send = (kind, d, extra) => {
    if (!d || typeof window.__oreoRecord !== 'function') return;
    window.__oreoRecord({ kind, testId: d.testId, text: d.text, tag: d.tag, path: location.pathname, ...extra });
  };
  // Typed text: "change" does not leave a shadow root, so the field being edited is remembered from "input"
  // (which does) and reported once, before the next thing the user does.
  let editing = null;
  const flush = () => {
    if (!editing) return;
    const { el, d } = editing;
    editing = null;
    const value = el.type === 'password' ? '******'
      : el.type === 'file' ? Array.from(el.files || []).map((f) => f.name).join(', ')
      : el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? 'checked' : 'unchecked')
      : String(el.value).slice(0, 2000);
    send('change', d, { value, text: '' });
  };
  const edited = (ev) => {
    const el = ev.composedPath()[0];
    if (!el || !('value' in el)) return;
    if (editing && editing.el !== el) flush();
    editing = { el, d: describe(ev) };
  };
  document.addEventListener('input', edited, true);
  document.addEventListener('change', (ev) => { edited(ev); flush(); }, true);
  document.addEventListener('focusout', (ev) => { if (editing && editing.el === ev.composedPath()[0]) flush(); }, true);
  window.addEventListener('pagehide', flush, true);
  // Clicks are taken at mousedown: a dropdown often closes on mousedown, and the click then lands on whatever
  // is behind it. A click without a mouse (keyboard, detail 0) has no mousedown, so it is taken from "click".
  document.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    if (editing && !ev.composedPath().includes(editing.el)) flush();
    send('click', describe(ev));
  }, true);
  document.addEventListener('click', (ev) => { if (ev.detail === 0 && ev.isTrusted) send('click', describe(ev)); }, true);
  // report what was typed before the Enter that submits it
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { flush(); send('press', describe(ev), { value: 'Enter', text: '' }); } }, true);
}

function describeUserAction(a, secrets) {
  const where = a.testId ? `testId=${a.testId}` : `<${a.tag}>`;
  const quoted = a.text ? ` "${a.text}"` : '';
  // a password typed into a field that is not a password field must not reach the report either
  const value = secrets.includes(a.value) ? '******' : a.value;
  if (a.kind === 'click') return `Click${quoted} (${where})`;
  if (a.kind === 'press') return `Press ${value} in ${where}`;
  return `Enter "${String(value).slice(0, 80)}" in ${where}`;
}

function writeRecordingReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const rows = run.steps.map((s, i) => `
    <tr><td>${i + 1}</td><td>${esc(s.time)}</td><td>${esc(s.desc)}<div class="page">${esc(s.page)}</div></td>
      <td>${s.screenshot ? `<a href="${esc(s.screenshot)}" target="_blank"><img src="${esc(s.screenshot)}"></a>` : ''}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(run.caseName)} - Recorded Session</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .desc{font-size:14px;margin:0 0 6px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  .page{color:#9ca3af;font-size:12px;margin-top:4px}
  img{max-width:240px;border:1px solid #e5e7eb;border-radius:4px}
</style></head><body>
<h1>Recorded session</h1>
${run.description ? `<p class="desc">${esc(run.description)}</p>` : ''}
<div class="meta">${run.steps.length} recorded action${run.steps.length === 1 ? '' : 's'} · Machine: ${esc(run.machine)} · Started: ${esc(run.startedAt)} · Duration: ${fmtSec(run.durationSec)}</div>
<table><thead><tr><th>#</th><th>Time</th><th>What was done (by hand)</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>
<p class="meta">Full replay: <a href="${esc(run.traceUrl)}">Open trace viewer</a><br>
Opens the trace viewer (page snapshots, console and network of the whole session). The link works while the runner window is still open; later, double-click view-trace.bat first. The same data is in trace.zip in this folder.</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

async function recordSession(config) {
  if (!config.baseUrl) config.baseUrl = await ask('Enter the system address (e.g. https://xxx:8088): ');
  const note = await askOptional('\nWhat are you going to show? One line, e.g. the problem you see (optional, Enter to skip): ');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(EVIDENCE_DIR, `recording_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = {
    caseName: 'Recorded session', description: note, mode: 'recording', status: 'recorded',
    machine: require('os').hostname(), startedAt: new Date().toLocaleString(), steps: [],
    traceUrl: traceUrl(config, path.basename(dir)),
  };
  const t0 = Date.now();
  const secrets = secretEntries(config).map(([, v]) => v);

  recording = true; // from here on Ctrl+C ends the session instead of closing the window
  const browser = await chromium.launch({ ...launchOptions(config), slowMo: 0 });
  // viewport: null = a normal window the PO can resize
  const context = await browser.newContext({ viewport: null });
  await context.tracing.start({ screenshots: true, snapshots: true });

  // Reports are handled one at a time, so the trace entries and screenshots stay in the order things happened
  let queue = Promise.resolve(), open = true;
  const add = (page, a) => {
    if (!open) return;
    const desc = describeUserAction(a, secrets);
    queue = queue.then(async () => {
      const no = run.steps.length + 1;
      const rec = { desc, time: new Date().toLocaleTimeString(), page: a.path || '' };
      run.steps.push(rec);
      console.log(`    [${no}] ${desc}`);
      try {
        await context.tracing.group(desc);
        await new Promise((r) => setTimeout(r, 400)); // let the page react, so the picture shows the result
        const shot = `step-${String(no).padStart(2, '0')}.png`;
        await page.screenshot({ path: path.join(dir, shot) });
        rec.screenshot = shot;
      } catch { /* the page may already be gone */ }
      await context.tracing.groupEnd().catch(() => {});
    });
  };
  await context.exposeBinding('__oreoRecord', ({ page }, a) => add(page, a));
  await context.addInitScript(watchUserActions);

  const page = await context.newPage();
  const closed = new Promise((resolve) => {
    browser.on('disconnected', resolve);
    context.on('page', (p) => p.on('close', () => { if (!context.pages().length) resolve(); }));
    page.on('close', () => { if (!context.pages().length) resolve(); });
  });

  console.log(`\n● Recording. Work in the browser window as usual.\n  Evidence folder: ${dir}`);
  console.log('  Everything in that window is recorded, including what you type. Do not open anything unrelated in it.\n');
  await page.goto(config.baseUrl).catch((e) => console.log(`  (Could not open ${config.baseUrl}: ${String(e.message).split('\n')[0]})`));

  const enter = askOptional('  When you are done, press Enter here (or close the browser window): \n');
  const endedBy = await Promise.race([enter.then(() => 'enter'), closed.then(() => 'closed')]);
  open = false;
  await queue;

  let traced = true;
  await context.tracing.stop({ path: path.join(dir, 'trace.zip') }).catch(() => { traced = false; });
  await browser.close().catch(() => {});
  run.durationSec = Math.round((Date.now() - t0) / 1000);
  writeRecordingReport(dir, run);
  recording = false;

  console.log(`\n■ Recording saved (${run.steps.length} action${run.steps.length === 1 ? '' : 's'})`);
  if (!traced) console.log('   Note: the trace could not be saved because the browser was already gone; the report and screenshots are there.');
  console.log(`   Report:      ${reportUrl(config, path.basename(dir))}`);
  console.log('   Full replay: "Open trace viewer" link at the bottom of the report');
  console.log(`   Folder:      ${dir}  (send this folder to QA)`);
  // when the browser was closed, the prompt above is still waiting for its Enter
  return { dir, pendingEnter: endedBy === 'closed' && interactive ? enter : undefined };
}

function printError(e) {
  console.error('\nRunner error:', String((e && e.message) || e).split('\n').slice(0, 3).join('\n'));
  const first = String((e && e.message) || '').split('\n')[0];
  if (/browserType\.launch/.test(first) && /Executable doesn't exist|Chromium distribution|is not found/i.test(first)) {
    console.error('Hint: no browser was found. Make sure Edge is installed on this computer, or change browser.channel in config.local.json to "chrome".');
  }
}

async function main() {
  const config = loadConfig(ROOT);
  const args = process.argv.slice(2);
  if (args[0] === '--view') {
    console.log(`\nReports and full replays of earlier runs: ${viewBase(config)}/`);
    if (!process.env.OREO_NO_OPEN) openFile(`${viewBase(config)}/`);
    await serveUntilEnter(config);
    return 0;
  }
  if (args[0] === '--record') {
    const { dir, pendingEnter } = await recordSession(config);
    if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
    await serveUntilEnter(config, pendingEnter);
    return 0;
  }

  // One window runs as many cases as the PO wants: after a run it goes back to the case list instead of closing.
  // config is the same object for all of them, so what was typed in for one run (address, account, password) is not
  // asked for again; it stays in memory only. The links of every run work until the window is closed.
  // With piped input there is nobody to ask: one choice (a case, or the cases given as arguments), as before.
  let server = null;
  for (let first = true; ; first = false) {
    let ran = false;
    try {
      const chosen = first && args.length ? casesFromArgs(args) : await chooseCases();
      if (chosen === QUIT) break;
      if (!chosen) { if (first) return 2; break; }
      // One case runs with every step on the screen; several run as a batch that ends with a summary
      let status, dir;
      if (chosen.length === 1) {
        const one = await runCase(chosen[0], config);
        status = one.run.status;
        dir = one.dir;
      } else {
        ({ status, dir } = await runBatch(chosen, config));
      }
      ran = true;
      if (status !== 'passed') sessionFailed = true;
      if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
    } catch (e) {
      // A case that cannot be run (a file of a newer format, a missing data file, a browser closed by hand) ends
      // that case, not the window
      if (!interactive || inputEnded) throw e;
      sessionFailed = true;
      printError(e);
    }
    if (ran && !server) {
      server = await startViewServer(config);
      if (!server) console.log(`   (Port ${viewPort(config)} is already in use - normally by another runner or view-trace window, which keeps the links working.)`);
    }
    if (!interactive) break;
    if (ran && server) console.log('\nThe links above work while this window stays open.');
    await discardTyped(); // an Enter pressed while the case was running must not answer this
    const answer = await askOptional(`${ran && server ? '' : '\n'}Press Enter to choose another case, or type Q to close: `);
    if (inputEnded || /^(q|quit|exit)$/i.test(answer)) break;
  }
  if (server) { server.closeAllConnections?.(); server.close(); }
  return sessionFailed ? 1 : 0;
}

main()
  .then((code) => { rl.close(); process.exitCode = code; })
  .catch((e) => {
    rl.close();
    printError(e);
    process.exitCode = 3;
  });
