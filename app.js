/* ================= CONFIG =================
   Paste the Apps Script web app URL here after you deploy it.
========================================== */
const API = 'https://script.google.com/macros/s/AKfycbx0SGQQjuFexwJJNSY3HfOE5BoS-dTOTOWOjVjgTiEy9NycaDyDrQC5mcCxrz50g3ponQ/exec';
const SHARES = { Rafique: 0.40, Anwar: 0.40, Shahidullah: 0.20 };
const T = { sold: 'Sold/Reinvested', eaten: 'Eaten', income: 'Income' };

/* ---------- helpers ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const f  = n => Math.round(n || 0).toLocaleString('en-US');
const fk = n => Math.abs(n) >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n));
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthName = k => { const [y, m] = k.split('-'); return MON[+m - 1] + ' ' + y; };
let DATA = null;

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------- theme ---------- */
const savedTheme = localStorage.getItem('pondtheme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
$('#themeBtn').onclick = () => {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = document.documentElement.getAttribute('data-theme') || (dark ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pondtheme', next);
  if (DATA) render();
};

/* ---------- access ---------- */
let PIN  = localStorage.getItem('pondpin')  || '';
let MODE = localStorage.getItem('pondmode') || '';   // '' | 'admin' | 'view'
const signedIn = () => MODE === 'admin' && !!PIN;

function applyMode() {
  document.body.classList.toggle('viewonly', !signedIn());
  if (!signedIn()) show('dash', false);
}
function openGate(force) {
  $('#gate').classList.remove('hidden');
  $('#gateErr').classList.add('hidden');
  $('#gatePin').value = '';
  $('#gateSkip').textContent = force ? 'Cancel, stay as viewer' : 'Continue without password';
}
const closeGate = () => $('#gate').classList.add('hidden');

$('#gateSkip').onclick = () => {
  MODE = 'view'; PIN = '';
  localStorage.setItem('pondmode', 'view'); localStorage.removeItem('pondpin');
  closeGate(); applyMode();
};
$('#gatePin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gateGo').click(); });
$('#gateGo').onclick = async () => {
  const v = $('#gatePin').value.trim();
  if (!v) { gateErr('Type the passcode, or continue as a viewer.'); return; }
  $('#gateGo').disabled = true; $('#gateGo').textContent = 'Checking…';
  const r = await post({ action: 'check', pin: v });
  $('#gateGo').disabled = false; $('#gateGo').textContent = 'Unlock full access';
  if (r.ok) {
    PIN = v; MODE = 'admin';
    localStorage.setItem('pondpin', v); localStorage.setItem('pondmode', 'admin');
    closeGate(); applyMode(); toast('Full access unlocked.');
  } else gateErr(r.error || 'That passcode did not work.');
};
function gateErr(m) { $('#gateErr').textContent = m; $('#gateErr').classList.remove('hidden'); }

/* ---------- network ---------- */
async function post(body) {
  try {
    const res = await fetch(API, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }   // avoids a CORS preflight
    });
    return await res.json();
  } catch (e) { return { ok: false, error: 'Could not reach the sheet. Check your connection.' }; }
}

/* The published Apps Script may still be the older version. Rather than showing
   blank rows, translate the old field names and rebuild what is missing. */
let OLDAPI = false;
function normalize(d) {
  if (!d) return d;
  OLDAPI = false;
  d.investments = d.investments || [];
  d.expenses = d.expenses || [];
  d.sales = d.sales || [];
  d.sales.forEach(s => {
    if (s.description == null) { s.description = s.buyer || ''; OLDAPI = true; }
    if (s.comment == null) s.comment = s.remarks || '';
  });
  d.expenses.forEach(e => { if (e.comment == null) e.comment = e.remarks || ''; });
  if (!d.payments) {
    OLDAPI = true;
    d.payments = [];
    (d.partners || []).forEach(p => (p.payments || []).forEach(q => {
      d.payments.push(Object.assign({ partner: p.name }, q));
    }));
  }
  if (!d.partnerNames) d.partnerNames = (d.partners || []).map(p => p.name);
  const s = d.summary || (d.summary = {});
  if (s.recovered == null) s.recovered = s.cost ? Math.round(s.revenue / s.cost * 1000) / 10 : 0;
  // A round writes its date on the first of its three rows only. Carry it down.
  let carry = '';
  d.investments.forEach(r => { if (r.date) carry = r.date; else r.date = carry; });
  return d;
}

