const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const page = fs.readFileSync('app/sessions/[id]/live/page.tsx', 'utf8');
const ast = ts.createSourceFile('live.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
let persistEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('completedSetsByBlockId: sanitizedCompletedSetsByBlockId')) {
    persistEffect = node.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function load(file) {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const series = load('lib/live-workout-series.ts');
const { normalizeLiveSetPerformances } = load('lib/live-workout-snapshot.ts');
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the actual page handlers with synchronous React setter equivalents.
function harness(type = 'reps', count = 3) {
  const block = { id: 'block', name: 'Press', block_type: type, sets_count: count,
    target_value: 10, charge_kg: 50, rest_seconds: 0, exercise_id: 'exercise' };
  const ctx = vm.createContext({ ...series, normalizeLiveSetPerformances, console, Math, Date,
    normalizeSessionSetsCount: n => Math.max(Number(n) || 1, 1),
    currentBlock: block, blocks: [block], currentIndex: 0,
    performanceDraftsByBlockId: {}, actualPerformanceDraftsByBlockId: {}, setPerformances: [],
    completedBlockIds: [], skippedBlockIds: [], completedSetsByBlockId: {},
    historySaved: false, saveState: 'idle', lastValidatedSeriesRef: { current: null },
    exerciseBlockId: null, exerciseSecondsLeft: 0, awaitingExerciseCompletion: false,
    openPerformanceLineIndex: null, isTimerPaused: false, isResting: false, isFinishReviewVisible: false,
    actualPerformanceCarryForwardByBlockId: {}, restAfterBlockId: null, restResumeIndex: null,
    restTotalSeconds: 60, restSecondsLeft: 60, elapsedSeconds: 0, finishReviewOpen: false,
    startedSeriesKey: null, runKey: 'stable-run', storageReady: true, authUserId: 'owner', liveStorageKey: 'owned-key',
    triggerHaptic() {}, beginRest() {}, setFinishReviewOpen() {},
    DEFAULT_REST_SECONDS: 60,
  });
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      vm.runInContext(ts.transpile(node.getText(ast)), ctx);
    }
  }
  for (const key of ['performanceDraftsByBlockId', 'actualPerformanceDraftsByBlockId', 'setPerformances',
    'completedBlockIds', 'skippedBlockIds', 'completedSetsByBlockId', 'openPerformanceLineIndex', 'startedSeriesKey',
    'exerciseBlockId', 'exerciseSecondsLeft', 'awaitingExerciseCompletion', 'isTimerPaused', 'validationFeedback',
    'restAfterBlockId', 'restResumeIndex', 'restTotalSeconds', 'restSecondsLeft']) {
    ctx['set' + key[0].toUpperCase() + key.slice(1)] = value => { ctx[key] = typeof value === 'function' ? value(ctx[key]) : value; };
  }
  for (const name of ['clearRestState', 'clearExerciseState', 'updateCurrentPerformanceLine', 'updateCurrentPerformanceLineAt',
    'addCurrentPerformanceLine', 'duplicateCurrentPerformanceLine', 'removeCurrentPerformanceLine',
    'resetCurrentPerformanceDraft', 'applyCurrentPerformanceToRemainingSets', 'upsertSetPerformanceEntries',
    'completeCurrentExercise', 'handleUncheckSeries', 'handleValidateCurrent', 'handleStartCurrentSeries']) {
    vm.runInContext(ts.transpile(`globalThis.${name} = ${declarations.get(name)};`), ctx);
  }
  ctx.performanceDraftsByBlockId.block = ctx.createDefaultLivePerformanceDraft(block);
  function render() {
    ctx.currentLivePerformanceDraft = ctx.performanceDraftsByBlockId.block;
    ctx.currentLivePerformanceLines = ctx.getLivePerformanceDraftLines(ctx.currentLivePerformanceDraft, block);
    ctx.currentLiveBlockSetsTotal = ctx.currentLivePerformanceLines.length;
    ctx.setPerformances = series.reconcileLiveSeries(ctx.setPerformances, block.id, ctx.currentLivePerformanceLines);
    ctx.currentCompletedSets = ctx.setPerformances.filter(row => row.status === 'completed').length;
    ctx.completedSetsByBlockId = { block: ctx.currentCompletedSets };
    ctx.completedBlockIds = ctx.currentCompletedSets === ctx.currentLiveBlockSetsTotal ? ['block'] : [];
    ctx.resolvedBlockIds = [...ctx.completedBlockIds, ...ctx.skippedBlockIds];
    ctx.isExerciseSwitchLocked = Boolean(ctx.exerciseBlockId) || ctx.isResting;
    ctx.currentPhase = ctx.isResting ? 'resting' : ctx.isTimerPaused ? 'paused' : ctx.exerciseBlockId ? 'exercising' : 'ready';
    for (const name of ['firstPendingLineIndex', 'timedLineIndex', 'selectedPendingLineIndex', 'activeLineIndex', 'currentSeriesKey', 'isSeriesStarted', 'isExercising',
      'currentActivePerformanceLineIndex', 'currentActivePerformanceLine', 'currentActualReps', 'currentActualChargeKg',
      'currentActualText', 'canValidateCurrentBlock', 'canAdjustCurrentPerformance']) {
      vm.runInContext(ts.transpile(`globalThis.${name} = ${declarations.get(name)};`), ctx);
    }
    ctx.isDurationBlock = type === 'duration';
    ctx.usesSetBySetValidation = ctx.currentLiveBlockSetsTotal > 1;
    ctx.currentLineRestSeconds = 0;
  }
  ctx.isDurationBlock = type === 'duration';
  render();
  function invoke(name, ...args) { ctx[name](...args); render(); }
  function restore() {
    let stored;
    ctx.window = { localStorage: { setItem(key, value) { assert.equal(key, 'owned-key'); stored = JSON.parse(value); } } };
    vm.runInContext(ts.transpile(`globalThis.persist = ${persistEffect};`), ctx);
    for (let attempt = 0; attempt < 8 && !stored; attempt++) ctx.persist();
    assert.ok(stored, 'actual persistence effect must reach the localStorage write');
    assert.equal(stored.completedSetsByBlockId.block, ctx.currentCompletedSets);
    assert.equal(stored.ownerUserId, 'owner');
    ctx.performanceDraftsByBlockId = { block: ctx.normalizeLivePerformanceDraft(stored.performanceDraftsByBlockId.block, block) };
    ctx.setPerformances = normalizeLiveSetPerformances(stored.setPerformances, stored.blocks);
    render();
    assert.equal(stored.runKey, 'stable-run');
  }
  return { ctx, invoke, render, restore };
}

