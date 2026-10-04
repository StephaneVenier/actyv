const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const runtime = process.argv.find(arg => arg.startsWith('--runtime='))?.slice(10);
if (!runtime) throw new Error('Supply --runtime=<PGlite node_modules>');
const { PGlite } = require(path.resolve(runtime, '@electric-sql/pglite'));
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
async function main() {
  const db = new PGlite();
  const A = randomUUID(), B = randomUUID();
  const as = async (role, id) => {
    await db.exec('reset role; set role ' + role);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id})]);
  };
  const insert = (id, owner, visibility) => db.query(
    'insert into public.challenges(id,name,created_by,visibility,invite_code,is_deleted) values ($1,$2,$3,$4,$5,false) returning *',
    [id, 'Test', owner, visibility, id]);
  try {
    for (const file of ['scripts/fixtures/v1-1b-production.sql',
      'supabase/migrations/20261004_v1_1a_account_isolation.sql',
      'supabase/migrations/20261004_v1_1b_reward_integrity.sql']) await db.exec(read(file));
    for (const id of [A,B]) {
      await db.query('insert into auth.users(id,email) values ($1,$2)', [id,id+'@test.invalid']);
      await db.query('insert into public.profiles(id,email,username) values ($1,$2,$3)', [id,id+'@test.invalid',id]);
    }
    await as('authenticated', A);
    await assert.rejects(insert(randomUUID(),A,'private'), /row-level security/);
    console.log('PASS reproduction: own INSERT RETURNING rejected before hotfix');
    await db.exec('reset role');
    const fix = read('supabase/migrations/20261004_fix_challenge_insert_returning.sql');
    await db.exec(fix); await db.exec(fix);
    await as('authenticated', A);
    const privateId = randomUUID();
    assert.equal((await insert(privateId,A,'private')).rows[0].created_by,A);
    await insert(randomUUID(),A,'community');
    const xp = await db.query('select sum(xp_amount)::int amount,count(*)::int count from public.xp_events where user_id=$1 and event_type=$2',[A,'challenge_created']);
    assert.deepEqual(xp.rows[0], {amount:40,count:2});
    await assert.rejects(insert(privateId,A,'private'), /duplicate key/);
    assert.equal((await db.query('select total_xp from public.profiles where id=$1',[A])).rows[0].total_xp,40);
    await assert.rejects(insert(randomUUID(),B,'private'), /row-level security/);
    await as('authenticated', B);
    assert.equal((await db.query('select id from public.challenges where id=$1',[privateId])).rows.length,0);
    await db.query('select public.join_challenge_by_invite_code($1)',[privateId]);
    assert.equal((await db.query('select id from public.challenges where id=$1',[privateId])).rows.length,1);
    await db.query('select public.join_challenge_by_invite_code($1)',[privateId]);
    assert.equal((await db.query('select sum(xp_amount)::int amount from public.xp_events where user_id=$1',[B])).rows[0].amount,10);
    await as('anon',null);
    await assert.rejects(insert(randomUUID(),A,'community'), /permission denied|row-level security/);
    console.log('PASS double migration, private/community RETURNING, foreign/anon denial, exact XP, duplicate UUID rollback, private invitation/retry');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