let loading = false, lastLoad = 0;
async function load(silent) {
  const now = Date.now();
  if (loading || (silent && now - lastLoad < 3000)) return;
  loading = true; lastLoad = now;
  document.body.classList.add('syncing');
  try { await doLoad(silent); }
  finally { loading = false; document.body.classList.remove('syncing'); }
}
async function doLoad(silent) {
  try {
    const res = await fetch(API + '?t=' + Date.now());
    const j = await res.json();
    if (j.ok) { DATA = normalize(j.data); localStorage.setItem('ponddata', JSON.stringify(DATA)); render(); }
    else if (!silent) toast(j.error || 'Could not read the sheet', true);
  } catch (e) {
    const c = localStorage.getItem('ponddata');
    if (c) { DATA = normalize(JSON.parse(c)); render(); $('#stamp').textContent = 'offline · last saved copy'; }
    else if (!silent) toast('Offline and nothing saved yet', true);
  }
}

/* ================= NAVIGATION =================
   Every view and every sheet gets a history entry, so the phone's back
   button walks back through the app instead of closing it. */
let VIEW = 'dash';
function show(v, push) {
  VIEW = v;
  $$('.view').forEach(s => s.classList.add('hidden'));
  const el = $('#v-' + v); if (el) el.classList.remove('hidden');
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  scrollTo(0, 0);
  if (push !== false) history.pushState({ v }, '', '#' + v);
}
$$('#tabs button').forEach(b => b.onclick = () => {
  const v = b.dataset.v;
  if (v !== 'dash' && !signedIn()) { openGate(true); return; }
  if (v !== VIEW) show(v);
});

addEventListener('popstate', e => {
  const st = e.state || {};
  const wantDepth = st.sheet || 0;
  if (wantDepth < SHEETS.length) { SHEETS.length = wantDepth; paintSheet(); }
  const v = st.v || 'dash';
  if (v !== VIEW) show(v, false);
});

/* ================= SLIDE-UP SHEET =================
   A stack, so History then Edit is two steps and the phone's back button
   walks Edit -> History -> the screen behind it, one press at a time. */
let SHEETS = [];
function openSheet(title, tag, html, wire) {
  SHEETS.push({ title: title, tag: tag, html: html, wire: wire });
  paintSheet();
  history.pushState({ v: VIEW, sheet: SHEETS.length }, '', '#' + VIEW);
}
function paintSheet() {
  const s = SHEETS[SHEETS.length - 1];
  if (!s) {
    $('#sheet').classList.add('hidden');
    $('#scrim').classList.add('hidden');
    return;
  }
  $('#sheetTitle').textContent = s.title;
  $('#sheetTag').textContent = s.tag || '';
  $('#sheetTag').classList.toggle('hidden', !s.tag);
  $('#sheetBody').innerHTML = s.html;
  $('#sheet').classList.remove('hidden');
  $('#scrim').classList.remove('hidden');
  $('#sheetBody').scrollTop = 0;
  $('#sheetBack').textContent = SHEETS.length > 1 ? 'Back' : 'Close';
  if (s.wire) s.wire();
}
function closeSheet() {
  const n = SHEETS.length;
  if (!n) return;
  SHEETS = []; paintSheet();
  history.go(-n);
}
$('#sheetBack').onclick = () => { if (SHEETS.length > 1) history.back(); else closeSheet(); };
$('#scrim').onclick = () => closeSheet();

/* ================= RENDER ================= */
function render() {
  if (!DATA) return;
  const s = DATA.summary;
  $('#stamp').textContent = 'updated ' + new Date(DATA.updated)
    .toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  banner();
  drawChips(s);
  drawTrend(s);
  drawRecovery(s);
  drawDonut(s);
  drawFish(s);
  drawPartners(s);
  fillPartnerSelect();
  updatePayState();
}


