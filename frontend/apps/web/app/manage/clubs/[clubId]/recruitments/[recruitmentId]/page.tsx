'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRecruitmentDetailQuery, useCloseRecruitmentMutation } from '@duing/hooks';
import { toRoute } from '../../../../../_lib/route';
import { displayStatusLabel, recruitmentPeriodLabel } from '../../../../../_lib/recruitmentDisplay';

export default function RecruitmentDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const { data: recruitment, isLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const closeRecruitment = useCloseRecruitmentMutation(recruitmentId);

  if (isLoading || !recruitment) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const isClosed = recruitment.displayStatus === 'CLOSED';
  const applicationModeLabel =
    recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼';
  const targetRoleLabel = recruitment.targetRole === 'OFFICER' ? '운영진' : '부원';

  async function handleClose() {
    setCloseError(null);
    try {
      await closeRecruitment.mutateAsync();
      setShowCloseConfirm(false);
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : '마감 처리에 실패했습니다.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* CLOSED 배너 */}
      {isClosed && (
        <div className="mb-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
          이미 마감된 모집입니다.
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{recruitment.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
          </p>
        </div>
        <span
          className={
            isClosed
              ? 'mt-1 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500'
              : 'mt-1 shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700'
          }
        >
          {displayStatusLabel(recruitment.displayStatus)}
        </span>
      </div>

      {/* 상세 정보 */}
      <dl className="mb-8 space-y-3 rounded-lg border border-slate-200 p-4">
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-sm text-slate-500">지원 방식</dt>
          <dd className="text-sm text-slate-900">{applicationModeLabel}</dd>
        </div>
        {recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl && (
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-sm text-slate-500">외부 폼 URL</dt>
            <dd className="text-sm text-slate-900 break-all">{recruitment.externalFormUrl}</dd>
          </div>
        )}
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-sm text-slate-500">모집 대상</dt>
          <dd className="text-sm text-slate-900">{targetRoleLabel}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-sm text-slate-500">모집 정원</dt>
          <dd className="text-sm text-slate-900">{recruitment.capacity}명</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-sm text-slate-500">면접 여부</dt>
          <dd className="text-sm text-slate-900">{recruitment.useInterview ? '있음' : '없음'}</dd>
        </div>
      </dl>

      {/* 내용 */}
      {recruitment.content && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700">모집 내용</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{recruitment.content}</p>
        </div>
      )}

      {/* 질문 목록 */}
      {recruitment.applicationMode === 'SELF' && recruitment.questions.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700">지원 질문</h2>
          <ol className="list-decimal pl-5 space-y-1">
            {recruitment.questions.map((question, index) => (
              <li key={index} className="text-sm text-slate-600">
                {question}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants`)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          지원자 관리
        </Link>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/stats`)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          통계
        </Link>

        {!isClosed && (
          <>
            <Link
              href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/edit`)}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              수정
            </Link>
            <button
              type="button"
              onClick={() => setShowCloseConfirm(true)}
              className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              마감
            </button>
          </>
        )}
      </div>

      {/* 마감 확인 모달 */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">모집을 마감할까요?</h2>
            <p className="mb-6 text-sm text-slate-500">
              마감 후에는 지원서를 더 이상 받을 수 없으며, 되돌릴 수 없습니다.
            </p>
            {closeError && <p className="mb-4 text-sm text-rose-600">{closeError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  setCloseError(null);
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={closeRecruitment.isPending}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {closeRecruitment.isPending ? '마감 중…' : '마감 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}