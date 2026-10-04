const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {randomUUID} = require('node:crypto');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function moduleFrom(file, requireModule=()=>({}), extras={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,require:requireModule,URL,console,Date,JSON,...extras});
  return exports;
}
const navigation=moduleFrom('lib/auth-navigation.ts');
for(const bad of ['//evil.example','https://evil.example','javascript:alert(1)','/\\evil.example','/%2f%2fevil.example','/%5cevil.example','/%00','/%ZZ'])assert.equal(navigation.safeLocalRedirect(bad),'/');
assert.equal(navigation.safeLocalRedirect('/historique?month=10'),'/historique?month=10');
const storage=moduleFrom('lib/account-storage.ts');
const map=new Map();
const local={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),key:i=>[...map.keys()][i],get length(){return map.size;}};
for(const kind of ['live','completed']){
  const key=storage.workoutStorageKey(kind,'A','S');
  local.setItem(key,JSON.stringify({ownerUserId:'A',runKey:'A-run',completedBlockIds:['set']}));
  assert.equal(storage.readOwnedSnapshot(local,key,'B'),null);
  assert.equal(storage.readOwnedSnapshot(local,storage.workoutStorageKey(kind,'B','S'),'B'),null);
  assert.equal(storage.readOwnedSnapshot(local,key,'A').runKey,'A-run');
}
local.setItem('actyv.session.live.S',JSON.stringify({runKey:'legacy'}));
assert.equal(storage.readOwnedSnapshot(local,'actyv.session.live.S','B'),null);
local.setItem('actyv-live-tracking-v1',JSON.stringify({state:{ownerUserId:'A',acceptedPoints:[{latitude:1}]}}));
local.setItem('actyv-live-activity-outbox-v1',JSON.stringify([{ownerUserId:'A'},{ownerUserId:'B'}]));
local.setItem(storage.workoutStorageKey('live','B','S'),JSON.stringify({ownerUserId:'B'}));
storage.purgeAccountStorage(local,'A');
assert.equal(local.getItem('actyv-live-tracking-v1'),null);
assert.deepEqual(JSON.parse(local.getItem('actyv-live-activity-outbox-v1')),[{ownerUserId:'B'}]);
assert.ok(local.getItem(storage.workoutStorageKey('live','B','S')));
local.setItem('test-auth',JSON.stringify({user:{id:'B'}}));
storage.purgeDeletedAuthStorage(local,'A','test-auth');
assert.equal(JSON.parse(local.getItem('test-auth')).user.id,'B');
local.setItem('test-auth',JSON.stringify({user:{id:'A'}}));
storage.purgeDeletedAuthStorage(local,'A','test-auth');
assert.equal(local.getItem('test-auth'),null);
console.log('PASS redirects; live/completed A/B isolation, ownerless rejection, A reconnect and owner-scoped purge');

async function testRecoveryPage(){
  for(const scenario of ['ordinary-session','recovery-event','expired','pkce']){
    const states=[];let handler;
    const react={useState(value){const index=states.push(value)-1;return [value,next=>{states[index]=next;}];},useEffect(effect){effect();}};
    const window={location:{hash:scenario==='expired'?'#error=access_denied':scenario==='ordinary-session'?'#type=recovery':'',search:scenario==='pkce'?'?code=valid':''},sessionStorage:{getItem:()=>null},history:{replaceState(){}}};
    const auth={onAuthStateChange(fn){handler=fn;return {data:{subscription:{unsubscribe(){}}}};},
      async getSession(){if(scenario==='recovery-event')handler('PASSWORD_RECOVERY');return {data:{session:{user:{id:'A'}}},error:null};},
      async exchangeCodeForSession(){return {data:{redirectType:'recovery'},error:null};}};
    const page=moduleFrom('app/reset-password/page.tsx',name=>name==='react'?react:name==='@/lib/supabase'?{supabase:{auth}}:name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}: {},{window,URLSearchParams});
    page.default();await new Promise(setImmediate);
    assert.equal(states[0],['recovery-event','pkce'].includes(scenario),scenario);
  }
  console.log('PASS actual recovery page: ordinary session/forged type rejected, PASSWORD_RECOVERY and PKCE accepted, expired link refused');
}

