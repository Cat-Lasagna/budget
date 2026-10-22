// Regression tests for specific bugs that were found and fixed.
const load = require('./harness');
load(__dirname + '/../index.html');
toast = () => {}; setModal = () => {}; closeModal = () => {}; renderLedger = () => {};
confirmDialog = (t, m, yes) => yes();
let pass = 0, fail = 0;
function check(name, cond, got) { cond ? pass++ : (fail++, console.log('FAIL:', name, got === undefined ? '' : '→ got ' + JSON.stringify(got))); }
const near = (a, b) => Math.abs(a - b) < 0.005;
const spendTotal = () => Object.values(aggregate('2026-05', '2026-05', ['a1']).spending).reduce((a, p) => a + p.total, 0);
const settled = n => (peopleSummary().find(p => p.name === n) || {}).settled;

// --- Splitting a purchase that others paid back must not subtract repayments twice
state.accounts = [{ id: 'a1', name: 'Visa', currency: 'CAD' }];
const rest = catIdByName('Restaurant'), gro = catIdByName('Groceries'), gas = catIdByName('Gas');
state.transactions = [{ id: 't1', accountId: 'a1', date: '2026-05-10', description: 'DINNER', spent: 200, credit: 0,
  categoryId: rest, adjusted: null, repayments: [{ person: 'Andrew', amount: 40 }, { person: 'Sarah', amount: 50 }], flags: {} }];
check('split: total before is 110', near(spendTotal(), 110), spendTotal());
splitTxnId = 't1'; splitParts = [{ amount: 100, categoryId: rest }, { amount: 100, categoryId: gro }];
applySplit();
check('split: total after is still 110', near(spendTotal(), 110), spendTotal());
check('split: Andrew still 40 back', near(settled('Andrew'), 40), settled('Andrew'));
check('split: Sarah still 50 back', near(settled('Sarah'), 50), settled('Sarah'));
check('split: repayments divided per part', state.transactions.every(t => near(repaidTotal(t), 45)),
  state.transactions.map(repaidTotal));
mergeSplit(state.transactions[0].id);
check('merge: one row again', state.transactions.length === 1, state.transactions.length);
check('merge: total still 110', near(spendTotal(), 110), spendTotal());
check('merge: repayments restored', near(settled('Andrew'), 40) && near(settled('Sarah'), 50),
  state.transactions[0].repayments);

// uneven 3-way split with awkward cents: per-person totals stay exact
state.transactions = [{ id: 't2', accountId: 'a1', date: '2026-05-10', description: 'TRIP', spent: 100, credit: 0,
  categoryId: rest, adjusted: null, repayments: [{ person: 'Andrew', amount: 10 }], flags: {} }];
splitTxnId = 't2'; splitParts = [{ amount: 33.33, categoryId: rest }, { amount: 33.33, categoryId: gro }, { amount: 33.34, categoryId: gas }];
applySplit();
check('3-way split: Andrew exactly 10', near(settled('Andrew'), 10), settled('Andrew'));
check('3-way split: total is 90', near(spendTotal(), 90), spendTotal());

// split with no repayments leaves no repayments field
state.transactions = [{ id: 't3', accountId: 'a1', date: '2026-05-10', description: 'X', spent: 50, credit: 0, categoryId: rest, adjusted: null, flags: {} }];
splitTxnId = 't3'; splitParts = [{ amount: 20, categoryId: rest }, { amount: 30, categoryId: gro }];
applySplit();
check('split without repayments: none added', state.transactions.every(t => !t.repayments));

// --- PDF: identical purchases on the same day are both kept
const hdr = 'For the period: May 1, 2026 to May 31, 2026';
const coffee = 'May 10   May 11   TIM HORTONS #123 MARKHAM ON      2.50';
let r = parseStatementPdf([hdr, coffee, coffee, 'Total purchases   $5.00']);
check('pdf: two identical coffees both kept', r.rows.length === 2, r.rows.length);
check('pdf: totals reconcile', r.checks.every(c => c.ok), r.checks);
check('pdf: nothing reported dropped', r.droppedRepeats === 0, r.droppedRepeats);

// a statement that really prints a line twice: repeat dropped only because totals say so
r = parseStatementPdf([hdr, coffee, coffee, 'Total purchases   $2.50']);
check('pdf: printed-twice line dropped', r.rows.length === 1, r.rows.length);
check('pdf: reports the dropped line', r.droppedRepeats === 1, r.droppedRepeats);
check('pdf: totals reconcile after drop', r.checks.every(c => c.ok), r.checks);

// no totals printed: keep everything
r = parseStatementPdf([hdr, coffee, coffee]);
check('pdf: no totals line, both kept', r.rows.length === 2, r.rows.length);

// genuine mismatch is still shown, not hidden
r = parseStatementPdf([hdr, coffee, coffee, 'Total purchases   $9.99']);
check('pdf: real mismatch still flagged', r.rows.length === 2 && !r.checks[0].ok, r.checks);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
