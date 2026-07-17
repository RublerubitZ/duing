'use client';

// 시설 예약 신청 확인 Dialog(§2.2) — "예약 신청" 버튼이 즉시 전송하는 대신 이 다이얼로그를 거친다.
// 실제 POST 는 이 다이얼로그의 [예약 신청] 에서만 발사되고(호출부가 onConfirm 으로 처리), 제출 중에는
// 버튼을 비활성화해 중복 제출을 막는다. 포털은 .duing 스코프 밖이라 SheetContent 전례(AdminMobileBar)처럼
// duing 클래스를 재부여해 토큰·폰트를 맞춘다(패널 bg-card 가 .duing 의 bg-cream 을 덮어 크림 띠는 없다).

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { SlotRange } from '../../_lib/bookingCalendar';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// yyyy-MM-dd → "2026.07.28 (화)" (로컬 필드 파싱 — UTC 자정 함정 회피).
function confirmDateLabel(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const weekday = WEEKDAY_LABELS[new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getDay()];
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `${year}.${pad2(month ?? 1)}.${pad2(day ?? 1)} (${weekday})`;
}

// { start:'14:00', end:'16:00' } → "14:00 ~ 16:00 (2시간)" (슬롯은 정시 단위 — 시 단위 차이로 계산).
function confirmTimeLabel(range: SlotRange): string {
  const hours = Number(range.end.slice(0, 2)) - Number(range.start.slice(0, 2));
  return `${range.start} ~ ${range.end} (${hours}시간)`;
}

type Props = {
  open: boolean;
  facilityName: string;
  date: string; // yyyy-MM-dd
  range: SlotRange;
  clubName: string;
  purpose: string;
  attendeeCount?: number;
  contactPhone: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-charcoal-3">{label}</dt>
      <dd className="text-right text-sm font-medium text-charcoal">{value}</dd>
    </div>
  );
}

export function BookingConfirmDialog({
  open, facilityName, date, range, clubName, purpose, attendeeCount, contactPhone,
  isSubmitting, onConfirm, onCancel,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 제출 중에는 ESC·바깥 클릭으로 닫히지 않게 한다(중복 제출·경합 방지).
        if (!next && !isSubmitting) onCancel();
      }}
    >
      <DialogContent
        className="duing w-[calc(100%-2rem)]"
        onPointerDownOutside={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>예약을 신청하시겠어요?</DialogTitle>
          <DialogDescription>아래 내용을 다시 한번 확인해주세요.</DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 rounded-md border border-line bg-cream/60 px-3 py-3">
          <ConfirmRow label="시설" value={facilityName} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-charcoal-3">예약 일시</dt>
            <dd className="text-right text-sm font-medium text-charcoal">
              <span className="block">{confirmDateLabel(date)}</span>
              <span className="block font-mono text-[13px] text-charcoal-2">{confirmTimeLabel(range)}</span>
            </dd>
          </div>
          <ConfirmRow label="신청 동아리" value={clubName} />
          <ConfirmRow label="사용 목적" value={purpose} />
          <ConfirmRow label="사용 인원" value={attendeeCount !== undefined ? `${attendeeCount}명` : '—'} />
          <ConfirmRow label="대표 연락처" value={contactPhone} />
        </dl>

        <p className="rounded-md bg-sage-mist px-3 py-2 text-xs leading-relaxed text-ink-deep">
          예약 신청 후 관리자 승인과 학교 반영 절차를 거쳐 최종 예약이 확정됩니다.
        </p>

        <DialogFooter>
          <button type="button" className="btn btn-secondary flex-1" disabled={isSubmitting} onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-primary flex-1" disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? '신청 중…' : '예약 신청'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
