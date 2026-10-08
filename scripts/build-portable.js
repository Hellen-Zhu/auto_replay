#!/usr/bin/env node
// 打包 PO 用的绿色版运行器：dist/UAT-Runner(.zip)
//
// 用法（在 QA 的 Windows 电脑上）：
//   npm run build:portable
//   npm run build:portable -- --node-zip D:\soft\node-v22.22.0-win-x64.zip   # 内网不能访问 nodejs.org 时用本地 zip
//   npm run build:portable -- --with-config                                  # 把你的 config.local.json 一起打进去（会去掉密码）
//
// 产物结构：
//   UAT-Runner/
//     运行用例.bat   node/node.exe   runner/   core/   cases/   node_modules/
//     config.local.json（或 config.local.example.json）

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
  console.log(`  下载 ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}，请手动下载后用 --node-zip 指定`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  return zip;
}

async function main() {
  console.log(`\n打包绿色版运行器 → ${OUT}\n`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. 便携版 Node（只需要 node.exe）
  if (flag('--skip-node')) {
    console.log('1/5 跳过 Node（--skip-node）');
  } else {
    console.log('1/5 准备便携版 Node');
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
    if (!exe) throw new Error('zip 里没有找到 node.exe');
    fs.mkdirSync(path.join(OUT, 'node'));
    fs.copyFileSync(exe, path.join(OUT, 'node', 'node.exe'));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 2. 运行器代码 + 共享核心 + 用例 + 启动文件
  console.log('2/5 复制运行器、核心代码和用例');
  copyDir(path.join(ROOT, 'runner'), path.join(OUT, 'runner'));
  copyDir(path.join(ROOT, 'core'), path.join(OUT, 'core'));
  copyDir(path.join(ROOT, 'cases'), path.join(OUT, 'cases'), (p) => fs.statSync(p).isDirectory() || p.endsWith('.json'));
  copyDir(path.join(ROOT, 'portable'), OUT);
  fs.mkdirSync(path.join(OUT, 'evidence'), { recursive: true });

  // 3. 配置：默认只放模板；--with-config 时带上你的配置但清空密码
  console.log('3/5 写入配置');
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
    console.log('  已带上 config.local.json（密码已清空，PO 运行时会提示输入）');
  }

  // 4. 依赖：只装 @playwright/test，不下载浏览器（用 PO 电脑自带的 Edge）
  console.log('4/5 安装依赖（不下载浏览器）');
  const pwVersion = require(path.join(ROOT, 'node_modules/@playwright/test/package.json')).version;
  fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({
    name: 'oreo-uat-runner', private: true, dependencies: { '@playwright/test': pwVersion },
  }, null, 2));
  sh('npm install --omit=dev --no-audit --no-fund', OUT);

  // 录像用的 ffmpeg（很小，约 1-2MB），装到运行器自己的目录里；失败不影响执行，只是没有录像
  if (!flag('--skip-ffmpeg')) {
    try {
      console.log('  安装录像组件 ffmpeg');
      const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(OUT, 'ms-playwright') };
      delete env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
      execSync('npx playwright install ffmpeg', { cwd: OUT, stdio: 'inherit', env });
    } catch {
      console.log('  ⚠ ffmpeg 安装失败：运行器仍可执行，但不会生成录像（截图和 trace 正常）');
    }
  }

  // 5. 压缩
  if (flag('--no-zip')) {
    console.log('5/5 跳过压缩（--no-zip）');
  } else {
    console.log('5/5 压缩');
    const zip = OUT + '.zip';
    fs.rmSync(zip, { force: true });
    const parent = path.dirname(OUT), name = path.basename(OUT);
    sh(isWin ? `tar -a -c -f "${zip}" "${name}"` : `zip -qr "${zip}" "${name}"`, parent);
    console.log(`\n完成：${zip}`);
  }
  console.log(`\n完成：${OUT}\n把整个文件夹（或 zip）放到共享盘，PO 解压后双击「运行用例.bat」即可。\n`);
}

main().catch((e) => { console.error('\n打包失败：', e.message); process.exit(1); });
