// Tests for the redesign's new pure functions (Home, Transactions, Insights).
const load = require('./harness');
load(__dirname + '/../index.html');
toast = () => {};
let pass = 0, fail = 0;
function check(name, cond, got) { cond ? pass++ : (fail++, console.log('FAIL:', name, got === undefined ? '' : '→ got ' + JSON.stringify(got))); }
const near = (a, b) => Math.abs(a - b) < 0.005;

// month labels
check('monthLabel long', monthLabel('2026-10') === 'October 2026', monthLabel('2026-10'));
check('monthLabel short', monthLabel('2026-10', { short: true }) === 'Oct');
check('prevMonth across a year', prevMonth('2026-01') === '2025-12');
check('monthEnd February', monthEnd('2026-02') === '2026-02-28' && monthEnd('2028-02') === '2028-02-29', [monthEnd('2026-02'), monthEnd('2028-02')]);

// merchant names
const pm = d => prettyMerchant(d);
check('name: store number and city dropped', pm('TIM HORTONS #1869 MARKHAM ON') === 'Tim Hortons', pm('TIM HORTONS #1869 MARKHAM ON'));
check('name: long reference dropped', pm('AMERICAN 00016630584352 TORONTO ON') === 'American', pm('AMERICAN 00016630584352 TORONTO ON'));
check('name: hyphen capitalised', pm('PETRO-CANADA AJAX ON') === 'Petro-Canada Ajax', pm('PETRO-CANADA AJAX ON'));
check('name: trailing code dropped', pm('SPOTIFY P2B3C4') === 'Spotify', pm('SPOTIFY P2B3C4'));
check('name: mixed case left alone', pm('Netflix.com') === 'Netflix.com', pm('Netflix.com'));
check('name: short text kept', pm('ESSO') === 'Esso', pm('ESSO'));
check('e-transfer shows the person', txDisplayName({ description: 'INTERNET BANKING E-TRANSFER 105964167501 Jamie Lee' }) === 'Jamie Lee');

// merchant grouping
const g = groupByMerchant([{ name: 'Petro-Canada Ajax' }, { name: 'Petro-Canada Markham' }, { name: 'The Alley' }, { name: 'The Keg' }]);
check('group: same chain in two towns merges', g.some(x => x.name === 'Petro-Canada' && x.rows.length === 2), g.map(x => x.name));
check('group: filler word does not merge', g.some(x => x.name === 'The Alley') && g.some(x => x.name === 'The Keg'), g.map(x => x.name));

// day labels never shift a date (no timezone parsing)
const today = todayStr();
check('dayLabel today', dayLabel(today) === 'Today');
check('dayLabel weekday', dayLabel('2026-10-12') === 'Mon, Oct 12' || today.slice(0, 4) !== '2026', dayLabel('2026-10-12'));

// spendingOf mirrors aggregate() exactly
state.accounts = [{ id: 'a', name: 'Visa', currency: 'CAD' }, { id: 'u', name: 'US', currency: 'USD' }];
const cat = n => catIdByName(n);
const T = (o) => Object.assign({ id: Math.random() + '', accountId: 'a', date: '2026-10-05', description: 'X', spent: 0, credit: 0, categoryId: null, adjusted: null, flags: {} }, o);
state.transactions = [
  T({ spent: 50, categoryId: cat('Restaurant') }),
  T({ spent: 200, categoryId: cat('Restaurant'), repayments: [{ person: 'A', amount: 90 }] }),
  T({ credit: 30, categoryId: cat('Clothing & Accessories') }),
  T({ spent: 70, categoryId: cat('Groceries'), flags: { workExpense: true } }),
  T({ credit: 900, categoryId: cat('Card Payments'), flags: { isInterAccountTransfer: true } }),
  T({ credit: 2000, categoryId: cat('Salary') }),
  T({ spent: 25 }),                                       // uncategorized
  T({ spent: 999, accountId: 'u', categoryId: cat('Restaurant') }),   // USD: excluded from CAD views
];
const agg = aggregate('2026-10', '2026-10', viewAccounts(''));
const tot = monthTotals(agg)['2026-10'];
const viaSpendingOf = state.transactions.filter(t => t.accountId === 'a').reduce((a, t) => a + spendingOf(t), 0);
check('spendingOf total equals aggregate spending', near(viaSpendingOf, tot.spending), { viaSpendingOf, agg: tot.spending });
check('monthTotals: spending 50+110-30+25', near(tot.spending, 155), tot);
check('monthTotals: income 2000', near(tot.income, 2000), tot);
check('monthTotals: net', near(tot.net, 1845), tot);

