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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-8">
          <p className="text-lg font-semibold text-emerald-800">발송 완료</p>
          <p className="mt-2 text-sm text-emerald-700">
            {notifiedCount}명에게 알림이 전송되었습니다. 면접 가능시간 요청을 보냈습니다.
          </p>
        </div>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`)}
          className="inline-block rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          면접 관리로
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-slate-900">검토·발송</h2>

      {detail && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">제목</span>
            <span className="font-medium text-slate-900">{detail.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">마감</span>
            <span className="text-slate-900">
              {detail.availabilityDeadline
                ? formatDateTimeKst(detail.availabilityDeadline)
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">장소</span>
            <span className="text-slate-900">{detail.location ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">면접 대상</span>
            <span className="text-slate-900">{detail.counts.totalMemberCount}명</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">등록된 슬롯</span>
            <span className="text-slate-900">{detail.slots.length}개</span>
          </div>
        </div>
      )}

      {/* 발송 조건 체크리스트 */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">발송 조건</h3>
        <ul className="space-y-1 text-sm">
          <li className={hasSlots ? 'text-emerald-700' : 'text-rose-600'}>
            {hasSlots ? '✓' : '✗'}{' '}
            {hasSlots ? `슬롯 ${detail?.slots.length ?? 0}개 등록됨` : '슬롯을 1개 이상 등록해야 합니다'}
          </li>
          <li className={hasMembers ? 'text-emerald-700' : 'text-rose-600'}>
            {hasMembers ? '✓' : '✗'}{' '}
            {hasMembers
              ? `면접 대상 ${detail?.counts.totalMemberCount ?? 0}명`
              : '면접 대상 멤버가 1명 이상이어야 합니다'}
          </li>
          <li className={hasDeadline ? 'text-emerald-700' : 'text-rose-600'}>
            {hasDeadline ? '✓' : '✗'}{' '}
            {hasDeadline ? '가능시간 제출 마감 설정됨' : '가능시간 제출 마감을 설정해야 합니다'}
          </li>
        </ul>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {apiError}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || requestAvailabilityMutation.isPending}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {requestAvailabilityMutation.isPending && <ButtonSpinner />}발송
        </button>
      </div>
    </div>
  );
}
