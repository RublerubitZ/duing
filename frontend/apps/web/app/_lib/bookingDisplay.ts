// 동아리 예약 관리 화면 전용 표기 유틸. 날짜는 로컬 필드 파싱만 사용한다(UTC 함정).
import type { BookingStatus } from '@duing/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function bookingDateLabel(dateIso: string): string {
  const [, month, day] = dateIso.split('-').map(Number);
  const weekday = WEEKDAY_LABELS[parseIsoDate(dateIso).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

/** BE LocalTime 직렬화(HH:mm:ss)를 표시용 HH:mm 로 정규화한다. 이미 HH:mm 이면 그대로. */
export function slotTimeLabel(time: string): string {
  return time.slice(0, 5);
}

export function bookingTimeLabel(startTime: string, endTime: string): string {
  return `${slotTimeLabel(startTime)}~${slotTimeLabel(endTime)}`;
}

export type BookingStatusMeta = {
  label: string;
  subLabel?: string; // APPROVED 전용 — "학교 반영 대기"(§9.6)
  badgeClass: string; // globals.css .pill 변형 클래스(목업 SubBadge 매핑과 동일)
};

// 목업 SubBadge 매핑: 승인대기=warm · 승인=기본(sage-mist) · 확정/완료=solid · 반려/충돌=coral · 취소=outline
export const BOOKING_STATUS_META: Record<BookingStatus, BookingStatusMeta> = {
  PENDING: { label: '승인 대기', badgeClass: 'pill-warm' },
  APPROVED: { label: '승인됨', subLabel: '학교 반영 대기', badgeClass: '' },
  CONFIRMED: { label: '확정', badgeClass: 'pill-solid' },
  REJECTED: { label: '거절됨', badgeClass: 'pill-coral' },
  CONFLICT: { label: '학교 일정 충돌', badgeClass: 'pill-coral' },
  CANCELLED: { label: '취소됨', badgeClass: 'pill-outline' },
};
