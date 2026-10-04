const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261004_v1_1b_reward_integrity.sql');
const fixture = read('scripts/fixtures/v1-1b-production.sql');
const v1a = read('supabase/migrations/20261004_v1_1a_account_isolation.sql');
assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.doesNotMatch(migration, /delete from public\.(xp_events|user_badges)|truncate table/i);
const client = read('lib/gamification.ts');
assert.doesNotMatch(client, /\.insert\(|grant_user_badge|xp_amount:\s*(?:Number|XP_RULES|xpOverride|\d)/);
assert.match(client, /request_xp_reward/);
assert.match(client, /refresh_own_badges/);
assert.doesNotMatch(read('app/activities/new/NewActivityPageClient.tsx'), /awardXp/);
assert.doesNotMatch(read('app/challenges/new/page.tsx'), /awardXp/);
console.log('PASS static: server authority, no direct reward writes, no redundant creation calls');

const runtime = process.argv.find(a => a.startsWith('--runtime='))?.slice(10);
if (!runtime) throw new Error('Supply --runtime=<node_modules containing @electric-sql/pglite>');
const { PGlite } = require(path.resolve(runtime, '@electric-sql/pglite'));
async function testClientAdapter() {
  const calls = [];
  const exports = {};
  const api = {
    auth: { getUser: async () => ({ data: { user: { id: 'A' } } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === 'refresh_own_badges'
        ? { awarded: ['first_activity'] }
        : { awarded: true, total_xp: 10 }, error: null };
    },
    from: () => { throw new Error('Client must not write reward tables'); },
  };
  vm.runInNewContext(ts.transpileModule(client, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => name === '@/lib/supabase'
    ? { supabase: api } : { BADGES: [], normalizeBadgeCode: code => code }, console });
  await exports.awardXp({ userId: 'A', source: 'session_completed', metadata: { target_id: 'history' }, xpOverride: 999999 });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { name: 'request_xp_reward', args: { p_event_type: 'session_completed', p_target_id: 'history' } });
  assert.equal((await exports.awardXp({ userId: 'B', source: 'session_completed', metadata: { target_id: 'history' } })).awarded, false);
  assert.deepEqual(Array.from((await exports.refreshUserBadges('A')).awarded), ['first_activity']);
  assert.equal(calls[1].name, 'refresh_own_badges');
  assert.equal(calls[1].args, undefined);
  await exports.refreshUserBadges('B');
  assert.equal(calls.length, 2);
  console.log('PASS actual frontend adapter: no XP amount/user UUID sent, server badge codes retained, foreign user rejected');
}
async function main() {
  await testClientAdapter();
  const db = new PGlite();
  const A = randomUUID(), B = randomUUID();
  const owner = async () => db.exec('reset role');
  const as = async (role, id = null) => {
    await owner();
    await db.exec('set role ' + role);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id })]);
  };
  const value = async sql => Object.values((await db.query(sql)).rows[0])[0];
  const reward = async (kind, id) => (await db.query('select public.request_xp_reward($1,$2) result', [kind, id])).rows[0].result;
  const rejected = async (sql, pattern = /permission denied|FORBIDDEN|NOT_ALLOWED|PROOF_REQUIRED|TRIGGER_ONLY|AUTH_REQUIRED/) =>
    assert.rejects(db.exec(sql), pattern);
  const events = async (user, type) => Number(await value("select count(*) from public.xp_events where user_id='" + user + "' and event_type='" + type + "'"));
  try {
    await db.exec(fixture);
    await db.exec(v1a);
    await db.exec(migration);
    await db.exec(migration);
    console.log('PASS SQL: complete migration applied twice on production-shaped schema');
    await db.exec("insert into auth.users(id,email) values ('" + A + "','a@test.invalid'),('" + B + "','b@test.invalid'); insert into public.profiles(id,email,username) values ('" + A + "','a@test.invalid','A'),('" + B + "','b@test.invalid','B')");
    await as('anon');
    await rejected("select public.add_user_xp('" + B + "','anything',999999,'fake')");
    await rejected("select public.award_xp('" + B + "','activity_added','fake')");
    await rejected('select public.refresh_own_badges()');
    await rejected('select public.ensure_daily_session_for_date(current_date)');
    await as('authenticated', A);
    await rejected("select public.add_user_xp('" + B + "','fake',-999999,'fake')");
    await rejected("select public.award_xp('" + B + "','challenge_joined','fake')");
    await rejected("insert into public.xp_events(user_id,event_type,xp_amount) values ('" + A + "','fake',999999)");
    await rejected("insert into public.user_xp_events(user_id,event_type,xp_amount) values ('" + A + "','fake',999999)");
    await rejected("insert into public.user_badges(user_id,badge_code) values ('" + A + "','invented')");
    await rejected("select public.grant_user_badge('" + B + "','first_activity')");
    await rejected("select public.grant_user_badge('" + A + "','invented')");
    await rejected('select public.ensure_daily_session_for_date(current_date+100)', /DAILY_DATE_NOT_ALLOWED/);
    await rejected("select public.refresh_user_badges('" + B + "')");
    await rejected("select public.request_xp_reward('invented','" + randomUUID() + "')");
    await rejected("select public.request_xp_reward('activity_added','" + randomUUID() + "')");
    await rejected("select public.request_xp_reward('session_completed','" + randomUUID() + "')");
    assert.equal((await reward('challenge_completed', randomUUID())).awarded, false);
    console.log('PASS abuse: anon/A/B, free/negative XP, fake ledger/badges, missing proof and internal RPCs blocked');

    const activity = randomUUID();
    await db.exec("insert into public.activities(id,user_id,sport,source) values ('" + activity + "','" + A + "','Marche','live')");
    assert.equal(await events(A, 'activity_added'), 1);
    await db.exec("insert into public.activities(id,user_id,sport,source) values ('" + activity + "','" + A + "','Marche','live') on conflict(id) do nothing");
    assert.equal(await events(A, 'activity_added'), 1);
    const badges = await value('select public.refresh_own_badges()');
    assert.ok(badges.awarded.includes('first_activity'));
    assert.ok(!badges.badges.includes('hundred_activities'));
    assert.deepEqual((await value('select public.refresh_own_badges()')).awarded, []);
    const challenge = randomUUID();
    await db.exec("insert into public.challenges(id,name,created_by,visibility,invite_code,is_public) values ('" + challenge + "','Public','" + A + "','community','public-test',true)");
    assert.equal(await events(A, 'challenge_created'), 1);
    await db.exec("insert into public.activities(user_id,challenge_id,sport,source) values ('" + A + "','" + challenge + "','Marche','manual')");
    await as('authenticated', B);
    await db.exec("insert into public.challenge_participants(user_id,challenge_id) values ('" + B + "','" + challenge + "')");
    assert.equal((await reward('challenge_joined', challenge)).awarded, true);
    assert.equal((await reward('challenge_joined', challenge)).awarded, false);
    // Owner A's standalone live is private even when its UUID is known.
    await rejected("insert into public.activity_interactions(user_id,activity_id,type) values ('" + B + "','" + activity + "','like')", /row-level security|FORBIDDEN/);
    const sharedActivity = await value("select id from public.activities where challenge_id='" + challenge + "' limit 1");
    await db.exec("insert into public.activity_interactions(user_id,activity_id,type) values ('" + B + "','" + sharedActivity + "','like')");
    await owner();
    assert.equal(await events(A, 'like_received'), 1);
    assert.equal(await events(B, 'like_received'), 0);
    await as('authenticated', B);
    await db.exec("delete from public.activity_interactions where activity_id='" + sharedActivity + "'; insert into public.activity_interactions(user_id,activity_id,type) values ('" + B + "','" + sharedActivity + "','like')");
    await owner();
    assert.equal(await events(A, 'like_received'), 1);
    // Distinct visible activities exercise the recipient's daily caps.
    for (let i = 0; i < 22; i++) {
      const id = randomUUID();
      await db.exec("alter table public.activities disable trigger trg_award_xp_on_activity_created; insert into public.activities(id,user_id,challenge_id,source) values ('" + id + "','" + A + "','" + challenge + "','manual'); alter table public.activities enable trigger trg_award_xp_on_activity_created");
      await as('authenticated', B);
      await db.exec("insert into public.activity_interactions(user_id,activity_id,type) values ('" + B + "','" + id + "','like'),('" + B + "','" + id + "','boost')");
      await owner();
    }
    assert.equal(await events(A, 'like_received'), 20);
    assert.equal(await events(A, 'boost_received'), 10);
    console.log('PASS reaction caps: 20 like XP / 30 boost XP; no self/foreign-private reward');
    console.log('PASS activity/live/retry, challenge create/join, recipient derivation, private activity, reaction farming, badge criteria/idempotence');

    await as('authenticated', A);
    for (let i = 0; i < 5; i++) await db.exec("insert into public.activities(user_id,sport,source) values ('" + A + "','Marche','live')");
    assert.equal(await events(A, 'activity_added'), 4);
    for (let i = 0; i < 3; i++) await db.exec("insert into public.challenges(name,created_by,visibility,invite_code) values ('Cap','" + A + "','community','cap-" + i + "')");
    assert.equal(await events(A, 'challenge_created'), 2);
    await owner();
    const legacyActivity = randomUUID();
    await db.exec("insert into public.xp_events(user_id,event_type,xp_amount,target_id) values ('" + B + "','activity_created',25,'" + legacyActivity + "')");
    await as('authenticated', B);
    await db.exec("insert into public.activities(id,user_id,source) values ('" + legacyActivity + "','" + B + "','live')");
    assert.equal(await events(B, 'activity_added'), 0);
    console.log('PASS creation caps and legacy activity alias deduplication');

    const session = randomUUID(), history = randomUUID(), program = randomUUID(), ps = randomUUID(), daily = randomUUID();
    await as('authenticated', A);
    await db.exec("insert into public.training_sessions(id,user_id,name,visibility) values ('" + session + "','" + A + "','Workout','public')");
    // PGlite queues connections: this verifies API-level concurrent replay,
    // not PostgreSQL multi-connection lock contention.
    const concurrent = await Promise.all([reward('session_created', session), reward('session_created', session)]);
    assert.equal(concurrent.filter(r => r.awarded).length, 1);
    await db.query("insert into public.workout_sessions_history(id,user_id,workout_id,run_key,metadata) values ($1,$2,$3,$4,$5)", [history,A,session,randomUUID(),JSON.stringify({ actual_sets: [
      { block_id: randomUUID(), block_name: 'Pompes', block_type: 'reps', status: 'completed', actual_reps: 12, actual_charge_kg: 0 },
      { block_name: 'Skipped', status: 'skipped' },
    ] })]);
    assert.equal((await reward('session_completed', history)).awarded, true);
    assert.equal((await reward('workout_completed', history)).awarded, false);
    const emptyHistory = randomUUID();
    await db.query("insert into public.workout_sessions_history(id,user_id,workout_id,metadata) values ($1,$2,$3,$4)", [emptyHistory,A,session,JSON.stringify({actual_sets:[{status:'completed',block_type:'reps',planned_reps:10}]})]);
    await rejected("select public.request_xp_reward('session_completed','" + emptyHistory + "')");
    assert.ok(!(await value('select public.refresh_own_badges()')).badges.includes('five_sessions_completed'));
    await db.exec("insert into public.training_programs(id,user_id,name,visibility) values ('" + program + "','" + A + "','Program','shared'); insert into public.training_program_sessions(id,program_id,session_id) values ('" + ps + "','" + program + "','" + session + "')");
    assert.equal((await reward('program_created', program)).awarded, true);
    assert.equal((await reward('program_shared', program)).awarded, true);
    await db.exec("update public.training_programs set visibility='private' where id='" + program + "'; update public.training_programs set visibility='shared' where id='" + program + "'");
    assert.equal((await reward('program_shared', program)).awarded, false);
    await rejected("select public.request_xp_reward('program_completed','" + program + "')");
    await db.exec("insert into public.training_program_completions(user_id,program_id,program_session_id,session_id,workout_history_id) values ('" + A + "','" + program + "','" + ps + "','" + session + "','" + history + "')");
    assert.equal((await reward('program_completed', program)).awarded, true);
    assert.equal((await reward('program_completed', program)).awarded, false);
    await owner();
    await db.exec("insert into public.daily_sessions(id,session_id,scheduled_for,bonus_xp) values ('" + daily + "','" + session + "',current_date,25)");
    await as('authenticated', A);
    await db.exec("insert into public.daily_session_completions(user_id,daily_session_id,session_id,workout_history_id,scheduled_for) values ('" + A + "','" + daily + "','" + session + "','" + history + "',current_date)");
    assert.equal((await reward('daily_session_completed', daily)).awarded, true);
    assert.equal((await reward('daily_session_completed', daily)).awarded, false);
    assert.equal(await value("select public.v1b_on_local_day('2026-10-03 23:30+00','2026-10-04')"), true);
    assert.equal(await value("select public.v1b_on_local_day('2026-10-01 23:30+00','2026-10-04')"), false);
    await as('authenticated', B);
    await rejected("select public.request_xp_reward('session_completed','" + history + "')");
    assert.equal(await value("select public.v1b_completed_workout('" + history + "','" + A + "')"), false);
    await rejected("insert into public.daily_session_completions(user_id,daily_session_id,session_id,workout_history_id,scheduled_for) values ('" + B + "','" + daily + "','" + session + "','" + history + "',current_date)", /row-level security/);
    console.log('PASS partial workout, real snapshot, session/program/daily rewards, retries and cross-owner evidence blocked');

    await owner();
    await rejected("select public.grant_user_badge('" + A + "','invented')", /BADGE_NOT_ALLOWED/);
    await db.exec("insert into public.user_badges(user_id,badge_code) values ('" + B + "','premier_pas')");
    await as('authenticated', B);
    assert.ok(!(await value('select public.refresh_own_badges()')).awarded.includes('first_activity'));
    await owner();
    assert.equal(await events(B, 'activity_created'), 1);
    const category = randomUUID(), mastery = randomUUID(), workoutMastery = randomUUID();
    await db.exec("insert into public.mastery_categories(id,slug,name) values ('" + category + "','test','Test'); insert into public.masteries(id,category_id,slug,name,measurement_type,unit) values ('" + mastery + "','" + category + "','marche','Marche','distance','km'),('" + workoutMastery + "','" + category + "','test-pompes','Pompes','reps','reps'); insert into public.mastery_levels(mastery_id,level,threshold,xp_reward) values ('" + mastery + "',1,1,5),('" + workoutMastery + "',1,10,5); insert into public.mastery_exercise_links(mastery_id,exercise_key,exercise_name,source_type) values ('" + workoutMastery + "','pompes','Pompes','alias')");
    await as('authenticated', A);
    const run = randomUUID();
    await db.exec("insert into public.activities(id,user_id,source,sport,distance_km) values ('" + run + "','" + A + "','live','Marche',2)");
    const progress = await value("select public.process_activity_masteries('" + run + "')");
    assert.equal(progress.xp_awarded_total, 5);
    assert.equal((await value("select public.process_activity_masteries('" + run + "')")).xp_awarded_total, 0);
    assert.equal((await value("select public.process_workout_masteries('" + history + "')")).xp_awarded_total, 5);
    assert.equal((await value("select public.process_workout_masteries('" + history + "')")).xp_awarded_total, 0);
    await owner();
    assert.equal(await events(A, 'mastery_level_up'), 2);
    // A has no pre-patch history: all new awards update ledger and profile exactly once.
    assert.equal(Number(await value("select total_xp from public.profiles where id='" + A + "'")), Number(await value("select sum(xp_amount) from public.xp_events where user_id='" + A + "'")));
    console.log('PASS canonical legacy badges, activity/workout mastery unlocks and XP; future ledger/profile increments coherent');
    await as('authenticated', B);
    const privateChallenge = randomUUID();
    await db.exec("insert into public.challenges(id,name,created_by,invite_code) values ('" + privateChallenge + "','Private','" + B + "','private-test')");
    await as('authenticated', A);
    await db.exec("select public.join_challenge_by_invite_code('private-test')");
    await db.exec("select public.join_challenge_by_invite('private-test')");
    await owner();
    assert.equal(Number(await value("select count(*) from public.xp_events where user_id='" + A + "' and event_type='challenge_joined' and target_id='" + privateChallenge + "'")), 1);
    console.log('PASS private invitation + compatibility wrapper: internal reward still works, no retry bonus');
  } finally { await db.close(); }

  const rollback = new PGlite();
  try {
    await rollback.exec(fixture); await rollback.exec(v1a);
    await assert.rejects(rollback.exec(migration.replace(/commit;\s*$/, 'select 1/0; commit;')), /division by zero/);
    await rollback.exec('rollback');
    assert.equal((await rollback.query("select to_regprocedure('public.request_xp_reward(text,text)')::text f")).rows[0].f, null);
    assert.equal((await rollback.query("select has_function_privilege('anon','public.add_user_xp(uuid,text,integer,text)','EXECUTE') permitted")).rows[0].permitted, true);
    console.log('PASS late failure rolls back the entire migration');
    await rollback.exec('alter table public.daily_sessions alter column bonus_xp type numeric');
    await assert.rejects(rollback.exec(migration), /V1B_TYPE_MISMATCH/);
    await rollback.exec('rollback');
    assert.equal((await rollback.query("select to_regprocedure('public.request_xp_reward(text,text)')::text f")).rows[0].f, null);
    console.log('PASS production-type divergence rejected before protections change');
  } finally { await rollback.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