const h = harness();
h.invoke('addCurrentPerformanceLine');
assert.equal(h.ctx.currentLiveBlockSetsTotal, 4);
h.ctx.openPerformanceLineIndex = 0;
h.render();
const performances = [[10, 50], [8, 55], [7, 55], [9, 50]];
performances.forEach(([reps, charge]) => {
  h.invoke('updateCurrentPerformanceLine', { targetValue: reps, chargeKg: charge });
  h.invoke('handleValidateCurrent');
});
assert.equal(h.ctx.currentCompletedSets, 4);
h.invoke('handleValidateCurrent');
assert.equal(h.ctx.setPerformances.length, 4);
h.restore();
assert.equal(h.ctx.currentLiveBlockSetsTotal, 4);
assert.equal(h.ctx.currentCompletedSets, 4);
assert.deepEqual(plain(h.ctx.setPerformances.map(r => [r.actual_reps, r.actual_charge_kg])), performances);
assert.equal(h.ctx.setPerformances.reduce((sum, r) => sum + r.actual_reps * r.actual_charge_kg, 0), 1775);
console.log('PASS 1/6: added fourth set, independent values, completed once, refresh and exact volume');

const removed = harness('reps', 4);
removed.invoke('removeCurrentPerformanceLine', 1);
removed.restore();
assert.equal(removed.ctx.currentLiveBlockSetsTotal, 3);
removed.invoke('removeCurrentPerformanceLine', 1);
removed.invoke('removeCurrentPerformanceLine', 1);
removed.restore();
assert.equal(removed.ctx.currentLiveBlockSetsTotal, 1);
console.log('PASS 2: removed pending sets never expand back to planned count, including one remaining');

