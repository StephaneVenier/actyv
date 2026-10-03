import type { FinishedLiveActivity, AcceptedGpsPoint } from '@/lib/live-tracking/types';

export type RouteCoordinate = [number, number]; // latitude, longitude
export type ActivityRouteTrace = {
  version: 1;
  segments: RouteCoordinate[][];
  point_count_original: number;
  point_count_stored: number;
  tolerance_m: number;
};
export const ROUTE_MAX_POINTS = 4000;
export const ROUTE_TOLERANCE_M = 5;
// Display only: never bridge a minute without an accepted GPS position.
export const ROUTE_MAX_GAP_MS = 60000;

function validCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Iterative Douglas-Peucker avoids stack overflow on long or zigzag routes.
export function simplifyRouteSegment(points: RouteCoordinate[], toleranceM: number): RouteCoordinate[] {
  if (points.length <= 2) return points.slice();
  const keep = new Set([0, points.length - 1]);
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const origin = points[0], scale = Math.cos(origin[0] * Math.PI / 180);
  const projected = points.map(p => [(((p[1] - origin[1] + 540) % 360) - 180) * 111195 * scale,
    (p[0] - origin[0]) * 111195]);
  let evaluations = 0;
  const workBudget = Math.max(100000, points.length * 1024);
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maximum = toleranceM ** 2, index = -1;
    const a = projected[first], b = projected[last], bx = b[0] - a[0], by = b[1] - a[1];
    const lengthSquared = bx * bx + by * by;
    for (let i = first + 1; i < last; i++) {
      // Worst-case zigzags are quadratic: retry at a coarser tolerance instead of blocking finish.
      if (++evaluations > workBudget) return points.slice();
      const px = projected[i][0] - a[0], py = projected[i][1] - a[1];
      const ratio = lengthSquared ? (px * bx + py * by) / lengthSquared : 0;
      const t = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
      const dx = px - t * bx, dy = py - t * by, d = dx * dx + dy * dy;
      if (d > maximum) { maximum = d; index = i; }
    }
    if (index !== -1) { keep.add(index); stack.push([first, index], [index, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

export function buildActivityRoute(snapshot: FinishedLiveActivity): ActivityRouteTrace | null {
  const segments: RouteCoordinate[][] = [];
  let current: RouteCoordinate[] = [], previous: AcceptedGpsPoint | null = null;
  const intervals = [...(snapshot.state.pausePeriods || []), ...(snapshot.state.collectionGaps || [])];
  const flush = () => { if (current.length) segments.push(current); current = []; previous = null; };
  for (const point of snapshot.state.acceptedPoints) {
    if (!validCoordinate(point.latitude, point.longitude) || !Number.isFinite(point.timestamp) ||
        point.timestamp < snapshot.startedAtMs || point.timestamp > snapshot.finishedAtMs ||
        point.trackingPaused || intervals.some(p => point.timestamp > p.startedAtMs &&
          (p.endedAtMs == null || point.timestamp < p.endedAtMs))) { flush(); continue; }
    if (previous && (point.timestamp <= previous.timestamp || point.timestamp - previous.timestamp > ROUTE_MAX_GAP_MS ||
        point.segmentDistanceM === 0 || intervals.some(p => previous!.timestamp <= p.startedAtMs && point.timestamp >= p.startedAtMs))) flush();
    current.push([point.latitude, point.longitude]); previous = point;
  }
  flush();
  if (!segments.length) return null;
  // More mandatory endpoints than the budget: omit the map rather than merge or truncate segments.
  if (segments.reduce((n, s) => n + Math.min(2, s.length), 0) > ROUTE_MAX_POINTS) return null;
  let tolerance = ROUTE_TOLERANCE_M, simplified = segments;
  do {
    simplified = segments.map(s => simplifyRouteSegment(s, tolerance));
    if (simplified.reduce((n, s) => n + s.length, 0) <= ROUTE_MAX_POINTS) break;
    tolerance *= 2;
  } while (tolerance < 100000000);
  return { version: 1, segments: simplified,
    point_count_original: segments.reduce((n, s) => n + s.length, 0),
    point_count_stored: simplified.reduce((n, s) => n + s.length, 0), tolerance_m: tolerance };
}

export function readActivityRoute(source: string | null, challengeId: string | null, value: unknown): ActivityRouteTrace | null {
  if (source !== 'live' || challengeId != null || !value || typeof value !== 'object') return null;
  const trace = value as ActivityRouteTrace;
  if (trace.version !== 1 || !Array.isArray(trace.segments) || trace.segments.length > ROUTE_MAX_POINTS) return null;
  let count = 0;
  for (const segment of trace.segments) {
    if (!Array.isArray(segment) || !segment.length) return null;
    count += segment.length;
    if (count > ROUTE_MAX_POINTS || segment.some(p => !Array.isArray(p) || p.length !== 2 || !validCoordinate(p[0], p[1]))) return null;
  }
  return count ? trace : null;
}

export function intervalDurationMs(intervals: Array<{ startedAtMs: number; endedAtMs: number | null }> | undefined,
  start: number, end: number): number | null {
  if (!intervals) return null;
  const sorted = intervals.map(p => [Math.max(start, p.startedAtMs), Math.min(end, p.endedAtMs ?? end)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  let duration = 0, last = start;
  for (const [a, b] of sorted) { duration += Math.max(0, b - Math.max(a, last)); last = Math.max(last, b); }
  return duration;
}
