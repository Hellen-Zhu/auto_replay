// Mock of the OREO login page, Trades page, New Trade form and trade detail page (for local demos and framework validation only; not the real system).
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
// Type-ahead dropdown: the options appear (after a short delay, like a server lookup) while typing,
// and a value only counts once an option has been clicked.
class ScCombobox extends HTMLElement {
  connectedCallback() {
    const opts = (this.getAttribute('options') || '').split('|');
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<div part="base"><input part="input" role="combobox" type="text" placeholder="Type to search..."><div role="listbox" hidden></div></div>' +
      '<style>div[part]{position:relative}input{width:260px;padding:6px;border:none;border-bottom:1px solid #ccc;font-size:14px}' +
      '[role=listbox]{position:absolute;z-index:5;background:#fff;border:1px solid #ccc;width:272px;max-height:160px;overflow:auto}' +
      '[role=option]{padding:6px;font-size:13px;cursor:pointer}[role=option]:hover{background:#e0e7ff}</style>';
    const input = r.querySelector('input'), list = r.querySelector('[role=listbox]');
    let timer;
    const render = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.toLowerCase();
        list.innerHTML = '';
        for (const o of opts.filter((x) => x.toLowerCase().includes(q))) {
          const d = document.createElement('div');
          d.setAttribute('role', 'option');
          d.textContent = o;
          d.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = o; this.selected = o; list.hidden = true; });
          list.appendChild(d);
        }
        list.hidden = false;
      }, 200);
    };
    input.addEventListener('input', () => { this.selected = ''; render(); });
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => { clearTimeout(timer); list.hidden = true; });
  }
  get value() { return this.selected || ''; }
}
customElements.define('sc-combobox', ScCombobox);
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
document.querySelector('[data-testid=layout-new-trade-btn]').addEventListener('click', () => { location.href = '/trades/new'; });
</script></body></html>`;

const pageHead = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OREO</title>${components}
<style>body{font-family:system-ui;margin:0}header{padding:10px 24px;border-bottom:1px solid #ddd}main{padding:24px}
.row{display:flex;align-items:center;gap:16px;margin-bottom:14px}.row>label:first-child{width:150px;font-size:13px}sc-button{display:inline-block}
#err{color:#b91c1c;font-size:13px;margin:8px 0}.overlay{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center}
.overlay[hidden]{display:none}.box{background:#fff;padding:24px;border-radius:8px;width:360px}.card{border:1px solid #ddd;border-radius:8px;padding:16px;font-size:14px}</style></head>
<body><header data-testid="layout-topnav-container"><b>OREO 0.2.17</b></header>
<script>if (!sessionStorage.getItem('user')) location.href = '/';</script>`;

