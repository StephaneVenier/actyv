'use client';

import { renderMasteryCategoryIcon } from '@/components/MasteryIcon';
import type { MasterySportMetricVisual, MasteryVisualMetricKey, MasteryVisualSportKey } from '@/lib/mastery-visuals';

type MasterySportVisualProps = {
  visual: MasterySportMetricVisual;
  className?: string;
};

function SnowSvg() {
  return (
    <>
      <path d="M12 4v16" />
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
      <path d="M4 12h16" />
    </>
  );
}

function MountainSvg() {
  return (
    <>
      <path d="m4 18 5-7 3.2 4 3.1-6 4.7 9" />
      <path d="M10.5 11.5 12 9l1.4 2.3" />
    </>
  );
}

function CompassSvg() {
  return (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="m9.5 14.5 2-5 3 1-5 4Z" />
    </>
  );
}

function BallSvg() {
  return (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M8.5 8.5 12 6l3.5 2.5-1.4 4.1H9.9L8.5 8.5Z" />
      <path d="m9.9 12.6-1.2 4" />
      <path d="m14.1 12.6 1.2 4" />
      <path d="M12 6v3.6" />
    </>
  );
}

function RacketSvg() {
  return (
    <>
      <ellipse cx="11" cy="10" rx="5.5" ry="6.5" />
      <path d="m14.7 14.7 4 4" />
      <path d="M8.6 7.4h4.8" />
      <path d="M8.6 10h4.8" />
      <path d="M8.6 12.6h4.8" />
      <path d="M9.6 5.3v9.4" />
      <path d="M12.4 5.3v9.4" />
    </>
  );
}

function CombatSvg() {
  return (
    <>
      <path d="M8 10.5c0-2.4 1.6-4 4-4s4 1.6 4 4v2.2c0 2.4-1.7 4.3-4 4.3-2.5 0-4-1.7-4-4.3v-2.2Z" />
      <path d="M10 6.8V5.4c0-.8.7-1.4 1.5-1.4h1c.8 0 1.5.6 1.5 1.4v1.4" />
      <path d="M9 11.5h6" />
    </>
  );
}

function WavesSvg() {
  return (
    <>
      <path d="M4 10c1.3 1 2.7 1 4 0 1.3-1 2.7-1 4 0 1.3 1 2.7 1 4 0 1.3-1 2.7-1 4 0" />
      <path d="M4 15c1.3 1 2.7 1 4 0 1.3-1 2.7-1 4 0 1.3 1 2.7 1 4 0 1.3-1 2.7-1 4 0" />
    </>
  );
}

function TriathlonSvg() {
  return (
    <>
      <path d="M4 16c1.2 1 2.3 1 3.5 0 1.2-1 2.3-1 3.5 0" />
      <path d="M14 18h4" />
      <path d="M15 18a2.5 2.5 0 1 1 5 0" />
      <circle cx="10" cy="6.5" r="1.2" />
      <path d="M8.5 15.5 11 11l2.4 1.2 1.8 3.3" />
    </>
  );
}

function RunningSvg() {
  return renderMasteryCategoryIcon('course-a-pied');
}

function TrailSvg() {
  return renderMasteryCategoryIcon('trail');
}

function WalkingSvg() {
  return renderMasteryCategoryIcon('marche');
}

function CyclingSvg() {
  return renderMasteryCategoryIcon('velo');
}

function SwimmingSvg() {
  return renderMasteryCategoryIcon('natation');
}

function FitnessSvg() {
  return renderMasteryCategoryIcon('fitness');
}

function getSportGlyph(sport: MasteryVisualSportKey) {
  switch (sport) {
    case 'RUNNING':
      return RunningSvg;
    case 'TRAIL':
      return TrailSvg;
    case 'WALKING':
      return WalkingSvg;
    case 'CYCLING':
      return CyclingSvg;
    case 'SWIMMING':
      return SwimmingSvg;
    case 'SNOW':
      return SnowSvg;
    case 'CLIMBING':
      return MountainSvg;
    case 'ORIENTEERING':
      return CompassSvg;
    case 'BALL':
      return BallSvg;
    case 'RACKET':
      return RacketSvg;
    case 'COMBAT':
      return CombatSvg;
    case 'WATER':
      return WavesSvg;
    case 'TRIATHLON':
      return TriathlonSvg;
    case 'FITNESS':
      return FitnessSvg;
    default:
      return RunningSvg;
  }
}

