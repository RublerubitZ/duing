/** YYYY-MM-DD 형식 endDate 와 today 의 d-Day 표기. */
export function computeDday(endDate: string, today: Date): string {
  const end = new Date(`${endDate}T00:00:00`);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((end.getTime() - todayMidnight.getTime()) / 86_400_000);
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}
