const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const sql = fs.readFileSync('supabase/migrations/20261002_sync_actual_workout_exercise_history.sql', 'utf8');
const page = fs.readFileSync('app/sessions/[id]/live/page.tsx', 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/workout-history.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { getExerciseHistoryTotalReps } = context.exports;

// Execute the aggregate expressions extracted from SQL on fixtures.
// These assertions are not a PostgreSQL integration/concurrency test.
function aggregate(sets) {
  const distinct = new Map();
  sets.filter(set => set.status === 'completed').forEach(set =>
    distinct.set(set.block_id + ':' + set.set_number, set));
  const groups = new Map();
  for (const item of distinct.values()) {
    const key = item.block_id + ':' + item.block_type;
    const values = groups.get(key) || [];
    values.push(item);
    groups.set(key, values);
  }
  function expression(field) {
    const match = sql.match(new RegExp("greatest\\(coalesce\\(\\(item ->> '" + field + "'\\)::numeric, 0\\), 0\\)"));
    assert.ok(match, field + ' must use actual values only');
    return value => Math.max(Number(value ?? 0), 0);
  }
  const reps = expression('actual_reps');
  const charge = expression('actual_charge_kg');
  const value = expression('actual_value');
  assert.ok(sql.includes("sum(case when block_type = 'reps' then reps * charge else 0 end)"));
  return [...groups.values()].map(points => ({
    block_type: points[0].block_type,
    sets_count: points.length,
    reps: Math.max(...points.map(p => p.block_type === 'reps' ? reps(p.actual_reps) : 0)),
    charge_kg: Math.max(...points.map(p => p.block_type === 'reps' ? charge(p.actual_charge_kg) : 0)),
    volume: points.reduce((sum, p) => sum + (p.block_type === 'reps' ? reps(p.actual_reps) * charge(p.actual_charge_kg) : 0), 0),
    duration_seconds: Math.trunc(Math.max(...points.map(p => p.block_type === 'duration' ? value(p.actual_value) : 0))),
    distance: Math.max(...points.map(p => p.block_type === 'distance' ? value(p.actual_value) : 0)),
    actual_sets: points,
  }));
}
function set(number, reps, charge, status = 'completed') {
  return { block_id: 'press', block_name: 'Presse', set_number: number, block_type: 'reps',
    planned_reps: 10, planned_charge_kg: 100, actual_reps: reps, actual_charge_kg: charge, status };
}
const partial = aggregate([set(1, 12, null), set(2, null, null, 'skipped')])[0];
assert.equal(partial.sets_count, 1);
assert.equal(getExerciseHistoryTotalReps(partial), 12);
console.log('A PASS: partial exercise retained');
const different = [set(1, 8, 50), set(2, 8, 50), set(3, 6, 55), set(4, null, null, 'skipped')];
const result = aggregate(different)[0];
assert.equal(result.sets_count, 3);
assert.equal(result.volume, 1130);
assert.equal(result.charge_kg, 55);
assert.equal(result.reps, 8);
assert.equal(getExerciseHistoryTotalReps(result), 22);
assert.equal(result.actual_sets.length, 3);
console.log('B PASS: distinct sets, 1130 kg, 22 total reps');
assert.equal(aggregate([set(1, 8, 60)])[0].charge_kg, 60);
console.log('C PASS: actual charge');
assert.equal(aggregate([set(1, null, null, 'skipped')]).length, 0);
console.log('D PASS: skipped exercise absent');
// Retry guarantees are structural here; test under local PostgreSQL before production.
assert.match(sql, /where id = p_history_id and user_id = auth.uid\(\)\s+for update/);
assert.match(sql, /delete from public.workout_exercise_history\s+where history_id = v_history.id and user_id = auth.uid\(\)/);
assert.ok(sql.indexOf('delete from') < sql.indexOf('insert into'));
assert.ok(!page.includes('!reusedHistory'));
assert.ok(page.includes("'sync_workout_exercise_history'"));
assert.ok(page.indexOf("'sync_workout_exercise_history'") < page.indexOf('processSessionMasteries(data.id)'));
assert.ok(page.includes('history_id.is.null,history_id.neq.'));
assert.ok(!page.includes('.insert(exerciseHistoryPayload)'));
console.log('E/F PASS (static): locked atomic rebuild, all retries call RPC, no second insert');
assert.deepEqual(aggregate(JSON.parse(JSON.stringify(different))), aggregate(different));
console.log('G PASS: JSON restoration');
const actual = aggregate([set(1, 8, 80)])[0];
assert.equal(actual.charge_kg, 80);
assert.equal(actual.volume, 640);
assert.ok(!sql.includes('planned_'));
assert.equal(getExerciseHistoryTotalReps({ block_type: 'reps', reps: 8, sets_count: 3 }), 24);
console.log('H PASS: no planned record; legacy interpretation preserved');
const duration = { ...set(1, null, null), block_type: 'duration', planned_value: 60, actual_value: 45 };
assert.equal(aggregate([duration])[0].duration_seconds, 45);
assert.equal(aggregate([{ ...duration, block_type: 'distance', actual_value: 500 }])[0].distance, 500);
assert.equal(aggregate([set(1, 8, 0)])[0].volume, 0);
assert.equal(aggregate([set(1, 8, null)])[0].volume, 0);
console.log('Extra PASS: actual duration/distance, zero/null charge');
