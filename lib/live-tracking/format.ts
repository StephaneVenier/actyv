export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDistanceKm(distanceM: number) {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

export function formatPace(secondsPerKm: number | null) {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return '--:-- /km';
  }

  const totalSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

export function formatSpeedKmh(speedKmh: number | null) {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0) {
    return '--.- km/h';
  }

  return `${speedKmh.toFixed(1)} km/h`;
}

export function formatElevation(elevationM: number) {
  const roundedValue = Math.max(0, Math.round(elevationM));
  return `+${roundedValue} m`;
}