// recurring charges + price rise
const mk = (d, amt, desc) => T({ date: d, spent: amt, description: desc, categoryId: cat('Subscriptions') });
state.transactions = [];
['05', '06', '07', '08'].forEach(m => state.transactions.push(mk(`2026-${m}-03`, 20.99, 'NETFLIX.COM')));
['09', '10'].forEach(m => state.transactions.push(mk(`2026-${m}-03`, 22.99, 'NETFLIX.COM')));
['05', '06', '07', '08', '09', '10'].forEach(m => state.transactions.push(mk(`2026-${m}-07`, 85, 'ROGERS WIRELESS')));
// coffee: frequent and varying, not a subscription
for (let i = 0; i < 24; i++) state.transactions.push(mk(`2026-${String(5 + (i % 6)).padStart(2, '0')}-1${i % 9}`, 3 + (i % 7), 'TIM HORTONS #1'));
const rec = recurringCharges(['a'], '2026-10');
const nf = rec.find(r => r.name === 'Netflix.com');
check('recurring: Netflix found', !!nf, rec.map(r => r.name));
check('recurring: price rise flagged 2.00 from 20.99', nf && near(nf.priceUp, 2) && near(nf.oldPrice, 20.99) && nf.since === '2026-09-03', nf);
check('recurring: current price used', nf && near(nf.typical, 22.99), nf);
check('recurring: Rogers steady, no alert', rec.some(r => r.name === 'Rogers Wireless' && r.priceUp === 0));
check('recurring: coffee is not a subscription', !rec.some(r => /tim/i.test(r.name)), rec.map(r => r.name));

// top merchants groups chains
state.transactions = [T({ spent: 50, description: 'PETRO-CANADA AJAX ON', categoryId: cat('Gas') }), T({ spent: 40, description: 'PETRO-CANADA MARKHAM ON', categoryId: cat('Gas') })];
const tm = topMerchants('2026-10', '2026-10', ['a']);
check('top merchants: chain grouped', tm.length === 1 && tm[0].name === 'Petro-Canada' && near(tm[0].total, 90), tm);

// biggest changes
state.transactions = [T({ date: '2026-09-02', spent: 100, categoryId: cat('Gas') }), T({ date: '2026-10-02', spent: 160, categoryId: cat('Gas') }),
  T({ date: '2026-09-02', spent: 80, categoryId: cat('Restaurant') }), T({ date: '2026-10-02', spent: 50, categoryId: cat('Restaurant') })];
const ch = insightChanges(aggregate('2026-09', '2026-10', ['a']));
check('changes: largest first', ch[0].parent === 'Transportation' && near(ch[0].diff, 60) && near(ch[1].diff, -30), ch);

// review card: the "N similar" list matches the count on the button
state.transactions = [
  T({ id: 'cur', description: 'TIM HORTONS #1869 MARKHAM ON', spent: 5, flags: { needsReview: true } }),
  T({ description: 'TIM HORTONS #22 TORONTO ON', spent: 4, categoryId: cat('Restaurant') }),
  T({ description: 'TIM HORTONS #9 AJAX ON', spent: 3, categoryId: cat('Restaurant') }),
  T({ description: 'TIM HORTONS #5 MARKHAM ON', spent: 6, flags: { needsReview: true } }),
  T({ description: 'LOBLAWS #1', spent: 50, categoryId: cat('Groceries') }),
];
const cur = state.transactions[0];
const kw = rankKeywords(cur.description)[0];
const shown = keywordStats(kw).total - 1;
const list = similarTransactions(cur, kw);
check('similar: keyword is the merchant', /tim hortons/i.test(kw), kw);
check('similar: list length equals the count shown', list.length === shown && shown === 3, { shown, list: list.length });
check('similar: excludes the transaction itself', !list.some(x => x.id === 'cur'));
check('similar: newest first', list.every((x, i) => i === 0 || list[i - 1].date >= x.date));
check('read-only rows do not open the editor', !txRowHTML(list[0], { compact: true, readOnly: true }).includes('onclick="txRowClick'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
