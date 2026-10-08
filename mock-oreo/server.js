// Mock of the OREO login page and Trades page (for local demos and framework validation only; not the real system).
// The structure mirrors the real pages: sc-text-input / sc-button are web components with an open shadow root,
// and the data-testid values match the real system.
// Start: npm run mock  ->  http://localhost:4173

const http = require('http');
const PORT = Number(process.env.PORT || 4173);
const USERS = { 'maker@test.com': { pwd: 'maker1', name: 'maker' }, 'checker@test.com': { pwd: 'checker1', name: 'checker' } };

const components = `
<script>
class ScTextInput extends HTMLElement {
  connectedCallback() {
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<div part="base" class="sc-form-group"><div part="input-group"><input part="input" class="sc-form-control line" type="' +
      (this.getAttribute('type') || 'text') + '" placeholder="' + (this.getAttribute('placeholder') || '') + '"></div></div>' +
      '<style>input{width:260px;padding:6px;border:none;border-bottom:1px solid #ccc;font-size:14px}</style>';
  }
  get value() { return this.shadowRoot.querySelector('input').value; }
}
class ScButton extends HTMLElement {
  connectedCallback() {
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<button part="base" class="button" type="button"><slot></slot></button>' +
      '<style>button{padding:6px 14px;border:1px solid #1e3a8a;border-radius:16px;background:#fff;cursor:pointer;width:100%}</style>';
  }
}
customElements.define('sc-text-input', ScTextInput);
customElements.define('sc-button', ScButton);
</script>`;

const loginPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OREO</title>${components}
<style>body{font-family:system-ui;background:#999;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.dialog{background:#fff;border-radius:8px;width:420px;overflow:hidden}.head{background:#1e4fa0;color:#fff;text-align:center;padding:32px}
form{padding:24px}.row{display:flex;align-items:center;gap:16px;margin-bottom:12px}label{width:110px;font-size:13px}#err{color:#b91c1c;font-size:13px}</style></head>
<body><div class="dialog" data-testid="login-dialog"><div class="head"><h2>OREO</h2>Sign in to access your FX trading platform</div>
<form>
  <div class="row"><label>Email Address</label><sc-text-input data-testid="login-email-input" id="email" type="email" placeholder="trader@bank.com"></sc-text-input></div>
  <div class="row"><label>Password</label><sc-text-input data-testid="login-password-input" id="password" type="password" placeholder="Enter your password"></sc-text-input></div>
  <div id="err"></div>
  <sc-button class="w-full h-12" data-testid="login-sign-in-to-portal-btn">Sign in to Portal</sc-button>
</form></div>
<script>
document.querySelector('[data-testid=login-sign-in-to-portal-btn]').addEventListener('click', async () => {
  const email = document.getElementById('email').value, pwd = document.getElementById('password').value;
  const r = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ email, pwd }) });
  if (!r.ok) { document.getElementById('err').textContent = 'Invalid email or password'; return; }
  const u = await r.json();
  setTimeout(() => { sessionStorage.setItem('user', u.name); location.href = '/trades'; }, 400); // simulate login latency
});
</script></body></html>`;

const tradesPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OREO</title>${components}
<style>body{font-family:system-ui;margin:0}header{display:flex;justify-content:space-between;align-items:center;padding:10px 24px;border-bottom:1px solid #ddd}
.actions{display:flex;gap:8px}sc-button{display:inline-block}table{border-collapse:collapse;margin:24px;font-size:13px}td,th{padding:6px 12px;border-bottom:1px solid #eee;text-align:left}</style></head>
<body><header data-testid="layout-topnav-container"><b>OREO 0.2.17</b>
<div class="actions">
  <sc-button data-testid="layout-new-trade-btn">+ New Trade</sc-button>
  <sc-button data-testid="layout-ai-reader-btn">+ AI Reader</sc-button>
  <sc-button data-testid="layout-theme-toggle-btn" title="Switch to dark mode">Dark</sc-button>
  <sc-button class="relative" data-testid="layout-user-menu-btn"><span class="hidden sm:inline" id="uname"></span></sc-button>
</div></header>
<h3 style="margin:24px 24px 0">Validation Blotter</h3>
<table><thead><tr><th>Trade ID</th><th>Product ID</th><th>Portfolio</th><th>Deal Date</th><th>Currency</th></tr></thead>
<tbody><tr><td>TRD-1791369475907O6B14DDE</td><td>FX_TRF</td><td>ABS_CR_UK_ETFBB</td><td>10/07/2026</td><td>USDJPY</td></tr></tbody></table>
<script>
const u = sessionStorage.getItem('user');
if (!u) location.href = '/';
// simulate async loading of user info
setTimeout(() => { document.getElementById('uname').textContent = u; }, 300);
</script></body></html>`;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/login') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { email, pwd } = JSON.parse(body || '{}');
      const u = USERS[email];
      if (u && u.pwd === pwd) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ name: u.name })); }
      else { res.writeHead(401); res.end(); }
    });
    return;
  }
  const html = req.url.startsWith('/trades') ? tradesPage : loginPage;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(PORT, () => console.log(`Mock OREO started: http://localhost:${PORT}  (account maker@test.com / maker1)`));
