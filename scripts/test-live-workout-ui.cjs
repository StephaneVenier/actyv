const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('app/sessions/[id]/live/page.tsx', 'utf8');
const ast = ts.createSourceFile('live.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const headSource = require('node:child_process').execFileSync('git', ['show', 'HEAD:app/sessions/[id]/live/page.tsx'], { encoding: 'utf8' });
const headAst = ts.createSourceFile('head.tsx', headSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handlers(tree) {
  const result = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) result.set(node.name.getText(tree), node.initializer.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}
const before = handlers(headAst), after = handlers(ast);
for (const name of ['saveCompletedSession', 'handleFinishSession', 'handleValidateCurrent', 'handleUncheckSeries',
  'updateCurrentPerformanceLine', 'updateCurrentPerformanceLineAt', 'addCurrentPerformanceLine',
  'removeCurrentPerformanceLine', 'addExerciseToLive', 'removeExerciseFromLive', 'handleStartCurrentSeries',
  'clearExerciseState', 'beginRest', 'adjustRestSeconds']) {
  assert.equal(after.get(name)?.replace(/\r\n/g, '\n'), before.get(name)?.replace(/\r\n/g, '\n'), `${name}: M3 must not change the engine`);
}
console.log('PASS static: M1/M2/timers/finalization handlers identical to HEAD');

// Browser mode uses a local preview and intercepts every Supabase request.
// No real user session or production write is used.
if (!process.argv.includes('--visual')) process.exit(0);
const runtime = process.argv.find(arg => arg.startsWith('--runtime='))?.slice('--runtime='.length);
const requireRuntime = runtime ? createRequire(path.resolve(runtime, 'package.json')) : require;
const { chromium } = requireRuntime('playwright');
const base = process.env.LIVE_UI_BASE_URL || 'http://127.0.0.1:3017';
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8')
  .match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\r\n"']+)/m)?.[1];
assert.ok(publicUrl, 'public Supabase URL required to intercept requests');
const host = new URL(publicUrl).hostname;
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', aud: 'authenticated' };
const sessionId = '11111111-1111-4111-8111-111111111111';
const library = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'Developpe couche', slug: 'developpe-couche', tracking_type: 'reps', supports_load: true },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Gainage', slug: 'gainage', tracking_type: 'duration', supports_load: false },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Rowing assis', slug: 'rowing-assis', tracking_type: 'reps', supports_load: true },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Course tapis', slug: 'course-tapis', tracking_type: 'distance', supports_load: false },
  { id: '77777777-7777-4777-8777-777777777777', name: 'Mobilite', slug: 'mobilite', tracking_type: 'free', supports_load: false },
].map(item => ({ ...item, active: true, sport: 'musculation', category: 'Musculation',
  primary_muscles: ['pectoraux'], secondary_muscles: [], equipment: ['barre'], metadata: {} }));
const blocks = library.map((exercise, index) => ({ id: `block-${index}`, session_id: sessionId, position: index,
  name: exercise.name, exercise_id: exercise.id, block_type: exercise.tracking_type,
  sets_count: index === 0 ? 4 : index >= 3 ? 1 : 3, target_value: index === 1 ? 30 : index === 3 ? 500 : index === 4 ? null : 10,
  charge_kg: exercise.tracking_type === 'reps' ? 50 : null, rest_seconds: 75 }));
