'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  useRecruitmentDetailQuery,
  useCloseRecruitmentMutation,
  useDeleteRecruitmentMutation,
  useRecruitmentStatsSummaryQuery,
  useStopRecruitmentIntakeMutation,
} from '@duing/hooks';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { toRoute } from '../../../../../_lib/route';
import {
  displayStatusLabel,
  isRecruitmentExpiredOpen,
  recruitmentExpiredOpenNotice,
  recruitmentPeriodLabel,
  RECRUITMENT_EXPIRED_OPEN_BADGE,
  RECRUITMENT_EXPIRED_OPEN_LABEL,
} from '../../../../../_lib/recruitmentDisplay';
import { externalFormPlatformLabel } from '../_lib/externalFormPlatform';
import { stopIntakeGate } from '../_lib/stopIntakeGate';
import { InterviewStageChip } from './_components/InterviewStageChip';
import { MemberEnrollmentSection } from '../_components/MemberEnrollmentSection';
import { CloseRecruitmentConfirmDescription } from '../_components/CloseRecruitmentConfirmDescription';
import { StopIntakeConfirmDescription } from '../_components/StopIntakeConfirmDescription';
import { RecruitmentQuestionItemList } from './_components/RecruitmentQuestionItemList';
import { LoadingGate } from '@/components/loading/LoadingGate';
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
  const [showStopIntakeConfirm, setShowStopIntakeConfirm] = useState(false);
  const [stopIntakeError, setStopIntakeError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  const { data: recruitment, isLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const closeRecruitment = useCloseRecruitmentMutation(recruitmentId, clubId);
  const stopIntake = useStopRecruitmentIntakeMutation(recruitmentId, clubId);
  const deleteRecruitment = useDeleteRecruitmentMutation(clubId, recruitmentId);
  // 통계 페이지 진입 전 핵심 지표(지원자·합격·합격률)를 상세에서 미리 보여주기 위한 1회 호출.
  // 통계 페이지와 동일 훅·쿼리키를 공유하므로 통계로 이동 시 캐시가 재사용된다.
  const { data: statsSummary } = useRecruitmentStatsSummaryQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );

  if (isLoading || !recruitment) {
    return <LoadingGate label="모집 정보 불러오는 중" />;
  }

  // 액션 게이트(수정·마감·삭제)는 raw status 기준이다 — 마감일이 지났어도 수동 마감 전이면 백엔드는
  // 모집을 OPEN(심사 진행 중)으로 다루므로, 여기서 displayStatus 로 막으면 운영진이 마감할 방법이 사라진다.
  const isClosed = recruitment.status === 'CLOSED';
  // 마감일만 지난 구간 — '마감'이라 안내하면 거짓이므로 별도 문구·칩으로 분리한다.
  const isExpiredOpen = isRecruitmentExpiredOpen(recruitment);
  // 접수 마감(신규 지원만 차단·심사 계속)은 상시모집 전용 — 시작일 다음 날(KST)부터 활성화된다.
  const stopIntakeAction = stopIntakeGate(recruitment, new Date());
  const isExternal = recruitment.applicationMode === 'EXTERNAL';
  const applicationModeLabel = isExternal ? '외부 폼' : '자체 폼';
  // 배지의 플랫폼명은 저장된 URL 호스트로 판별한다 — 화이트리스트 밖 레거시 URL 이면 생략한다.
  const externalFormPlatform = isExternal
    ? externalFormPlatformLabel(recruitment.externalFormUrl)
    : null;
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

  async function handleStopIntake() {
    setStopIntakeError(null);
    try {
      await stopIntake.mutateAsync();
      setShowStopIntakeConfirm(false);
    } catch (err) {
      setStopIntakeError(err instanceof Error ? err.message : '접수 마감 처리에 실패했습니다.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* 상태 배너 — 실제 마감과 '마감일만 경과'를 구분해 안내한다 */}
      {isClosed && (
        <div className="mb-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
          이미 마감된 모집입니다.
        </div>
      )}
      {/* 데이터 로드 후 나타나는 행동 요청이라 라이브 리전으로 알린다 */}
      {isExpiredOpen && (
        <div role="status" className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {recruitmentExpiredOpenNotice(recruitment.applicationMode)}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{recruitment.title}</h1>
          {/* 외부 폼 모집은 지원서·면접 없이 코드로 회원을 등록한다 — 화면 첫 줄에서 모드를 알린다(§5). */}
          {isExternal && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                외부 폼 모집
              </span>
              {externalFormPlatform && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {externalFormPlatform}
                </span>
              )}
            </div>
          )}
          <p className="mt-1 text-sm text-slate-500">
            {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
          </p>
        </div>
        {/* 상태 칩. 라벨(displayStatusLabel)·색 규칙이 운영 콘솔 칩(recruitmentStatusChip)과 다른 어휘라
            그 헬퍼를 쓰지 않는다 — 통합하면 예정/상시/마감 표기가 바뀌므로 디자인 판단이 먼저다. */}
        <span
          className={`mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            isClosed
              ? 'bg-slate-100 text-slate-500'
              : isExpiredOpen
                ? RECRUITMENT_EXPIRED_OPEN_BADGE
                : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {/* 제목 옆 맨 텍스트라 스크린리더에서 무엇의 상태인지 알 수 없다 */}
          <span className="sr-only">모집 상태 </span>
          <span>
            {isExpiredOpen
              ? RECRUITMENT_EXPIRED_OPEN_LABEL
              : displayStatusLabel(recruitment.displayStatus)}
          </span>
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

      {/* 액션 버튼 — 지원자 관리가 1차 액션(운영진이 가장 자주 확인), 나머지는 보조 액션.
          외부 폼 모집은 지원서·통계를 쓰지 않으므로 두 진입점을 아예 두지 않는다(§5.1). */}
      <div className="flex flex-wrap gap-3">
        {!isExternal && (
          <>
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
          </>
        )}
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
            {stopIntakeAction.visible && (
              <button
                type="button"
                disabled={!stopIntakeAction.enabled}
                aria-describedby={stopIntakeAction.enabled ? undefined : 'stop-intake-too-early'}
                onClick={() => setShowStopIntakeConfirm(true)}
                className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-amber-300 disabled:hover:bg-white"
              >
                접수 마감
              </button>
            )}
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
      </div>

      {stopIntakeAction.visible && !stopIntakeAction.enabled && (
        <p id="stop-intake-too-early" className="mt-2 text-xs text-slate-500">
          모집 시작일 다음 날부터 접수를 마감할 수 있습니다. 오늘 바로 끝내야 한다면 마감을
          이용해주세요.
        </p>
      )}

      {/* 외부 폼 모집은 지원자 화면 대신 여기서 회원을 등록한다 — 모집 상태와 무관하게 노출하되,
          링크 생성은 실질 진행 중일 때만 열어 종료 후 409 를 UX 에서 차단한다(§4.2·§5). */}
      {isExternal && (
        <MemberEnrollmentSection
          clubId={clubId}
          recruitmentId={recruitmentId}
          clubName={recruitment.clubName}
          canCreate={recruitment.effectivelyOpen}
        />
      )}

      <ConfirmDialog
        open={showStopIntakeConfirm}
        title="접수를 마감할까요?"
        description={<StopIntakeConfirmDescription applicationMode={recruitment.applicationMode} />}
        confirmLabel="접수 마감"
        isPending={stopIntake.isPending}
        errorMessage={stopIntakeError}
        onConfirm={handleStopIntake}
        onCancel={() => {
          setShowStopIntakeConfirm(false);
          setStopIntakeError(null);
        }}
      />

      <ConfirmDialog
        open={showCloseConfirm}
        title="모집을 마감할까요?"
        description={
          <CloseRecruitmentConfirmDescription
            applicationMode={recruitment.applicationMode}
            statsSummary={statsSummary}
          />
        }
        confirmLabel="마감"
        isPending={closeRecruitment.isPending}
        errorMessage={closeError}
        onConfirm={handleClose}
        onCancel={() => {
          setShowCloseConfirm(false);
          setCloseError(null);
        }}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="모집 공고를 삭제할까요?"
        description="지원자가 없는 공고만 삭제할 수 있으며, 삭제하면 되돌릴 수 없습니다."
        isPending={deleteRecruitment.isPending}
        errorMessage={deleteError}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
