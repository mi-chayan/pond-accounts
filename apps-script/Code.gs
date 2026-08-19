/**
 * Natun Bari Pond - API for the web app
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app
 *   Execute as: Me          Who has access: Anyone
 * Then set the passcode once: run setPasscode() after editing the value below.
 */

var SHEET_LEDGER = 'Pond with Shahidullah ';   // NOTE the trailing space
var SHEET_SALES  = 'Fish sell';

var PARTNERS = [
  { name: 'Rafique',     share: 0.40, tab: null       },  // manager, funds his own share
  { name: 'Anwar',       share: 0.40, tab: 'Anwar'       },
  { name: 'Shahidullah', share: 0.20, tab: 'Shahidullah' }
];

var LEASE_TOTAL  = 159900;   // 5 year lease
var LEASE_MONTHS = 60;
var STOCK_ESTIMATE = 200000; // fish still in the pond, taka
var DEFAULT_RATE = 200;      // taka per kg, for break-even

/* ============ one-time setup ============ */
function setPasscode() {
  PropertiesService.getScriptProperties().setProperty('PIN', 'CHANGE-ME-NOW');
  Logger.log('Passcode set. Now change it to something only Rafique knows.');
}
function checkPin(pin) {
  var real = PropertiesService.getScriptProperties().getProperty('PIN');
  return !!real && String(pin || '') === real;
}

