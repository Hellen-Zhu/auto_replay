#!/usr/bin/env node
// Prints the actions of a recording made with record-session.bat (runner.js --record), one line each, with what this
// project knows about the element of each: its name in elements/ and the files under framework/ that use that name
// or the testid. Read-only. Usage, from the project root:
//   node .claude/skills/converting-po-recording/read-recording.js <recording folder> [--json]
// The folder is evidence/recording_<timestamp>/ as the PO sent it; result.json is read, nothing else.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node .claude/skills/converting-po-recording/read-recording.js <recording folder> [--json]');
  process.exit(2);
}
const run = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf-8').replace(/^﻿/, ''));
if (run.mode !== 'recording') {
  console.error(`${dir}/result.json is not a recording (mode: ${run.mode})`);
  process.exit(2);
}

// A recording made before the runner stored the action as data has only its description: read that back
function fromDescription(desc) {
  let m = desc.match(/^(Click|Right-click)(?: "(.*)")? \((?:testId=(.*)|<(.*)>)\)$/);
  if (m) return { kind: m[1] === 'Click' ? 'click' : 'rightClick', text: m[2] || '', testId: m[3] || '', tag: m[4] || '', role: '' };
  m = desc.match(/^Press (.*) in (?:testId=(.*)|<(.*)>)$/);
  if (m) return { kind: 'press', value: m[1], testId: m[2] || '', tag: m[3] || '', text: '', role: '' };
  m = desc.match(/^Enter "(.*)" in (?:testId=(.*)|<(.*)>)$/);
  if (m) return { kind: 'change', value: m[1], testId: m[2] || '', tag: m[3] || '', text: '', role: '' };
  return { kind: 'unknown', text: desc, testId: '', tag: '', role: '' };
}

// testid -> element names, from every element JSON file
const byTestId = new Map();
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) {
      let list;
      try { list = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { continue; }
      for (const el of Array.isArray(list) ? list : []) {
        const v = el && el.lookupDetails && el.lookupDetails.findBy === 'testId' && el.lookupDetails.value;
        if (v) byTestId.set(v, [...(byTestId.get(v) || []), el.name]);
      }
    }
  }
})(path.join(ROOT, 'elements'));

// The exported case files that use a testid: they name the case (and spec) a recorded action belongs to, also when
// elements/ does not have the name yet
const caseFiles = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) caseFiles.push({ file: path.relative(ROOT, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf-8') });
  }
})(path.join(ROOT, 'cases'));
const inCases = (testId) => caseFiles.filter((c) => c.text.includes(`"${testId}"`)).map((c) => c.file);

// Real data never leaves this script: a trade or task ID, and what was typed on the login page (the account), are
// shown as placeholders
const TRADE_ID = /\b(TRD|CHK)-[A-Z0-9]+\b/g;
const masked = (a) => {
  const m = { ...a };
  for (const k of ['text', 'value']) if (typeof m[k] === 'string') m[k] = m[k].replace(TRADE_ID, '<trade ID>');
  if (a.kind === 'change' && /^\/login/.test(a.page || '')) m.value = '<account>';
  return m;
};

// The framework's source, to find where a name or a testid is used
const sources = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|js)$/.test(e.name)) sources.push({ file: path.relative(ROOT, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf-8') });
  }
})(path.join(ROOT, 'framework'));
const usedIn = (needle) => sources.filter((s) => s.text.includes(`'${needle}'`)).map((s) => s.file);

const actions = run.steps.map((s, i) => {
  const a = s.action || fromDescription(s.desc);
  const names = a.testId ? byTestId.get(a.testId) || [] : [];
  const files = [...new Set([...names.flatMap(usedIn), ...(a.testId ? usedIn(a.testId) : [])])];
  const cases = a.testId ? inCases(a.testId) : [];
  // A click that only puts the cursor into a field is followed by the value typed into the same field
  const next = run.steps[i + 1] && (run.steps[i + 1].action || fromDescription(run.steps[i + 1].desc));
  const focusOnly = a.kind === 'click' && !a.role && next && next.kind === 'change' && next.testId === a.testId;
  return masked({ no: i + 1, page: s.page, ...a, elements: names, usedIn: files, inCases: cases, focusOnly, screenshot: s.screenshot || '' });
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ description: (run.description || '').replace(TRADE_ID, '<trade ID>'), startedAt: run.startedAt, actions }, null, 2));
} else {
  console.log(`Recording: ${(run.description || '(no note)').replace(TRADE_ID, '<trade ID>')}   ${run.startedAt}   ${actions.length} actions\n`);
  for (const a of actions) {
    const what = a.kind === 'change' || a.kind === 'press' ? `${a.kind} "${a.value}"` : `${a.kind}${a.text ? ` "${a.text}"` : ''}`;
    const role = a.role ? ` role=${a.role}` : '';
    const known = a.elements.length ? `element ${a.elements.join(' / ')}` : a.testId ? 'NOT in elements/' : 'no testid';
    console.log(`${String(a.no).padStart(3)}  ${a.page.padEnd(14)} ${what}${role}`);
    console.log(`       testid=${a.testId || '-'}  ${known}${a.usedIn.length ? `  used in ${a.usedIn.join(', ')}` : ''}${a.focusOnly ? '  (focus only)' : ''}`);
    // By spec folder: a testid in the cases of one or two specs points at them; one that most specs use (login, search) does not
    const specs = [...new Set(a.inCases.map((f) => f.split('/')[1]))];
    if (specs.length) console.log(`       in cases of: ${specs.length > 2 ? `${specs.length} specs (shared)` : specs.map((sp) => `${sp} (${a.inCases.filter((f) => f.split('/')[1] === sp).length})`).join(', ')}`);
  }
}
