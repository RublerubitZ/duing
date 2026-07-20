'use client';

import { parseKstInstant } from '@duing/hooks';
import { crawlFreshnessLabel } from '../_lib/adminBookingDisplay';

// BE 신선도 TTL(10분)과 동일 — 크롤 연속 실패 시 crawledAt 이 늙어가므로 실패 은폐 없이 자연히 경고로 전환된다.
const FRESH_TTL_MS = 10 * 60_000;

/** 페이지 헤더 크롤 신선도 칩(개편 스펙 §1·A1) — 수집 시각이 없으면 렌더하지 않는다(폴백). */
export function CrawlFreshnessChip({ crawledAt }: { crawledAt?: string }) {
  if (crawledAt === undefined) return null;
  const now = new Date();
  const basis = parseKstInstant(crawledAt);
  if (Number.isNaN(basis.getTime())) return null;
  const stale = now.getTime() - basis.getTime() > FRESH_TTL_MS;
  return (
    <span
      title="학교 예약 데이터는 10분마다 자동 수집되고, 예약 상세를 열면 그 시점에 다시 수집합니다."
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
        stale ? 'border-coral/40 bg-coral/10 text-coral' : 'border-line bg-paper text-charcoal-3'
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-coral' : 'bg-ink'}`} />
      학교 데이터 {crawlFreshnessLabel(crawledAt, now)}
    </span>
  );
}