/* An honest warning rather than a screen full of blanks. */
function banner() {
  let el = document.getElementById('oldapi');
  if (!OLDAPI) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'oldapi'; el.className = 'card warnbar';
    el.innerHTML = '<b>The sheet is running the old script.</b>' +
      'Fish descriptions and comments will not save, and no entry can be edited. ' +
      'Paste the new Code.gs into Apps Script, then Deploy, Manage deployments, New version.';
    $('#v-dash').insertBefore(el, $('#chips'));
  }
}

/* ---- stat chips ---- */
function drawChips(s) {
  const items = [
    ['Cash in hand', f(s.cash), 'with Rafique', 'var(--pay)', ''],
    ['Invested',     f(s.projected), 'by all partners', 'var(--invest)', ''],
    ['Spent',        f(s.cost), 'since day one', 'var(--expense)', ''],
    ['Profit / Loss', f(s.profit), s.profit < 0 ? 'still in the hole' : 'in the black',
      s.profit < 0 ? 'var(--crit)' : 'var(--good)', s.profit < 0 ? 'neg' : 'pos']
  ];
  $('#chips').innerHTML = items.map(([k, v, n, c, cls]) =>
    `<div class="chip" style="--c:${c}"><div class="k">${k}</div><div class="v ${cls}">${v}</div><div class="n">${n}</div></div>`
  ).join('');
}