const funcs = vm.createContext({ Math, Date, normalizeSessionSetsCount: n => Math.max(Number(n) || 1, 1) });
for (const node of ast.statements) {
  if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
    vm.runInContext(ts.transpile(node.getText(ast)), funcs);
  }
}
function state(mode) {
  const drafts = Object.fromEntries(blocks.map(block => [block.id, funcs.createDefaultLivePerformanceDraft(block)]));
  const first = drafts['block-0'].lines[0];
  return { ownerUserId: user.id, blocks, currentIndex: mode === 'duration' ? 1 : mode === 'distance' ? 3 : mode === 'free' ? 4 : 0,
    performanceDraftsByBlockId: drafts, actualPerformanceDraftsByBlockId: {}, actualPerformanceCarryForwardByBlockId: {},
    completedBlockIds: [], skippedBlockIds: [], completedSetsByBlockId: { 'block-0': 1 },
    setPerformances: [{ block_id: 'block-0', exercise_id: library[0].id, block_name: blocks[0].name,
      live_line_id: first.id, block_type: 'reps', set_number: 1, line_number: 1,
      actual_reps: 10, actual_charge_kg: 50, actual_value: null, status: 'completed' }],
    finishReviewOpen: mode === 'summary', historySaved: false, runKey: '55555555-5555-4555-8555-555555555555',
    elapsedSeconds: 1938, isTimerPaused: mode === 'rest' || mode === 'summary', exerciseBlockId: null, exerciseSecondsLeft: 0,
    awaitingExerciseCompletion: false, startedSeriesKey: null,
    restAfterBlockId: mode === 'rest' ? 'block-0' : null, restResumeIndex: mode === 'rest' ? 0 : null,
    restTotalSeconds: 75, restSecondsLeft: mode === 'rest' ? 72 : 0 };
}
async function main() {
  fs.mkdirSync('tmp/live-m3', { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const results = [];
  try {
    for (const width of [360, 375, 390, 412, 430]) {
      for (const mode of ['reps', 'duration', 'distance', 'free', 'rest', 'picker', 'summary']) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(({ key, user, snapshotKey, snapshot }) => {
          const payload = btoa(JSON.stringify({ sub: user.id, exp: 4102444800, aud: 'authenticated' }));
          localStorage.setItem(key, JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.fixture',
            refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }));
          localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
        }, { key: `sb-${host.split('.')[0]}-auth-token`, user,
          snapshotKey: `actyv.account.${user.id}.session.live.${sessionId}`, snapshot: state(mode) });
        await context.route(`https://${host}/**`, async route => {
          const url = new URL(route.request().url());
          let data = [];
          if (url.pathname.endsWith('/user')) data = user;
          else if (url.pathname.endsWith('/training_sessions')) data = { id: sessionId, user_id: user.id,
            name: 'Haut du corps', sport: 'musculation', visibility: 'private' };
          else if (url.pathname.endsWith('/training_session_blocks')) data = blocks;
          else if (url.pathname.endsWith('/exercise_library')) data = library;
          else if (url.pathname.endsWith('/profiles')) data = { username: 'Actyv Test' };
          else if (url.pathname.endsWith('/rpc/ensure_own_profile')) data = { id: user.id, username: 'Actyv Test' };
          else if (url.pathname.endsWith('/rpc/get_own_account_deletion_status')) data = null;
          if (route.request().method() !== 'GET' && !['ensure_own_profile', 'get_own_account_deletion_status'].some(name => url.pathname.endsWith('/rpc/' + name))) {
            throw new Error('Unexpected write/RPC during UI preview: ' + url.pathname);
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data),
            headers: { 'access-control-allow-origin': '*' } });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/sessions/${sessionId}/live`);
        await page.locator(mode === 'summary' ? '.session-live-finished' : '.session-live-board__expanded').waitFor();
        if (mode === 'picker') {
          await page.getByRole('button', { name: '+ Exercice', exact: true }).click();
          await page.getByRole('button', { name: 'Choisir un exercice', exact: true }).click();
          await page.getByPlaceholder('Rechercher un exercice').fill('Rowing');
          await page.locator('.session-exercise-picker-item__select').filter({ hasText: 'Rowing assis' }).waitFor();
          const overlay = await page.locator('.session-exercise-picker-overlay').boundingBox();
          assert.ok(Math.abs(overlay.y) < 1 && Math.abs(overlay.height - 844) < 1, 'picker must cover viewport, not a transformed card');
        }
        if (mode === 'reps') {
          assert.equal(await page.getByRole('spinbutton', { name: 'Serie 1 : repetitions', exact: true }).isDisabled(), true);
          const reps = page.getByRole('spinbutton', { name: 'Serie 2 : repetitions', exact: true });
          await reps.fill('12');
          await page.getByRole('spinbutton', { name: 'Serie 2 : charge en kg', exact: true }).fill('60');
          await page.getByRole('button', { name: 'Valider la serie', exact: true }).click();
          await page.getByRole('button', { name: 'Decocher la serie 2 pour la modifier' }).waitFor();
          await page.getByRole('button', { name: 'Passer', exact: true }).click();
          await page.getByRole('button', { name: 'Decocher la serie 2 pour la modifier' }).click();
          await reps.fill('13');
          const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),
            `actyv.account.${user.id}.session.live.${sessionId}`);
          assert.equal(saved.performanceDraftsByBlockId['block-0'].lines[1].targetValue, 13);
          await page.locator('.session-live-secondary-menu summary').click();
          await page.getByRole('button', { name: "Retirer l'exercice", exact: true }).click();
          await page.locator('.session-live-board__expanded').getByText('Decoche les series realisees avant de retirer cet exercice.', { exact: true }).waitFor();
          await page.locator('.session-live-secondary-menu summary').click();
        }
        if (mode === 'duration') {
          await page.getByRole('spinbutton', { name: 'Serie 1 : secondes', exact: true }).fill('45');
          await page.getByRole('button', { name: 'Demarrer la serie', exact: true }).click();
          assert.equal(await page.getByRole('spinbutton', { name: 'Serie 1 : secondes', exact: true }).isDisabled(), true);
        }
        await page.waitForTimeout(150);
        if (mode !== 'picker') await page.evaluate(() => window.scrollTo(0, 0));
        const metrics = await page.evaluate(() => {
          const area = document.querySelector('.session-live-board__expanded');
          const overflow = [...document.querySelectorAll('.session-live-board *')].filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
          }).map(node => node.className);
          return { documentWidth: document.documentElement.scrollWidth, overflow,
            expandedHeight: area?.getBoundingClientRect().height,
            activeBottom: area?.getBoundingClientRect().bottom };
        });
        assert.ok(metrics.documentWidth <= width, `${width}/${mode}: global overflow`);
        assert.deepEqual(metrics.overflow, [], `${width}/${mode}: controls outside viewport`);
        assert.deepEqual(errors, [], `${width}/${mode}: browser errors`);
        await page.screenshot({ path: `tmp/live-m3/${mode}-${width}.png`, fullPage: mode !== 'picker' });
        if (mode === 'picker') {
          const item = page.locator('.session-exercise-picker-item__select').filter({ hasText: 'Rowing assis' });
          await item.click();
          await page.getByRole('button', { name: "Ajouter l'exercice", exact: true }).click();
          assert.equal(await page.locator('.session-live-workout-row').filter({ hasText: 'Rowing assis' }).count(), 2);
        }
        if (width === 390 && mode === 'reps') {
          await page.setViewportSize({ width, height: 540 });
          const input = page.getByRole('spinbutton', { name: 'Serie 2 : repetitions', exact: true });
          await input.focus();
          await input.evaluate(node => node.scrollIntoView({ block: 'center' }));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: 'tmp/live-m3/keyboard-height-390.png', fullPage: false });
        }
        results.push({ width, mode, ...metrics });
        console.log('PASS visual', JSON.stringify(results.at(-1)));
        await context.close();
      }
    }
    fs.writeFileSync('tmp/live-m3/report.json', JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