const checked = harness();
checked.invoke('updateCurrentPerformanceLine', { targetValue: 8, chargeKg: 55 });
checked.invoke('handleValidateCurrent');
checked.invoke('updateCurrentPerformanceLineAt', 0, { targetValue: 999 });
assert.equal(checked.ctx.currentLivePerformanceLines[0].targetValue, 8);
checked.invoke('removeCurrentPerformanceLine', 0);
assert.equal(checked.ctx.currentLiveBlockSetsTotal, 3);
assert.equal(checked.ctx.setPerformances.length, 1);
checked.invoke('handleUncheckSeries', 0);
checked.restore();
assert.equal(checked.ctx.setPerformances.length, 0);
assert.equal(checked.ctx.currentLivePerformanceLines[0].chargeKg, 55);
checked.invoke('updateCurrentPerformanceLine', { targetValue: 7, chargeKg: 57.5 });
checked.invoke('handleValidateCurrent');
checked.restore();
assert.equal(checked.ctx.setPerformances.length, 1);
assert.equal(checked.ctx.setPerformances[0].actual_reps, 7);
assert.equal(checked.ctx.setPerformances[0].actual_charge_kg, 57.5);
console.log('PASS 3/4/5: uncheck, edit, revalidate, refresh; completed editing/removal refused');

const neighbour = harness();
neighbour.ctx.openPerformanceLineIndex = 2;
neighbour.render();
neighbour.invoke('updateCurrentPerformanceLine', { targetValue: 6, chargeKg: 70 });
neighbour.invoke('handleValidateCurrent');
const identity = neighbour.ctx.setPerformances[0].live_line_id;
neighbour.invoke('removeCurrentPerformanceLine', 0);
neighbour.restore();
assert.equal(neighbour.ctx.setPerformances[0].live_line_id, identity);
assert.equal(neighbour.ctx.setPerformances[0].set_number, 2);
assert.equal(neighbour.ctx.setPerformances[0].actual_charge_kg, 70);
neighbour.invoke('handleUncheckSeries', 1);
assert.equal(neighbour.ctx.setPerformances.length, 0);
console.log('PASS identity: deleting a neighbour cannot attach a captured performance to another line');

const legacy = harness();
legacy.ctx.openPerformanceLineIndex = 1;
legacy.render();
legacy.invoke('handleValidateCurrent');
delete legacy.ctx.setPerformances[0].live_line_id;
legacy.invoke('removeCurrentPerformanceLine', 0);
legacy.restore();
assert.equal(legacy.ctx.setPerformances[0].set_number, 1);
assert.equal(legacy.ctx.setPerformances[0].live_line_id, legacy.ctx.currentLivePerformanceLines[0].id);
console.log('PASS legacy: positional performance adopted before deletion, stable identity restored');

const duration = harness('duration', 2);
duration.invoke('updateCurrentPerformanceLine', { targetValue: 45 });
duration.invoke('handleStartCurrentSeries');
assert.equal(duration.ctx.exerciseSecondsLeft, 45);
duration.invoke('updateCurrentPerformanceLine', { targetValue: 90 });
duration.invoke('updateCurrentPerformanceLineAt', 0, { targetValue: 90 });
assert.equal(duration.ctx.currentLivePerformanceLines[0].targetValue, 45);
duration.ctx.isTimerPaused = true;
duration.render();
duration.invoke('updateCurrentPerformanceLine', { targetValue: 90 });
duration.invoke('handleValidateCurrent');
assert.equal(duration.ctx.setPerformances.length, 0);
assert.equal(duration.ctx.currentLivePerformanceLines[0].targetValue, 45);
duration.invoke('clearExerciseState');
duration.invoke('updateCurrentPerformanceLine', { targetValue: 60 });
duration.invoke('handleStartCurrentSeries');
assert.equal(duration.ctx.exerciseSecondsLeft, 60);
duration.ctx.exerciseBlockId = null;
duration.ctx.exerciseSecondsLeft = 0;
duration.ctx.awaitingExerciseCompletion = true;
duration.render();
duration.invoke('handleValidateCurrent');
assert.equal(duration.ctx.setPerformances[0].actual_value, 60);
console.log('PASS 7/8: modified duration launches correctly; running/paused target locked; reset and validation');

