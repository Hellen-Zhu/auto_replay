// Mock of the OREO login page, Trades page, New Trade form and trade detail page (for local demos and framework validation only; not the real system).
// The structure mirrors the real pages: sc-text-input / sc-button are web components with an open shadow root,
// and the data-testid values match the real system.
// Start: npm run mock  ->  http://localhost:4173
//
// What is real and what is only this mock's guess:
// - real testids: login-*, layout-*, create-trade-*, trade-file-upload, trade-detail-*, trade-change-confirmation-dialog,
//   trade-change-confirm-btn, trade-row-action-cancellation, trade-change-reason-select, trade-change-comments-textarea;
// - the comments field of the confirmation dialog is, as on the real system, an sc-text-input host with
//   data-slot="textarea": a fill on the host fails, the control to fill is the [part="input"] in its shadow root.
//   Whether the real component renders a <textarea> or an <input> there is not known (the mock renders a <textarea>);
//   the tag of the reason select (sc-select here) is not known either, only that a click opens it and that its
//   entries have the role menuitem;
// - testids made up here because the real ones are not known yet (search box, all-trades blotter): they are marked
//   "mock testid" below. Point the element names at them with a scratch elements folder (OREO_ELEMENTS_DIR) when
//   running a case against the mock;
// - the toast only copies the two attributes the E2E project reads (data-title, data-description);
// - API, served under /api/v1 (so apiBaseUrl for the mock is http://localhost:4173/api/v1): create (path, X-User-Id
//   header, multipart parts "trade" + "datFile", data.trade.id and data.checkerContext.taskId in the response) and
//   the checker's approve / reject of a task (path, JSON body, { code, status: 'SUCCESS', data: <the trade> } in the
//   response) are like the real ones, and so is the status LIVE of an approved trade in the blotter. The body of
//   trigger-event, the status REJECTED and the rule that the submitter cannot decide on the own task are this mock's
//   own. So is the rule that a cancellation needs comments (the real dialog marks them optional): it is there so
//   that a case whose comments did not reach the control fails.

const http = require('http');
const PORT = Number(process.env.PORT || 4173);
const USERS = { 'maker@test.com': { pwd: 'maker1', name: 'maker' }, 'checker@test.com': { pwd: 'checker1', name: 'checker' } };

