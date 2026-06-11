export function formatPercent(value: number | null | undefined, options?: { maximumFractionDigits?: number }) {
  const normalizedValue = Number(value);

  if (!Number.isFinite(normalizedValue)) {
    return '0 %';
  }

  const maximumFractionDigits = options?.maximumFractionDigits ?? 1;
  const formatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });

  return `${formatter.format(normalizedValue)} %`;
}