async function testOfflineAccountTransition(){
  const transitions=[];let handler;
  const react={useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:effect=>effect()};
  const shell=moduleFrom('components/AppShell.tsx',name=>name==='react'?react:
    name==='next/navigation'?{usePathname:()=>'/'}:
    name==='@/lib/account-lifecycle'?{isAccountTransitionInProgress:()=>false}:
    name==='@/lib/account-deletion'?{resumeAccountPurges:async()=>{}}:
    name==='@/lib/live-tracking/platform'?{liveTrackingPlatform:{transitionOwner:async owner=>transitions.push(owner)}}:
    name==='@/lib/supabase'?{supabase:{auth:{getUser:async()=>({data:{user:null},error:{name:'AuthRetryableFetchError'}}),
      onAuthStateChange(fn){handler=fn;return {data:{subscription:{unsubscribe(){}}}};}}}}:
    name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:{},
    {document:{addEventListener(){},removeEventListener(){}},window:{location:{pathname:'/',replace(){}}}});
  shell.AppShell({children:null});await new Promise(setImmediate);
  assert.deepEqual(transitions,[],'network failure must not stop native tracking');
  handler('SIGNED_OUT');await new Promise(setImmediate);
  assert.deepEqual(transitions,[null],'real logout must stop tracking');
  console.log('PASS actual AppShell: temporary offline Auth failure preserves tracking; SIGNED_OUT transitions native owner');
}

async function testPendingDeletionShell() {
  const states=[],calls=[];
  const shell=moduleFrom('components/AppShell.tsx',name=>name==='react'?{
    useState(value){const index=states.push(value)-1;return [value,next=>{states[index]=next;}];},useRef:value=>({current:value}),useEffect:fn=>fn()
  }:name==='next/navigation'?{usePathname:()=>'/'}:
    name==='@/lib/account-lifecycle'?{isAccountTransitionInProgress:()=>false}:
    name==='@/lib/account-deletion'?{resumeAccountPurges:async()=>{calls.push('purge-first');}}:
    name==='@/lib/live-tracking/platform'?{liveTrackingPlatform:{transitionOwner:async owner=>{assert.equal(owner,null);calls.push('stop');}}}:
    name==='@/lib/supabase'?{supabase:{auth:{getUser:async()=>({data:{user:{id:'A'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      rpc:async name=>{calls.push(name);assert.equal(name,'get_own_account_deletion_status');return {data:true,error:null};}}}:
    name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:{},
    {document:{addEventListener(){},removeEventListener(){}},window:{location:{pathname:'/',replace(){throw new Error('Unexpected redirect');}}}});
  shell.AppShell({children:'private Live'});await new Promise(setImmediate);
  assert.equal(states[1],false);
  assert.equal(states[2],'A');
  assert.deepEqual(calls,['purge-first','get_own_account_deletion_status','stop']);
  console.log('PASS pending-deletion AppShell: own Auth UUID without profile; purge first; no ensure/profile RPC; normal children blocked; finalization available');
}

async function testDeleteRoute(){
  for(const scenario of ['no-token','invalid','wrong-password','success','cleanup-failure','auth-failure','late-retry','other-account','foreign-proof']){
    const actions=[];
    const owner=['other-account','foreign-proof'].includes(scenario)?'B':'A';
    const pending=scenario==='late-retry';
    const client={auth:{getUser:async()=>({data:{user:scenario==='invalid'?null:{id:owner,email:owner+'@test.invalid'}},error:null}),
      signInWithPassword:async()=>{actions.push('password');return {data:{user:{id:owner}},error:scenario==='wrong-password'?{}:null};},signOut:async()=>({error:null})}};
    const admin={from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='account_deletion_state'&&pending?{user_id:owner}:table==='account_deletion_confirmations'&&scenario==='foreign-proof'?{user_id:'A'}:null,error:null}),
      insert:async row=>{assert.equal(row.user_id,owner);actions.push('proof');return {error:null};}};},
      rpc:async(name,args)=>{assert.equal(name,'cleanup_account_data');assert.equal(args.p_user_id,owner);actions.push('cleanup');return {error:scenario==='cleanup-failure'?{}:null};},
      auth:{admin:{deleteUser:async id=>{assert.equal(id,owner);actions.push('delete-auth');return {error:scenario==='auth-failure'?{}:null};}}}};
    const env={NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'};
    const api=moduleFrom('app/api/account/delete/route.ts',name=>name==='node:crypto'?require(name):name==='next/server'?{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}:
      {createClient:(_url,key)=>key==='server'?admin:client},{process:{env}});
    const result=await api.POST({headers:{get:()=>scenario==='no-token'?null:'Bearer new-token'},json:async()=>({password:pending?undefined:'secret',purgeProof:randomUUID(),user_id:'A'})});
    assert.equal(result.status,scenario==='no-token'||scenario==='invalid'?401:scenario==='wrong-password'?403:scenario==='foreign-proof'?409:['cleanup-failure','auth-failure'].includes(scenario)?503:200);
    if(scenario==='foreign-proof')assert.deepEqual(actions,['password']);
    if(pending)assert.deepEqual(actions,['proof','delete-auth']);
    if(scenario==='success')assert.deepEqual(actions,['password','proof','cleanup','delete-auth']);
    if(scenario==='cleanup-failure')assert.ok(!actions.includes('delete-auth'));
  }
  console.log('PASS delete endpoint: verified owner only; no ban; password first request; durable late retry without profile/password; Auth failure remains retryable');
  for (const confirmed of [false,true]) {
    const api=moduleFrom('app/api/account/delete/route.ts',name=>name==='node:crypto'?require(name):name==='next/server'?{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}:
      {createClient:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{user_id:confirmed?null:'A'},error:null})})})},
      {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'}}});
    const result=await api.GET({headers:{get:()=>randomUUID()}});
    assert.equal(result.body.confirmed,confirmed);
  }
}