const components = `
<script>
class ScTextInput extends HTMLElement {
  connectedCallback() {
    const r = this.attachShadow({ mode: 'open' });
    // data-slot="textarea" marks the multi-line variant (the comments field of the trade change confirmation dialog)
    const control = this.getAttribute('data-slot') === 'textarea'
      ? '<textarea part="input" class="sc-form-control" rows="3"></textarea>'
      : '<input part="input" class="sc-form-control line" type="' + (this.getAttribute('type') || 'text') +
        '" placeholder="' + (this.getAttribute('placeholder') || '') + '">';
    r.innerHTML = '<div part="base" class="sc-form-group"><div part="input-group">' + control + '</div></div>' +
      '<style>input{width:260px;padding:6px;border:none;border-bottom:1px solid #ccc;font-size:14px}' +
      'textarea{width:260px;padding:6px;border:1px solid #ccc;font:inherit;font-size:13px}</style>';
  }
  get value() { return this.shadowRoot.querySelector('[part=input]').value; }
  set value(text) { this.shadowRoot.querySelector('[part=input]').value = text; }
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
    r.innerHTML = '<div part="base"><input part="input" role="combobox" type="text" placeholder="Type to search..."><div role="menu" hidden></div></div>' +
      '<style>div[part]{position:relative}input{width:260px;padding:6px;border:none;border-bottom:1px solid #ccc;font-size:14px}' +
      '[role=menu]{position:absolute;z-index:5;background:#fff;border:1px solid #ccc;width:272px;max-height:160px;overflow:auto}' +
      'sl-menu-item{display:block;padding:6px;font-size:13px;cursor:pointer}sl-menu-item:hover{background:#e0e7ff}</style>';
    const input = r.querySelector('input'), list = r.querySelector('[role=menu]');
    let timer;
    const render = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.toLowerCase();
        list.innerHTML = '';
        for (const o of opts.filter((x) => x.toLowerCase().includes(q))) {
          // like the real dropdown: an sl-menu-item with a slotted label, the typed text highlighted in <b>
          const d = document.createElement('sl-menu-item');
          d.setAttribute('role', 'menuitem');
          d.className = 'dropdown-item expanded-menu-item';
          const at = o.toLowerCase().indexOf(q);
          d.append(o.slice(0, at), Object.assign(document.createElement('b'), { textContent: o.slice(at, at + q.length) }), o.slice(at + q.length));
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
// Dropdown without typing: a click opens the list; the entries are sl-menu-item like the combobox's
class ScSelect extends HTMLElement {
  connectedCallback() {
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<div part="base"><button part="display" type="button">Select...</button><div role="menu" hidden></div></div>' +
      '<style>div[part]{position:relative}button{width:200px;padding:6px;border:1px solid #ccc;background:#fff;text-align:left;font-size:13px;cursor:pointer}' +
      '[role=menu]{position:absolute;z-index:5;background:#fff;border:1px solid #ccc;width:198px}' +
      'sl-menu-item{display:block;padding:6px;font-size:13px;cursor:pointer}sl-menu-item:hover{background:#e0e7ff}</style>';
    const btn = r.querySelector('button'), list = r.querySelector('[role=menu]');
    for (const o of (this.getAttribute('options') || '').split('|')) {
      const d = document.createElement('sl-menu-item');
      d.setAttribute('role', 'menuitem');
      d.textContent = o;
      d.addEventListener('click', () => { this.selected = o; btn.textContent = o; list.hidden = true; });
      list.appendChild(d);
    }
    btn.addEventListener('click', () => { list.hidden = !list.hidden; });
  }
  get value() { return this.selected || ''; }
  reset() { this.selected = ''; this.shadowRoot.querySelector('button').textContent = 'Select...'; }
}
class SlMenuItem extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' }).innerHTML = '<div id="anchor" part="base" class="menu-item"><slot name="prefix" part="prefix"></slot><slot part="label" class="menu-item__label"></slot></div>';
  }
}
// Like the real sc-modal: the host has no size of its own, the panel lives in the shadow root and the content is slotted
class ScModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:block;width:0;height:0}:host([hidden]) .overlay{display:none}'
      + '.overlay{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center}'
      + '.box{background:#fff;padding:24px;border-radius:8px;width:360px}</style>'
      + '<div class="overlay"><div class="box"><slot name="header"></slot><slot></slot></div></div>';
  }
}
customElements.define('sc-modal', ScModal);
customElements.define('sl-menu-item', SlMenuItem);
customElements.define('sc-combobox', ScCombobox);
customElements.define('sc-select', ScSelect);
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
  setTimeout(() => { sessionStorage.setItem('user', u.name); sessionStorage.setItem('userEmail', email); location.href = '/trades'; }, 400); // simulate login latency
});
</script></body></html>`;

const tradesPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OREO</title>${components}
<style>body{font-family:system-ui;margin:0}header{display:flex;justify-content:space-between;align-items:center;padding:10px 24px;border-bottom:1px solid #ddd}
.actions{display:flex;gap:8px}sc-button{display:inline-block}table{border-collapse:collapse;margin:8px 24px 24px;font-size:13px}td,th{padding:6px 12px;border-bottom:1px solid #eee;text-align:left}
h3{margin:24px 24px 0}.search{margin:16px 24px 0}.row{display:flex;align-items:center;gap:16px;margin-bottom:14px}.row>label{width:90px;font-size:13px}
#err{color:#b91c1c;font-size:13px;margin:8px 0}#rowmenu{position:fixed;z-index:9;background:#fff;border:1px solid #ccc;box-shadow:0 2px 8px #0003;font-size:13px}
#rowmenu[hidden]{display:none}#rowmenu [role=menuitem]{padding:8px 16px;cursor:pointer}#rowmenu [role=menuitem]:hover{background:#e0e7ff}
#toaster{position:fixed;right:16px;bottom:16px;list-style:none;margin:0;padding:0}#toaster li{background:#fff;border:1px solid #16a34a;border-radius:8px;padding:10px 16px;margin-top:8px;font-size:13px;box-shadow:0 2px 8px #0003}</style></head>
<body><header data-testid="layout-topnav-container"><b>OREO 0.2.17</b>
<div class="actions">
  <sc-button data-testid="layout-new-trade-btn">+ New Trade</sc-button>
  <sc-button data-testid="layout-ai-reader-btn">+ AI Reader</sc-button>
  <sc-button data-testid="layout-theme-toggle-btn" title="Switch to dark mode">Dark</sc-button>
  <sc-button class="relative" data-testid="layout-user-menu-btn"><span class="hidden sm:inline" id="uname"></span></sc-button>
</div></header>
<!-- mock testid -->
<div class="search"><sc-text-input data-testid="trade-portal-search-input" placeholder="Search by Trade ID..."></sc-text-input></div>
<h3>Validation Blotter</h3>
<table><thead><tr><th>Trade ID</th><th>Product ID</th><th>Portfolio</th><th>Deal Date</th><th>Currency</th></tr></thead>
<tbody><tr><td>TRD-1791369475907O6B14DDE</td><td>FX_TRF</td><td>ABS_CR_UK_ETFBB</td><td>10/07/2026</td><td>USDJPY</td></tr></tbody></table>
<h3>All Trades</h3>
<!-- mock testid -->
<div data-testid="trade-portal-all-trades-blotter">
<table><thead><tr><th>Trade ID</th><th>Product ID</th><th>Counterparty</th><th>Status</th><th>Event Status</th></tr></thead><tbody></tbody></table></div>
<!-- the action menu of a row: opens on a right-click -->
<div id="rowmenu" role="menu" hidden>
  <div role="menuitem">View Details</div>
  <div role="menuitem" data-testid="trade-row-action-cancellation">Cancellation</div>
</div>
<sc-modal data-testid="trade-change-confirmation-dialog" hidden><div slot="header"><h2>Confirm Trade Changes</h2>
  <p>Review the changes and risk impact before saving</p></div>
  <div><h2>Updated Risk Calculation</h2>
    <div class="row"><label>Update Reason *</label><sc-select data-testid="trade-change-reason-select" options="DEALER_ERROR|CLIENT_REQUEST|MOCK_OTHER"></sc-select></div>
    <div class="row"><label>Additional Comments (Optional)</label><sc-text-input data-slot="textarea" id="update-comments" data-ui="form-control" data-testid="trade-change-comments-textarea"></sc-text-input></div>
    <div id="err"></div>
    <sc-button data-testid="trade-change-confirm-btn">Confirm &amp; Save</sc-button></div></sc-modal>
<ol id="toaster"></ol>
<script>
const u = sessionStorage.getItem('user'), email = sessionStorage.getItem('userEmail');
if (!u) location.href = '/';
// simulate async loading of user info
setTimeout(() => { document.getElementById('uname').textContent = u; }, 300);
const $ = (id) => document.querySelector('[data-testid=' + id + ']');
$('layout-new-trade-btn').addEventListener('click', () => { location.href = '/trades/new'; });

const api = (path, init) => fetch(path, { ...init, headers: { 'X-User-Id': email } });
const search = $('trade-portal-search-input'), tbody = $('trade-portal-all-trades-blotter').querySelector('tbody');
const menu = document.getElementById('rowmenu'), cancelEntry = $('trade-row-action-cancellation');
const dialog = $('trade-change-confirmation-dialog'), err = document.getElementById('err');
const reason = $('trade-change-reason-select'), comments = $('trade-change-comments-textarea');
let trades = [], current = null;

function render() {
  const q = search.value.trim().toLowerCase();
  tbody.innerHTML = '';
  for (const t of trades.filter((x) => x.id.toLowerCase().includes(q))) {
    const tr = document.createElement('tr');
    for (const v of [t.id, t.productId, t.counterparty, t.status, t.eventStatus]) tr.appendChild(Object.assign(document.createElement('td'), { textContent: v }));
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      current = t;
      cancelEntry.hidden = t.status !== 'LIVE'; // only a live trade can be cancelled
      menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
      menu.hidden = false;
    });
    tbody.appendChild(tr);
  }
}
async function load() { trades = (await (await api('/api/trades')).json()).data.trades; render(); }
setTimeout(load, 300); // simulate async loading of the blotter
search.addEventListener('input', render);
document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });

// Like Sonner: one <li> per toast, its texts in [data-title] and [data-description], gone after a few seconds
function toast(type, title, description) {
  const li = document.createElement('li');
  li.setAttribute('data-sonner-toast', ''); li.setAttribute('data-type', type);
  li.innerHTML = '<div data-content><div data-title></div><div data-description></div></div>';
  li.querySelector('[data-title]').textContent = title;
  li.querySelector('[data-description]').textContent = description;
  document.getElementById('toaster').appendChild(li);
  setTimeout(() => li.remove(), 5000);
}

cancelEntry.addEventListener('click', () => {
  menu.hidden = true;
  reason.reset(); comments.value = ''; err.textContent = '';
  // simulate the risk calculation that runs before the confirmation dialog
  setTimeout(() => { dialog.hidden = false; }, 400);
});
$('trade-change-confirm-btn').addEventListener('click', async () => {
  const r = await api('/api/v1/trades/trigger-event', { method: 'POST',
    body: JSON.stringify({ tradeId: current.id, event: 'CANCEL', reason: reason.value, comments: comments.value }) });
  const body = await r.json();
  if (!r.ok) { err.textContent = body.message; return; }
  dialog.hidden = true;
  toast('success', 'Success', 'Cancellation completed successfully');
  load();
});
</script></body></html>`;

const pageHead = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OREO</title>${components}
<style>body{font-family:system-ui;margin:0}header{padding:10px 24px;border-bottom:1px solid #ddd}main{padding:24px}
.row{display:flex;align-items:center;gap:16px;margin-bottom:14px}.row>label:first-child{width:150px;font-size:13px}sc-button{display:inline-block}
#err{color:#b91c1c;font-size:13px;margin:8px 0}.overlay{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center}
.overlay[hidden]{display:none}.box{background:#fff;padding:24px;border-radius:8px;width:360px}.card{border:1px solid #ddd;border-radius:8px;padding:16px;font-size:14px}</style></head>
<body><header data-testid="layout-topnav-container"><b>OREO 0.2.17</b></header>
<script>if (!sessionStorage.getItem('user')) location.href = '/';</script>`;