/* ---- how the business is going ---- */
function drawTrend(s) {
  const M = DATA.byMonth || [];
  if (M.length < 2) { $('#trend').innerHTML = '<p class="cap">Not enough months yet.</p>'; return; }

  let co = 0, re = 0;
  const pts = M.map(m => {
    co += m.cost; re += m.rev;
    return { m: m.m, cost: co, rev: re };
  });
  const max = Math.max(...pts.map(p => p.cost)) || 1;
  const W = 320, H = 132, PL = 30, PR = 6, PT = 10, PB = 18;
  const x = i => PL + (W - PL - PR) * (pts.length === 1 ? 0 : i / (pts.length - 1));
  const y = v => PT + (H - PT - PB) * (1 - v / max);

  const line = key => pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
  const gap = line('cost') + ' ' + pts.slice().reverse()
    .map((p, i) => 'L' + x(pts.length - 1 - i).toFixed(1) + ' ' + y(p.rev).toFixed(1)).join(' ') + ' Z';

  const ticks = [0, max / 2, max];
  const lastI = pts.length - 1;
  const labelIdx = [0, Math.floor(lastI / 2), lastI];

  $('#trend').innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Money spent against money earned">
    ${ticks.map(t => `<line class="gridline" x1="${PL}" x2="${W - PR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>
      <text class="axis" x="${PL - 4}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${fk(t)}</text>`).join('')}
    <path d="${gap}" fill="var(--expense)" opacity=".13"/>
    <path d="${line('cost')}" fill="none" stroke="var(--expense)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${line('rev')}"  fill="none" stroke="var(--sale)"    stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(lastI).toFixed(1)}" cy="${y(pts[lastI].cost).toFixed(1)}" r="3.2" fill="var(--expense)"/>
    <circle cx="${x(lastI).toFixed(1)}" cy="${y(pts[lastI].rev).toFixed(1)}"  r="3.2" fill="var(--sale)"/>
    ${labelIdx.map(i => `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === lastI ? 'end' : 'middle'}">${pts[i].m.slice(2).replace('-', '/')}</text>`).join('')}
  </svg>`;

  $('#trendLeg').innerHTML =
    `<span><i style="background:var(--expense)"></i>Money spent ${f(s.cost)}</span>
     <span><i style="background:var(--sale)"></i>Money earned ${f(s.revenue)}</span>`;

  const gapNow = s.cost - s.revenue;
  $('#trendCap').textContent = `The shaded gap is what the pond still owes itself: ${f(gapNow)} taka.`;
  const tag = $('#trendTag');
  tag.textContent = (s.profit < 0 ? '−' : '+') + f(Math.abs(s.profit));
  tag.className = 'tag ' + (s.profit < 0 ? 'neg' : 'pos');
}

/* ---- getting the money back ---- */
function drawRecovery(s) {
  const pct = Math.max(0, Math.min(100, s.recovered || 0));
  $('#recBar').innerHTML =
    `<i style="width:${pct}%;background:var(--sale)"></i><i style="flex:1;background:transparent"></i>`;
  $('#recTag').textContent = pct.toFixed(1) + '%';
  $('#recTag').className = 'tag ' + (pct >= 100 ? 'pos' : '');
  $('#recCap').textContent =
    `Fish has paid back ${f(s.revenue)} of the ${f(s.cost)} spent. ${f(s.cost - s.revenue)} still to go.`;
  $('#beRow').innerHTML = [
    [f(s.trueMonth), 'Costs per month<br>running plus lease share'],
    [s.breakEvenKg + ' kg', `To break even each month<br>at ${s.rate} taka a kg`],
    [s.kgTotal.toFixed(0) + ' kg', `Produced in ${s.nMonths} months<br>${(s.kgTotal / s.nMonths).toFixed(1)} kg a month`]
  ].map(([b, sp]) => `<div class="mini"><b>${b}</b><span>${sp}</span></div>`).join('');
}

/* ---- where the money went ---- */
function drawDonut(s) {
  const cats = (DATA.categories || []).slice(0, 4);
  const restVal = (DATA.categories || []).slice(4).reduce((a, b) => a + b.value, 0);
  const rows = restVal > 0 ? cats.concat([{ label: 'Other', value: restVal }]) : cats;
  const ramp = ['var(--o1)', 'var(--o2)', 'var(--o3)', 'var(--o4)', 'var(--o5)'];
  const total = s.cost || 1, R = 52, r = 33, C = 60;
  let a0 = -Math.PI / 2, arcs = '';
  rows.forEach((c, i) => {
    const a1 = a0 + (c.value / total) * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
    const [x1, y1] = p(R, a0), [x2, y2] = p(R, a1), [x3, y3] = p(r, a1), [x4, y4] = p(r, a0);
    arcs += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${big} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} A${r} ${r} 0 ${big} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z" fill="${ramp[i]}"/>`;
    a0 = a1;
  });
  $('#donut').innerHTML =
    `<svg viewBox="0 0 120 120" role="img" aria-label="Cost by category">${arcs}
      <text x="60" y="58" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">${fk(s.cost)}</text>
      <text x="60" y="71" text-anchor="middle" font-size="8" fill="var(--muted)">total spent</text></svg>`;
  $('#dlist').innerHTML = rows.map((c, i) =>
    `<div class="drow"><i style="background:${ramp[i]}"></i><span>${esc(c.label)}</span>
      <b>${f(c.value)} <em>${(c.value / total * 100).toFixed(0)}%</em></b></div>`).join('');
  $('#costTag').textContent = rows[0] ? rows[0].label + ' leads' : '';
}

/* ---- fish out of the pond ---- */
function drawFish(s) {
  const rows = [
    { k: 'Stayed in the pond', v: s.reinvested, kg: s.kgSold,   c: 'var(--sale)',
      n: 'Sold, and Rafique spent it back on the pond.' },
    { k: 'Shared out as cash', v: s.income,     kg: s.kgIncome, c: 'var(--pay)',
      n: 'Sold, and handed to the partners 40 / 40 / 20.' },
    { k: 'Eaten by partners',  v: s.eaten,      kg: s.kgEaten,  c: 'var(--warn)',
      n: 'No cash. Counted as income and split in kind.' }
  ];
  const tot = s.revenue || 1;
  $('#fishSeg').innerHTML = rows.filter(r => r.v > 0).map(r =>
    `<i style="width:${(r.v / tot * 100).toFixed(1)}%;background:${r.c}">${r.v / tot > .12 ? (r.v / tot * 100).toFixed(0) + '%' : ''}</i>`).join('');
  $('#fishList').innerHTML = rows.map(r =>
    `<div class="srow"><i style="background:${r.c}"></i><span>${r.k}</span>
      <em>${r.kg.toFixed(1)} kg</em><b>${f(r.v)}</b><p>${r.n}</p></div>`).join('');
  $('#fishTag').textContent = s.kgTotal.toFixed(0) + ' kg · ' + f(s.revenue);
}

