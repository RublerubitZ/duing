import { daysSinceKst, formatDateKst, formatRelativeTime, formatTimeKst } from '@duing/hooks';

import type { AdminJobHealth, AdminJobKey, AdminJobStatus } from '@duing/types';
import type { DashboardChipTone } from '@/components/dashboard/dashboardChipTone';

export const JOB_STATUS_CONTACT_GUIDE = '두잉 담당자에게 알려 주세요';

type JobPresentation = {
  name: string;
  /** daily = 매일 잡(KST "오늘 00:40"), frequent = 10분 잡(상대 시각 "8분 전") */
  cadence: 'daily' | 'frequent';
  /** 경고·꺼짐 줄에 붙는 업무 영향 */
  impact: string;
  /** 경고 줄에서 그동안 직접 할 수 있는 일 — 없으면 null */
  workaround: string | null;
  /** 정상 결과 — time 은 사람이 읽는 시각 문구 */
  okText: (time: string, count: number) => string;
  /** 일부 실패 덧붙임 */
  partialSuffix: (failedCount: number) => string;
};

const JOB_PRESENTATIONS: Record<AdminJobKey, JobPresentation> = {
  RECRUITMENT_AUTO_CLOSE: {
    name: '모집 자동 마감',
    cadence: 'daily',
    impact: '기간이 끝난 모집이 "모집 중"으로 남을 수 있어요',
    workaround: '모집 관리에서 직접 마감할 수 있어요',
    okText: (time, count) => (count > 0 ? `${time} · ${count}건 마감` : `${time} · 마감할 모집 없음`),
    partialSuffix: (failedCount) => ` · ${failedCount}건 실패`,
  },
  APPLICATION_PENDING_REMINDER: {
    name: '미처리 지원 리마인더',
    cadence: 'daily',
    impact: '7일 넘게 기다린 지원서를 운영진이 모를 수 있어요',
    workaround: null,
    okText: (time, count) => (count > 0 ? `${time} · 운영진 알림 ${count}건` : `${time} · 보낼 알림 없음`),
    partialSuffix: (failedCount) => ` · ${failedCount}건 실패`,
  },
  FACILITY_RESERVATION_CRAWL: {
    name: '학교 시설 예약 수집',
    cadence: 'frequent',
    impact: '시설 예약 현황이 최신이 아닐 수 있어요',
    workaround: null,
    okText: (time) => `${time} 수집 성공`,
    // 실패 시설 없이 일부 칸만 못 읽은 달도 일부 실패다(서버 결과는 상태로만 정한다)
    partialSuffix: (failedCount) => (failedCount > 0 ? ` · 시설 ${failedCount}곳 수집 실패` : ' · 일부 시설 정보를 읽지 못했어요'),
  },
  FACILITY_BOOKING_MATCHING: {
    name: '학교 반영 확인',
    cadence: 'frequent',
    impact: '학교 반영 대기가 자동으로 줄지 않아요',
    workaround: '시설 예약 관리에서 직접 확정할 수 있어요',
    // "확정할 예약 없음"이 아니다 — 바로 위 "학교 반영 대기 N건" 카드와 부딪치지 않게
    okText: (time, count) => (count > 0 ? `${time} · ${count}건 확정` : `${time} · 새로 확정한 예약 없음`),
    partialSuffix: () => ' · 일부 확인 못 함',
  },
  FEDERATION_INQUIRY_PURGE: {
    name: '문의 보관 기간 파기',
    cadence: 'daily',
    // 보관 기간(45일)은 서버 설정이라 숫자를 박지 않는다
    impact: '삭제된 문의 내용이 보관 기간을 넘겨 남아 있을 수 있어요',
    workaround: null,
    okText: (time, count) => (count > 0 ? `${time} · ${count}건 파기` : `${time} · 파기할 문의 없음`),
    partialSuffix: (failedCount) => ` · 첨부 ${failedCount}건 삭제 못 함`,
  },
};

const HEALTH_CHIPS: Record<AdminJobHealth, { label: string; tone: DashboardChipTone }> = {
  OK: { label: '정상', tone: 'info' },
  PARTIAL: { label: '일부 실패', tone: 'soon' },
  FAILED: { label: '실패', tone: 'late' },
  OVERDUE: { label: '늦음', tone: 'late' },
  NOT_YET: { label: '첫 실행 전', tone: 'info' },
  DISABLED: { label: '꺼짐', tone: 'info' },
};

// 응답의 job·health 는 string 이다(앞선 백엔드) — Map·Set 조회라 모르는 값은 자연스럽게 빠진다(fail-open).
const PRESENTATION_BY_JOB: ReadonlyMap<string, JobPresentation> = new Map(Object.entries(JOB_PRESENTATIONS));
const CHIP_BY_HEALTH: ReadonlyMap<string, { label: string; tone: DashboardChipTone }> = new Map(Object.entries(HEALTH_CHIPS));
const WARNING_HEALTHS: ReadonlySet<string> = new Set(['PARTIAL', 'FAILED', 'OVERDUE']);

