const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261004_v1_1a_account_isolation.sql'), 'utf8');
const productionSchema = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v1-1a-production-schema.json'), 'utf8'));
const requirements = JSON.parse(migration.match(/jsonb_each\('([\s\S]*?)'::jsonb\)/)[1]);
for (const [relation, columns] of Object.entries(requirements)) {
  const table = productionSchema.find(row => `${row.schema_name}.${row.relation_name}` === relation);
  assert.equal(table?.relation_exists, 'true', `Missing production table: ${relation}`);
  for (const column of columns) assert.ok(table.columns.some(c => c.name === column), `Missing production column: ${relation}.${column}`);
}
assert.doesNotMatch(migration, /m\.user_id/);
// Validate every qualified business-column access, not just the preflight list.
const functions = [...migration.matchAll(/create (?:or replace )?function public\.(\w+)\([^]*?as \$\$([^]*?)\$\$;/g)];
for (const [, name, body] of functions) {
  const aliases = name === 'v1a_can_read_challenge'
    ? { c: 'public.challenges', p: 'public.challenge_participants', m: 'public.challenge_members' }
    : name === 'v1a_owns_challenge' ? { c: 'public.challenges' }
    : name === 'ensure_own_profile' ? { u: 'auth.users', result: 'public.profiles' }
    : { p: 'public.training_programs', s: 'public.training_program_sessions' };
  for (const [, alias, column] of body.matchAll(/\b([a-z_]+)\.([a-z_]+)\b/g)) {
    if (!aliases[alias]) continue;
    assert.ok(requirements[aliases[alias]].includes(column), `${name}: ${alias}.${column} missing from schema preflight`);
  }
}
for (const file of ['app/challenges/page.tsx', 'app/challenges/[id]/page.tsx', 'app/leaderboard/page.tsx',
  'app/profile/page.tsx', 'app/api/account/delete/route.ts', 'lib/user-statistics.ts']) {
  const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const chain of text.matchAll(/\.from\('challenge_members'\)([\s\S]*?)(?:;|,\s*\n\s*(?:\[\]|supabase|Promise)|:\s*Promise)/g)) {
    assert.doesNotMatch(chain[1], /\.eq\('user_id'|\.select\('[^']*\buser_id\b|user_id\.eq/, `${file}: nonexistent member user_id`);
  }
}
console.log(`PASS catalog: ${Object.keys(requirements).length} required relations and ${Object.values(requirements).flat().length} referenced business columns verified against production snapshot`);
assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.doesNotMatch(migration, /(?:create or replace function public\.(?:award_xp|grant_user_badge|process_\w+masteries)|delete from|update public\.)/i);
assert.match(migration, /grant update \(username\) on public.profiles/);
assert.match(migration, /revoke select \(%s\), insert \(%s\), update \(%s\), references \(%s\)/);
const profile = fs.readFileSync(path.join(__dirname, '../app/profile/page.tsx'), 'utf8');
assert.match(profile, /\.update\(\{ username: trimmed \}\)/);
assert.doesNotMatch(profile, /total_xp: profile.total_xp/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(profile, /\.select\('id, username'\)/);
assert.match(profile, /!data \|\| data.id !== user.id/);
// Exercise the actual handler, including the zero-row and network failure paths.
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.createSourceFile('profile.tsx', profile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleSaveUsername') handler = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
async function testProfileSave() {
  for (const scenario of ['success', 'empty', 'taken', 'rls', 'network', 'foreign']) {
    let message = '', saving = false, updates = 0;
    const context = {
      profile: { id: 'B', username: 'Old' }, savingUsername: false, usernameInput: 'New',
      setSavingUsername: value => { saving = value; }, setMessage: value => { message = value; },
      setProfile: () => {}, setEditMode: () => {},
      supabase: {
        auth: { getUser: async () => ({ data: { user: { id: scenario === 'foreign' ? 'A' : 'B' } } }) },
        from: () => ({ update: payload => {
          assert.deepEqual(Object.keys(payload), ['username']); updates++;
          return { eq: (key, id) => {
            assert.equal(id, 'B');
            return { select: () => ({ maybeSingle: async () => {
              if (scenario === 'network') throw new Error('Offline');
              return { data: scenario === 'success' ? { id: 'B', username: 'New' } : null,
                error: scenario === 'taken' ? { code: '23505' } : scenario === 'rls' ? { code: '42501' } : null };
            } }) };
          } };
        } })
      }
    };
    const code = ts.transpile(`const save = ${handler}; save;`);
    await vm.runInNewContext(code, context)();
    assert.equal(message === 'Pseudo mis a jour.', scenario === 'success');
    assert.equal(saving, false);
    if (scenario === 'foreign') assert.equal(updates, 0);
  }
  console.log('PASS profile UI: real returned row required; unique/RLS/network/empty/foreign errors never report success');
}
async function testSignup() {
  const text = fs.readFileSync(path.join(__dirname, '../app/(auth)/signup/page.tsx'), 'utf8');
  const source = ts.createSourceFile('signup.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleSignup') handler = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const scenario of ['immediate', 'confirmation', 'missingProfile']) {
    let calls = 0, redirected = false, message = '';
    const context = {
      email: 'b@test.invalid', password: 'password', username: ' B ', redirectTo: '/login',
      setMessage: value => { message = value; }, setLoading: () => {}, router: { push: () => { redirected = true; } },
      supabase: {
        auth: { signUp: async options => {
          assert.equal(options.options.data.username, 'B');
          return { data: { user: { id: 'B' }, session: scenario === 'confirmation' ? null : {} } };
        } },
        rpc: async () => { calls++; return { data: scenario === 'missingProfile' ? null : { id: 'B' } }; }
      }
    };
    await vm.runInNewContext(ts.transpile(`const signup = ${handler}; signup;`), context)({ preventDefault() {} });
    assert.equal(calls, scenario === 'confirmation' ? 0 : 1);
    assert.equal(redirected, scenario !== 'missingProfile');
    assert.equal(message === 'Compte créé avec succès.', scenario !== 'missingProfile');
  }
  console.log('PASS signup: immediate session validates returned profile; email confirmation defers provisioning; missing profile never reports success');
}
const join = fs.readFileSync(path.join(__dirname, '../app/programs/join/[invite_code]/page.tsx'), 'utf8');
assert.match(join, /get_shared_program_preview/);
assert.doesNotMatch(join, /\.eq\('invite_code', inviteCode\)/);
console.log('PASS static: transaction, scoped profile writes, code-only program preview, no XP engine changes');

// Optional disposable runtime: no application dependency, no network or live DB.
const runtime = process.argv.find(arg => arg.startsWith('--runtime='))?.slice(10);
if (!runtime) {
  console.log('SQL execution skipped: pass --runtime=<directory containing @electric-sql/pglite>');
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

async function main() {
  await testProfileSave();
  await testSignup();
  const { PGlite } = require(path.resolve(runtime, '@electric-sql/pglite'));
  const db = new PGlite();
  const A = '00000000-0000-4000-8000-000000000001';
  const B = '00000000-0000-4000-8000-000000000002';
  const C = '00000000-0000-4000-8000-000000000003';
  const privateChallenge = '10000000-0000-4000-8000-000000000001';
  const publicChallenge = '10000000-0000-4000-8000-000000000002';
  const live = '20000000-0000-4000-8000-000000000001';
  const shared = '30000000-0000-4000-8000-000000000001';
  const privateProgram = '30000000-0000-4000-8000-000000000002';
  const as = async (role, id = null, email = null) => {
    await db.exec(`reset role; set role ${role};`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, email })]);
  };
  const rows = async sql => (await db.query(sql)).rows;
  const denied = async sql => {
    try { await db.exec(sql); assert.fail(`Write unexpectedly allowed: ${sql}`); }
    catch (error) { assert.ok(['42501', '23514'].includes(error.code), `${error.message} (${error.code})`); }
  };
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/v1-1a-security.sql'), 'utf8'));
    for (const table of productionSchema) {
      const relation = `${table.schema_name}.${table.relation_name}`;
      const exists = (await db.query('select to_regclass($1)::text as relation', [relation])).rows[0].relation;
      if (table.relation_exists !== 'true') { assert.equal(exists, null, relation); continue; }
      const columns = (await db.query(`select a.attname as name, format_type(a.atttypid,a.atttypmod) as type,
        a.attnotnull as not_null, a.attidentity as identity, a.attgenerated as generated,
        pg_get_expr(d.adbin,d.adrelid) as "default"
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`, [relation])).rows;
      assert.deepEqual(columns, table.columns, `${relation}: fixture columns/types/defaults/nullability drifted`);
      const constraints = (await db.query(`select conname as name, contype as type, pg_get_constraintdef(oid,true) as definition
        from pg_constraint where conrelid=$1::regclass and contype <> 'n' order by conname`, [relation])).rows;
      assert.deepEqual(constraints, table.constraints, `${relation}: fixture constraints drifted`);
      const indexes = (await db.query(`select c.relname as name, pg_get_indexdef(i.indexrelid) as definition
        from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=$1::regclass order by c.relname`, [relation])).rows;
      assert.deepEqual(indexes, table.indexes, `${relation}: fixture indexes drifted`);
    }
    console.log('PASS fixture: every exported table column/type/default/constraint/index matches production, legacy view absent');
    // Exercise the existing repo invitation RPC, not a second membership engine.
    // Reward calls are logged locally; production reward implementations are not changed.
    await db.exec(`create table public.v1a_test_reward_calls (user_id uuid, kind text, target text);
      create function public.add_user_xp(p_user uuid, p_kind text, p_amount integer, p_target text)
      returns void language sql as $$ insert into public.v1a_test_reward_calls values (p_user,p_kind,p_target); $$;
      create function public.refresh_user_badges(p_user uuid) returns void language sql as $$
        insert into public.v1a_test_reward_calls values (p_user,'badges',null); $$;`);
    const repoSchema = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
    const invitation = repoSchema.match(/create or replace function public\.join_challenge_by_invite_code\(p_invite_code text\)[\s\S]*?\$\$;/)[0];
    await db.exec(invitation);
    await db.exec('revoke all on function public.join_challenge_by_invite_code(text) from public, anon; grant execute on function public.join_challenge_by_invite_code(text) to authenticated;');
    await db.exec(`
      insert into auth.users (id,email,raw_user_meta_data) values ('${A}','a@test.invalid','{"username":"A"}'),
        ('${B}','b@test.invalid','{"username":"B"}'), ('${C}','c@test.invalid','{"username":"C"}');
      insert into profiles (id,email,username,total_xp,level) values ('${A}','a@test.invalid','A',1420,7);
      insert into challenges (id,created_by,name,visibility,invite_code) values
        ('${privateChallenge}','${A}','Private','private','private-code'),
        ('${publicChallenge}','${A}','Community','community','community-code'),
        ('10000000-0000-4000-8000-000000000003','${A}','Community 2','community','community-code-2');
      insert into challenge_members (id,challenge_id,user_email,role) values
        ('40000000-0000-4000-8000-000000000001','${privateChallenge}','C@TEST.INVALID','member'),
        ('40000000-0000-4000-8000-000000000004','${privateChallenge}',null,'member'),
        ('40000000-0000-4000-8000-000000000005','${privateChallenge}','','member');
      insert into activities (id,user_id,source,metadata) values
        ('${live}','${A}','live','{"route_trace":{"segments":[]}}');
      insert into training_programs (id,user_id,name,visibility,invite_code) values
        ('${shared}','${A}','Shared','shared','secret-code'), ('${privateProgram}','${A}','Private','private',null);
      insert into training_program_sessions (id,program_id,session_name,week_number,day_of_week,order_index)
        values ('50000000-0000-4000-8000-000000000001','${shared}','Workout',1,2,1);
    `);
    await db.exec(migration);
    const first = await rows("select tablename, policyname, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname");
    await db.exec(migration);
    assert.deepEqual(await rows("select tablename, policyname, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname"), first);
    console.log('PASS SQL: full migration applies twice, same policies, data retained');
    // A deployment schema drift must fail before policy replacement.
    await db.exec('alter table public.training_programs rename column name to missing_name');
    await assert.rejects(db.exec(migration), error => error.message.includes('V1A_SCHEMA_MISMATCH: public.training_programs.name'));
    await db.exec('rollback; alter table public.training_programs rename column missing_name to name');
    assert.deepEqual(await rows("select tablename, policyname, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname"), first);
    // Also prove a later failure rolls back all policy/function/grant changes.
    await assert.rejects(db.exec(migration.replace("notify pgrst, 'reload schema';", 'select v1a_intentional_missing_function();')), error => error.code === '42883');
    await db.exec('rollback');
    assert.deepEqual(await rows("select tablename, policyname, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname"), first);
    console.log('PASS transaction: missing-column preflight and late SQL failure leave existing policies intact');

    await as('authenticated', A, 'a@test.invalid');
    await db.exec('select ensure_own_profile()');
    assert.equal((await rows('select total_xp from profiles'))[0].total_xp, 1420);
    await db.exec("update profiles set username='A renamed'");
    await denied('update profiles set total_xp=999999');
    await denied('update profiles set level=99');
    await denied('delete from profiles');
    await denied(`insert into profiles (id,total_xp) values ('${B}',999)`);
    assert.equal((await rows('select metadata from activities')).length, 1);
    await db.exec(`insert into activities (id,user_id,source) values ('20000000-0000-4000-8000-000000000002','${A}','live')`);
    await db.exec(`insert into activities (id,user_id,source,challenge_id) values
      ('20000000-0000-4000-8000-000000000003','${A}','manual','${privateChallenge}')`);
    await db.exec(`insert into challenge_participants (challenge_id,user_id,role) values ('${privateChallenge}','${A}','admin')
      on conflict (challenge_id,user_id) do nothing`);
    await db.exec(`update challenges set invite_code='new-code' where id='${privateChallenge}'`);
    assert.equal((await rows('select * from training_programs')).length, 2);
    await db.exec(`update training_programs set name='Private edited' where id='${privateProgram}'`);
    console.log('PASS A: legitimate profile edit, XP/level blocked, Live 5B insert/read, owner challenge creation flow');

    await as('authenticated', B, 'b@test.invalid');
    await db.exec('select ensure_own_profile(); select ensure_own_profile()');
    assert.equal((await rows('select * from profiles')).length, 1);
    assert.equal((await rows('select total_xp from profiles'))[0].total_xp, 0);
    assert.equal((await rows(`select * from profiles where id='${A}'`)).length, 0);
    await db.exec(`update profiles set username='hacked' where id='${A}'`);
    assert.equal((await rows(`select * from activities where id='${live}'`)).length, 0);
    assert.equal((await rows(`delete from activities where id='${live}' returning id`)).length, 0);
    await denied(`update activities set user_id='${B}' where id='${live}'`);
    await denied(`insert into activities (id,user_id,source) values ('20000000-0000-4000-8000-000000000004','${A}','live')`);
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 0);
    assert.equal((await rows("select * from challenges where visibility='community'")).length, 2);
    assert.equal((await rows(`update challenges set created_by='${B}' where id='${privateChallenge}' returning id`)).length, 0);
    assert.equal((await rows(`delete from challenges where id='${privateChallenge}' returning id`)).length, 0);
    await denied(`insert into challenge_participants (challenge_id,user_id) values ('${privateChallenge}','${B}')`);
    await denied(`insert into challenge_members (id,challenge_id,user_email) values ('40000000-0000-4000-8000-000000000002','${privateChallenge}','b@test.invalid')`);
    await db.exec(`insert into challenge_participants (challenge_id,user_id) values ('${publicChallenge}','${B}')`);
    await db.exec(`delete from challenge_participants where challenge_id='${publicChallenge}' and user_id='${B}'`);
    await denied(`insert into challenge_participants (challenge_id,user_id,role) values ('${publicChallenge}','${B}','admin')`);
    assert.equal((await rows(`update training_programs set name='hacked' where id='${privateProgram}' returning id`)).length, 0);
    assert.equal((await rows('select * from training_programs')).length, 0);
    assert.equal((await rows('select * from training_program_sessions')).length, 0);
    console.log('PASS B: foreign profile/GPS/mutations/private challenge blocked, community join/leave works, shared not enumerable');

    await as('authenticated', C, 'c@test.invalid');
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 1);
    assert.equal((await rows(`select * from activities where challenge_id='${privateChallenge}'`)).length, 1);
    await db.exec(`insert into challenge_participants (challenge_id,user_id) values ('${privateChallenge}','${C}')`);
    assert.equal((await rows(`delete from challenge_members where challenge_id='${privateChallenge}' returning id`)).length, 1);
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 1);
    console.log('PASS C: nonempty legacy email membership, no RLS recursion, shared challenge activity visible');
    await as('authenticated', B, '');
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 0);
    await as('authenticated', B, null);
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 0);
    await as('authenticated', B, 'b@test.invalid');
    await assert.rejects(db.exec("select * from join_challenge_by_invite_code('wrong')"), error => error.message === 'invalid_invite');
    const joined = (await rows("select * from join_challenge_by_invite_code('new-code')"))[0];
    assert.equal(joined.id, privateChallenge);
    assert.equal(joined.already_joined, false);
    assert.equal((await rows("select * from join_challenge_by_invite_code('new-code')"))[0].already_joined, true);
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 1);
    await db.exec(`delete from challenge_participants where challenge_id='${privateChallenge}' and user_id='${B}'`);
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 0);
    await as('postgres');
    assert.equal((await rows(`select * from v1a_test_reward_calls where user_id='${B}' and kind='challenge_joined'`)).length, 1);
    console.log('PASS invitations: existing repo RPC joins a private challenge, retry keeps one participant/reward call, own leave works; empty/null emails never match');

    await as('anon');
    await denied('select * from profiles');
    await denied('update profiles set username=\'hacked\'');
    await denied('select * from activities');
    await denied('select ensure_own_profile()');
    await denied("select * from join_challenge_by_invite_code('new-code')");
    await denied('select * from training_programs');
    await denied('select * from training_program_sessions');
    await denied('select * from program_sessions');
    const preview = (await rows("select get_shared_program_preview('secret-code') as preview"))[0].preview;
    assert.equal(preview.program.id, shared);
    assert.equal(preview.sessions.length, 1);
    assert.equal(preview.program.invite_code, undefined);
    assert.equal((await rows("select get_shared_program_preview('') as preview"))[0].preview, null);
    assert.equal((await rows("select get_shared_program_preview('wrong') as preview"))[0].preview, null);
    assert.equal((await rows(`select * from challenges where id='${privateChallenge}'`)).length, 0);
    assert.equal((await rows(`select * from challenges where id='${publicChallenge}'`)).length, 0);
    assert.equal((await rows("select * from challenges where visibility='community'")).length, 0);
    assert.equal((await rows('select * from v1a_public_profiles')).length, 2);
    await denied('truncate profiles');
    await denied('truncate activities');
    await denied('truncate training_program_completions');
    console.log('PASS anon: challenges/private data/writes/legacy/TRUNCATE denied; exact-code program preview and public profile projection work');

    await as('postgres');
    assert.equal((await rows(`select username from profiles where id='${A}'`))[0].username, 'A renamed');
    assert.equal((await rows('select count(*)::int as n from activities'))[0].n, 3);
    await db.exec(`update profiles set total_xp=1430, level=8 where id='${A}'`);
    assert.equal((await rows(`select total_xp from profiles where id='${A}'`))[0].total_xp, 1430);
    await db.exec(`insert into training_programs (id,user_id,name,visibility) values
      ('30000000-0000-4000-8000-000000000003','${A}','Public','public')`);
    await as('authenticated', B, 'b@test.invalid');
    assert.equal((await rows('select * from training_programs')).length, 1);
    await db.exec(`insert into training_programs (id,user_id,name,visibility) values
      ('30000000-0000-4000-8000-000000000004','${B}','Own copy','private')`);
    await db.exec(`insert into training_program_sessions (id,program_id,session_name) values
      ('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','Copied workout')`);
    assert.equal((await rows('select * from training_program_sessions')).length, 1);
    console.log('PASS server: privileged XP writes unchanged; no data destruction');
    console.log('PASS programs: public bank, own editing and copied schedule remain accessible');
    await as('postgres');
    const D = '00000000-0000-4000-8000-000000000004';
    const E = '00000000-0000-4000-8000-000000000005';
    await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('${D}','d@test.invalid','{"username":"Taken"}'),
      ('${E}','e@test.invalid','{"username":"Taken"}')`);
    await as('authenticated', D, 'd@test.invalid');
    const created = (await rows('select ensure_own_profile() as profile'))[0].profile;
    assert.equal(created.username, 'Taken');
    assert.equal(created.id, D);
    await as('authenticated', E, 'e@test.invalid');
    // PGlite queues these calls on one connection; production inter-connection
    // serialization is provided by the transaction advisory lock above.
    const concurrent = await Promise.all([rows('select ensure_own_profile() as profile'), rows('select ensure_own_profile() as profile')]);
    assert.deepEqual(concurrent[0], concurrent[1]);
    assert.match(concurrent[0][0].profile.username, /^Utilisateur_[a-f0-9]{12}$/);
    assert.equal((await rows(`update profiles set username='Available' where id='${E}' returning id`)).length, 1);
    await assert.rejects(db.exec("update profiles set username='Taken'"), error => error.code === '23505');
    assert.equal((await rows('select username from profiles'))[0].username, 'Available');
    await denied("update profiles set email='stolen@test.invalid'");
    assert.equal((await rows(`update profiles set username='stolen' where id='${D}' returning id`)).length, 0);
    assert.equal((await rows('select ensure_own_profile() as profile'))[0].profile.username, 'Available');
    await as('postgres');
    assert.equal((await rows(`select username from profiles where id='${D}'`))[0].username, 'Taken');
    assert.equal((await rows(`select count(*)::int as n from profiles where id='${E}'`))[0].n, 1);
    console.log('PASS provisioning: free/taken username, unique fallback, returned real profile, retries, queued concurrent calls, email/foreign writes blocked');
  } finally { await db.close(); }
}