/* ---- partners ---- */
function drawPartners(s) {
  $('#plist').innerHTML = (DATA.partners || []).map(p => {
    const pct = p.should ? Math.min(100, p.paid / p.should * 100) : 0;
    const settled = Math.abs(p.due) < 1;
    return `<div class="prow">
      <div class="ptop"><span class="pname">${esc(p.name)}${p.manager ? ' · manager' : ''}</span>
        <span class="pshare">${Math.round(p.share * 100)}% share</span></div>
      <div class="pbar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="pgrid">
        <div class="pcell"><b>${f(p.should)}</b><span>Should</span></div>
        <div class="pcell"><b>${f(p.paid)}</b><span>Paid</span></div>
        <div class="pcell ${settled ? 'ok' : 'due'}"><b>${settled ? '0' : f(p.due)}</b><span>Due</span></div>
        <div class="pcell"><b>${f(p.fish + p.money)}</b><span>Got back</span></div>
      </div></div>`;
  }).join('');
  $('#partTag').textContent = f(s.projected) + ' in total';
}

/* ================= HISTORY + EDIT ================= */
const KINDS = {
  investments: {
    title: 'All investment calls', kind: 'investment', color: 'var(--invest)', bg: 'var(--investbg)',
    rows: () => DATA.investments,
    line: r => ({ t: r.purpose || 'Investment', s: r.who, a: f(r.amount), d: r.date, pill: r.who })
  },
  expenses: {
    title: 'All expenses', kind: 'expense', color: 'var(--expense)', bg: 'var(--expensebg)',
    rows: () => DATA.expenses,
    line: r => ({ t: r.purpose || 'Expense', s: 'Paid to ' + (r.payee || '—'), a: f(r.amount), d: r.date, pill: r.comment })
  },
  sales: {
    title: 'All fish out', kind: 'sale', color: 'var(--sale)', bg: 'var(--salebg)',
    rows: () => DATA.sales,
    line: r => ({ t: r.description || 'Fish', s: r.kg + ' kg at ' + r.rate, a: f(r.received), d: r.date,
                  pill: r.type === T.eaten ? 'Eaten by partners' : r.type === T.income ? 'Cash shared out' : 'Stayed in the pond' })
  },
  payments: {
    title: 'All payments', kind: 'payment', color: 'var(--pay)', bg: 'var(--paybg)',
    rows: () => DATA.payments,
    line: r => ({ t: r.partner, s: 'Paid to Rafique', a: f(r.amount), d: r.date, pill: '' })
  }
};

$$('button.hist').forEach(b => b.onclick = () => openHist(b.dataset.h));

function openHist(key) {
  if (!DATA) { toast('Still loading', true); return; }
  const K = KINDS[key];
  const rows = (K.rows() || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!rows.length) { openSheet(K.title, '', '<p class="empty">Nothing recorded yet.</p>'); return; }

  const total = rows.reduce((a, b) => a + (b.amount != null ? b.amount : b.received), 0);
  let html = '', last = '';
  rows.forEach((r, i) => {
    const g = (r.date || '').slice(0, 7);
    if (g !== last) { last = g; html += `<p class="hgroup">${g ? monthName(g) : 'No date'}</p>`; }
    const L = K.line(r);
    html += `<button class="hrow" data-k="${key}" data-i="${i}" style="--k:${K.color};--kb:${K.bg}">
      <span class="t">${esc(L.t)}</span>
      <span class="a">${L.a}</span>
      <svg class="pen" viewBox="0 0 24 24"><path d="M3 17.2V21h3.8L17.8 10 14 6.2 3 17.2ZM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8L18.9 8.9l1.8-1.8Z"/></svg>
      <span class="s">${esc(L.s)}</span><span class="d">${esc(L.d)}</span>
      ${L.pill ? `<span class="pill">${esc(L.pill)}</span>` : ''}</button>`;
  });
  openSheet(K.title, rows.length + ' · ' + f(total), html, () => {
    $$('#sheetBody .hrow').forEach(b => b.onclick = () => {
      if (!signedIn()) { toast('Passcode needed to change entries', true); return; }
      const rec = rows[+b.dataset.i];
      if (!(rec && rec.row > 0)) {
        toast('Editing needs the new Apps Script. Deploy a new version first.', true); return;
      }
      openEdit(key, rec);
    });
  });
}

