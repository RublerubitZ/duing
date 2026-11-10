'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  formatDateTimeKst,
  useInterviewRoundDetailQuery,
  useRequestAvailabilityMutation,
} from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';

// Step4: 검토·발송
// 발송 조건 3종 (§10.3):  슬롯≥1 && 멤버≥1 && deadline≠null
// 미충족 항목은 rose 텍스트로 사유 표시. 조건 충족 시에만 [발송] 활성.
// 발송 성공 → 완료 화면 ({notifiedMemberCount}명에게 알림 + 면접 관리로 링크).

type Props = {
  recruitmentId: number;
  roundId: number;
  clubId: number;
};

export function Step4Review({ recruitmentId, roundId, clubId }: Props) {
  const detailQuery = useInterviewRoundDetailQuery(roundId, { enabled: true });
  const requestAvailabilityMutation = useRequestAvailabilityMutation(recruitmentId, roundId);

  const [notifiedCount, setNotifiedCount] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const detail = detailQuery.data;

  const hasSlots = (detail?.slots.length ?? 0) >= 1;
  const hasMembers = (detail?.counts.totalMemberCount ?? 0) >= 1;
  const hasDeadline = detail?.availabilityDeadline !== null && detail?.availabilityDeadline !== undefined;

  const canSend = hasSlots && hasMembers && hasDeadline;

  const handleSend = async () => {
    setApiError(null);
    try {
      const result = await requestAvailabilityMutation.mutateAsync();
      setNotifiedCount(result.notifiedMemberCount);
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError(error.message);
      } else {
        setApiError('발송 중 오류가 발생했습니다.');
      }
    }
  };

  if (detailQuery.isLoading) {
    return <LoadingGate label="라운드 정보 불러오는 중" className="min-h-0 py-8" />;
  }

  // 완료 화면
  if (notifiedCount !== null) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg border border-sage-soft bg-sage-mist px-6 py-8">
          <p className="text-lg font-semibold text-ink">발송 완료</p>
          <p className="mt-2 text-sm text-ink">
            {notifiedCount}명에게 알림이 전송되었습니다. 면접 가능시간 요청을 보냈습니다.
          </p>
        </div>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`)}
          className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-deep"
        >
          면접 관리로
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-ink-deep">검토·발송</h2>

      {detail && (
        <div className="rounded-lg border border-line bg-cream p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-charcoal-3">제목</span>
            <span className="font-medium text-ink-deep">{detail.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-charcoal-3">마감</span>
            <span className="text-ink-deep">
              {detail.availabilityDeadline
                ? formatDateTimeKst(detail.availabilityDeadline)
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-charcoal-3">장소</span>
            <span className="text-ink-deep">{detail.location ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-charcoal-3">면접 대상</span>
            <span className="text-ink-deep">{detail.counts.totalMemberCount}명</span>
          </div>
          <div className="flex justify-between">
            <span className="text-charcoal-3">등록된 슬롯</span>
            <span className="text-ink-deep">{detail.slots.length}개</span>
          </div>
        </div>
      )}

      {/* 발송 조건 체크리스트 */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-charcoal-3">발송 조건</h3>
        <ul className="space-y-1 text-sm">
          <li className={hasSlots ? 'text-ink' : 'text-coral-deep'}>
            {hasSlots ? '✓' : '✗'}{' '}
            {hasSlots ? `슬롯 ${detail?.slots.length ?? 0}개 등록됨` : '슬롯을 1개 이상 등록해야 합니다'}
          </li>
          <li className={hasMembers ? 'text-ink' : 'text-coral-deep'}>
            {hasMembers ? '✓' : '✗'}{' '}
            {hasMembers
              ? `면접 대상 ${detail?.counts.totalMemberCount ?? 0}명`
              : '면접 대상 지원자가 1명 이상이어야 합니다'}
          </li>
          <li className={hasDeadline ? 'text-ink' : 'text-coral-deep'}>
            {hasDeadline ? '✓' : '✗'}{' '}
            {hasDeadline ? '가능시간 제출 마감 설정됨' : '가능시간 제출 마감을 설정해야 합니다'}
          </li>
        </ul>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral-deep"
        >
          {apiError}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || requestAvailabilityMutation.isPending}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {requestAvailabilityMutation.isPending && <ButtonSpinner />}발송
        </button>
      </div>
    </div>
  );
}
