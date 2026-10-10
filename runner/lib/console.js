// The console of the runner: prompts, hidden input, the keys typed while a case runs, error output.

const readline = require('readline');
const state = require('./state');

// ---------------- Command-line interaction ----------------
// No history: readline would keep every answer, also a password typed at a hidden prompt, and show it again when
// the Up key is pressed at a later prompt
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
rl._writeToOutput = (s) => { if (!state.muted) rl.output.write(s); };
const interactive = !!process.stdin.isTTY;

// Read line by line through the async iterator: input is buffered, so no line is lost to prompt timing
const lines = rl[Symbol.asyncIterator]();
let typedLines = 0, readLines = 0;
rl.on('line', () => { typedLines++; });
async function readLine(q, hidden, optional) {
  rl.output.write(q);
  state.muted = hidden;
  const { value, done } = await lines.next();
  readLines++;
  state.muted = state.quietKeys;
  if (hidden) rl.output.write('\n');
  if (done) {
    state.inputEnded = true;
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
function setQuietKeys(on) { state.quietKeys = interactive && on; state.muted = state.quietKeys; }
const fmtSec = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`);
const plural = (n) => `${n} case${n === 1 ? '' : 's'}`;

function printError(e) {
  console.error('\nRunner error:', String((e && e.message) || e).split('\n').slice(0, 3).join('\n'));
  const first = String((e && e.message) || '').split('\n')[0];
  if (/browserType\.launch/.test(first) && /Executable doesn't exist|Chromium distribution|is not found/i.test(first)) {
    console.error('Hint: no browser was found. Make sure Edge is installed on this computer, or change browser.channel in config.local.json to "chrome".');
  }
}

module.exports = { rl, interactive, ask, askHidden, askOptional, discardTyped, setQuietKeys, fmtSec, plural, printError };
