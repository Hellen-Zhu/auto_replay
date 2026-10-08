#!/usr/bin/env node
// Build the portable runner for the PO: dist/UAT-Runner(.zip)
//
// Usage (on QA's Windows machine):
//   npm run build:portable                      # default: copy the node.exe you are running, no download
//   npm run build:portable -- --with-config     # include your config.local.json (passwords are stripped)
//   npm run build:portable -- --node-zip D:\soft\node-v22.22.0-win-x64.zip   # to pin a different Node version
//   npm run build:portable -- --download-node   # download from nodejs.org (needs internet access)
//   npm run build:portable -- --with-ffmpeg     # only when video recording is needed
//
// Output layout:
//   UAT-Runner/
//     run-case.bat   record-session.bat   view-trace.bat   node/node.exe   runner/   core/   cases/   data/   node_modules/
//     config.local.json (or config.local.example.json)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);

const NODE_VERSION = opt('--node-version') || '22.22.0';
const OUT = path.resolve(ROOT, opt('--out') || 'dist/UAT-Runner');
const isWin = process.platform === 'win32';

function sh(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } });
}
function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s)) continue;
    if (e.isDirectory()) copyDir(s, d, filter); else fs.copyFileSync(s, d);
  }
}

async function getNodeZip() {
  const local = opt('--node-zip');
  if (local) return path.resolve(local);
  const zip = path.join(os.tmpdir(), `node-v${NODE_VERSION}-win-x64.zip`);
  if (fs.existsSync(zip)) return zip;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  console.log(`  Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}); download it manually and pass it with --node-zip`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  return zip;
}

async function main() {
  console.log(`\nBuilding portable runner -> ${OUT}\n`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. Portable Node (only node.exe is needed)
  if (flag('--skip-node')) {
    console.log('1/5 Skipping Node (--skip-node)');
  } else if (!opt('--node-zip') && !flag('--download-node')) {
    // Default: copy the node.exe that is currently running (your locally installed Node); no internet needed
    console.log('1/5 Copying local Node: ' + process.execPath + ' (v' + process.versions.node + ')');
    if (!isWin) console.log('  ⚠ Not running on Windows: the copied node will not run on the PO\'s Windows machine. Build on Windows instead.');
    fs.mkdirSync(path.join(OUT, 'node'));
    fs.copyFileSync(process.execPath, path.join(OUT, 'node', isWin ? 'node.exe' : 'node'));
  } else {
    console.log('1/5 Preparing portable Node (from zip)');
    const zip = await getNodeZip();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'node-x-'));
    sh(isWin ? `tar -xf "${zip}" -C "${tmp}"` : `unzip -q "${zip}" -d "${tmp}"`);
    const find = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { const r = find(p); if (r) return r; } else if (e.name === 'node.exe') return p;
      }
    };
    const exe = find(tmp);
    if (!exe) throw new Error('node.exe was not found in the zip');
    fs.mkdirSync(path.join(OUT, 'node'));
    fs.copyFileSync(exe, path.join(OUT, 'node', 'node.exe'));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 2. Runner code + shared core + cases + launcher
  console.log('2/5 Copying runner, core code and cases');
  copyDir(path.join(ROOT, 'runner'), path.join(OUT, 'runner'));
  copyDir(path.join(ROOT, 'core'), path.join(OUT, 'core'));
  copyDir(path.join(ROOT, 'cases'), path.join(OUT, 'cases'), (p) => fs.statSync(p).isDirectory() || p.endsWith('.json'));
  // Files the cases upload (e.g. the product .dat files)
  if (fs.existsSync(path.join(ROOT, 'data'))) copyDir(path.join(ROOT, 'data'), path.join(OUT, 'data'));
  copyDir(path.join(ROOT, 'portable'), OUT);
  fs.mkdirSync(path.join(OUT, 'evidence'), { recursive: true });

  // 3. Config: only the template by default; with --with-config your config is included with passwords stripped
  console.log('3/5 Writing config');
  fs.copyFileSync(path.join(ROOT, 'config.local.example.json'), path.join(OUT, 'config.local.example.json'));
  const mine = path.join(ROOT, 'config.local.json');
  if (flag('--with-config') && fs.existsSync(mine)) {
    const cfg = JSON.parse(fs.readFileSync(mine, 'utf-8').replace(/^\uFEFF/, ''));
    const scrub = (o) => { for (const [k, v] of Object.entries(o || {})) {
      if (v && typeof v === 'object') scrub(v); else if (/password|secret|token/i.test(k)) o[k] = '';
    } };
    scrub(cfg);
    if (cfg.browser) { delete cfg.browser.executablePath; delete cfg.browser.args; cfg.browser.headless = false; }
    fs.writeFileSync(path.join(OUT, 'config.local.json'), JSON.stringify(cfg, null, 2), 'utf-8');
    console.log('  Included config.local.json (passwords stripped; the PO is prompted for them at run time)');
  }

  // 4. Dependencies: install only @playwright/test, no browser download (the PO machine's own Edge is used)
  console.log('4/5 Installing dependencies (no browser download)');
  const pwVersion = require(path.join(ROOT, 'node_modules/@playwright/test/package.json')).version;
  fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({
    name: 'oreo-uat-runner', private: true, dependencies: { '@playwright/test': pwVersion },
  }, null, 2));
  sh('npm install --omit=dev --no-audit --no-fund', OUT);

  // ffmpeg for video (small, about 1-2MB), installed into the runner's own folder; a failure does not block execution, there is just no video
  if (flag('--with-ffmpeg')) {
    try {
      console.log('  Installing the ffmpeg video component');
      const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(OUT, 'ms-playwright') };
      delete env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
      execSync('npx playwright install ffmpeg', { cwd: OUT, stdio: 'inherit', env });
    } catch {
      console.log('  ⚠ ffmpeg install failed: the runner still works but produces no video (screenshots and trace are unaffected)');
    }
  }

  // 5. Zip
  if (flag('--no-zip')) {
    console.log('5/5 Skipping zip (--no-zip)');
  } else {
    console.log('5/5 Zipping');
    const zip = OUT + '.zip';
    fs.rmSync(zip, { force: true });
    const parent = path.dirname(OUT), name = path.basename(OUT);
    sh(isWin ? `tar -a -c -f "${zip}" "${name}"` : `zip -qr "${zip}" "${name}"`, parent);
    console.log(`\nDone: ${zip}`);
  }
  console.log(`\nDone: ${OUT}\nPut the whole folder (or the zip) on the shared drive; the PO unzips it and double-clicks "run-case.bat".\n`);
}

main().catch((e) => { console.error('\nBuild failed:', e.message); process.exit(1); });
