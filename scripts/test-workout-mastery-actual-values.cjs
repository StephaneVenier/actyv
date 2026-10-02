const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const page = fs.readFileSync('app/sessions/[id]/live/page.tsx', 'utf8');
const migrationPath = 'supabase/migrations/20261002_use_actual_workout_mastery_values.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const previous = fs.readFileSync('supabase/migrations/20260819_fix_workout_mastery_uuid_aggregation.sql', 'utf8');
const expected = previous.replace('coalesce(raw_rows.actual_reps, raw_rows.planned_reps, 0)', 'coalesce(raw_rows.actual_reps, 0)')
  .replace('coalesce(raw_rows.actual_value, raw_rows.planned_value, 0)', 'coalesce(raw_rows.actual_value, 0)')
  .replace("sum(case when completed_rows.block_type = 'distance' then completed_rows.numeric_value else 0 end) as total_distance_km,",
    "-- Live block distances are meters; the existing value helper expects kilometers.\n      sum(case when completed_rows.block_type = 'distance' then completed_rows.numeric_value / 1000.0 else 0 end) as total_distance_km,");
assert.equal(sql.replace(/\r\n/g, '\n').trim(), expected.replace(/\r\n/g, '\n').trim());
assert.match(sql, /where raw_rows.status = 'completed'/);
const coalesce = (...values) => values.find(value => value != null);
const greatest = Math.max;
// Evaluate the actual arithmetic expressions extracted from the SQL, not a second formula.
const repsExpression = sql.match(/(greatest\(coalesce\(raw_rows.actual_reps[^\n]+) as reps_value/)[1];
const valueExpression = sql.match(/(greatest\(coalesce\(raw_rows.actual_value[^\n]+) as numeric_value/)[1];
const distanceExpression = sql.match(/then (completed_rows.numeric_value \/ [0-9.]+) else 0 end\) as total_distance_km/)[1];
const reps = new Function('raw_rows', 'coalesce', 'greatest', `return ${repsExpression};`);
const value = new Function('raw_rows', 'coalesce', 'greatest', `return ${valueExpression};`);
const distance = new Function('completed_rows', `return ${distanceExpression};`);
function actual(row) {
  if (row.status !== 'completed') return { reps: 0, volume: 0, distance: 0, seconds: 0 };
  const r = reps(row, coalesce, greatest);
  const v = value(row, coalesce, greatest);
  return { reps: r, volume: row.actual_charge_kg == null ? 0 : r * row.actual_charge_kg,
    distance: distance({ numeric_value: v }), seconds: v };
}
const base = { status: 'completed', planned_reps: 10, planned_charge_kg: 40, planned_value: 1000 };
assert.equal(actual({ ...base, actual_reps: 8, actual_charge_kg: 45 }).volume, 360);
assert.equal(actual({ ...base, planned_reps: 8, planned_charge_kg: 50, actual_reps: 8, actual_charge_kg: 60 }).volume, 480);
assert.equal(actual({ ...base, actual_reps: 8, actual_charge_kg: null }).volume, 0);
assert.equal(actual({ ...base, actual_value: 500 }).distance, 0.5);
assert.equal(actual({ ...base, planned_value: 60, actual_value: 45 }).seconds, 45);
assert.equal(actual({ ...base, status: 'skipped', actual_reps: 8, actual_charge_kg: 45 }).volume, 0);
assert.equal(actual({ ...base, actual_reps: 0, actual_charge_kg: 0, actual_value: 0 }).volume, 0);
assert.equal(actual({ ...base, actual_value: null }).seconds, 0);
assert.equal(actual({ ...base, actual_reps: null, actual_charge_kg: 50 }).volume, 0);
const real = { ...base, actual_reps: 8, actual_charge_kg: 45, actual_value: 500 };
assert.deepEqual(actual(JSON.parse(JSON.stringify(real))), actual(real));

const accessorStart = page.indexOf('  const currentActualReps =');
const accessorEnd = page.indexOf('  const currentActualText =', accessorStart);
const access = new Function('currentBlock', 'currentActivePerformanceLine', 'normalizePositiveInteger', 'normalizeNonNegativeNumber',
  ts.transpile(page.slice(accessorStart, accessorEnd), { target: ts.ScriptTarget.ES2020 }) + '\nreturn { currentActualReps, currentActualChargeKg };');
const normalize = number => Math.max(Number(number), 0);
const block = { id: 'block', name: 'Press', block_type: 'reps', target_value: 10, charge_kg: 40 };
assert.deepEqual(access(block, { targetValue: null, chargeKg: null }, normalize, normalize),
  { currentActualReps: null, currentActualChargeKg: null });
assert.deepEqual(access(block, { targetValue: 0, chargeKg: 0 }, normalize, normalize),
  { currentActualReps: 0, currentActualChargeKg: 0 });
const validationStart = page.indexOf('    if (!currentBlock || !canValidateCurrentBlock) return;');
const validationEnd = page.indexOf('    if (usesSetBySetValidation)', validationStart);
const validate = new Function('currentBlock', 'canValidateCurrentBlock', 'currentCompletedSets', 'lastValidatedSeriesRef',
  'triggerHaptic', 'setStartedSeriesKey', 'setValidationFeedback', 'usesSetBySetValidation', 'currentLiveBlockSetsTotal',
  'getPlannedReps', 'getPlannedChargeKg', 'currentActualReps', 'currentActualChargeKg', 'currentActivePerformanceLineIndex',
  'safeTrimText', 'currentIndex', 'currentActivePerformanceLine', 'upsertSetPerformanceEntries',
  ts.transpile(page.slice(validationStart, validationEnd), { target: ts.ScriptTarget.ES2020 }));
let captured;
validate(block, true, 0, { current: null }, () => {}, () => {}, () => {}, true, 4,
  b => b.target_value, b => b.charge_kg, 8, 0, 0, text => text.trim(), 0, {}, rows => { captured = rows[0]; });
assert.equal(captured.actual_charge_kg, 0);
assert.equal(captured.actual_reps, 8);
assert.equal(captured.planned_charge_kg, 40);
console.log('PASS A-H: actual-only values, missing data, meters conversion, duration, skipped, zero and restoration.');
console.log('PASS: frontend null/zero and validated snapshot; migration differs only in the three audited SQL expressions.');
console.log('SQL arithmetic checked locally; no PostgreSQL execution or Supabase write.');
