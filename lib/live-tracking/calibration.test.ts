import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialElevationState, updateElevation } from './elevation';
import { evaluateGpsPointSegment } from './filters';
import type { LiveGpsPoint } from './types';

const BASE_LATITUDE = 48.8566;
const BASE_LONGITUDE = 2.3522;

function offsetLongitudeByMeters(longitude: number, latitude: number, meters: number) {
  const metersPerDegree = 111320 * Math.cos((latitude * Math.PI) / 180);
  return longitude + meters / metersPerDegree;
}

function createPoint(overrides: Partial<LiveGpsPoint> = {}): LiveGpsPoint {
  return {
    latitude: BASE_LATITUDE,
    longitude: BASE_LONGITUDE,
    altitude: 100,
    accuracy: 10,
    altitudeAccuracy: 8,
    speed: null,
    heading: null,
    timestamp: 0,
    ...overrides,
  };
}

test('rejects walking drift segments that stay inside the accuracy envelope', () => {
  const previousPoint = createPoint({
    accuracy: 18,
    timestamp: 0,
  });
  const driftPoint = createPoint({
    accuracy: 18,
    longitude: offsetLongitudeByMeters(BASE_LONGITUDE, BASE_LATITUDE, 2.8),
    timestamp: 2000,
  });

  const result = evaluateGpsPointSegment(previousPoint, driftPoint, 'marche');

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'segment-too-small');
});

test('keeps meaningful walking movement when the segment is clearly larger than GPS noise', () => {
  const previousPoint = createPoint({
    accuracy: 18,
    timestamp: 0,
  });
  const movedPoint = createPoint({
    accuracy: 18,
    longitude: offsetLongitudeByMeters(BASE_LONGITUDE, BASE_LATITUDE, 5.2),
    timestamp: 2000,
  });

  const result = evaluateGpsPointSegment(previousPoint, movedPoint, 'marche');

  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'accepted');
  assert.ok(result.segmentDistanceM > 5);
});

test('ignores noisy altitude oscillations so they do not fabricate elevation gain', () => {
  const points = [100, 101.2, 99.6, 101.4, 99.8, 100.5, 99.9, 100.7].map((altitude, index) =>
    createPoint({
      altitude,
      altitudeAccuracy: 8,
      timestamp: index * 2000,
    })
  );

  const finalState = points.reduce(updateElevation, createInitialElevationState());

  assert.equal(finalState.totalGainM, 0);
  assert.equal(finalState.totalLossM, 0);
});

test('accumulates a steady climb without double-counting every noisy step', () => {
  const points = [100, 102, 104, 106, 108, 110, 112, 114].map((altitude, index) =>
    createPoint({
      altitude,
      altitudeAccuracy: 6,
      timestamp: index * 2000,
    })
  );

  const finalState = points.reduce(updateElevation, createInitialElevationState());

  assert.ok(finalState.totalGainM >= 11.5 && finalState.totalGainM <= 12.5);
  assert.equal(finalState.totalLossM, 0);
});

test('skips altitude spikes reported with poor altitude accuracy', () => {
  const points = [
    createPoint({ altitude: 100, altitudeAccuracy: 8, timestamp: 0 }),
    createPoint({ altitude: 118, altitudeAccuracy: 24, timestamp: 2000 }),
    createPoint({ altitude: 100.5, altitudeAccuracy: 8, timestamp: 4000 }),
  ];

  const finalState = points.reduce(updateElevation, createInitialElevationState());

  assert.equal(finalState.totalGainM, 0);
  assert.equal(finalState.totalLossM, 0);
});
