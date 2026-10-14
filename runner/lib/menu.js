// What the lists that are operated with the keyboard share: the console they need, the width of a text, and a short
// list of rows from which one is picked with the arrow keys (the settings and the case data of a run).

const state = require('./state');
const { rl, interactive } = require('./console');

// A list needs single key presses and a screen it can redraw: everything else gets numbered lists and typed answers
const useKeys = () => interactive && process.stdout.isTTY && !process.env.OREO_PLAIN_MENU
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

// The cursor is hidden while a list is shown. However the runner ends, the console gets it back
let cursorHidden = false;
process.on('exit', () => { if (cursorHidden) process.stdout.write('\x1b[?25h'); });

/**
 * Shows rows and lets one of them be picked: Up / Down move, Enter picks. A row is { text, value }; a row without a
 * value is a heading and cannot be picked. `start` is the value of the row that is highlighted first, `hint` the
 * line below the list, `keys` the letters that end the list by themselves. With `typing`, what is typed is collected
 * instead (a console types the path of a file dropped into the window): Enter then ends the list with it, Esc clears it.
 * Resolves to { value } (Enter), { typed } (Enter after typing), { key } (one of `keys`) or { esc: true }. Ctrl+C
 * closes the window like at a prompt.
 * The list is erased again when it ends, so the caller prints what is to stay on the screen.
 */
function pickRow({ rows, start, hint, keys = [], typing = false }) {
  const out = process.stdout;
  const pickable = rows.map((r, i) => (r.value === undefined ? -1 : i)).filter((i) => i >= 0);
  let cur = Math.max(0, pickable.findIndex((i) => rows[i].value === start));
  let top = 0, drawn = 0;
  let typed = '';

  const build = () => {
    const W = Math.max(20, (out.columns || 80) - 1); // one column less than the window, so that no line ever wraps
    const room = Math.max(3, (out.rows || 24) - 5);
    const at = pickable[cur];
    const scroll = rows.length > room;
    const win = scroll ? room - 2 : room;
    // a heading above the highlighted row stays in view when the list starts at the top
    top = Math.max(0, Math.min(Math.max(Math.min(top, cur === 0 ? 0 : at), at - win + 1), rows.length - win));
    const lines = [];
    if (scroll) lines.push(top > 0 ? `      ... ${top} more above` : '');
    rows.slice(top, top + win).forEach((r, i) => {
      if (r.value === undefined) { lines.push(fit(r.text, W)); return; }
      const here = top + i === at;
      const line = fit(`${here ? '>' : ' '} ${r.text}`, W);
      lines.push(here ? `\x1b[7m${padTo(line, W)}\x1b[0m` : line);
    });
    if (scroll) {
      const below = rows.length - top - win;
      lines.push(below > 0 ? `      ... ${below} more below` : '');
    }
    // a long path keeps its end, where the file name is
    const tail = (t, room) => (textWidth(t) <= room ? t : `...${[...t].slice(-Math.max(1, room - 3)).join('')}`);
    const keysText = '   Enter: use this file   Esc: clear';
    return [...lines, '', typed ? `  File: ${tail(typed, W - 8 - keysText.length)}${keysText}` : fit(`  ${hint}`, W)];
  };
  // Only the list itself is redrawn, as the case tree does it
  const erase = () => `${drawn ? `\x1b[${drawn}A` : ''}\x1b[1G\x1b[0J`;
  const paint = () => {
    const lines = build();
    out.write(`${erase()}${lines.join('\n')}\n`);
    drawn = lines.length;
  };
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
      if (key.ctrl) {
        // the same as Ctrl+C at a typed prompt, which readline reports itself
        if (key.name === 'c') { done({ esc: true }); rl.emit('SIGINT'); }
        return;
      }
      switch (key.name) {
        case 'up': cur = Math.max(0, cur - 1); break;
        case 'down': cur = Math.min(pickable.length - 1, cur + 1); break;
        case 'home': case 'pageup': cur = 0; break;
        case 'end': case 'pagedown': cur = pickable.length - 1; break;
        case 'return': case 'enter': done(typed ? { typed } : { value: rows[pickable[cur]].value }); return;
        case 'escape': if (typed) { typed = ''; break; } done({ esc: true }); return;
        case 'backspace': if (!typed) return; typed = typed.slice(0, -1); break;
        default:
          if (typing && typeof s === 'string' && !key.meta && /^[^\x00-\x1f\x7f]+$/.test(s)) { typed += s; break; }
          if (typeof s === 'string' && keys.includes(s.toLowerCase())) done({ key: s.toLowerCase() });
          return;
      }
      paint();
    };

    // While the list is shown readline must not see the keys (see the case tree)
    rl._ttyWrite = () => {};
    state.muted = true;
    out.write('\x1b[?25l');
    cursorHidden = true;
    paint();
    process.stdin.on('keypress', onKey);
    out.on('resize', onResize);
  });
}

module.exports = { useKeys, textWidth, fit, padTo, pickRow };
