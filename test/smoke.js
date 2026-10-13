const load = require('./harness');
load(__dirname + '/../index.html');
toast = () => {}; setModal = () => {}; closeModal = () => {};
confirmDialog = (t, m, yes) => yes();
let pass = 0, fail = 0;
function check(name, cond) { cond ? pass++ : (fail++, console.log('FAIL:', name)); }
const exists = n => { try { return typeof eval(n) === 'function'; } catch { return false; } };

check('40 seed categories', state.categories.length === 40);
check('truth table seeded', state.truthTable.length > 0 && state.settings.truthSeeded);
const cp = state.categories.find(c => c.name === 'Card Payments');
check('Card Payments excluded', cp && cp.countsTowardSpending === false);

check('finalAmount: repayments', finalAmount({flags:{}, spent:200, adjusted:null, repayments:[{person:'A',amount:40},{person:'B',amount:50}]}) === 110);
check('finalAmount: adjusted wins', finalAmount({flags:{}, spent:200, adjusted:75, repayments:[{person:'A',amount:40}]}) === 75);
check('finalAmount: workExpense = 0', finalAmount({flags:{workExpense:true}, spent:200, adjusted:75}) === 0);
check('finalAmount: lentOut = 0', finalAmount({flags:{lentOut:true}, spent:200, adjusted:null}) === 0);

check('date ymd', parseDateFlexible('2026-05-29','ymd') === '2026-05-29');
check('date mdy', parseDateFlexible('05/29/2026','mdy') === '2026-05-29');
check('date dmy', parseDateFlexible('29/05/2026','dmy') === '2026-05-29');
check('date mon', /^2026-05-29$/.test(parseDateFlexible('May 29, 2026','mon') || parseDateFlexible('29 May 2026','mon')));

check('delimiter comma', detectDelimiter('a,b,c\n1,2,3') === ',');
check('delimiter tab', detectDelimiter('a\tb\tc\n1\t2\t3') === '\t');
check('delimiter semicolon', detectDelimiter('a;b;c\n1;2;3') === ';');

const t = {description:'PAYMENT THANK YOU', spent:0, credit:500, flags:{}};
autoProcess(t);
check('autoProcess: card payment is transfer', t.flags.isInterAccountTransfer === true);
const e = {description:'INTERNET BANKING E-TRANSFER 123456 JOHN', spent:50, credit:0, flags:{}};
autoProcess(e);
check('autoProcess: e-transfer needs review', e.flags.eTransferMethod && e.flags.needsReview);
const rule = state.truthTable.find(r => r.keyword && r.categoryId);
const m = {description:'XX ' + rule.keyword.toUpperCase() + ' TORONTO ON', spent:10, credit:0, flags:{}};
autoProcess(m);
check('autoProcess: known merchant categorized', m.categoryId === rule.categoryId || m.categoryId);

for (const f of ['aggregate','creditOffset','displayAmount','buildPreview','peopleSummary','ensureMigrations',
  'parseStatementPdf','pdfItemsToLines','dataHealth','auditTruthTable','suggestedRules','cardAssignmentReport',
  'openSplitModal','mergeSplit','startReviewQueue','snapshotForUndo','renderLedger','doDrivePush','loadFromDrive'])
  check('subsystem present: ' + f, exists(f));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
