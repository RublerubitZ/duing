'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  useRecruitmentDetailQuery,
  useCloseRecruitmentMutation,
  useDeleteRecruitmentMutation,
  useRecruitmentStatsSummaryQuery,
} from '@duing/hooks';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { useBackDismiss } from '@/app/_lib/backDismiss';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { toRoute } from '../../../../../_lib/route';
import { displayStatusLabel, recruitmentPeriodLabel } from '../../../../../_lib/recruitmentDisplay';
import { InterviewStageChip } from './_components/InterviewStageChip';
import { RecruitmentQuestionItemList } from './_components/RecruitmentQuestionItemList';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';

export default function RecruitmentDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const router = useGuardedRouter();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 삭제 확인은 ConfirmDialog(Radix) 라 Dialog 래퍼가 이미 커버한다 — 마감 확인만 수제 오버레이다.
  useBackDismiss(showCloseConfirm, () => setShowCloseConfirm(false));

  const { data: recruitment, isLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const closeRecruitment = useCloseRecruitmentMutation(recruitmentId);
  const deleteRecruitment = useDeleteRecruitmentMutation(clubId, recruitmentId);
  // 통계 페이지 진입 전 핵심 지표(지원자·합격·합격률)를 상세에서 미리 보여주기 위한 1회 호출.
  // 통계 페이지와 동일 훅·쿼리키를 공유하므로 통계로 이동 시 캐시가 재사용된다.
  const { data: statsSummary } = useRecruitmentStatsSummaryQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );

  if (isLoading || !recruitment) {
    return <LoadingGate label="모집 정보 불러오는 중" />;
  }

  const isClosed = recruitment.displayStatus === 'CLOSED';
  const applicationModeLabel =
    recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼';
  const targetRoleLabel = recruitment.targetRole === 'OFFICER' ? '운영진' : '부원';

  // 외부 폼 모집은 questionItems 가 빈 배열로 내려온다 — 두 목록 모두 비어 있으면 섹션 자체를 감춘다.
  const questionItems = recruitment.questionItems ?? [];
  const hasQuestionItems = questionItems.length > 0;
  const showQuestions =
    recruitment.applicationMode === 'SELF' &&
    (hasQuestionItems || recruitment.questions.length > 0);

  // 운영진이 가장 자주 확인하는 지원자 수를 액션 버튼에 직접 노출한다.
  // 통계 요약(authoritative total)을 단일 출처로 써서 통계 페이지 수치와 항상 일치시킨다.
  const applicantTotal = statsSummary?.total ?? null;

  // 삭제는 마감(CLOSED)된 0지원자 공고만 가능(백엔드가 강제 — OPEN 은 지원 경쟁으로 고아 발생).
  // 진행 중 공고는 먼저 '마감' 후 삭제하면 되고, 그 조건을 만족할 때만 버튼을 노출해 409 를 UX 에서 차단한다.
  const canDelete =
    recruitment.status === 'CLOSED' && statsSummary != null && statsSummary.total === 0;

  async function handleDelete() {
    setDeleteError(null);
    try {
      await deleteRecruitment.mutateAsync();
      setShowDeleteConfirm(false);
      router.push(toRoute(`/manage/clubs/${clubId}/recruitments`));
    } catch (err) {
      setShowDeleteConfirm(false);
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  }

  // 액션 버튼 시각 위계: "지원자 관리"가 1차 액션(채움), 나머지는 명확히 클릭 가능한 보조 액션(그림자+테두리 강조).
  // 기존엔 "수정"만 채워진 버튼이라 회색 아웃라인인 지원자/통계가 비활성처럼 보이던 문제를 해소한다.
  const primaryActionClass =
    'inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700';
  const secondaryActionClass =
    'inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50';

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
        {recruitment.useInterview && (
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-sm text-slate-500">면접 단계</dt>
            <dd>
              <InterviewStageChip clubId={clubId} recruitmentId={recruitmentId} />
            </dd>
          </div>
        )}
      </dl>

      {/* 내용 */}
      {recruitment.content && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700">모집 내용</h2>
          <MarkdownProse content={recruitment.content} />
        </div>
      )}

      {/* 질문 목록 — questionItems 가 있으면 유형·필수 여부·선택지까지, 없으면(구 BE 시차) 텍스트만 */}
      {showQuestions && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700">지원 질문</h2>
          {hasQuestionItems ? (
            <RecruitmentQuestionItemList items={questionItems} />
          ) : (
            <ol className="list-decimal pl-5 space-y-1">
              {recruitment.questions.map((question, index) => (
                <li key={index} className="text-sm text-slate-600">
                  {question}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 지원 현황 요약 — 통계 페이지 진입 전 핵심 지표 미리보기 */}
      {statsSummary && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-slate-500">지원자</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{statsSummary.total}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-slate-500">합격</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{statsSummary.accepted}</span>
          </div>
          {statsSummary.capacity > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-500">합격률</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {(statsSummary.ratio * 100).toFixed(1)}%
              </span>
            </div>
          )}
          <span className="ml-auto text-xs text-slate-400">정원 {statsSummary.capacity}명</span>
        </div>
      )}

      {/* 액션 버튼 — 지원자 관리가 1차 액션(운영진이 가장 자주 확인), 나머지는 보조 액션 */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants`)}
          className={primaryActionClass}
        >
          지원자 관리
          {applicantTotal !== null && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tabular-nums">
              {applicantTotal}
              <span className="sr-only">명</span>
            </span>
          )}
        </Link>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/stats`)}
          className={secondaryActionClass}
        >
          통계
        </Link>
        {recruitment.useInterview && (
          <Link
            href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`)}
            className={secondaryActionClass}
          >
            면접 관리
          </Link>
        )}

        {!isClosed && (
          <>
            <Link
              href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/edit`)}
              className={secondaryActionClass}
            >
              수정
            </Link>
            <button
              type="button"
              onClick={() => setShowCloseConfirm(true)}
              className="inline-flex items-center gap-2 rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:border-rose-400 hover:bg-rose-50"
            >
              마감
            </button>
          </>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-2 rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:border-rose-400 hover:bg-rose-50"
          >
            삭제
          </button>
        )}

        {deleteError && <p className="w-full text-sm text-rose-600">{deleteError}</p>}
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
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {closeRecruitment.isPending && <ButtonSpinner />}마감 확인
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="모집 공고를 삭제할까요?"
        description="지원자가 없는 공고만 삭제할 수 있으며, 삭제하면 되돌릴 수 없습니다."
        isPending={deleteRecruitment.isPending}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