async function testDurablePurge() {
  const owner='A',proof=randomUUID();
  storage.writeAccountPurgeMarker(local,{owner,proof,confirmed:false});
  local.setItem(storage.workoutStorageKey('live',owner,'S'),JSON.stringify({ownerUserId:owner}));
  let serverDeleted=false,failNative=false;const actions=[];
  function restart() {
    return moduleFrom('lib/account-deletion.ts',name=>name==='@/lib/account-storage'?storage:
      name==='@/lib/account-lifecycle'?{beginAccountTransition:()=>()=>{},purgeDeletedAccount:async id=>{
        assert.equal(id,owner);actions.push('purge');if(failNative)throw new Error('native purge failed');storage.purgeAccountStorage(local,id);
      }}:{},{window:{localStorage:local},fetch:async()=>({ok:true,json:async()=>({confirmed:serverDeleted})})});
  }
  await restart().resumeAccountPurges();
  assert.ok(local.getItem(storage.workoutStorageKey('live',owner,'S')),'No deletion before server confirmation');
  // Auth was deleted, but the response was lost and the process died.
  serverDeleted=true;failNative=true;
  await assert.rejects(restart().resumeAccountPurges(),/native purge failed/);
  assert.equal(storage.readAccountPurgeMarkers(local)[0].confirmed,true,'Persist confirmation before native purge');
  failNative=false;
  await restart().resumeAccountPurges();
  assert.equal(local.getItem(storage.workoutStorageKey('live',owner,'S')),null);
  assert.equal(storage.readAccountPurgeMarkers(local).length,0);
  assert.ok(local.getItem(storage.workoutStorageKey('live','B','S')));
  storage.writeAccountPurgeMarker(local,{owner,proof,confirmed:true});
  await restart().resumeAccountPurges();
  assert.equal(storage.readAccountPurgeMarkers(local).length,0,'Confirmed marker survives restart and replays idempotent purge');
  console.log('PASS durable purge: unconfirmed untouched; lost response; restart; failed native purge; marker retained; confirmed replay; B storage retained');
}

async function testUnavailableDailyPage() {
  const states=[],queries=[];
  const completion={id:'completion-B',scheduled_for:'2026-10-04'};
  const react={useState(value){const index=states.push(value)-1;return [value,next=>{states[index]=next;}];},useEffect(fn){fn();},useMemo:fn=>fn()};
  const page=moduleFrom('app/session-du-jour/page.tsx',name=>name==='react'?react:
    name==='@/lib/supabase'?{supabase:{auth:{getUser:async()=>({data:{user:{id:'B'}}})},from(table){queries.push(table);return {
      select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:[completion],error:null}),maybeSingle:async()=>({data:completion,error:null})};}}}:
    name==='@/lib/daily-sessions'?{getOrCreateDailySessionForDate:async()=>({dailySession:{id:'daily',session_id:null}}),getDailySessionStreakDays:()=>1,getBestDailySessionStreakDays:()=>1,isDailySessionForToday:()=>true}:
    name==='@/lib/session-blocks'?{getSessionEstimatedDuration:()=>0}:
    name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:{}) ;
  page.default();await new Promise(setImmediate);
  assert.equal(states[3],completion);
  assert.equal(states[7],'Seance indisponible.');
  assert.equal(states[6],false);
  assert.ok(!queries.includes('training_sessions'),'NULL source must never be queried');
  console.log('PASS actual daily page: NULL source, saved B completion retained, unavailable state, no source lookup/crash');
}

