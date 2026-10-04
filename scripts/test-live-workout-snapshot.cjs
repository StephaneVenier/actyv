const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const moduleContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/live-workout-snapshot.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, moduleContext);
const { normalizeLiveSetPerformances } = moduleContext.exports;
const page = fs.readFileSync('app/sessions/[id]/live/page.tsx', 'utf8');
const start = page.indexOf('      const finalSetPerformanceByKey =');
const end = page.indexOf('      const completedSetPerformances =', start);
assert.ok(start > 0 && end > start);
const finalize = new Function('setPerformances', 'blocks', 'performanceDraftsByBlockId',
  'normalizeLiveSetPerformances', 'getSetPerformanceKey', 'createDefaultLivePerformanceDraft',
  'getLivePerformanceDraftLines', 'getLivePerformanceDraftTotalSets', 'safeTrimText',
  'getLivePerformanceLineForSetNumber', 'normalizeNonNegativeNumber',
  ts.transpile(page.slice(start, end), { target: ts.ScriptTarget.ES2020 }) + '\nreturn finalSetPerformances;');
const block = { id: 'press', name: 'Presse inclinee', exercise_id: 'exercise', block_type: 'reps', sets_count: 4 };
const row = { block_id: 'press', block_name: 'Presse inclinee', exercise_id: 'exercise',
  block_type: 'reps', set_number: 1, line_number: 1, planned_reps: 8, actual_reps: 8,
  planned_charge_kg: 80, actual_charge_kg: 80, planned_value: null, actual_value: null,
  actual_text: null, status: 'completed' };
function finish(rows, currentBlock = block) {
  return finalize(rows, [currentBlock], {}, normalizeLiveSetPerformances,
    entry => `${entry.block_id}:${entry.set_number}`, () => ({}),
    () => Array.from({ length: 4 }, () => ({ targetValue: 8, chargeKg: 80 })),
    () => 4, value => value.trim(), (lines, number) => ({ line: lines[number - 1], lineIndex: number - 1 }),
    value => Math.max(Number(value) || 0, 0));
}
const volume = rows => rows.filter(entry => entry.status === 'completed')
  .reduce((sum, entry) => sum + (entry.actual_reps || 0) * (entry.actual_charge_kg || 0), 0);

const one = finish([row]);
assert.deepEqual(one.map(entry => entry.status), ['completed', 'skipped', 'skipped', 'skipped']);
assert.equal(one[0].block_type, 'reps');
assert.equal(volume(one), 640);
const two = finish([row, { ...row, set_number: 2, line_number: 2, actual_reps: 6, actual_charge_kg: 90 }]);
assert.equal(volume(two), 1180);
const restored = normalizeLiveSetPerformances(JSON.parse(JSON.stringify([row])), [block]);
assert.equal(restored[0].block_type, 'reps');
assert.equal(restored[0].line_number, 1);
assert.equal(restored[0].exercise_id, 'exercise');
assert.equal(restored[0].actual_charge_kg, 80);
assert.equal(finish(restored)[1].status, 'skipped');
for (const type of ['duration', 'distance', 'free']) {
  const timed = { ...row, block_type: type, actual_reps: null, actual_charge_kg: null,
    planned_value: 90, actual_value: 75, actual_text: type === 'free' ? 'Real note' : null };
  const result = normalizeLiveSetPerformances(JSON.parse(JSON.stringify([timed])), [{ ...block, block_type: type }]);
  assert.equal(result[0].block_type, type);
  assert.equal(result[0].actual_value, 75);
  assert.equal(result[0].actual_text, timed.actual_text);
}
const legacy = normalizeLiveSetPerformances([{ ...row, block_type: null, actual_reps: null }], [block]);
assert.equal(legacy[0].block_type, 'reps');
assert.equal(legacy[0].actual_reps, null);
const skipped = normalizeLiveSetPerformances([{ ...row, status: 'skipped' }], [block]);
assert.equal(skipped[0].actual_reps, null);
assert.equal(skipped[0].actual_charge_kg, null);
assert.equal(volume(finish(skipped)), 0);
assert.equal(finish([]).filter(entry => entry.status === 'completed').length, 0);
assert.equal(normalizeLiveSetPerformances([row, { ...row, status: 'skipped' }], [block]).length, 1);

const guardStart = page.indexOf('    if (!currentBlock || !canValidateCurrentBlock) return;');
const guardEnd = page.indexOf('    triggerHaptic(18);', guardStart);
const validate = new Function('currentBlock', 'canValidateCurrentBlock', 'currentActivePerformanceLine', 'lastValidatedSeriesRef',
  page.slice(guardStart, guardEnd) + '\nreturn true;');
const lock = { current: null };
assert.equal(validate(block, true, { id: 'first' }, lock), true);
assert.equal(validate(block, true, { id: 'first' }, lock), undefined);
assert.equal(validate(block, false, { id: 'second' }, lock), undefined);
assert.equal(validate(block, true, { id: 'second' }, lock), true);
console.log('PASS A-F: one/two sets, restoration, duration/distance/free, skipped excluded, missing actual values preserved.');
console.log('PASS: repeated validation and resting guard; one record per set; no fabricated completion.');
