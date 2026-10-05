const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const sourcePath = 'app/sessions/[id]/page.tsx';
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const baseline = execFileSync('git', ['show', `HEAD:${sourcePath}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
function unchangedLogic(value) {
  return value.slice(0, value.indexOf('  const handleDeleteSession ='))
    .split('  const openDeleteSession =')[0]
    .replace('useEffect, useMemo, useRef, useState', 'useEffect, useMemo, useState')
    .replace(/  const deletionLock =[^\n]*\n  const deletionDialog =[^\n]*\n  const \[linkedProgramCount[^\n]*\n/, '');
}
assert.equal(unchangedLogic(source), unchangedLogic(baseline), 'Loading, calculations and unrelated handlers unchanged');
assert.ok(source.includes('onAction={isCompleted ? undefined : () => toggleBlockCompleted(block.id)}'));
assert.ok(source.includes('href={`/sessions/${session.id}/live`}'));
assert.ok(source.includes('href={`/sessions/${session.id}/edit`}'));
assert.ok(source.includes('onClick={openDeleteSession}'));
console.log('PASS detail: loading, calculations, handlers and action targets unchanged');
if (!process.argv.includes('--visual')) process.exit(0);

const runtime = process.argv.find(arg => arg.startsWith('--runtime='))?.slice(10);
const { chromium } = (runtime ? createRequire(path.resolve(runtime, 'package.json')) : require)('playwright');
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8')
  .match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\r\n"']+)/m)?.[1];
const host = new URL(publicUrl).hostname;
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', aud: 'authenticated' };
const id = '11111111-1111-4111-8111-111111111111';
const imageFixture = process.argv.find(arg => arg.startsWith('--image='))?.slice(8);
const exerciseId = '22222222-2222-4222-8222-222222222222';
const names = ['Papillon', 'Developpe couche avec halteres sur banc incline', 'Planche', 'Course tapis', 'Mobilite'];
const types = ['reps', 'reps', 'duration', 'distance', 'free'];
const blocks = names.map((name, index) => ({ id: `block-${index}`, session_id: id, position: index,
  name, block_type: types[index], sets_count: 3, target_value: index === 2 ? 30 : index === 3 ? 500 : index === 4 ? null : 12,
  charge_kg: index === 1 ? 50 : null, rest_seconds: 45, exercise_id: index === 0 && imageFixture ? exerciseId : null }));
const base = process.env.SESSION_UI_BASE_URL || 'http://127.0.0.1:3018';
async function main() {
  fs.mkdirSync('tmp/session-compact', { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const report = [];
  try {
    for (const width of [360, 375, 390, 412, 430]) {
      for (const mode of ['compact', 'expanded', 'progress', 'completed']) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(({ host, user, id, completed }) => {
          const payload = btoa(JSON.stringify({ sub: user.id, exp: 4102444800, aud: 'authenticated' }));
          localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({
            access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.fixture', refresh_token: 'fixture',
            expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }));
          localStorage.setItem(`actyv.account.${user.id}.session.completed.${id}`, JSON.stringify({ ownerUserId: user.id, completedBlockIds: completed }));
        }, { host, user, id, completed: [] });
        await context.route(`https://${host}/**`, async route => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname.includes('/storage/') && imageFixture) {
            return route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(imageFixture) });
          }
          let data = [];
          if (pathname.endsWith('/user')) data = user;
          else if (pathname.endsWith('/training_sessions')) data = { id, user_id: user.id, name: 'Renforcement complet',
            sport: 'fitness', description: 'Seance de renforcement', visibility: 'private' };
          else if (pathname.endsWith('/training_session_blocks')) data = blocks;
          else if (pathname.endsWith('/exercise_library')) data = [{ id: exerciseId, slug: 'papillon', name: 'Papillon',
            tracking_type: 'reps', active: true, image_path: `${exerciseId}/main.webp`, metadata: {}, equipment: [], primary_muscles: [], secondary_muscles: [] }];
          else if (pathname.endsWith('/profiles') || pathname.endsWith('/rpc/ensure_own_profile')) data = { id: user.id, username: 'Actyv Test' };
          else if (pathname.endsWith('/rpc/get_own_account_deletion_status')) data = null;
          assert.ok(route.request().method() === 'GET' || ['ensure_own_profile', 'get_own_account_deletion_status'].some(n => pathname.endsWith('/rpc/' + n)), 'No production writes');
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/sessions/${id}`);
        await page.locator('.compact-exercise-card').first().waitFor();
        assert.equal(await page.locator('.compact-exercise-card').count(), 5);
        const completedCount = mode === 'completed' ? 5 : mode === 'progress' ? 1 : 0;
        for (let index = 0; index < completedCount; index++) {
          await page.locator('.compact-exercise-card').nth(index).getByRole('button', { name: /Continuer|Demarrer/ }).click();
        }
        await page.waitForFunction(expected => document.querySelectorAll('.compact-exercise-card--done').length === expected,
          completedCount);
        if (imageFixture) {
          await page.locator('.compact-exercise-card').first().locator('img').waitFor();
          await page.waitForFunction(() => {
            const img = document.querySelector('.compact-exercise-card img'); return img?.complete && img.naturalWidth > 0;
          });
        }
        assert.equal(await page.getByRole('link', { name: /Demarrer la seance/ }).getAttribute('href'), `/sessions/${id}/live`);
        assert.equal(await page.getByRole('link', { name: /Modifier/ }).getAttribute('href'), `/sessions/${id}/edit`);
        if (mode === 'expanded') {
          await page.getByRole('button', { name: 'Plus', exact: true }).first().click();
          await page.locator('.compact-exercise-card__details').first().waitFor();
          await page.getByRole('button', { name: 'Moins', exact: true }).click();
          assert.equal(await page.locator('.compact-exercise-card__details').count(), 0);
          await page.getByRole('button', { name: 'Plus', exact: true }).first().click();
        }
        if (mode === 'compact') {
          await page.locator('.session-overflow-menu summary').click();
          await page.getByRole('link', { name: 'Nouvelle seance', exact: true }).waitFor();
          await page.locator('.session-overflow-menu summary').click();
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        const metrics = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          cards: [...document.querySelectorAll('.compact-exercise-card')].map(node => {
            const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height };
          }) }));
        assert.ok(metrics.width <= width, `${width}/${mode}: horizontal overflow`);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `tmp/session-compact/session-${mode}-${width}.png`, fullPage: false });
        await page.locator('.compact-exercise-card').last().scrollIntoViewIfNeeded();
        await page.locator('.compact-exercise-card').last().evaluate(node => node.scrollIntoView({ block: 'center' }));
        const lastAction = await page.locator('.compact-exercise-card').last().getByRole('button', { name: /Demarrer|Termine/ }).boundingBox();
        const navigation = await page.locator('.bottom-bar').boundingBox();
        assert.ok(lastAction.y + lastAction.height <= navigation.y, 'Last action accessible above bottom navigation');
        report.push({ width, mode, ...metrics });
        console.log('PASS visual', JSON.stringify(report.at(-1)));
        await context.close();
      }
    }
    fs.writeFileSync('tmp/session-compact/report.json', JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
