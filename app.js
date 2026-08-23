/* ================= CONFIG =================
   Paste the Apps Script web app URL here after you deploy it.
   It looks like: https://script.google.com/macros/s/AKfy..../exec
========================================== */
const API = 'https://script.google.com/macros/s/AKfycbx0SGQQjuFexwJJNSY3HfOE5BoS-dTOTOWOjVjgTiEy9NycaDyDrQC5mcCxrz50g3ponQ/exec';
const SHARES = { Rafique: 0.40, Anwar: 0.40, Shahidullah: 0.20 };

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const f = n => Math.round(n).toLocaleString('en-US');
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); return n; };
const today = () => new Date().toISOString().slice(0, 10);
let DATA = null;
let PIN  = localStorage.getItem('pondpin') || '';
let MODE = localStorage.getItem('pondmode') || '';   // '' | 'admin' | 'view'

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : '');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 3400);
}

/* ---------- theme ---------- */
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('pondtheme', dark ? 'light' : 'dark');
};
if (localStorage.getItem('pondtheme')) document.documentElement.setAttribute('data-theme', localStorage.getItem('pondtheme'));

/* ---------- access mode ---------- */
function signedIn() { return MODE === 'admin' && !!PIN; }

function applyMode() {
  const admin = signedIn();
  document.body.classList.toggle('viewonly', !admin);
  if (!admin) show('dash');
}

/* Hidden way back to the passcode screen: tap the app name three times.
   There is no visible key, as asked. Without this a viewer could never unlock. */
let taps = 0, tapT = null;
document.querySelector('.brand').addEventListener('click', () => {
  taps++; clearTimeout(tapT); tapT = setTimeout(() => taps = 0, 900);
  if (taps >= 3) { taps = 0; openGate(true); }
});

function openGate(force) {
  $('#gateErr').classList.add('hidden');
  $('#gatePin').value = '';
  $('#gate').classList.remove('hidden');
  $('#gateSkip').textContent = force ? 'Cancel, stay as viewer' : 'Continue without password';
  setTimeout(() => $('#gatePin').focus(), 120);
}
function closeGate() { $('#gate').classList.add('hidden'); }

$('#gateSkip').onclick = () => {
  MODE = 'view'; PIN = '';
  localStorage.setItem('pondmode', 'view'); localStorage.removeItem('pondpin');
  closeGate(); applyMode();
};

$('#gatePin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gateGo').click(); });

$('#gateGo').onclick = async () => {
  const v = $('#gatePin').value.trim();
  if (!v) { $('#gateErr').textContent = 'Type the passcode, or continue as a viewer.'; $('#gateErr').classList.remove('hidden'); return; }
  $('#gateGo').disabled = true; $('#gateGo').textContent = 'Checking…';
  const r = await post({ action: 'check', pin: v });
  $('#gateGo').disabled = false; $('#gateGo').textContent = 'Unlock full access';
  if (r.ok) {
    PIN = v; MODE = 'admin';
    localStorage.setItem('pondpin', v); localStorage.setItem('pondmode', 'admin');
    closeGate(); applyMode(); toast('Full access unlocked.');
  } else {
    $('#gateErr').textContent = r.error || 'That passcode did not work.';
    $('#gateErr').classList.remove('hidden');
  }
};

