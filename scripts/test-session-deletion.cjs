const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const source = fs.readFileSync('app/sessions/[id]/page.tsx', 'utf8');
assert.ok(!source.includes('window.confirm'));
assert.ok(source.includes(".eq('id', session.id).eq('user_id', user.id).select('id')"));
assert.ok(source.includes('deletionLock.current = true'));
assert.ok(source.includes('data?.length !== 1'));
const handler = source.slice(source.indexOf('  const handleDeleteSession'), source.indexOf('  return (\n    <SessionDebugBoundary'));
assert.ok(!/from\('(workout|mastery|xp)/.test(handler));
console.log('PASS deletion static: owner filters, result check, lock and no history writes');
if (!process.argv.includes('--visual')) process.exit(0);
const runtime = process.argv.find(a => a.startsWith('--runtime='))?.slice(10);
const { chromium } = (runtime ? createRequire(path.resolve(runtime, 'package.json')) : require)('playwright');
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\r\n"']+)/m)[1]).hostname;
const base = process.env.SESSION_UI_BASE_URL || 'http://127.0.0.1:3018';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', aud: 'authenticated' };
const id = '11111111-1111-4111-8111-111111111111';
async function main() {
  fs.mkdirSync('tmp/session-deletion', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [360, 375, 390, 412, 430]) {
      for (const mode of ['owner', 'other', 'empty', 'error', 'network']) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(({ host, user }) => {
          localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({
            access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: user.id, exp: 4102444800, aud: 'authenticated' })) + '.fixture',
            refresh_token: 'fixture', expires_at: 4102444800, token_type: 'bearer', user }));
        }, { host, user });
        let deleted = false, deletes = 0;
        const writes = [];
        const session = { id, user_id: mode === 'other' ? '00000000-0000-4000-8000-000000000002' : user.id,
          name: 'Seance test', sport: 'Fitness', visibility: 'public' };
        await context.route(`https://${host}/**`, async route => {
          const url = new URL(route.request().url()), method = route.request().method();
          let data = [];
          if (url.pathname.endsWith('/user')) data = user;
          else if (url.pathname.endsWith('/training_sessions')) {
            if (method === 'DELETE') {
              deletes++;
              writes.push(url.pathname);
              assert.equal(url.searchParams.get('id'), `eq.${id}`);
              assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`);
              assert.equal(url.searchParams.get('select'), 'id');
              await new Promise(resolve => setTimeout(resolve, 250));
              if (mode === 'network') return route.abort();
              if (mode === 'error') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'PRIVATE_DB_ERROR', code: '23503' }) });
              data = mode === 'empty' ? [] : [{ id }];
              deleted = mode === 'owner';
            } else data = url.searchParams.has('id') ? session : deleted ? [] : [session];
          } else if (url.pathname.endsWith('/training_session_blocks')) data = [{ id: 'block', session_id: id, name: 'Pompes', block_type: 'reps', sets_count: 3, target_value: 10, position: 0 }];
          else if (url.pathname.endsWith('/training_program_sessions')) data = [{ program_id: 'program1' }, { program_id: 'program1' }];
          else if (url.pathname.endsWith('/profiles') || url.pathname.endsWith('/rpc/ensure_own_profile')) data = { id: user.id, username: 'Test' };
          else if (url.pathname.endsWith('/rpc/get_own_account_deletion_status')) data = null;
          else if (method !== 'GET') assert.ok(url.pathname.includes('/rpc/'), 'No business writes outside session delete');
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        await page.goto(`${base}/sessions/${id}`);
        await page.locator('.compact-exercise-card').waitFor();
        await page.getByLabel("Plus d'actions").click();
        const trigger = page.getByRole('button', { name: 'Supprimer la séance', exact: true });
        if (mode === 'other') {
          assert.equal(await trigger.count(), 0);
          assert.equal(deletes, 0);
        } else {
          await trigger.click();
          const dialog = page.getByRole('dialog');
          await dialog.waitFor();
          assert.equal(deletes, 0);
          await page.waitForFunction(() => document.querySelector('dialog').textContent.includes('1 programme'));
          await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
          assert.equal(await dialog.isVisible(), false);
          assert.equal(deletes, 0);
          await trigger.click();
          const bounds = await dialog.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: `tmp/session-deletion/confirmation-${width}-${mode}.png` });
          await dialog.getByRole('button', { name: 'Supprimer', exact: true }).evaluate(button => { button.click(); button.click(); });
          if (mode === 'owner') {
            await page.waitForURL(`${base}/sessions`);
            assert.ok(!await page.getByText('Seance test', { exact: true }).count(), 'Deleted session absent from list');
          } else {
            await dialog.getByRole('alert').waitFor();
            assert.ok(!(await dialog.innerText()).includes('PRIVATE_DB_ERROR'));
            assert.equal(deleted, false);
            assert.equal(await dialog.getByRole('button', { name: 'Supprimer', exact: true }).isEnabled(), true);
          }
          assert.equal(deletes, 1);
          assert.deepEqual(writes, ['/rest/v1/training_sessions']);
        }
        console.log(`PASS deletion ${width} ${mode}`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
