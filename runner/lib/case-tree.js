// The case tree that is operated with the keyboard, and the cases given as arguments.

const fs = require('fs');
const path = require('path');
const { CASES_DIR } = require('./paths');
const state = require('./state');
const { rl, interactive, plural } = require('./console');
const { listCases, inFolder, folderEntries, searchCases, chooseCase } = require('./case-list');

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
      state.muted = state.quietKeys;
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
    state.muted = true;
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

module.exports = { QUIT, chooseCases, casesFromArgs };