const futureTimer = harness('duration');
futureTimer.ctx.openPerformanceLineIndex = 2;
futureTimer.render();
futureTimer.invoke('updateCurrentPerformanceLine', { targetValue: 75 });
futureTimer.invoke('handleStartCurrentSeries');
futureTimer.ctx.openPerformanceLineIndex = null;
futureTimer.restore();
assert.equal(futureTimer.ctx.currentActivePerformanceLineIndex, 2);
assert.equal(futureTimer.ctx.currentActualReps, 75);
assert.equal(futureTimer.ctx.isExercising, true);
futureTimer.ctx.startedSeriesKey = 'block:2';
futureTimer.restore();
assert.equal(futureTimer.ctx.isExercising, true);
console.log('PASS timer restore: selected future series retains its target/identity; legacy timer key remains resumable');

for (const type of ['reps', 'duration', 'distance', 'free']) {
  const typed = harness(type);
  typed.invoke('updateCurrentPerformanceLine', { targetValue: 75, note: 'Performed note' });
  typed.invoke('handleValidateCurrent');
  typed.invoke('handleUncheckSeries', 0);
  typed.invoke('updateCurrentPerformanceLine', { targetValue: 80, note: 'Updated note' });
  typed.invoke('handleValidateCurrent');
  typed.restore();
  assert.equal(typed.ctx.setPerformances.length, 1);
  const row = typed.ctx.setPerformances[0];
  assert.equal(row.status, 'completed');
  if (type === 'free') assert.equal(row.actual_text, 'Updated note');
  else assert.equal(type === 'reps' ? row.actual_reps : row.actual_value, 80);
}
const start = page.indexOf('      const finalSetPerformanceByKey =');
const end = page.indexOf('      const completedSetPerformances =', start);
checked.invoke('addCurrentPerformanceLine');
checked.invoke('removeCurrentPerformanceLine', 3);
checked.invoke('handleValidateCurrent');
checked.invoke('handleUncheckSeries', 2);
checked.ctx.blocks.push({ ...checked.ctx.currentBlock, id: 'unperformed', name: 'Not performed', sets_count: 1 });
vm.runInContext(ts.transpile(page.slice(start, end)) + '; globalThis.finalRows = finalSetPerformances;', checked.ctx);
assert.equal(checked.ctx.finalRows.filter(r => r.status === 'completed').length, 1);
assert.equal(checked.ctx.finalRows.filter(r => r.status === 'skipped').length, 3);
assert.equal(checked.ctx.finalRows[0].actual_charge_kg, 57.5);
assert.equal(checked.ctx.finalRows.find(r => r.block_id === 'unperformed').status, 'skipped');
console.log('PASS 9/types: partial finalization uses only explicit completed performances, reps/duration/distance/free retained');

assert.doesNotMatch(page, /Math\.max\(currentBlockSetsTotal, currentLivePerformanceTotalSets\)/);
assert.match(page, /completedSetsByBlockId: sanitizedCompletedSetsByBlockId/);
assert.match(page, /reconcileLiveSeries\(sanitizedSetPerformances/);
assert.match(page, /live_line_id: currentActivePerformanceLine\.id/);
console.log('PASS integration: stable identity in page snapshots and validation, no planned-count clamp');
