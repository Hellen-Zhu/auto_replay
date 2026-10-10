// The local server behind the report and trace viewer links.

const fs = require('fs');
const path = require('path');
const { EVIDENCE_DIR } = require('./paths');
const { interactive, askOptional } = require('./console');
const { esc } = require('./report');

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

module.exports = { viewPort, viewBase, reportUrl, traceUrl, startViewServer, serveUntilEnter };