/* ---------- install to home screen ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e; $('#installBtn').classList.remove('hidden');
});
$('#installBtn').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; $('#installBtn').classList.add('hidden');
};
window.addEventListener('appinstalled', () => $('#installBtn').classList.add('hidden'));

/* ---------- network ---------- */
async function post(body) {
  if (API.includes('PASTE_YOUR')) return { ok: false, error: 'The app is not connected to the sheet yet. Set API in app.js.' };
  try {
    const res = await fetch(API, { method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' } });   // text/plain avoids a CORS preflight
    return await res.json();
  } catch (e) { return { ok: false, error: 'Could not reach the sheet. Check your connection.' }; }
}
let loading = false, lastLoad = 0;
async function load(silent) {
  const now = Date.now();
  if (loading || (silent && now - lastLoad < 3000)) return;   // no duplicate calls
  loading = true; lastLoad = now;
  try { await doLoad(silent); } finally { loading = false; }
}
async function doLoad(silent) {
  if (API.includes('PASTE_YOUR')) {
    const c = localStorage.getItem('ponddata');
    if (c) { DATA = JSON.parse(c); render(); }
    $('#stamp').textContent = 'not connected to the sheet yet';
    return;
  }
  try {
    const res = await fetch(API + '?t=' + Date.now());
    const j = await res.json();
    if (j.ok) { DATA = j.data; localStorage.setItem('ponddata', JSON.stringify(DATA)); render(); }
    else if (!silent) toast(j.error || 'Could not read the sheet', true);
  } catch (e) {
    const c = localStorage.getItem('ponddata');
    if (c) { DATA = JSON.parse(c); render(); $('#stamp').textContent = 'offline · showing last saved copy'; }
    else if (!silent) toast('Offline and nothing saved yet', true);
  }
}

/* ---------- navigation ---------- */
let pendingTab = null;
function show(v) {
  $$('.view').forEach(s => s.classList.add('hidden'));
  $('#v-' + v).classList.remove('hidden');
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo(0, 0);
}
$$('#tabs button').forEach(b => b.onclick = () => {
  const v = b.dataset.v;
  if (v !== 'dash' && !signedIn()) { openGate(true); return; }
  show(v);
});

/* ================= RENDER ================= */
function render() {
  if (!DATA) return;
  const s = DATA.summary;
  $('#stamp').textContent = 'updated ' + new Date(DATA.updated).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  /* tiles */
  $('#tiles').innerHTML = [
    ['Cash in hand', f(s.cash), 'with Rafique right now', ''],
    ['Total invested', f(s.projected), 'by all partners', ''],
    ['Fish revenue', f(s.revenue), s.kgTotal.toFixed(1) + ' kg out of the pond', ''],
    ['Total cost', f(s.cost), 'since the pond started', ''],
    ['Profit / Loss', f(s.profit), 'lease charged in full to year one', s.profit < 0 ? 'neg' : 'pos'],
    ['Fish in pond', f(s.stock), 'estimate, not in the profit line', '']
  ].map(([k, v, n, c]) => `<div class="tile"><div class="k">${k}</div><div class="v ${c}">${v}</div><div class="n">${n}</div></div>`).join('');

  /* fish money three ways */
  $('#fishCap').textContent = `Fish revenue ${f(s.revenue)} from ${s.kgTotal.toFixed(1)} kg. Only the first line is still pond cash.`;
  $('#fishSplit').innerHTML = [
    ['Stayed in the pond', s.reinvested, s.kgSold, 'Sold and spent back on feed, medicine and labour.'],
    ['Shared out as cash', s.income, s.kgIncome, 'Sold and handed to the partners 40 / 40 / 20.'],
    ['Taken as fish', s.eaten, s.kgEaten, 'Eaten by the partners. Counted as income, never as cash.']
  ].map(([k, v, kg, n]) => `<div class="frow"><div class="fk">${k}</div><div class="fv">${f(v)}</div><div class="fkg">${kg.toFixed(1)} kg</div><div class="fn">${n}</div></div>`).join('');

  /* donut */
  $('#costCap').textContent = `Total cost ${f(s.cost)}. Biggest single item: ${DATA.categories[0] ? DATA.categories[0].label.toLowerCase() : '—'}.`;
  drawDonut(DATA.categories, s.cost);

  /* monthly bars */
  drawBars(DATA.byMonth.map(m => ({ m: m.m, v: m.cost })), s.runPerMonth, s.lease);

  /* partners */
  $('#partners').innerHTML = '<table><tr><th>Partner</th><th>Should</th><th>Paid</th><th>Due</th><th>Got fish</th><th>Got cash</th></tr>' +
    DATA.partners.map((p, i) => `<tr><td><span class="dot" style="background:var(--s${i + 1})"></span>${p.name}</td>
      <td>${f(p.should)}</td><td>${f(p.paid)}</td>
      <td class="${p.due > 0 ? 'neg' : p.due < 0 ? 'pos' : ''}">${f(p.due)}</td>
      <td>${f(p.fish)}</td><td>${f(p.money || 0)}</td></tr>`).join('') +
    `<tr><td><b>Total</b></td><td><b>${f(sum(DATA.partners, 'should'))}</b></td>
      <td><b>${f(sum(DATA.partners, 'paid'))}</b></td><td><b>${f(sum(DATA.partners, 'due'))}</b></td>
      <td><b>${f(sum(DATA.partners, 'fish'))}</b></td><td><b>${f(DATA.partners.reduce((a,x)=>a+(x.money||0),0))}</b></td></tr></table>`;

  /* monthly plan */
  $('#planCap').textContent = `Running ${f(s.runPerMonth)} plus the lease share ${f(s.leasePerMonth)}. To break even the pond must produce about ${s.breakEvenKg} kg a month at ${s.rate} taka.`;
  $('#plan').innerHTML = '<table><tr><th>Partner</th><th>Share</th><th>Per month</th><th>Next 12 months</th></tr>' +
    DATA.partners.map((p, i) => `<tr><td><span class="dot" style="background:var(--s${i + 1})"></span>${p.name}</td>
      <td>${Math.round(p.share * 100)}%</td><td>${f(s.trueMonth * p.share)}</td><td>${f(s.trueMonth * 12 * p.share)}</td></tr>`).join('') +
    `<tr><td><b>Pond total</b></td><td></td><td><b>${f(s.trueMonth)}</b></td><td><b>${f(s.trueMonth * 12)}</b></td></tr></table>`;

  /* history counts */
  const pays = DATA.partners.reduce((a, p) => a + (p.payments ? p.payments.length : 0), 0);
  $('#hcExp').textContent  = DATA.expenses.length + ' entries';
  $('#hcInv').textContent  = DATA.investments.length + ' entries';
  $('#hcPay').textContent  = pays + ' entries';
  $('#hcSale').textContent = DATA.sales.length + ' entries';

  /* payee suggestions + partner select */
  const payees = [...new Set(DATA.expenses.map(e => e.payee).filter(Boolean))].sort();
  $('#payees').innerHTML = payees.map(p => `<option>${esc(p)}</option>`).join('');
  const sel = $('#paySel');
  if (sel.options.length === 0)
    sel.innerHTML = DATA.partners.filter(p => !p.manager).map(p => `<option>${p.name}</option>`).join('');
  updatePayState();
}
const sum = (a, k) => a.reduce((x, y) => x + y[k], 0);
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ---------- charts ---------- */
function drawDonut(cats, total) {
  const box = $('#donut'); box.innerHTML = '';
  if (!cats.length) { box.innerHTML = '<p class="cap">No cost recorded yet.</p>'; return; }
  const top = cats.slice(0, 4);
  const rest = cats.slice(4).reduce((a, b) => a + b.value, 0);
  if (rest > 0) top.push({ label: 'Other', value: rest });
  const cols = ['--o1', '--o2', '--o3', '--o4', '--o5'];
  const W = 340, H = 62 + top.length * 30, cx = 78, cy = 78, R = 66, r = 40;
  const svg = el('svg', { viewBox: `0 0 ${W} ${Math.max(H, 168)}`, class: 'chart', role: 'img', 'aria-label': 'Cost breakdown' });
  let ang = -Math.PI / 2;
  top.forEach((d, i) => {
    const sw = d.value / total * Math.PI * 2, e2 = ang + sw, big = sw > Math.PI ? 1 : 0;
    svg.appendChild(el('path', {
      d: `M ${cx + R * Math.cos(ang)} ${cy + R * Math.sin(ang)} A ${R} ${R} 0 ${big} 1 ${cx + R * Math.cos(e2)} ${cy + R * Math.sin(e2)} L ${cx + r * Math.cos(e2)} ${cy + r * Math.sin(e2)} A ${r} ${r} 0 ${big} 0 ${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)} Z`,
      fill: `var(${cols[i]})`, stroke: 'var(--surface)', 'stroke-width': 2
    }));
    ang = e2;
  });
  const t1 = el('text', { x: cx, y: cy - 1, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': '15' }); t1.textContent = f(total);
  const t2 = el('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'ax' }); t2.textContent = 'total cost';
  svg.append(t1, t2);
  let y = 26;
  top.forEach((d, i) => {
    svg.appendChild(el('rect', { x: 170, y: y - 8, width: 10, height: 10, rx: 3, fill: `var(${cols[i]})` }));
    const a = el('text', { x: 186, y: y, fill: 'var(--ink)', 'font-size': '12' }); a.textContent = d.label;
    const b = el('text', { x: 186, y: y + 14, class: 'ax' }); b.textContent = `${f(d.value)} · ${(d.value / total * 100).toFixed(1)}%`;
    svg.append(a, b); y += 30;
  });
  box.appendChild(svg);
}

function drawBars(months, avg, lease) {
  const box = $('#bars'); box.innerHTML = '';
  const m = months.map(d => ({ m: d.m, v: d.v })).filter(d => d.v >= 0);
  if (!m.length) { box.innerHTML = '<p class="cap">No cost recorded yet.</p>'; return; }
  // strip the lease from whichever month carries it
  let stripped = false;
  m.forEach(d => { if (!stripped && lease && d.v >= lease) { d.v -= lease; d.lease = true; stripped = true; } });
  const W = 340, H = 150, P = { t: 10, r: 6, b: 24, l: 34 }, n = m.length;
  const max = Math.max(...m.map(d => d.v), avg) * 1.15 || 1;
  const y = v => H - P.b - v / max * (H - P.t - P.b);
  const step = (W - P.l - P.r) / n, bw = Math.max(3, step - 3);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Monthly running cost' });
  for (let i = 0; i <= 2; i++) {
    const v = max * i / 2;
    svg.appendChild(el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: 'var(--grid)', 'stroke-width': 1 }));
    const t = el('text', { x: P.l - 5, y: y(v) + 3, 'text-anchor': 'end', class: 'ax' });
    t.textContent = Math.round(v / 1000) + 'k'; svg.appendChild(t);
  }
  svg.appendChild(el('line', { x1: P.l, x2: W - P.r, y1: y(avg), y2: y(avg), stroke: 'var(--s2)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
  m.forEach((d, i) => {
    const bx = P.l + i * step + 1.5;
    svg.appendChild(el('rect', { x: bx, y: y(d.v), width: bw, height: Math.max(1.5, H - P.b - y(d.v)), rx: 3, fill: 'var(--s1)' }));
    if (n <= 8 || i % Math.ceil(n / 7) === 0) {
      const t = el('text', { x: bx + bw / 2, y: H - P.b + 13, 'text-anchor': 'middle', class: 'ax' });
      t.textContent = d.m.slice(2).replace('-', '/'); svg.appendChild(t);
    }
  });
  const at = el('text', { x: W - P.r, y: y(avg) - 4, 'text-anchor': 'end', 'font-size': '9.5', fill: 'var(--s2)' });
  at.textContent = 'avg ' + f(avg); svg.appendChild(at);
  box.appendChild(svg);
}

/* ================= FORMS ================= */
$$('input[type=date]').forEach(i => i.value = today());

function live(form, fn) { form.addEventListener('input', fn); fn(); }

/* round preview */
live($('#f-round'), () => {
  const a = +$('#f-round').amount.value || 0;
  $('#roundSplit').innerHTML = a
    ? Object.entries(SHARES).map(([n, s]) => `${n} <b>${f(a * s)}</b>`).join(' &nbsp;·&nbsp; ') + `<br>Total <b>${f(a)}</b>`
    : 'Enter an amount to see the 40 / 40 / 20 split.';
});

/* sale preview */
const saleForm = $('#f-sale');
const TYPE_NOTE = {
  'Sold/Reinvested': 'Cash stays with Rafique and is spent on the pond.',
  'Income': 'Cash is shared out 40 / 40 / 20. It does not stay in the pond.',
  'Eaten': 'No cash. Counted as income and split 40 / 40 / 20 in kind.'
};
live(saleForm, () => {
  const kg = +saleForm.kg.value || 0, rate = +saleForm.rate.value || 0, d = +saleForm.discount.value || 0;
  const t = saleForm.type.value, net = kg * rate - d;
  $('#saleCalc').innerHTML = kg && rate
    ? `Total <b>${f(kg * rate)}</b> &nbsp;·&nbsp; less discount <b>${f(d)}</b> &nbsp;·&nbsp; value <b>${f(net)}</b>` +
      (t !== 'Sold/Reinvested' ? `<br>Rafique <b>${f(net * .4)}</b> &nbsp;·&nbsp; Anwar <b>${f(net * .4)}</b> &nbsp;·&nbsp; Shahidullah <b>${f(net * .2)}</b>` : '') +
      `<br><span class="opt">${TYPE_NOTE[t] || ''}</span>`
    : 'Enter kg and rate to see the total.';
});

/* ---------- history ---------- */
const HIST = {
  expenses:    { title: 'All expenses',    sign: -1 },
  investments: { title: 'All investments', sign: 0 },
  payments:    { title: 'All payments',    sign: 1 },
  sales:       { title: 'All fish out',    sign: 1 }
};
function openHist(kind) {
  if (!DATA) return;
  let rows = [], total = 0;
  if (kind === 'expenses') {
    rows = DATA.expenses.map(e => ({ d: e.date, t: e.purpose || e.payee || 'Expense',
      s: e.payee + (e.remarks ? ' · ' + e.remarks : ''), a: e.amount, sub: '' }));
    total = DATA.summary.cost;
  } else if (kind === 'investments') {
    rows = DATA.investments.map(e => ({ d: e.date, t: e.who, s: e.purpose, a: e.amount, sub: '' }));
    total = DATA.summary.projected;
  } else if (kind === 'payments') {
    DATA.partners.forEach(p => (p.payments || []).forEach(x =>
      rows.push({ d: x.date, t: p.name, s: x.amount < 0 ? 'Refunded to him' : 'Paid to Rafique', a: x.amount, sub: '' })));
    total = rows.reduce((a, b) => a + b.a, 0);
  } else {
    rows = DATA.sales.map(x => ({ d: x.date, t: x.buyer || 'Fish out',
      s: x.type + ' · ' + x.kg + ' kg at ' + f(x.rate) + (x.discount ? ' · discount ' + f(x.discount) : ''),
      a: x.received, sub: '' }));
    total = DATA.summary.revenue;
  }
  rows.sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  $('#histTitle').textContent = HIST[kind].title;
  $('#histTotal').textContent = f(total);
  let html = '', lastM = '';
  rows.forEach(r => {
    const mk = (r.d || '').slice(0, 7);
    if (mk !== lastM) { lastM = mk; html += `<div class="hgroup">${monthName(mk)}</div>`; }
    html += `<div class="hrow"><div class="l"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></div>
      <div class="r">${r.a < 0 ? '−' : ''}${f(Math.abs(r.a))}<span>${r.d || ''}</span></div></div>`;
  });
  $('#histBody').innerHTML = html || '<p class="cap">Nothing recorded yet.</p>';
  $('#histView').classList.remove('hidden');
  $('#histBody').scrollTop = 0;
}
function monthName(mk) {
  if (!mk || mk.length < 7) return 'Undated';
  const [y, m] = mk.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + y;
}
$$('button.hist').forEach(b => b.onclick = () => openHist(b.dataset.h));
$('#histBack').onclick = () => $('#histView').classList.add('hidden');

/* payment state */
function updatePayState() {
  const box = $('#payState'); if (!DATA) { box.textContent = ''; return; }
  const name = $('#paySel').value;
  const p = DATA.partners.find(x => x.name === name);
  box.innerHTML = p ? `${p.name} should invest <b>${f(p.should)}</b>, has paid <b>${f(p.paid)}</b>, still due <b>${f(p.due)}</b>` : '';
}
$('#paySel').addEventListener('change', updatePayState);

/* submit handling */
function wire(sel, build, okMsg) {
  $(sel).addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!signedIn()) { openGate(true); return; }
    const btn = ev.target.querySelector('button[type=submit]');
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
    const r = await post(Object.assign({ pin: PIN }, build(ev.target)));
    btn.disabled = false; btn.textContent = old;
    if (r.ok) {
      DATA = r.data; localStorage.setItem('ponddata', JSON.stringify(DATA)); render();
      ev.target.reset(); $$('input[type=date]').forEach(i => i.value = today());
      ev.target.dispatchEvent(new Event('input'));
      toast(r.result || okMsg); show('dash');
      setTimeout(() => load(true), 1200);   // confirm against the sheet itself
    } else {
      toast(r.error || 'Could not save', true);
      if (/passcode/i.test(r.error || '')) { PIN = ''; MODE = 'view'; localStorage.removeItem('pondpin'); localStorage.setItem('pondmode','view'); applyMode(); openGate(true); }
    }
  });
}
wire('#f-round', fm => ({ action: 'round', date: fm.date.value, purpose: fm.purpose.value, amount: +fm.amount.value }), 'Round announced');
wire('#f-expense', fm => ({ action: 'expense', date: fm.date.value, payee: fm.payee.value, purpose: fm.purpose.value, amount: +fm.amount.value, remarks: fm.remarks.value }), 'Expense saved');
wire('#f-sale', fm => ({ action: 'sale', date: fm.date.value, buyer: fm.buyer.value, kg: +fm.kg.value, rate: +fm.rate.value, discount: +fm.discount.value || 0, type: fm.type.value, remarks: fm.remarks.value }), 'Sale saved');
wire('#f-pay', fm => ({ action: 'payment', partner: fm.partner.value, date: fm.date.value, amount: +fm.amount.value, refund: fm.refund.checked }), 'Payment saved');

/* ---------- splash ---------- */
setTimeout(() => { const s = $('#splash'); if (s) s.classList.add('gone'); }, 2200);

/* ---------- live updates ----------
   Anything Rafique saves must reach every other phone without anyone tapping refresh.
   Three triggers: a 20 second poll while the app is on screen, the moment the app is
   brought back to the foreground, and the moment the phone regains a connection. */
const POLL_MS = 20000;
let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => { if (!document.hidden) { load(true); checkBuild(); } }, POLL_MS);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopPolling(); }
  else { load(true); startPolling(); }
});
window.addEventListener('focus',  () => load(true));
window.addEventListener('online', () => { $('#stamp').textContent = 'back online, refreshing…'; load(true); });
window.addEventListener('offline', () => { $('#stamp').textContent = 'offline · showing last saved copy'; });

