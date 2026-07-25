import { parseKstInstant, todayKstDateString } from '@duing/hooks';

// KST(Asia/Seoul) 프레임의 y/m/d 를 뽑는다. BE joinedAt 은 Instant(…Z)라, UTC getter 로 계산하면
// KST 새벽(00~09시) 가입이 전날/전달로 밀려 같은 패널의 가입일(formatDateKst) 표기와 어긋난다.
// 레포의 KST 유틸(parseKstInstant→todayKstDateString == kstDateString)을 재사용해 달력 기준을 맞춘다.
function kstParts(date: Date): { year: number; month: number; day: number } {
  // todayKstDateString 은 항상 'YYYY-MM-DD' 를 반환한다.
  const parts = todayKstDateString(date).split('-');
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

// 가입일부터 기준 시각까지의 가입 기간을 한국어로 표기한다. now 를 주입받아 테스트를 결정적으로 만든다.
export function formatMembershipDuration(joinedAt: string, now: Date): string {
  const joined = kstParts(parseKstInstant(joinedAt));
  const current = kstParts(now);

  let totalMonths = (current.year - joined.year) * 12 + (current.month - joined.month);
  // 아직 그 달의 가입일에 도달하지 못했으면 한 달을 뺀다(예: 1/20 가입, 2/10 기준 → 0개월).
  if (current.day < joined.day) totalMonths -= 1;

  if (totalMonths <= 0) return '이번 달 가입';

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}개월`;
  if (months === 0) return `${years}년`;
  return `${years}년 ${months}개월`;
}