const COUNTERPARTIES = 'MOCK BANK A|MOCK BANK B|MOCK CORP C';
const newTradePage = `${pageHead}
<main data-testid="create-trade-stepin-container"><h3>New Trade</h3>
  <div class="row"><label>Counterparty</label><sc-combobox data-testid="create-trade-counterparty-combobox" options="${COUNTERPARTIES}"></sc-combobox></div>
  <div class="row"><label>Portfolio</label><sc-combobox data-testid="create-trade-portfolio-combobox" options="ABS_CR_UK_ETFBB|MOCK_PORTFOLIO_2"></sc-combobox></div>
  <div class="row"><label>Product ID</label><sc-combobox data-testid="create-trade-product-id-input" options="FX_CO|FX_TRF|FX_FSB|FX_OPT"></sc-combobox></div>
  <div class="row"><label>Direction</label><sc-combobox data-testid="create-trade-direction-combobox" options="Buy|Sell"></sc-combobox></div>
  <div class="row"><label>Trade file (.dat)</label><input type="file" accept=".dat" data-testid="create-trade-file-input"></div>
  <div class="row"><label>StepIn</label><input type="checkbox" data-testid="create-trade-stepin-toggle"></div>
  <div id="stepin" hidden>
    <div class="row"><label>StepIn type</label>
      <label><input type="radio" name="stepin" value="full" data-testid="create-trade-stepin-full-radio"> Full</label>
      <label><input type="radio" name="stepin" value="partial" data-testid="create-trade-stepin-partial-radio"> Partial</label></div>
    <div class="row"><label>Old counterparty</label><sc-combobox data-testid="create-trade-stepin-old-counterparty-combobox" options="${COUNTERPARTIES}"></sc-combobox></div>
  </div>
  <div id="err"></div>
  <sc-button data-testid="create-trade-save-btn">Save</sc-button> <sc-button data-testid="create-trade-book-btn">Book</sc-button>
</main>
<div class="overlay" data-testid="trade-change-confirmation-dialog" hidden><div class="box"><h3>Confirm trade creation</h3>
  <p>Book this trade and send it for approval?</p>
  <sc-button data-testid="trade-change-confirmation-confirm-btn">Confirm</sc-button></div></div>
<script>
const $ = (id) => document.querySelector('[data-testid=' + id + ']');
const err = document.getElementById('err'), dialog = $('trade-change-confirmation-dialog');
$('create-trade-stepin-toggle').addEventListener('change', (e) => { document.getElementById('stepin').hidden = !e.target.checked; });
function collect() {
  const file = $('create-trade-file-input').files[0];
  const stepIn = $('create-trade-stepin-toggle').checked;
  return {
    counterparty: $('create-trade-counterparty-combobox').value, portfolio: $('create-trade-portfolio-combobox').value,
    productId: $('create-trade-product-id-input').value, direction: $('create-trade-direction-combobox').value,
    fileName: file ? file.name : '',
    stepIn: stepIn ? ((document.querySelector('input[name=stepin]:checked') || {}).value || '') : null,
    oldCounterparty: stepIn ? $('create-trade-stepin-old-counterparty-combobox').value : '',
  };
}
$('create-trade-book-btn').addEventListener('click', () => {
  const t = collect();
  const missing = ['counterparty', 'portfolio', 'productId', 'direction', 'fileName'].filter((k) => !t[k]);
  if (t.stepIn !== null) { if (!t.stepIn) missing.push('stepIn type'); if (!t.oldCounterparty) missing.push('oldCounterparty'); }
  err.textContent = missing.length ? 'Missing: ' + missing.join(', ') : '';
  // simulate the risk calculation that runs before the confirmation dialog
  if (!missing.length) setTimeout(() => { dialog.hidden = false; }, 400);
});
$('trade-change-confirmation-confirm-btn').addEventListener('click', async () => {
  const r = await fetch('/api/trades', { method: 'POST', body: JSON.stringify(collect()) });
  const body = await r.json();
  dialog.hidden = true;
  if (!r.ok) { err.textContent = body.message; return; }
  location.href = '/trades/' + body.data.trade.id;
});
</script></body></html>`;

const tradeDetailPage = `${pageHead}
<main data-testid="trade-detail-container"><h3>Trade Detail</h3>
<div class="card" data-testid="trade-detail-header-card">Loading...</div>
<script>
// simulate async loading of the trade
setTimeout(async () => {
  const card = document.querySelector('[data-testid=trade-detail-header-card]');
  const r = await fetch('/api/trades/' + location.pathname.split('/').pop());
  if (!r.ok) { card.textContent = 'Trade not found'; return; }
  const t = (await r.json()).data.trade;
  card.innerHTML = '<b></b> &middot; <span></span>';
  card.querySelector('b').textContent = t.id;
  card.querySelector('span').textContent = [t.productId, t.counterparty, t.portfolio, t.direction,
    t.stepIn ? 'StepIn ' + t.stepIn + ' from ' + t.oldCounterparty : '', t.status].filter(Boolean).join(' · ');
}, 300);
</script></main></body></html>`;

const TRADES = {}; // trades booked in this mock session, kept in memory only
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

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
  if (req.method === 'POST' && req.url === '/api/trades') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const t = JSON.parse(body || '{}');
      if (!t.counterparty || !t.portfolio || !t.productId || !t.direction) return json(res, 400, { message: 'Basic mandatory info is incomplete' });
      if (t.fileName !== t.productId + '.dat') return json(res, 400, { message: `The uploaded file does not match product ${t.productId}` });
      if (t.stepIn !== null && (!t.stepIn || !t.oldCounterparty)) return json(res, 400, { message: 'StepIn info is incomplete' });
      const id = 'TRD-' + Date.now() + Math.random().toString(16).slice(2, 10).toUpperCase();
      TRADES[id] = { ...t, id, status: 'Pending Approval' };
      json(res, 200, { data: { trade: TRADES[id] } });
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/trades/')) {
    const t = TRADES[req.url.split('/').pop()];
    return t ? json(res, 200, { data: { trade: t } }) : json(res, 404, { message: 'Trade not found' });
  }
  const url = req.url.split('?')[0];
  const html = url === '/trades/new' ? newTradePage : url.startsWith('/trades/') ? tradeDetailPage : url.startsWith('/trades') ? tradesPage : loginPage;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(PORT, () => console.log(`Mock OREO started: http://localhost:${PORT}  (account maker@test.com / maker1)`));
