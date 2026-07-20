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

export function bookingTimeLabel(startTime: string, endTime: string): string {
  return `${startTime}~${endTime}`;
}

export type BookingStatusMeta = {
  label: string;
  subLabel?: string; // APPROVED 전용 — "학교 반영 대기"(§9.6)
  badgeClass: string; // 두잉 토큰 배지 클래스(§9.6 색 지정)
};

export const BOOKING_STATUS_META: Record<BookingStatus, BookingStatusMeta> = {
  PENDING: { label: '승인 대기', badgeClass: 'bg-[#FBEFD7] text-[#8E6620]' }, // warm 페어(지원 배지 전례)
  APPROVED: { label: '승인됨', subLabel: '학교 반영 대기', badgeClass: 'bg-ink/10 text-ink' },
  CONFIRMED: { label: '확정', badgeClass: 'bg-ink text-cream' },
  REJECTED: { label: '거절됨', badgeClass: 'bg-graysoft text-charcoal-3' },
  CONFLICT: { label: '학교 일정 충돌', badgeClass: 'bg-coral/15 text-coral' },
  CANCELLED: { label: '취소됨', badgeClass: 'bg-graysoft text-charcoal-3' },
};