/* ============ endpoints ============ */
function doGet(e) {
  try { return json({ ok: true, data: readAll() }); }
  catch (err) { return json({ ok: false, error: String(err) }); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'Bad request' }); }

  if (!checkPin(body.pin)) return json({ ok: false, error: 'Wrong passcode' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json({ ok:false, error:'Sheet is busy, try again' }); }

  try {
    var r;
    switch (body.action) {
      case 'round':   r = addRound(body);   break;
      case 'expense': r = addExpense(body); break;
      case 'sale':    r = addSale(body);    break;
      case 'payment': r = addPayment(body); break;
      case 'check':   r = 'ok';             break;
      default: return json({ ok: false, error: 'Unknown action' });
    }
    return json({ ok: true, result: r, data: readAll() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============ writes ============ */

// Announce a funding round. Splits by share, writes 3 investment rows,
// and adds each partner's share to the Share (Due) column on his own tab.
function addRound(b) {
  var total = num(b.amount);
  if (!(total > 0)) throw 'Amount must be more than zero';
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LEDGER);
  var row = nextFreeRow(sh, 4, 6);           // column D = Amount
  var date = b.date || todayStr();
  var purpose = b.purpose || 'Feed & other cost';

  PARTNERS.forEach(function (p, i) {
    var amt = Math.round(total * p.share);
    sh.getRange(row + i, 1).setValue(i === 0 ? date : '');
    sh.getRange(row + i, 2).setValue(p.name);
    sh.getRange(row + i, 3).setValue(purpose);
    sh.getRange(row + i, 4).setValue(amt);
    if (p.tab) {
      var t = SpreadsheetApp.getActive().getSheetByName(p.tab);
      if (t) t.getRange(nextFreeRow(t, 1, 3), 1).setValue(amt);   // Share (Due)
    }
  });
  return 'Round of ' + total + ' announced and split';
}

function addExpense(b) {
  var amt = num(b.amount);
  if (!(amt > 0)) throw 'Amount must be more than zero';
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LEDGER);
  var row = nextFreeRow(sh, 11, 6);          // column K = Amount
  sh.getRange(row, 8).setValue(b.date || todayStr());
  sh.getRange(row, 9).setValue(b.payee || '');
  sh.getRange(row, 10).setValue(b.purpose || '');
  sh.getRange(row, 11).setValue(amt);
  if (b.remarks) sh.getRange(row, 13).setValue(b.remarks);
  return 'Expense of ' + amt + ' recorded';
}

function addSale(b) {
  var kg = num(b.kg), rate = num(b.rate), disc = num(b.discount);
  if (!(kg > 0) || !(rate > 0)) throw 'kg and rate must be more than zero';
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SALES);
  var row = nextFreeRow(sh, 3, 3);           // column C = kg
  sh.getRange(row, 1).setValue(b.date || todayStr());
  sh.getRange(row, 2).setValue(b.buyer || '');
  sh.getRange(row, 3).setValue(kg);
  sh.getRange(row, 4).setValue(rate);
  sh.getRange(row, 5).setValue(kg * rate);
  sh.getRange(row, 6).setValue(disc);
  sh.getRange(row, 7).setValue(kg * rate - disc);
  sh.getRange(row, 8).setValue(b.type === 'Eaten' ? 'Eaten' : 'Sold');
  if (b.type === 'Eaten') sh.getRange(row, 9).setValue(b.takenBy || '');
  return 'Sale of ' + (kg * rate - disc) + ' recorded';
}

function addPayment(b) {
  var amt = num(b.amount);
  if (!amt) throw 'Amount cannot be zero';
  var p = PARTNERS.filter(function (x) { return x.name === b.partner; })[0];
  if (!p || !p.tab) throw 'Unknown partner, or that partner has no payment tab';
  var t = SpreadsheetApp.getActive().getSheetByName(p.tab);
  if (!t) throw 'Tab not found: ' + p.tab;
  var row = nextFreeRow(t, 3, 3);            // column C = Paid
  t.getRange(row, 2).setValue(b.date || todayStr());
  t.getRange(row, 3).setValue(b.refund ? -Math.abs(amt) : Math.abs(amt));
  return (b.refund ? 'Refund of ' : 'Payment of ') + Math.abs(amt) + ' recorded for ' + p.name;
}

/* ============ read + compute ============ */
function readAll() {
  var ss = SpreadsheetApp.getActive();
  var L  = ss.getSheetByName(SHEET_LEDGER);
  var F  = ss.getSheetByName(SHEET_SALES);

  var last = Math.max(L.getLastRow(), 6);
  var inv = [], exp = [];
  if (last >= 6) {
    var block = L.getRange(6, 1, last - 5, 13).getValues();
    block.forEach(function (r) {
      if (num(r[3]) > 0) inv.push({ date: ds(r[0]), who: str(r[1]), purpose: str(r[2]), amount: num(r[3]) });
      if (num(r[10]) > 0) exp.push({ date: ds(r[7]), payee: str(r[8]), purpose: str(r[9]), amount: num(r[10]), remarks: str(r[12]) });
    });
  }

  var sales = [];
  var fl = Math.max(F.getLastRow(), 3);
  if (fl >= 3) {
    F.getRange(3, 1, fl - 2, 9).getValues().forEach(function (r) {
      if (num(r[2]) > 0) sales.push({
        date: ds(r[0]), buyer: str(r[1]), kg: num(r[2]), rate: num(r[3]),
        total: num(r[4]), discount: num(r[5]), received: num(r[6]),
        type: str(r[7]).trim() || 'Sold', takenBy: str(r[8]).trim()
      });
    });
  }

  var totalProjected = inv.reduce(function (a, b) { return a + b.amount; }, 0);
  var totalCost      = exp.reduce(function (a, b) { return a + b.amount; }, 0);
  var cashSales = 0, eaten = 0, kgSold = 0, kgEaten = 0;
  sales.forEach(function (s) {
    if (s.type === 'Eaten') { eaten += s.received; kgEaten += s.kg; }
    else { cashSales += s.received; kgSold += s.kg; }
  });

  var partners = PARTNERS.map(function (p) {
    var should = inv.filter(function (r) { return sameName(r.who, p.name); })
                    .reduce(function (a, b) { return a + b.amount; }, 0);
    var paid = should, pays = [];
    if (p.tab) {
      var t = ss.getSheetByName(p.tab);
      paid = 0;
      if (t && t.getLastRow() >= 3) {
        t.getRange(3, 1, t.getLastRow() - 2, 3).getValues().forEach(function (r) {
          if (r[2] !== '' && !isNaN(num(r[2])) && num(r[2]) !== 0) {
            paid += num(r[2]);
            pays.push({ date: ds(r[1]), amount: num(r[2]) });
          }
        });
      }
    }
    var fish = sales.filter(function (s) { return s.type === 'Eaten' && sameName(s.takenBy, p.name); })
                    .reduce(function (a, b) { return a + b.received; }, 0);
    return { name: p.name, share: p.share, manager: !p.tab, should: should, paid: paid, due: should - paid, fish: fish, payments: pays };
  });

  var months = monthKeys(inv, exp, sales);
  var byMonth = months.map(function (m) {
    return {
      m: m,
      cost: sum(exp.filter(function (r) { return r.date.slice(0, 7) === m; })),
      inv:  sum(inv.filter(function (r) { return r.date.slice(0, 7) === m; })),
      rev:  sales.filter(function (s) { return s.type !== 'Eaten' && s.date.slice(0, 7) === m; })
                 .reduce(function (a, b) { return a + b.received; }, 0)
    };
  });

  var lease = exp.filter(function (r) { return /lease/i.test(r.purpose) || /lease/i.test(r.payee); })
                 .reduce(function (a, b) { return a + b.amount; }, 0);
  var running = totalCost - lease;
  var nMonths = Math.max(1, byMonth.filter(function (x) { return x.cost > 0; }).length);
  var runPerMonth   = Math.round(running / nMonths);
  var leasePerMonth = Math.round((lease || LEASE_TOTAL) / LEASE_MONTHS);
  var trueMonth     = runPerMonth + leasePerMonth;

  return {
    updated: new Date().toISOString(),
    investments: inv, expenses: exp, sales: sales, partners: partners, byMonth: byMonth,
    summary: {
      projected: totalProjected, cost: totalCost, cashSales: cashSales, eaten: eaten,
      revenue: cashSales + eaten, funds: totalProjected + cashSales,
      cash: totalProjected + cashSales - totalCost,
      profit: cashSales + eaten - totalCost,
      stock: STOCK_ESTIMATE, ifSold: cashSales + eaten - totalCost + STOCK_ESTIMATE,
      kgSold: kgSold, kgEaten: kgEaten,
      lease: lease, running: running, nMonths: nMonths,
      runPerMonth: runPerMonth, leasePerMonth: leasePerMonth, trueMonth: trueMonth,
      breakEvenKg: Math.round(trueMonth / DEFAULT_RATE * 10) / 10,
      rate: DEFAULT_RATE
    },
    categories: categorise(exp)
  };
}

function categorise(exp) {
  var rules = [
    ['Lease',       /lease/i],
    ['Feed',        /feed|khail|east powder|quality feed/i],
    ['Fingerlings', /fish|shing|carp|katol|ruei|mirka|tengra|baim|baush|telapiya|karpu/i],
    ['Medicine',    /medicine|salt|chun|potas|yucca|u.?mate|acua|carbolic|virus|plankton|bacteria|ukun/i],
    ['Fertiliser',  /uria|tsp|dap|mag/i],
    ['Labour',      /netting|cleaning|labour|jal/i],
    ['Equipment',   /bamboo|bas |drum|net$/i],
    ['Transport',   /fare|auto/i]
  ];
  var out = {};
  exp.forEach(function (e) {
    var text = (e.purpose || '') + ' ' + (e.payee || '');
    var cat = 'Other';
    for (var i = 0; i < rules.length; i++) { if (rules[i][1].test(text)) { cat = rules[i][0]; break; } }
    out[cat] = (out[cat] || 0) + e.amount;
  });
  return Object.keys(out).map(function (k) { return { label: k, value: out[k] }; })
    .sort(function (a, b) { return b.value - a.value; });
}

/* ============ helpers ============ */
function nextFreeRow(sh, col, startRow) {
  var last = Math.max(sh.getLastRow(), startRow);
  var vals = sh.getRange(startRow, col, last - startRow + 2, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === '' || vals[i][0] === null) return startRow + i;
  return last + 1;
}
function num(v) { if (v === '' || v === null || v === undefined) return 0; var n = Number(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function str(v) { return v === null || v === undefined ? '' : String(v); }
function sameName(a, b) { return String(a || '').trim().toLowerCase().indexOf(String(b).trim().toLowerCase()) === 0; }
function sum(a) { return a.reduce(function (x, y) { return x + y.amount; }, 0); }
function todayStr() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function ds(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v || '').trim(); if (!s) return '';
  var d = new Date(s); if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return s;
}
function monthKeys(inv, exp, sales) {
  var set = {};
  [].concat(inv, exp).forEach(function (r) { if (r.date) set[r.date.slice(0, 7)] = 1; });
  sales.forEach(function (r) { if (r.date) set[r.date.slice(0, 7)] = 1; });
  return Object.keys(set).sort();
}