export type JobStatusRow = {
  key: string;
  name: string;
  chip: { label: string; tone: DashboardChipTone } | null;
  isWarning: boolean;
  isDisabled: boolean;
  isNotYet: boolean;
  resultText: string;
  impact: string | null;
  workaround: string | null;
};

/** 매일 잡의 시각 — KST 날짜로 "오늘 00:40"·"어제 00:40"·"10월 28일 00:40". */
export function dailyRunTimeText(iso: string, now: Date): string {
  const time = formatTimeKst(iso);
  const daysAgo = daysSinceKst(iso, now);
  if (daysAgo === 0) return `오늘 ${time}`;
  if (daysAgo === 1) return `어제 ${time}`;
  const [, month, day] = formatDateKst(iso).split('.');
  return `${Number(month)}월 ${Number(day)}일 ${time}`;
}

function runTimeText(presentation: JobPresentation, iso: string, now: Date): string {
  return presentation.cadence === 'frequent' ? formatRelativeTime(iso, now) : dailyRunTimeText(iso, now);
}

function resultText(status: AdminJobStatus, presentation: JobPresentation, now: Date): string {
  const lastSuccessText = status.lastSucceededAt ? `마지막 성공 ${runTimeText(presentation, status.lastSucceededAt, now)}` : null;
  switch (status.health) {
    case 'NOT_YET':
      return '아직 실행 기록이 없어요';
    case 'DISABLED':
      return '두잉 담당자가 꺼 두었어요';
    case 'FAILED':
      return `마지막 실행 실패 · ${lastSuccessText ?? '성공 기록 없음'}`;
    case 'OVERDUE':
      return lastSuccessText ? `예정대로 돌지 않았어요 · ${lastSuccessText}` : '예정대로 돌지 않았어요';
  }
  // OK·PARTIAL·모르는 상태 — 마지막 실행 결과로 쓴다
  if (status.lastFinishedAt === null) return '아직 실행 기록이 없어요';
  const time = runTimeText(presentation, status.lastFinishedAt, now);
  if (status.health === 'OK' && status.lastOutcome !== null && status.lastOutcome !== 'SUCCESS') {
    return `${time} 잠깐 실패 · 다음 실행에서 다시 시도해요`;
  }
  const okText = presentation.okText(time, status.resultCount ?? 0);
  return status.health === 'PARTIAL' ? okText + presentation.partialSuffix(status.failedCount ?? 0) : okText;
}

/** 서버 순서를 지키고, 모르는 작업 키는 건너뛴다. */
export function buildJobStatusRows(statuses: AdminJobStatus[], now: Date): JobStatusRow[] {
  return statuses.flatMap((status) => {
    const presentation = PRESENTATION_BY_JOB.get(status.job);
    if (!presentation) return [];
    const isWarning = WARNING_HEALTHS.has(status.health);
    const isDisabled = status.health === 'DISABLED';
    return [
      {
        key: status.job,
        name: presentation.name,
        chip: CHIP_BY_HEALTH.get(status.health) ?? null,
        isWarning,
        isDisabled,
        isNotYet: status.health === 'NOT_YET',
        resultText: resultText(status, presentation, now),
        impact: isWarning || isDisabled ? presentation.impact : null,
        workaround: isWarning ? presentation.workaround : null,
      },
    ];
  });
}

/** 카드 첫 줄 — 경고 수, 아니면 정상(배포 직후 모두 첫 실행 전이면 그 문장), 꺼짐 수 덧붙임. */
export function jobStatusHeadline(rows: JobStatusRow[]): string {
  const warningCount = rows.filter((row) => row.isWarning).length;
  if (warningCount > 0) return `확인이 필요한 자동 작업이 ${warningCount}개 있어요`;
  // 로컬·테스트처럼 전부 꺼져 있으면 "제때 돌고 있어요"라고 하지 않는다
  if (rows.length > 0 && rows.every((row) => row.isDisabled)) return '자동 작업이 모두 꺼져 있어요';
  const disabledCount = rows.filter((row) => row.isDisabled).length;
  const disabledSuffix = disabledCount > 0 ? ` · 꺼 둔 작업 ${disabledCount}개` : '';
  // 배포 직후 — 아직 아무것도 돌지 않았는데 "제때 돌고 있어요"라고 하지 않는다
  const isAwaitingFirstRun = rows.some((row) => row.isNotYet) && rows.every((row) => row.isNotYet || row.isDisabled);
  return `${isAwaitingFirstRun ? '첫 실행을 기다리고 있어요' : '모두 제때 돌고 있어요'}${disabledSuffix}`;
}
