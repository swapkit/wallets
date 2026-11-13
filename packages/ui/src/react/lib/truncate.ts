export function truncateMiddle(value: string, { start = 6, end = 4 }: { start?: number; end?: number } = {}) {
  if (value.length <= start + end + 2) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}