/* ---- edit one row ---- */
const FIELDS = {
  investment: r => [
    ['date',   'date',  'Date', r.date, {}],
    ['pick',   'who',   'Whose share', r.who, { opts: (DATA.partnerNames || Object.keys(SHARES)) }],
    ['text',   'purpose', 'What the money is for', r.purpose, {}],
    ['money',  'amount', 'Amount', r.amount, {}]
  ],
  expense: r => [
    ['date',  'date', 'Date', r.date, {}],
    ['text',  'payee', 'Paid to', r.payee, {}],
    ['text',  'purpose', 'What was bought', r.purpose, {}],
    ['money', 'amount', 'Amount', r.amount, {}],
    ['text',  'comment', 'Comment', r.comment, {}]
  ],
  sale: r => [
    ['date', 'date', 'Date', r.date, {}],
    ['pick', 'type', 'What happened', r.type, { opts: [
      [T.sold, 'Sold, money stays in the pond'],
      [T.income, 'Sold, cash shared out to the partners'],
      [T.eaten, 'Fish eaten by partners']] }],
    ['text',  'description', 'Description', r.description, {}],
    ['qty',   'kg', 'Weight in kg', r.kg, {}],
    ['money', 'rate', 'Rate per kg', r.rate, {}],
    ['money', 'discount', 'Discount', r.discount, {}],
    ['text',  'comment', 'Comment', r.comment, {}]
  ],
  payment: r => [
    ['pick',  'partner', 'Who paid', r.partner, { opts: (DATA.partnerNames || []).filter(n => n !== 'Rafique') }],
    ['date',  'date', 'Date', r.date, {}],
    ['money', 'amount', 'Amount received', r.amount, {}]
  ]
};