async function testSql(){
  const runtime=process.argv.find(arg=>arg.startsWith('--runtime='))?.slice(10);
  if(!runtime)throw new Error('Supply --runtime=<PGlite node_modules>');
  const {PGlite}=require(path.resolve(runtime,'@electric-sql/pglite'));
  const db=new PGlite();
  const schema=JSON.parse(read('scripts/fixtures/v1-2a-production-schema.json'));
  try{
    for(const file of ['scripts/fixtures/v1-1b-production.sql','supabase/migrations/20261004_v1_1a_account_isolation.sql',
      'supabase/migrations/20261004_v1_1b_reward_integrity.sql','supabase/migrations/20261004_fix_challenge_insert_returning.sql'])await db.exec(read(file));
    // Validate the reused SQL fixture against the CURRENT export, not assumptions.
    for(const table of schema.filter(t=>t.name.startsWith('public.'))){
      const rows=(await db.query('select attname column_name,format_type(atttypid,atttypmod) type,attnotnull not_null from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped',[table.name])).rows;
      assert.equal(rows.length,table.columns.length,table.name);
      for(const col of table.columns){
        const row=rows.find(row=>row.column_name===col.name);
        assert.ok(row,table.name+'.'+col.name);
        assert.equal(row.type,col.type,table.name+'.'+col.name+' type');
        assert.equal(row.not_null,col.not_null,table.name+'.'+col.name+' nullability');
      }
      const foreign=table.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY'));
      for(const fk of foreign){
        const found=(await db.query('select pg_get_constraintdef(oid) definition from pg_constraint where conrelid=$1::regclass and conname=$2',[table.name,fk.name])).rows[0];
        assert.equal(found?.definition.replaceAll('public.',''),fk.definition.replaceAll('public.',''),fk.name);
      }
    }
    const migration=read('supabase/migrations/20261004_v1_2a_account_cleanup.sql');
    await db.exec(migration);await db.exec(migration);
    const A=randomUUID(),B=randomUUID(),challenge=randomUUID();
    for(const user of [A,B]){
      await db.query('insert into auth.users(id,email) values ($1,$2)',[user,user+'@test.invalid']);
      await db.query('insert into public.profiles(id,email,username) values ($1,$2,$3)',[user,user+'@test.invalid',user]);
      await db.query('insert into public.activities(user_id,source,metadata) values ($1,$2,$3)',[user,'live',JSON.stringify({route_trace:{segments:[[1,2]]}})]);
      await db.query('insert into public.workout_sessions_history(user_id,workout_id,metadata) values ($1,$2,$3)',[user,randomUUID(),'{}']);
      await db.query('insert into public.user_badges(user_id,badge_code) values ($1,$2)',[user,'first_activity']);
    }
    await db.query('insert into public.challenges(id,name,created_by,visibility,invite_code) values ($1,$2,$3,$4,$5)',[challenge,'Collective',A,'community',challenge]);
    await db.query('insert into public.challenge_participants(challenge_id,user_id) values ($1,$2)',[challenge,B]);
    const sharedSession=randomUUID(),daily=randomUUID();
    await db.query('insert into public.training_sessions(id,user_id,name,visibility) values ($1,$2,$3,$4)',[sharedSession,A,'Shared daily source','public']);
    await db.query('insert into public.daily_sessions(id,session_id,scheduled_for) values ($1,$2,current_date)',[daily,sharedSession]);
    await db.query('insert into public.daily_session_completions(daily_session_id,user_id,scheduled_for) values ($1,$2,current_date)',[daily,B]);
    const legacyProgram=randomUUID(),legacySchedule=randomUUID();
    await db.query('insert into public.training_programs(id,user_id,name) values ($1,$2,$3)',[legacyProgram,A,'Legacy source']);
    await db.query('insert into public.training_program_sessions(id,program_id) values ($1,$2)',[legacySchedule,legacyProgram]);
    await db.query('insert into public.training_program_completions(user_id,program_id,program_session_id) values ($1,$2,$3)',[B,legacyProgram,legacySchedule]);
    assert.equal((await db.query('select count(*)::int count from public.daily_session_completions where user_id=$1',[B])).rows[0].count,1);
    await db.query('insert into public.activities(user_id,challenge_id,user_email,activity_name,metadata) values ($1,$2,$3,$4,$5)',[A,challenge,A+'@test.invalid','Private name',JSON.stringify({route_trace:{secret:1}})]);
    const as=async(role,id)=>{await db.exec('reset role; set role '+role);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id})]);};
    await as('authenticated',A);
    assert.equal((await db.query('select public.get_own_account_deletion_status() pending')).rows[0].pending,false);
    const liveProof=(await db.query('insert into public.activities(user_id,source) values ($1,$2) returning id',[A,'live'])).rows[0];
    await db.query('delete from public.activities where id=$1',[liveProof.id]);
    await assert.rejects(db.query('select public.cleanup_account_data($1)',[B]),/permission denied/);
    await assert.rejects(db.query('select * from public.account_deletion_state'),/permission denied/);
    await db.exec('reset role');
    await db.query('insert into public.account_deletion_confirmations(proof_hash,user_id) values ($1,$2)',['test-digest',A]);
    await db.query('select public.cleanup_account_data($1)',[A]);
    await as('authenticated',A);
    assert.equal((await db.query('select public.get_own_account_deletion_status() pending')).rows[0].pending,true);
    await assert.rejects(db.query('insert into public.activities(user_id,source) values ($1,$2)',[A,'live']),/ACCOUNT_DELETION_IN_PROGRESS/);
    await assert.rejects(db.query('select public.ensure_own_profile()'),/ACCOUNT_DELETION_IN_PROGRESS/);
    await as('authenticated',B);
    assert.equal((await db.query('select public.get_own_account_deletion_status() pending')).rows[0].pending,false);
    const retained=(await db.query('insert into public.activities(user_id,source) values ($1,$2) returning id',[B,'live'])).rows[0];
    await db.query('delete from public.activities where id=$1',[retained.id]);
    await as('anon',null);
    await assert.rejects(db.query('select public.cleanup_account_data($1)',[A]),/permission denied/);
    await db.exec('reset role');
    await db.query('select public.cleanup_account_data($1)',[A]);
    await db.query('select public.cleanup_account_data($1)',[A]);
    assert.equal((await db.query('select session_id from public.daily_sessions where id=$1',[daily])).rows[0].session_id,null);
    assert.equal((await db.query('select count(*)::int count from public.daily_session_completions where user_id=$1',[B])).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int count from public.training_sessions where id=$1',[sharedSession])).rows[0].count,0);
    assert.deepEqual((await db.query('select program_id,program_session_id from public.training_program_completions where user_id=$1',[B])).rows[0],{program_id:null,program_session_id:null});
    for(const table of ['profiles','activities','workout_sessions_history','xp_events','user_badges']){
      const column=table==='profiles'?'id':'user_id';
      assert.equal((await db.query(`select count(*)::int count from public.${table} where ${column}=$1`,[A])).rows[0].count,0);
      assert.ok((await db.query(`select count(*)::int count from public.${table} where ${column}=$1`,[B])).rows[0].count>0);
    }
    assert.equal((await db.query('select created_by from public.challenges where id=$1',[challenge])).rows[0].created_by,null);
    const contribution=(await db.query('select user_id,user_email,metadata,activity_name from public.activities where challenge_id=$1',[challenge])).rows[0];
    assert.deepEqual(contribution,{user_id:null,user_email:null,metadata:{},activity_name:null});
    assert.equal((await db.query('select count(*)::int count from public.challenge_participants where user_id=$1',[B])).rows[0].count,1);
    await db.query('delete from auth.users where id=$1',[A]);
    assert.equal((await db.query('select user_id from public.account_deletion_confirmations where proof_hash=$1',['test-digest'])).rows[0].user_id,null);
    assert.equal((await db.query('select count(*)::int count from public.account_deletion_state where user_id=$1',[A])).rows[0].count,0);
    await db.query('select public.cleanup_account_data($1)',[A]);
    await as('authenticated',A);
    await assert.rejects(db.query('select public.ensure_own_profile()'),/ACCOUNT_DELETION_IN_PROGRESS|AUTH_USER_MISSING|foreign key/);
    console.log('PASS current production schema/FKs; double migration; private cleanup/anon denial; personal GPS/data deletion; collective survival; B retained; retry');
  }finally{await db.close();}
}
(async()=>{await testRecoveryPage();await testOfflineAccountTransition();await testPendingDeletionShell();await testDeleteRoute();await testDurablePurge();await testUnavailableDailyPage();await testSql();})().catch(error=>{console.error(error);process.exitCode=1;});
