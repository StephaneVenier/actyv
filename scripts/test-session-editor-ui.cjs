const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ts = require('typescript');
const pages = ['app/sessions/new/page.tsx', 'app/sessions/[id]/edit/page.tsx'];
for (const file of pages) {
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const head = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  assert.equal(source.slice(0, source.indexOf('  return (\n    <AppShell>')),
    head.slice(0, head.indexOf('  return (\n    <AppShell>')), `${file}: unchanged data and handlers`);
}
const editor = fs.readFileSync('components/session-blocks-editor.tsx', 'utf8');
const headEditor = execFileSync('git', ['show', 'HEAD:components/session-blocks-editor.tsx'], { encoding: 'utf8' });
function changes(source) {
  const tree = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ['onUpdateBlock', 'onRemoveBlock'].includes(node.expression.getText(tree))) {
      values.push(node.getText(tree).replace(/\s+/g, ''));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); return values;
}
for (const call of changes(headEditor)) assert.ok(changes(editor).includes(call), 'Existing update/delete payload unchanged');
assert.ok(editor.includes('compact = false'));
assert.ok(editor.includes('compact = false'), 'Shared editor keeps its default mode; callers may explicitly opt in');
function compile(source, resolve) {
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(resolve, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const blockHelpers = compile(fs.readFileSync('lib/session-blocks.ts', 'utf8'), require);
const draftHelpers = compile(fs.readFileSync('lib/session-draft-blocks.ts', 'utf8'), name => name.includes('session-blocks') ? blockHelpers : {});
const resolve = name => name.startsWith('react') ? require(name) : name.endsWith('/session-blocks') ? blockHelpers
  : name.endsWith('/session-draft-blocks') ? draftHelpers : name.endsWith('/session-exercise-picker') ? { SessionExercisePicker: () => null }
  : name.endsWith('/session-exercise-icon') ? { SessionExerciseIcon: () => null } : { getExercisesByIds: async () => ({ data: [] }) };
const React = require('react');
const render = require('react-dom/server').renderToStaticMarkup;
const props = { blocks: ['reps', 'duration', 'distance', 'free'].map((blockType, i) => ({ id: `test-${i}`, name: 'Exercice', exerciseId: null,
  blockType, sets_count: 3, targetValue: '10', chargeKg: '50', restSeconds: '45' })), onAddBlock() {}, onRemoveBlock() {}, onUpdateBlock() {} };
assert.equal(render(React.createElement(compile(editor, resolve).SessionBlocksEditor, props)),
  render(React.createElement(compile(headEditor, resolve).SessionBlocksEditor, props)), 'Program/default markup identical to HEAD');
console.log('PASS editor: creation/edit handlers, payloads and program opt-out unchanged');
if (!process.argv.includes('--visual')) process.exit(0);
const runtime = process.argv.find(a => a.startsWith('--runtime='))?.slice(10);
const { chromium } = (runtime ? createRequire(path.resolve(runtime, 'package.json')) : require)('playwright');
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8')
  .match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\r\n"']+)/m)[1]).hostname;
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', aud: 'authenticated' };
const id = '11111111-1111-4111-8111-111111111111';
const exerciseId = '22222222-2222-4222-8222-222222222222';
const library = [{ id: exerciseId, slug: 'papillon', name: 'Papillon', tracking_type: 'reps', active: true,
  image_path: `${exerciseId}/main.webp`, metadata: {}, primary_muscles: ['pectoraux'], secondary_muscles: [], equipment: ['machine'], category: 'Musculation' }];
const imageFixture = process.argv.find(a => a.startsWith('--image='))?.slice(8);
const base = process.env.SESSION_UI_BASE_URL || 'http://127.0.0.1:3018';
async function main() {
  fs.mkdirSync('tmp/session-editor', { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const report = [];
  try {
    for (const width of [360, 375, 390, 412, 430]) {
      for (const count of [1, 5, 10]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(({ host, user }) => {
          const payload = btoa(JSON.stringify({ sub: user.id, exp: 4102444800, aud: 'authenticated' }));
          localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.fixture',
            refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }));
        }, { host, user });
        let savedBlocks = Array.from({ length: count }, (_, i) => ({ id: `block-${i}`, session_id: id, position: i,
          name: i === 1 ? 'Developpe couche avec halteres sur banc incline' : i === 0 ? 'Papillon' : `Exercice ${i + 1}`,
          exercise_id: i === 0 && imageFixture ? exerciseId : null, block_type: ['reps', 'duration', 'distance', 'free'][i % 4],
          sets_count: 3, target_value: i % 4 === 3 ? null : i % 4 === 2 ? 500 : 12, charge_kg: i % 4 === 0 ? 50 : null, rest_seconds: 45 }));
        let savedSession = { id, user_id: user.id, name: 'Renforcement complet', sport: 'Fitness', description: 'Consigne test' };
        const writes = [];
        await context.route(`https://${host}/**`, async route => {
          const url = new URL(route.request().url()), method = route.request().method();
          let data = [];
          if (url.pathname.includes('/storage/') && imageFixture) return route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(imageFixture) });
          if (url.pathname.endsWith('/user')) data = user;
          else if (url.pathname.endsWith('/training_sessions')) {
            if (method !== 'GET') { savedSession = { ...savedSession, ...route.request().postDataJSON() }; writes.push({ table: 'session', method }); }
            data = savedSession;
          } else if (url.pathname.endsWith('/training_session_blocks')) {
            if (method === 'POST') { savedBlocks = route.request().postDataJSON().map((b, i) => ({ ...b, id: `block-${i}` })); writes.push({ table: 'blocks', method }); }
            else if (method === 'DELETE') { savedBlocks = []; writes.push({ table: 'blocks', method }); }
            data = method === 'GET' ? savedBlocks : [];
          } else if (url.pathname.endsWith('/exercise_library')) data = library;
          else if (url.pathname.endsWith('/profiles') || url.pathname.endsWith('/rpc/ensure_own_profile')) data = { id: user.id, username: 'Actyv Test' };
          else if (url.pathname.endsWith('/rpc/get_own_account_deletion_status')) data = null;
          else if (url.pathname.includes('/rpc/')) data = { awarded: false };
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${base}/sessions/${id}/edit`);
        await page.locator('.session-editor-block').first().waitFor();
        assert.equal(await page.locator('.session-editor-block').count(), count);
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
          rows: [...document.querySelectorAll('.session-editor-block')].map(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; }) }));
        assert.ok(metrics.width <= width);
        await page.screenshot({ path: `tmp/session-editor/session-editor-${count === 10 ? '10-exercises' : 'compact'}-${width}-${count}.png`, fullPage: false });
        if (width === 390 && count === 5) await page.screenshot({ path: 'tmp/session-editor/session-editor-compact-390.png' });
        if (width === 390 && count === 10) {
          await page.locator('.session-editor-block').first().evaluate(n => window.scrollBy(0, n.getBoundingClientRect().top - 100));
          metrics.visibleClosedRows = await page.evaluate(() => {
            const ceiling = document.querySelector('.session-editor-footer').getBoundingClientRect().top;
            return [...document.querySelectorAll('.session-editor-block')].filter(n => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= ceiling; }).length;
          });
          await page.screenshot({ path: 'tmp/session-editor/session-editor-10-exercises-390.png' });
        }
        await page.locator('.session-editor-block__open').first().click();
        let expanded = page.locator('.session-editor-block.is-expanded');
        await expanded.getByRole('spinbutton', { name: 'Series', exact: true }).fill('4');
        await expanded.getByRole('spinbutton', { name: 'Cible (reps)', exact: true }).fill('15');
        await expanded.getByRole('spinbutton', { name: 'Charge (kg)', exact: true }).fill('57.5');
        await expanded.getByRole('spinbutton', { name: 'Repos (sec)', exact: true }).fill('75');
        if (width === 390 && count === 10) {
          await page.setViewportSize({ width, height: 540 });
          const focused = expanded.getByRole('spinbutton', { name: 'Charge (kg)', exact: true });
          await focused.focus();
          await focused.evaluate(n => n.scrollIntoView({ block: 'center' }));
          assert.equal(await page.locator('.session-editor-footer').evaluate(n => getComputedStyle(n).position), 'fixed');
          const inputBounds = await focused.boundingBox();
          const footerBounds = await page.locator('.session-editor-footer').boundingBox();
          assert.ok(inputBounds.y >= 0 && inputBounds.y + inputBounds.height <= footerBounds.y, 'Focused field visible above save bar');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: 'tmp/session-editor/session-editor-keyboard-390.png' });
          await page.setViewportSize({ width, height: 844 });
        }
        await expanded.getByRole('button', { name: 'Choisir un exercice', exact: true }).click();
        await page.getByPlaceholder('Rechercher un exercice').fill('Papillon');
        await page.locator('.session-exercise-picker-item__select').filter({ hasText: 'Papillon' }).first().waitFor();
        const overlay = await page.locator('.session-exercise-picker-overlay').boundingBox();
        assert.ok(Math.abs(overlay.y) < 1 && Math.abs(overlay.height - 844) < 1, 'Picker covers viewport');
        if (width === 390) await page.screenshot({ path: 'tmp/session-editor/session-editor-picker-390.png' });
        await page.locator('.session-exercise-picker-item__select').filter({ hasText: 'Papillon' }).first().click();
        if (width === 390) {
          await expanded.evaluate(n => window.scrollBy(0, n.getBoundingClientRect().top - 100));
          await page.screenshot({ path: 'tmp/session-editor/session-editor-expanded-390.png' });
        }
        if (count > 1) {
          await page.locator('.session-editor-block__open').nth(1).click();
          assert.equal(await page.locator('.session-editor-block.is-expanded').count(), 1);
          await page.locator('.session-editor-block.is-expanded').getByRole('button', { name: 'Supprimer cet exercice' }).click();
        }
        await page.getByRole('button', { name: '+ Ajouter un exercice', exact: true }).click();
        expanded = page.locator('.session-editor-block.is-expanded');
        assert.equal(await expanded.count(), 1);
        await expanded.getByRole('textbox', { name: 'Nom du bloc', exact: true }).fill('Exercice ajoute');
        await expanded.getByRole('combobox', { name: 'Type', exact: true }).selectOption('duration');
        await expanded.getByRole('spinbutton', { name: 'Cible (sec)', exact: true }).fill('45');
        await expanded.getByRole('combobox', { name: 'Type', exact: true }).selectOption('free');
        assert.equal(await expanded.getByRole('textbox', { name: 'Consigne libre', exact: true }).count(), 0);
        await expanded.getByRole('combobox', { name: 'Type', exact: true }).selectOption('distance');
        await expanded.getByRole('spinbutton', { name: 'Cible (m)', exact: true }).fill('750');
        await expanded.getByRole('spinbutton', { name: 'Cible (m)', exact: true }).blur();
        const saveBounds = await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).boundingBox();
        const navBounds = await page.locator('.bottom-bar').boundingBox();
        assert.ok(saveBounds.y >= 0 && saveBounds.y + saveBounds.height < navBounds.y, 'Save action visible above bottom bar');
        await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
        await page.waitForURL(`${base}/sessions/${id}`);
        assert.equal(savedBlocks[0].exercise_id, exerciseId);
        assert.equal(savedBlocks[0].sets_count, 4);
        assert.equal(savedBlocks[0].target_value, 15);
        assert.equal(savedBlocks[0].charge_kg, 57.5);
        assert.equal(savedBlocks[0].rest_seconds, 75);
        assert.equal(savedBlocks.at(-1).target_value, 750);
        assert.equal(savedBlocks.at(-1).block_type, 'distance');
        assert.deepEqual(savedBlocks.map(b => b.position), savedBlocks.map((_, i) => i));
        assert.equal(writes.filter(w => w.table === 'blocks' && w.method === 'POST').length, 1);
        await page.locator('.compact-exercise-card').first().waitFor();
        await page.goto(`${base}/sessions/${id}/edit`);
        await page.locator('.session-editor-block').first().waitFor();
        assert.ok((await page.locator('.session-editor-block').first().innerText()).includes('4 x 15'));
        await page.goto(`${base}/sessions/new`);
        await page.getByLabel('Nom de la seance', { exact: true }).fill('Creation test');
        await page.locator('#session-sport').selectOption('Fitness');
        await page.locator('.session-editor-block__open').click();
        expanded = page.locator('.session-editor-block.is-expanded');
        await expanded.getByRole('textbox', { name: 'Nom du bloc', exact: true }).fill('Pompes');
        await expanded.getByRole('spinbutton', { name: 'Cible (reps)', exact: true }).fill('10');
        if (width === 390) await page.screenshot({ path: 'tmp/session-editor/session-editor-create-390.png' });
        await page.getByRole('button', { name: 'Creer la seance', exact: true }).click();
        await page.waitForURL(`${base}/sessions/${id}`);
        assert.equal(savedSession.name, 'Creation test');
        assert.equal(savedBlocks.length, 1);
        assert.equal(savedBlocks[0].target_value, 10);
        assert.equal(savedBlocks[0].exercise_id, null);
        assert.deepEqual(errors, []);
        report.push({ width, count, ...metrics });
        console.log('PASS editor visual/save', JSON.stringify(report.at(-1)));
        await context.close();
      }
    }
    fs.writeFileSync('tmp/session-editor/report.json', JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