/* Pull down at the top of the dashboard to force a refresh. */
let pullY = 0;
addEventListener('touchstart', e => { pullY = scrollY === 0 ? e.touches[0].clientY : 0; }, { passive: true });
addEventListener('touchend', e => {
  if (pullY && e.changedTouches[0].clientY - pullY > 90) { toast('Refreshing…'); load(true); }
  pullY = 0;
}, { passive: true });

/* ---------- new app version ----------
   version.json carries a build stamp. Bump it on every publish and every open app
   picks the new code up within 20 seconds, without anyone reinstalling anything. */
let BUILD = null;
async function checkBuild() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = (await r.json()).build;
    if (!BUILD) { BUILD = v; return; }
    if (v !== BUILD && !reloading) {
      reloading = true;
      toast('New version, updating…');
      if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
      setTimeout(() => location.reload(), 800);
    }
  } catch (e) { /* offline, try again next poll */ }
}

/* The service worker is a second safety net for the same job. */
function watchForUpdate(reg) {
  if (!reg) return;
  setInterval(() => reg.update().catch(() => {}), 60000);
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) toast('Updating the app…');
    });
  });
}
let reloading = false;
const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;   // first install claims the page, that is not an update
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(watchForUpdate).catch(() => {});
}

/* ---------- boot ---------- */
applyMode();
if (!MODE) openGate(false); else closeGate();
load();
checkBuild();
startPolling();