function DistanceSvg() {
  return (
    <>
      <circle cx="6" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <path d="M7.5 16c2.5-1.4 5.2-4 9-7.5" />
    </>
  );
}

function DurationSvg() {
  return (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 12V8.5" />
      <path d="M12 4v1.5" />
    </>
  );
}

function ElevationSvg() {
  return (
    <>
      <path d="m4 18 5-7 3 4 3-6 5 9" />
      <path d="M14 6h4" />
      <path d="M16 4l2 2-2 2" />
    </>
  );
}

function OutingSvg() {
  return (
    <>
      <path d="M7 19V5" />
      <path d="M8 6h8l-1.6 3L16 12H8Z" />
    </>
  );
}

function StepsSvg() {
  return (
    <>
      <path d="M9.5 15.5c1.2 0 2.1-1.3 2.1-2.9 0-1.6-.9-2.9-2.1-2.9-1.1 0-2.1 1.3-2.1 2.9 0 1.6 1 2.9 2.1 2.9Z" />
      <path d="M15.7 18.6c1.3 0 2.3-1.4 2.3-3.2 0-1.8-1-3.2-2.3-3.2s-2.3 1.4-2.3 3.2c0 1.8 1 3.2 2.3 3.2Z" />
    </>
  );
}

function MatchSvg() {
  return (
    <>
      <path d="M7 7h10v4.2c0 3-2.2 5.6-5 6.3-2.8-.7-5-3.3-5-6.3V7Z" />
      <path d="M10 4h4" />
    </>
  );
}

function FrequencySvg() {
  return (
    <>
      <rect x="5" y="6" width="14" height="12" rx="2.5" />
      <path d="M8 4v4" />
      <path d="M16 4v4" />
      <path d="M5 10h14" />
    </>
  );
}

function RoundsSvg() {
  return (
    <>
      <circle cx="9" cy="12" r="4.5" />
      <circle cx="15" cy="12" r="4.5" />
    </>
  );
}

function EventSvg() {
  return (
    <>
      <path d="M12 5.5 13.8 9l3.9.6-2.8 2.7.7 3.7-3.6-1.9-3.6 1.9.7-3.7-2.8-2.7 3.9-.6L12 5.5Z" />
    </>
  );
}

function getMetricGlyph(metric: MasteryVisualMetricKey) {
  switch (metric) {
    case 'DISTANCE':
      return DistanceSvg;
    case 'DURATION':
      return DurationSvg;
    case 'ELEVATION':
      return ElevationSvg;
    case 'OUTING':
      return OutingSvg;
    case 'STEPS':
      return StepsSvg;
    case 'MATCH':
      return MatchSvg;
    case 'FREQUENCY':
      return FrequencySvg;
    case 'ROUNDS':
      return RoundsSvg;
    case 'EVENT':
      return EventSvg;
    default:
      return FrequencySvg;
  }
}

function shouldUseMetricLabel(visual: MasterySportMetricVisual) {
  return visual.metric === 'MILESTONE' || visual.metric === 'COUNT';
}

export function MasterySportVisual({ visual, className }: MasterySportVisualProps) {
  const SportGlyph = getSportGlyph(visual.sport);
  const MetricGlyph = getMetricGlyph(visual.metric);
  const usesLabel = shouldUseMetricLabel(visual);

  return (
    <span
      className={`mastery-sport-visual mastery-sport-visual--${visual.sport.toLowerCase().replace(/_/g, '-')}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden="true"
    >
      <svg
        className="mastery-sport-visual__sport"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <SportGlyph />
      </svg>
      <span className="mastery-sport-visual__metric">
        {usesLabel && visual.label ? (
          <span className="mastery-sport-visual__metric-label">{visual.label}</span>
        ) : (
          <svg
            className="mastery-sport-visual__metric-glyph"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <MetricGlyph />
          </svg>
        )}
      </span>
    </span>
  );
}
