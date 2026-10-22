// Sync tests: a fake Google sign-in and a fake, slow Google Drive, so that
// overlapping requests can be reproduced on purpose.
const realSetTimeout = setTimeout, realClearTimeout = clearTimeout;
const load = require('./harness');
load(__dirname + '/../index.html');
// the harness disables timers; these tests need real ones
global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout;
toast = () => {}; updateSyncCard = () => {}; buildNav = () => {}; switchView = () => {};
let pass = 0, fail = 0;
function check(name, cond, got) { cond ? pass++ : (fail++, console.log('FAIL:', name, got === undefined ? '' : '→ got ' + JSON.stringify(got))); }
const wait = ms => new Promise(r => realSetTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p.then(v => ({ v }), e => ({ e })), wait(ms).then(() => 'HUNG')]);

// fake Google sign-in: answers after 20 ms, or never
let tokenRequests = 0, tokenMode = 'answer';
function fakeTokenClient() {
  return { requestAccessToken() {
    tokenRequests++;
    if (tokenMode === 'answer') realSetTimeout(() => onToken({ access_token: 'tok' + tokenRequests, expires_in: 3600 }), 20);
  } };
}

// fake Drive: each request takes 30 ms; a save changes the file's modified time
let driveModified = 't0', driveBody = '{}', patches = [], staleAsked = 0;
global.fetch = async (url, opts) => {
  opts = opts || {};
  const json = obj => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
  if (opts.method === 'PATCH') {
    // Drive stores the file at once; the reply takes a while to come back
    driveBody = opts.body; patches.push(JSON.parse(opts.body));
    const mine = driveModified = 't' + (patches.length);
    await wait(60);
    return json({ modifiedTime: mine });
  }
  await wait(30);
  if (url.includes('fields=modifiedTime')) return json({ modifiedTime: driveModified });
  if (url.includes('alt=media')) return { ok: true, status: 200, text: async () => driveBody };
  if (url.includes('/files?q=')) return json({ files: [{ id: 'f1', modifiedTime: driveModified }] });
  throw new Error('unexpected ' + url);
};
confirmStale = () => { staleAsked++; return Promise.resolve(true); };

(async () => {
  // --- 1. two parts of the app asking for a sign-in at the same moment
  Sync.tokenClient = fakeTokenClient();
  const a = getToken(false), b = getToken(false);
  const ra = await withTimeout(a, 500), rb = await withTimeout(b, 500);
  check('token: first caller is answered (used to hang)', ra !== 'HUNG' && ra.v, ra);
  check('token: second caller is answered', rb !== 'HUNG' && rb.v, rb);
  check('token: only one request sent to Google', tokenRequests === 1, tokenRequests);

  // --- 2. Google never answers a silent sign-in: give up instead of waiting forever
  tokenMode = 'silent'; Sync.silentTokenTimeoutMs = 100;
  const r2 = await withTimeout(getToken(false), 1000);
  check('token: unanswered silent sign-in gives up', r2 !== 'HUNG' && r2.e && r2.e.timeout, r2);
  tokenMode = 'answer';

  // --- 3. overlapping saves must not raise a false "newer changes" warning
  Sync.enabled = true; Sync.signedIn = true; Sync.token = 'tok'; Sync.tokenExpiry = Date.now() + 3600e3;
  Sync.fileId = 'f1'; Sync.lastModified = driveModified;
  patches = []; staleAsked = 0;
  state.settings.marker = 1;
  const p1 = doDrivePush();
  await wait(40);                      // first save is mid-upload
  state.settings.marker = 2;
  const p2 = doDrivePush();
  state.settings.marker = 3;           // another edit before the second save starts
  const p3 = doDrivePush();
  await withTimeout(Promise.all([p1, p2, p3]), 2000);
  check('push: no false "newer changes" warning', staleAsked === 0, staleAsked);
  check('push: queued saves combined into one', patches.length === 2, patches.length);
  check('push: last save has the latest edit', patches.length && patches[patches.length - 1].settings.marker === 3,
    patches.map(p => p.settings.marker));
  check('push: ends synced, nothing pending', Sync.pendingPush === false && Sync.lastModified === driveModified,
    { pending: Sync.pendingPush, last: Sync.lastModified, drive: driveModified });

  // --- 4. a real change from another device is still caught
  driveModified = 'other-device';
  staleAsked = 0;
  await withTimeout(doDrivePush(), 2000);
  check('push: genuine change from another device still asks', staleAsked === 1, staleAsked);

  // --- 5. a load and a save at the same time run one after the other
  let active = 0, maxActive = 0;
  const realFetch = global.fetch;
  global.fetch = async (u, o) => { active++; maxActive = Math.max(maxActive, active); try { return await realFetch(u, o); } finally { active--; } };
  Sync.lastModified = driveModified;
  await withTimeout(Promise.all([loadFromDrive(), doDrivePush()]), 2000);
  check('lock: load and save never overlap', maxActive === 1, maxActive);
  global.fetch = realFetch;

  // --- 6. expired login: retry once, never loop
  let calls = 0;
  global.fetch = async () => { calls++; await wait(5); return { ok: false, status: 401 }; };
  const r6 = await withTimeout(doDrivePush(), 2000);
  check('auth: repeated 401 does not loop', r6 !== 'HUNG' && calls < 10, calls);
  check('auth: marked offline with a pending save', Sync.pendingPush === true);
  global.fetch = realFetch;

  // --- 7. the stale-data dialog can't be dismissed without a choice
  check('dialog: unlocked normally', modalLocked === false);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
