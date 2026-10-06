const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ts = require('typescript');
for (const file of ['components/program-editor-form.tsx', 'app/programs/[id]/page.tsx']) {
  const current = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const before = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n')
    .replace("        visibility: 'private',", file === 'components/program-editor-form.tsx' ? "        ...(mode === 'edit' ? {} : { visibility: 'private' as const })," : "        visibility: 'private',");
  function handlers(source) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), values = new Map();
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) values.set(node.name.getText(tree), node.initializer.getText(tree));
      ts.forEachChild(node, visit);
    }
    visit(tree); return values;
  }
  const actual = handlers(current);
  for (const [name, body] of handlers(before)) assert.equal(actual.get(name), body, `${file}: existing handler ${name} unchanged`);
  assert.equal((current.match(/supabase[\s\S]*?\.from\(/g) || []).length, (before.match(/supabase[\s\S]*?\.from\(/g) || []).length, 'No additional database flow');
}
console.log('PASS program handlers: load/save/share/move/completions unchanged');
if (!process.argv.includes('--visual')) process.exit(0);
const runtime = process.argv.find(a => a.startsWith('--runtime='))?.slice(10);
const { chromium } = (runtime ? createRequire(path.resolve(runtime, 'package.json')) : require)('playwright');
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\r\n"']+)/m)[1]).hostname;
const base = process.env.SESSION_UI_BASE_URL || 'http://127.0.0.1:3018';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', aud: 'authenticated' };
const pid = '11111111-1111-4111-8111-111111111111', sid = '22222222-2222-4222-8222-222222222222';
async function main() {
  fs.mkdirSync('tmp/program-editor', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report = [];
  try {
    const requestedWidth = process.argv.find(arg => arg.startsWith('--width='))?.slice(8);
    for (const width of requestedWidth ? [Number(requestedWidth)] : [360, 375, 390, 412, 430]) for (const weeks of [1, 4, 8, 52]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addInitScript(({ host, user }) => {
        localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: user.id, exp: 4102444800, aud: 'authenticated' })) + '.fixture', refresh_token: 'fixture', expires_at: 4102444800, token_type: 'bearer', user }));
      }, { host, user });
      let program = { id: pid, user_id: user.id, name: 'Programme renforcement et préparation physique sur plusieurs semaines', sport: 'Fitness', duration_weeks: weeks, start_date: '2026-10-05', description: 'Description conservée', visibility: 'private', invite_code: null };
      let sessions = Array.from({ length: weeks }, (_, i) => ({ id: `slot-${i}`, program_id: pid, session_id: sid, session_name: 'Renforcement complet avec un nom de séance volontairement très long', sport: 'Fitness', week_number: i + 1, day_of_week: 1, order_index: 1 }));
      let workout = { id: sid, user_id: user.id, name: sessions[0].session_name, sport: 'Fitness', description: 'Consigne', visibility: 'private' };
      const initialBlock = { id: 'block', session_id: sid, exercise_id: null, name: 'Pompes', block_type: 'reps', sets_count: 3, target_value: 10, charge_kg: null, rest_seconds: 45, position: 0 };
      let blocks = [initialBlock];
      const writes = [];
      let failSave = false;
      await context.route(`https://${host}/**`, async route => {
        const url = new URL(route.request().url()), method = route.request().method(), table = url.pathname.split('/').at(-1);
        const body = route.request().postData() ? route.request().postDataJSON() : null;
        let data = [];
        if (table === 'user') data = user;
        else if (table === 'profiles' || table === 'ensure_own_profile') data = { id: user.id, username: 'Test' };
        else if (table === 'get_own_account_deletion_status') data = null;
        else if (table === 'v1a_public_profiles') data = { username: 'Créateur test' };
        else if (table === 'get_shared_program_preview') data = { program: { ...program, user_id: '00000000-0000-4000-8000-000000000002', visibility: 'shared', invite_code: 'TEST' }, sessions };
        else if (table === 'training_programs') {
          if (method !== 'GET') {
            writes.push({ table, method, body });
            if (failSave) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'PRIVATE_DB_ERROR' }) });
            program = { ...program, ...body };
            if (method === 'POST') sessions = [];
            if (body.visibility === 'shared') program.invite_code = 'TEST';
          }
          data = url.searchParams.has('id') || method === 'POST' ? program : [program];
        } else if (table === 'training_program_sessions') {
          if (method === 'DELETE') {
            writes.push({ table, method });
            sessions = url.searchParams.has('id') ? sessions.filter(item => `eq.${item.id}` !== url.searchParams.get('id')) : [];
          } else if (method === 'POST') {
            writes.push({ table, method, body });
            const added = (Array.isArray(body) ? body : [body]).map((item, i) => ({ ...item, id: `saved-${sessions.length + i}` }));
            sessions.push(...added); data = Array.isArray(body) ? added : added[0];
          } else if (method === 'GET') data = sessions;
        } else if (table === 'training_sessions') {
          if (method !== 'GET') { writes.push({ table, method, body }); workout = { ...workout, ...body }; }
          data = url.searchParams.has('id') || method === 'POST' ? workout : [workout];
        } else if (table === 'training_session_blocks') {
          if (method === 'POST') { writes.push({ table, method, body }); blocks = body.map((item, i) => ({ ...item, id: `block-${i}` })); }
          else if (method === 'DELETE') { writes.push({ table, method }); blocks = []; }
          data = method === 'GET' ? blocks : [];
        } else if (table === 'training_program_completions') data = [{ id: 'completion', user_id: user.id, program_id: pid, program_session_id: sessions[0]?.id, session_id: sid, completed_at: '2026-10-05T12:00:00Z' }];
        else if (url.pathname.includes('/rpc/')) data = { awarded: false, awarded_badges: [] };
        else assert.equal(method, 'GET', 'No write to histories/masteries/XP');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/programs/${pid}`);
      await page.locator('.program-plan-week').waitFor();
      assert.equal(await page.locator('.program-plan-week').count(), 1);
      assert.ok((await page.locator('.program-progress-compact').innerText()).includes(`1/${weeks}`));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) await page.screenshot({ path: 'tmp/program-editor/program-detail-390.png' });
      const nav = page.getByRole('combobox', { name: 'Semaine affichée' });
      const options = await nav.locator('option').evaluateAll(items => items.map(item => item.value));
      await nav.selectOption(options.at(-1));
      assert.equal(await page.locator('.program-plan-week').count(), 1);
      assert.equal(writes.length, 0, 'Week navigation is read only');
      if (width === 390 && weeks === 8) await page.screenshot({ path: 'tmp/program-editor/program-8-weeks-390.png' });
      await nav.selectOption(options[0]);
      await page.locator('.program-plan-day').nth(2).getByRole('button', { name: 'Ajouter', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.ok(sessions.some(item => item.day_of_week === 3));
      const addedDay = page.locator('.program-plan-day').nth(2);
      const liveLink = addedDay.getByRole('link', { name: 'Lancer la seance' });
      assert.ok((await liveLink.getAttribute('href')).includes(`programId=${pid}`));
      await addedDay.getByRole('link', { name: 'Ouvrir la seance' }).click();
      await page.waitForURL(`${base}/sessions/${sid}`);
      await page.goto(`${base}/programs/${pid}`);
      await page.locator('.program-plan-week').waitFor();
      await page.locator('.program-plan-day').nth(2).getByRole('button', { name: 'Retirer du programme' }).click();
      await page.waitForFunction(() => !document.querySelectorAll('.program-plan-day')[2].querySelector('.program-session-card'));
      assert.ok(!sessions.some(item => item.day_of_week === 3));
      await page.locator('.program-sharing-compact > summary').click();
      await page.getByRole('button', { name: 'Activer le partage', exact: true }).click();
      await page.getByRole('button', { name: 'Copier le lien', exact: true }).waitFor();
      assert.equal(program.visibility, 'shared');
      await page.goto(`${base}/programs/join/TEST`);
      await page.getByRole('heading', { name: program.name, exact: true }).waitFor();
      const originalVisibility = weeks === 4 ? 'public' : weeks === 8 ? 'shared' : 'private';
      program.visibility = originalVisibility;
      program.invite_code = originalVisibility === 'shared' ? 'TEST' : null;
      if (width === 390 && weeks === 8) program.start_date = '2026-10-07';
      await page.goto(`${base}/programs/${pid}/edit`);
      await page.locator('.program-editor-session__toggle').filter({ hasText: workout.name }).first().waitFor();
      await page.locator('#program-name').fill('Programme modifié');
      await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
      await page.waitForURL(`${base}/programs/${pid}`);
      assert.equal(program.visibility, originalVisibility, 'Name-only edit preserves visibility');
      assert.equal(program.invite_code, originalVisibility === 'shared' ? 'TEST' : null);
      await page.goto(`${base}/programs/${pid}/edit`);
      await page.locator('.program-editor-session__toggle').filter({ hasText: workout.name }).first().waitFor();
      await page.getByRole('combobox', { name: 'Semaine affichée' }).selectOption(String(weeks));
      assert.equal(program.visibility, originalVisibility, 'Week navigation preserves visibility');
      assert.equal(await page.locator('.program-editor-day').count(), 7);
      if (width === 390 && weeks === 8) assert.ok((await page.locator('.program-editor-day__heading').first().innerText()).includes('mercredi'), 'Day label follows actual midweek start date');
      if (width === 390) {
        await page.screenshot({ path: 'tmp/program-editor/program-editor-390.png' });
        await page.screenshot({ path: 'tmp/program-editor/program-week-picker-390.png' });
        await page.locator('.program-editor-day').first().evaluate(node => window.scrollBy(0, node.getBoundingClientRect().top - 100));
        const visibleDays = await page.evaluate(() => { const bottom = document.querySelector('.program-editor-save').getBoundingClientRect().top; return [...document.querySelectorAll('.program-editor-day')].filter(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= bottom; }).length; });
        report.push({ width, weeks, visibleDays });
        await page.screenshot({ path: 'tmp/program-editor/program-empty-day-390.png' });
      }
      await page.locator('.program-editor-day').nth(2).getByRole('button', { name: '+ Séance', exact: true }).click();
      const expanded = page.locator('.program-editor-session__fields');
      assert.equal(await expanded.count(), 1);
      await expanded.locator('select').last().selectOption(sid);
      const savedCount = sessions.length;
      await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
      await page.waitForURL(`${base}/programs/${pid}`);
      assert.equal(program.name, 'Programme modifié');
      assert.equal(program.visibility, originalVisibility, 'Editing name/session preserves private/public/shared visibility');
      assert.equal(program.invite_code, originalVisibility === 'shared' ? 'TEST' : null, 'Invite code unchanged');
      const programUpdate = writes.filter(write => write.table === 'training_programs' && write.method === 'PATCH').at(-1);
      assert.ok(!Object.hasOwn(programUpdate.body, 'visibility'), 'Editor never overwrites sharing state');
      assert.ok(!Object.hasOwn(programUpdate.body, 'invite_code'), 'Editor never overwrites invite code');
      assert.equal(sessions.length, savedCount + 1);
      assert.ok(sessions.some(item => item.week_number === weeks && item.day_of_week === 3 && item.session_id === sid));
      assert.equal(blocks[0].target_value, 10);
      assert.equal(blocks[0].sets_count, 3);
      await page.goto(`${base}/programs/${pid}/edit`);
      await page.locator('#program-name').waitFor();
      assert.equal(await page.locator('#program-name').inputValue(), 'Programme modifié');
      await page.goto(`${base}/programs/new`);
      await page.locator('#program-name').fill('Nouveau programme');
      await page.locator('#program-sport').selectOption('Fitness');
      await page.locator('#program-duration').fill(String(weeks));
      await page.locator('.program-editor-session__toggle').first().click();
      await page.locator('.program-editor-session__fields select').last().selectOption(sid);
      if (width === 390 && weeks === 8) {
        await page.getByRole('button', { name: 'Configurer une nouvelle seance', exact: true }).click();
        await page.locator('.session-editor-block__open').click();
        await page.getByRole('spinbutton', { name: 'Cible (reps)', exact: true }).fill('15');
        await page.screenshot({ path: 'tmp/program-editor/program-inline-session-390.png' });
        await page.setViewportSize({ width, height: 540 });
        const input = page.getByRole('spinbutton', { name: 'Cible (reps)', exact: true });
        await input.focus();
        await input.evaluate(node => node.scrollIntoView({ block: 'center' }));
        const field = await input.boundingBox(), footer = await page.locator('.program-editor-save').boundingBox();
        assert.ok(field.y >= 0 && field.y + field.height <= footer.y, 'Focused numeric input clear of save bar');
        await page.setViewportSize({ width, height: 844 });
      }
      if (width === 390) await page.screenshot({ path: 'tmp/program-editor/program-create-390.png' });
      failSave = true;
      await page.getByRole('button', { name: 'Enregistrer le programme', exact: true }).click();
      await page.getByText('Impossible de creer le programme pour le moment.', { exact: true }).waitFor();
      assert.ok(!(await page.locator('form').innerText()).includes('PRIVATE_DB_ERROR'));
      failSave = false;
      await page.getByRole('button', { name: 'Enregistrer le programme', exact: true }).click();
      await page.waitForURL(`${base}/programs/${pid}`);
      assert.equal(program.duration_weeks, weeks);
      assert.equal(program.visibility, 'private', 'Creation remains private');
      if (width === 390 && weeks === 8) assert.equal(blocks[0].target_value, 15, 'Inline compact editor persists actual configured target');
      assert.equal(sessions.length, 1, 'New program contains exactly its configured session');
      if (width === 390 && weeks === 52) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('.program-plan-week').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const surface = await page.locator('.programs-page--dense').boundingBox();
        assert.ok(surface.width <= 760, 'Desktop content remains constrained');
        await page.screenshot({ path: 'tmp/program-editor/program-desktop.png' });
      }
      assert.deepEqual(errors, []);
      console.log(`PASS program ${width}px ${weeks} weeks: navigation/add/edit/save/reopen/share/create/error`);
      await context.close();
    }
    fs.writeFileSync('tmp/program-editor/report.json', JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