function fieldHTML(type, name, label, val, opt) {
  const v = val == null ? '' : val;
  if (type === 'pick') {
    let list = (opt.opts || []).slice();
    // Old rows can carry a name that is no longer in the list, such as Idris.
    // Keep it, so editing a row never silently reassigns it to someone else.
    const known = list.map(o => String(Array.isArray(o) ? o[0] : o));
    if (v !== '' && known.indexOf(String(v)) < 0) list = [[v, v + ' (as written in the sheet)']].concat(list);
    const opts = list.map(o => {
      const [ov, ol] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}>${esc(ol)}</option>`;
    }).join('');
    return `<label class="fld pick"><span class="lbl">${label}</span>
      <span class="ctl"><i class="pre">☰</i><select name="${name}">${opts}</select><i class="post">▾</i></span></label>`;
  }
  if (type === 'date')
    return `<label class="fld date"><span class="lbl">${label}</span>
      <span class="ctl"><i class="pre">📅</i><input type="date" name="${name}" value="${esc(v)}"></span></label>`;
  if (type === 'money')
    return `<label class="fld money"><span class="lbl">${label}</span>
      <span class="ctl"><i class="pre">৳</i><input type="number" step="1" inputmode="numeric" name="${name}" value="${esc(v)}"></span>
      <span class="hint">Taka</span></label>`;
  if (type === 'qty')
    return `<label class="fld qty"><span class="lbl">${label}</span>
      <span class="ctl"><i class="pre">⚖</i><input type="number" step="0.1" inputmode="decimal" name="${name}" value="${esc(v)}"><i class="post">kg</i></span></label>`;
  return `<label class="fld text"><span class="lbl">${label}</span>
    <span class="ctl"><i class="pre">Aa</i><input name="${name}" value="${esc(v)}"></span></label>`;
}

function openEdit(key, rec) {
  const K = KINDS[key];
  const fields = FIELDS[K.kind](rec).map(a => fieldHTML(...a)).join('');
  const html = `<form class="form card accent-${K.kind === 'investment' ? 'invest' : K.kind}" id="f-edit"
       style="--accent:${K.color}">
      <p class="cap">This writes straight into the Google Sheet, row ${rec.row}. Nothing is kept anywhere else.</p>
      ${fields}
      <button class="primary" type="submit" style="background:${K.color}">Save the change</button>
    </form>`;

  openSheet('Edit entry', 'sheet row ' + rec.row, html, () => {
    $('#f-edit').addEventListener('submit', async ev => {
      ev.preventDefault();
      const fm = ev.target, body = { action: 'edit', pin: PIN, kind: K.kind, row: rec.row };
      [...fm.elements].forEach(el => { if (el.name) body[el.name] = el.value; });
      if (K.kind === 'payment' && !body.partner) body.partner = rec.partner;
      const btn = fm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving…';
      const r = await post(body);
      btn.disabled = false; btn.textContent = 'Save the change';
      if (r.ok) {
        DATA = normalize(r.data); localStorage.setItem('ponddata', JSON.stringify(DATA)); render();
        closeSheet(); toast(r.result || 'Saved');
      } else toast(r.error || 'Could not save', true);
    });
  });
}

/* ================= FORMS ================= */
function fillPartnerSelect() {
  const sel = $('#paySel'); if (!sel || sel.options.length) return;
  (DATA.partnerNames || ['Anwar', 'Shahidullah']).filter(n => n !== 'Rafique')
    .forEach(n => sel.add(new Option(n, n)));
}
function updatePayState() {
  const box = $('#payState'); if (!DATA) { box.textContent = ''; return; }
  const p = (DATA.partners || []).find(x => x.name === $('#paySel').value);
  if (!p) { box.textContent = ''; return; }
  box.innerHTML = `<div class="sp">
    <div><b>${f(p.should)}</b><span>SHOULD INVEST</span></div>
    <div><b>${f(p.paid)}</b><span>PAID SO FAR</span></div>
    <div><b>${f(p.due)}</b><span>STILL DUE</span></div></div>`;
}
$('#paySel').addEventListener('change', updatePayState);

/* investment split preview */
function invPreview() {
  const total = +$('#f-invest [name=amount]').value || 0;
  const box = $('#invSplit');
  if (!total) { box.innerHTML = '<span class="note">Type an amount to see each partner\'s portion.</span>'; return; }
  box.innerHTML = `<span class="big">${f(total)}</span> to raise, split by share
    <div class="sp">${Object.entries(SHARES).map(([n, sh]) =>
      `<div><b>${f(total * sh)}</b><span>${n.toUpperCase()} ${Math.round(sh * 100)}%</span></div>`).join('')}</div>
    <p class="note">Three rows are written to the ledger, one per partner, exactly as Rafique does it by hand.</p>`;
}
$('#f-invest').addEventListener('input', invPreview);

/* sale preview */
const TYPE_NOTE = {
  [T.sold]:   'Cash stays with Rafique and is spent on the pond.',
  [T.income]: 'Cash is shared out 40 / 40 / 20. It does not stay in the pond.',
  [T.eaten]:  'No cash. Counted as income and split 40 / 40 / 20 in kind.'
};
function salePreview() {
  const fm = $('#f-sale');
  const kg = +fm.kg.value || 0, rate = +fm.rate.value || 0, disc = +fm.discount.value || 0;
  const val = Math.max(0, kg * rate - disc), type = fm.type.value;
  const split = type === T.sold ? '' :
    `<div class="sp">${Object.entries(SHARES).map(([n, sh]) =>
      `<div><b>${f(val * sh)}</b><span>${n.toUpperCase()}</span></div>`).join('')}</div>`;
  $('#saleCalc').innerHTML =
    `<span class="big">${f(val)}</span> · ${kg || 0} kg at ${rate || 0}${disc ? ' less ' + f(disc) : ''}
     ${split}<p class="note">${TYPE_NOTE[type] || ''}</p>`;
}
$('#f-sale').addEventListener('input', salePreview);
$('#f-sale').addEventListener('change', salePreview);

/* submit */
function wire(sel, build, okMsg) {
  $(sel).addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!signedIn()) { openGate(true); return; }
    const btn = ev.target.querySelector('button[type=submit]');
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
    const r = await post(Object.assign({ pin: PIN }, build(ev.target)));
    btn.disabled = false; btn.textContent = old;
    if (r.ok) {
      DATA = normalize(r.data); localStorage.setItem('ponddata', JSON.stringify(DATA)); render();
      ev.target.reset(); $$('input[type=date]').forEach(i => i.value = today());
      invPreview(); salePreview();
      toast(r.result || okMsg); show('dash');
    } else {
      toast(r.error || 'Could not save', true);
      if (/passcode/i.test(r.error || '')) {
        PIN = ''; MODE = 'view';
        localStorage.removeItem('pondpin'); localStorage.setItem('pondmode', 'view');
        applyMode(); openGate(true);
      }
    }
  });
}
wire('#f-invest',  fm => ({ action: 'investment', date: fm.date.value, purpose: fm.purpose.value, amount: +fm.amount.value }), 'Investment announced');
wire('#f-expense', fm => ({ action: 'expense', date: fm.date.value, payee: fm.payee.value, purpose: fm.purpose.value, amount: +fm.amount.value, comment: fm.comment.value }), 'Expense saved');
wire('#f-sale',    fm => ({ action: 'sale', date: fm.date.value, description: fm.description.value, kg: +fm.kg.value, rate: +fm.rate.value, discount: +fm.discount.value || 0, type: fm.type.value, comment: fm.comment.value }), 'Saved');
wire('#f-pay',     fm => ({ action: 'payment', partner: fm.partner.value, date: fm.date.value, amount: +fm.amount.value }), 'Payment saved');

/* ================= LIVE UPDATES ================= */
const POLL_MS = 20000;
let pollTimer = null;
const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => { if (!document.hidden) { load(true); checkBuild(); } }, POLL_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPolling(); else { load(true); startPolling(); }
});
addEventListener('focus',  () => load(true));
addEventListener('online', () => { $('#stamp').textContent = 'back online, refreshing…'; load(true); });
addEventListener('offline', () => { $('#stamp').textContent = 'offline · last saved copy'; });

let pullY = 0;
addEventListener('touchstart', e => { pullY = scrollY === 0 ? e.touches[0].clientY : 0; }, { passive: true });
addEventListener('touchend', e => {
  if (pullY && e.changedTouches[0].clientY - pullY > 90) load(true);
  pullY = 0;
}, { passive: true });

/* ---- new app version ----
   Bump version.json on every publish. Open apps pick it up within 20 seconds. */
let reloading = false, BUILD = null;
async function checkBuild() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = (await r.json()).build;
    if (!BUILD) { BUILD = v; return; }
    if (v !== BUILD && !reloading) {
      reloading = true; toast('New version, updating…');
      if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
      setTimeout(() => location.reload(), 800);
    }
  } catch (e) { /* offline, try again next poll */ }
}
const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js')
    .then(reg => { if (reg) setInterval(() => reg.update().catch(() => {}), 60000); })
    .catch(() => {});
}

/* ================= SPLASH =================
   Full blue screen only when the app is genuinely opened.
   On a refresh, just the little fish in the corner. */
const FIRST_OPEN = !sessionStorage.getItem('pondopened');
sessionStorage.setItem('pondopened', '1');
if (FIRST_OPEN) setTimeout(() => $('#splash').classList.add('gone'), 2000);
else { const sp = $('#splash'); if (sp) sp.remove(); }

/* ================= BOOT ================= */
$$('input[type=date]').forEach(i => { if (!i.value) i.value = today(); });
history.replaceState({ v: 'dash' }, '', '#dash');
applyMode();
if (!MODE) openGate(false); else closeGate();
invPreview(); salePreview();
load();
checkBuild();
startPolling();
