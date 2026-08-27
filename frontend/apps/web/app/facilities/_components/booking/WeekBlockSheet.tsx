'use client';

import { useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// 모바일 주간 그리드에서 탭한 예약 블록의 상세(§9.3). PENDING 은 이름 비노출 정책상 라벨이 이미 "승인 대기"로 온다.
export type WeekBlockDetail = {
  kind: 'BLOCKED' | 'PENDING' | 'BASIC_SECURED';
  label: string; // 확정·기본 확보=단체명(또는 "예약됨" 폴백), 대기="승인 대기"
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
};

type Props = {
  block: WeekBlockDetail | null;
  onClose: () => void;
};

/**
 * 주간 그리드 블록 상세 바텀시트(§9.3) — 모바일에서 확정/대기/기본 확보 블록 탭 시 라벨·시간 범위·상태 배지를 보여준다.
 * PC 에서는 블록이 비인터랙티브라 열리지 않는다.
 * 포털은 .duing 스코프 밖(body)이므로 컨테이너에 .duing 을 재부여해 토큰(폰트·타이포)을 적용하고,
 * 시트 표면은 명시 bg-cream 으로 둔다(NotificationSheet 전례).
 */
export function WeekBlockSheet({ block, onClose }: Props) {
  // 닫힘 애니메이션(약 300ms) 동안 내용이 사라지지 않게 마지막 블록 스냅샷을 유지한다 — 열림 여부는 block prop 이 결정.
  const lastBlockRef = useRef<WeekBlockDetail | null>(null);
  if (block !== null) lastBlockRef.current = block;
  const shown = block ?? lastBlockRef.current;
  const isPending = shown?.kind === 'PENDING';
  const isSecured = shown?.kind === 'BASIC_SECURED';
  const statusBadge = isPending ? '승인 대기' : isSecured ? '기본 확보 시간' : '예약됨';
  // 확정=이미 예약이 잡힌 시간, 대기=승인 대기 중인 신청, 기본 확보=총동연 지정 확보 시간.
  // 어느 쪽도 신청할 수 없다는 안내(전면 차단 설계 §3.7).
  const policyNote = isPending
    ? '승인 대기 중인 신청이에요.'
    : isSecured
      ? '총동연이 지정한 기본 확보 시간이에요. 예약을 신청할 수 없어요.'
      : '이미 예약이 확정된 시간이에요.';

  return (
    <Sheet
      open={block !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        hideClose
        data-bottom-bar
        className="duing rounded-t-[26px] border-line bg-cream px-5 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-3 h-[4.5px] w-10 rounded-full bg-line" />
        <SheetHeader className="mb-3">
          <SheetTitle>{isPending ? '승인 대기' : (shown?.label ?? '')}</SheetTitle>
          <SheetDescription className="sr-only">예약 블록 상세 정보</SheetDescription>
        </SheetHeader>
        {shown !== null && (
          <dl className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-charcoal-3">시간</dt>
              <dd className="font-mono text-sm font-semibold text-ink-deep">
                {shown.start}~{shown.end}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-charcoal-3">상태</dt>
              <dd>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    isPending
                      ? 'border-warm/60 bg-warm/15 text-[#8E6620]'
                      : isSecured
                        ? 'border-sage-soft bg-sage-mist text-ink'
                        : 'border-line bg-graysoft text-charcoal-2'
                  }`}
                >
                  {statusBadge}
                </span>
              </dd>
            </div>
            <p className="pt-1 text-xs text-charcoal-3">{policyNote}</p>
          </dl>
        )}
      </SheetContent>
    </Sheet>
  );
}
