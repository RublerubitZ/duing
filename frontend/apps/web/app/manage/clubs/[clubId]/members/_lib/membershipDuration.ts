// 가입일부터 기준 시각까지의 가입 기간을 한국어로 표기한다.
// now 를 주입받아 테스트를 결정적으로 만든다. 월 경계는 UTC 기준으로 계산해
// 실행 환경 타임존(로컬 KST / CI·prod UTC)에 흔들리지 않게 한다.
export function formatMembershipDuration(joinedAt: string, now: Date): string {
  const joined = new Date(joinedAt);

  let totalMonths =
    (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - joined.getUTCMonth());
  // 아직 그 달의 가입일에 도달하지 못했으면 한 달을 뺀다(예: 1/20 가입, 2/10 기준 → 0개월).
  if (now.getUTCDate() < joined.getUTCDate()) totalMonths -= 1;

  if (totalMonths <= 0) return '이번 달 가입';

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}개월`;
  if (months === 0) return `${years}년`;
  return `${years}년 ${months}개월`;
}