const COUNTERPARTIES = '10 AM NY|10 AM JAK|MOCK BANK A|MOCK BANK B|MOCK CORP C';
const newTradePage = `${pageHead}
<main data-testid="create-trade-stepin-container"><h3>New Trade</h3>
  <div class="row"><label>Counterparty</label><sc-combobox data-testid="create-trade-counterparty-combobox" options="${COUNTERPARTIES}"></sc-combobox></div>
  <div class="row"><label>Portfolio</label><sc-combobox data-testid="create-trade-portfolio-combobox" options="CM_OIL_CRU_OPT|ABS_CR_UK_ETFBB|MOCK_PORTFOLIO_2"></sc-combobox></div>
  <div class="row"><label>Product ID</label><sc-combobox data-testid="create-trade-product-id-input" options="FX_PSCRIPT|FX_TRF|FX_PSCRIPT_FSKO|FX_OPT"></sc-combobox></div>
  <div class="row"><label>Direction</label><sc-combobox data-testid="create-trade-direction-select" options="Buy|Sell"></sc-combobox></div>
  <div class="row"><label>Trade file (.dat)</label><div data-testid="trade-file-upload" style="border:1px dashed #aaa;padding:12px;font-size:13px">Drag and drop or click to upload file <input type="file" accept=".dat"></div></div>
  <div class="row"><label>StepIn</label><input type="checkbox" data-testid="create-trade-stepin-toggle"></div>
  <div id="stepin" hidden>
    <div class="row"><label>StepIn type</label>
      <label><input type="radio" name="stepin" value="full" data-testid="create-trade-stepin-full-radio"> Full</label>
      <label><input type="radio" name="stepin" value="partial" data-testid="create-trade-stepin-partial-radio"> Partial</label></div>
    <div class="row"><label>Old counterparty</label><sc-combobox data-testid="create-trade-old-counterparty-combobox" options="${COUNTERPARTIES}"></sc-combobox></div>
  </div>
  <div id="err"></div>
  <sc-button data-testid="create-trade-save-btn">Save</sc-button> <sc-button data-testid="create-trade-book-btn">Book</sc-button>
</main>
<sc-modal data-testid="trade-change-confirmation-dialog" hidden><div slot="header"><h2>Confirm Trade Changes</h2>
  <p>Review the changes and risk impact before saving</p></div>
  <div><h2>Updated Risk Calculation</h2><sc-button data-testid="trade-change-confirm-btn">Confirm &amp; Save</sc-button></div></sc-modal>
<script>
const $ = (id) => document.querySelector('[data-testid=' + id + ']');
const err = document.getElementById('err'), dialog = $('trade-change-confirmation-dialog');
$('create-trade-stepin-toggle').addEventListener('change', (e) => { document.getElementById('stepin').hidden = !e.target.checked; });
function collect() {
  const file = $('trade-file-upload').querySelector('input').files[0];
  const stepIn = $('create-trade-stepin-toggle').checked;
  return {
    counterparty: $('create-trade-counterparty-combobox').value, portfolio: $('create-trade-portfolio-combobox').value,
    productId: $('create-trade-product-id-input').value, direction: $('create-trade-direction-select').value,
    fileName: file ? file.name : '',
    stepIn: stepIn ? ((document.querySelector('input[name=stepin]:checked') || {}).value || '') : null,
    oldCounterparty: stepIn ? $('create-trade-old-counterparty-combobox').value : '',
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
$('trade-change-confirm-btn').addEventListener('click', async () => {
  // like the real system: multipart/form-data that carries the uploaded file itself
  const form = new FormData();
  form.append('trade', JSON.stringify(collect()));
  form.append('file', $('trade-file-upload').querySelector('input').files[0]);
  const r = await fetch('/api/v1/trades/create?tradeAction=SUBMIT', { method: 'POST', body: form, headers: { 'X-User-Id': sessionStorage.getItem('userEmail') } });
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
const TASKS = {}; // approval tasks that are still open: task ID -> { tradeId, submittedBy }
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
  // Like the real API, /api/v1 has no login: the caller only names itself with its e-mail in X-User-Id
  const caller = req.headers['x-user-id'];
  if (req.url.startsWith('/api/v1/') && !USERS[caller]) return json(res, 401, { message: 'X-User-Id is missing or not a known user' });
  const readBody = (then) => { let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => then(body)); };

  if (req.method === 'POST' && req.url === '/api/v1/trades/create?tradeAction=SUBMIT') {
    return readBody((body) => {
      const field = (name) => (body.match(new RegExp('name="' + name + '"[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([\\s\\S]*?)\\r\\n--')) || [])[1];
      let t = JSON.parse(field('trade') || '{}');
      if (t.basic) {
        // The real request (what a case sends through the API): { basic: {...} } plus the file part "datFile"
        const b = t.basic;
        if (!field('datFile')) return json(res, 400, { message: 'Invalid dat file: empty or null bytes' });
        if (typeof b.premiumAmount !== 'number') return json(res, 400, { message: 'premiumAmount must be a number' });
        t = { counterparty: b.counterpartyName, portfolio: b.portfolioId, productId: b.productId, direction: b.direction,
          fileName: (body.match(/name="datFile"; filename="([^"]*)"/) || [])[1], stepIn: null, oldCounterparty: '' };
      } else if (!field('file')) {
        // The simplified request of this mock's own New Trade page
        return json(res, 400, { message: 'The trade data file is missing or empty' });
      }
      if (!t.counterparty || !t.portfolio || !t.productId || !t.direction) return json(res, 400, { message: 'Basic mandatory info is incomplete' });
      if (t.fileName !== t.productId + '.dat') return json(res, 400, { message: `The uploaded file does not match product ${t.productId}` });
      if (t.stepIn !== null && (!t.stepIn || !t.oldCounterparty)) return json(res, 400, { message: 'StepIn info is incomplete' });
      const stamp = Date.now() + Math.random().toString(16).slice(2, 10).toUpperCase();
      const id = 'TRD-' + stamp, taskId = 'CHK-' + stamp;
      TRADES[id] = { ...t, id, status: 'PARV', eventStatus: 'New' };
      TASKS[taskId] = { tradeId: id, submittedBy: caller };
      json(res, 200, { code: 200, status: 'PENDING APPROVAL', msg: 'Submitted for checker approval. TaskId: ' + taskId,
        data: { checkerContext: { taskId, submittedBy: caller }, trade: TRADES[id] } });
    });
  }
  // The checker decides on a task: approve makes the trade live, reject does not. The request has a JSON body
  const decide = req.method === 'POST' && req.url.match(/^\/api\/v1\/checker\/tasks\/([^/]+)\/(approve|reject)$/);
  if (decide) {
    return readBody((body) => {
      try { JSON.parse(body); } catch { return json(res, 400, { message: 'The request body must be JSON' }); }
      const task = TASKS[decide[1]];
      if (!task) return json(res, 404, { message: 'Task not found' });
      if (task.submittedBy === caller) return json(res, 403, { message: 'A task cannot be decided by the user who submitted it' });
      delete TASKS[decide[1]];
      const t = TRADES[task.tradeId];
      t.status = decide[2] === 'approve' ? 'LIVE' : 'REJECTED';
      json(res, 200, { code: 200, status: 'SUCCESS', msg: '', data: { id: t.id, basic: { counterpartyName: t.counterparty, portfolioId: t.portfolio, productId: t.productId, direction: t.direction }, trace: [] } });
    });
  }
  // The path and method are the real ones; the body and the response are this mock's own
  if (req.method === 'POST' && req.url === '/api/v1/trades/trigger-event') {
    return readBody((body) => {
      const e = JSON.parse(body || '{}'), t = TRADES[e.tradeId];
      if (!t) return json(res, 404, { message: 'Trade not found' });
      if (t.status !== 'LIVE') return json(res, 409, { message: 'Only a live trade can be cancelled' });
      if (!e.reason || !e.comments) return json(res, 400, { message: 'Reason and comments are required' });
      Object.assign(t, { status: 'PARV', eventStatus: 'Cancelled', cancelReason: e.reason, cancelComments: e.comments });
      json(res, 200, { code: 200, status: 'PENDING APPROVAL', data: { trade: t } });
    });
  }
  // Nothing else is served under the API prefix: without this an unknown API path would be answered with a page
  if (req.url.startsWith('/api/v1/')) return json(res, 404, { message: 'Not found' });
  if (req.method === 'GET' && req.url === '/api/trades') return json(res, 200, { data: { trades: Object.values(TRADES).reverse() } });
  if (req.method === 'GET' && req.url.startsWith('/api/trades/')) {
    const t = TRADES[req.url.split('/').pop()];
    return t ? json(res, 200, { data: { trade: t } }) : json(res, 404, { message: 'Trade not found' });
  }
  const url = req.url.split('?')[0];
  const html = url === '/trades/new' ? newTradePage : url.startsWith('/trades/') ? tradeDetailPage : url.startsWith('/trades') ? tradesPage : loginPage;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(PORT, () => console.log(`Mock OREO started: http://localhost:${PORT}  (account maker@test.com / maker1)`));
