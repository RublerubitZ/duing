'use client';

import { use } from 'react';
import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import {
  useClubRecruitmentsQuery,
  useCreateRecruitmentMutation,
  useRecruitmentDetailQuery,
} from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { isRecruitmentUnderReview } from '@/app/_lib/recruitmentDisplay';
import posthog from 'posthog-js';
import { LoadingGate } from '@/components/loading/LoadingGate';
import {
  RecruitmentForm,
  RECRUITMENT_FORM_ID,
} from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import type { CreateFormValues } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

export default function NewRecruitmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ cloneFrom?: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const { cloneFrom: cloneFromParam } = use(searchParams);
  const clubId = Number(clubIdParam);
  const router = useGuardedRouter();

  // 양식 복제 진입 — ?cloneFrom={id} 가 있으면 해당 모집 상세를 새 작성 폼의 초기값으로 쓴다.
  // 별도 Clone API 없이 기존 상세 조회 + 생성 API 를 재사용한다(원본은 절대 수정하지 않음).
  // 생성 시 질문 id 는 서버가 무시하고 새로 발급하므로(QuestionItemPayload 스펙 §2.2) id 스트립 불필요.
  // 추후 백엔드 Clone API 가 생기면 이 fetch 만 바꾸면 된다 — RecruitmentForm 은 cloneSeed(RecruitmentDetail)만 받는다.
  const cloneFromId = cloneFromParam !== undefined ? Number(cloneFromParam) : undefined;
  const isValidCloneFromId = cloneFromId !== undefined && !isNaN(cloneFromId);
  const { data: cloneSourceCandidate, isLoading: isCloneSourceLoading } = useRecruitmentDetailQuery(
    isValidCloneFromId ? cloneFromId : undefined,
  );
  // 모집 상세는 공개 API 라 ?cloneFrom= 에 남의 동아리 모집 id 를 넣어도 조회된다. 이 동아리 소속이
  // 아니면 복제 씨앗으로 쓰지 않는다(복제 진입이 아닌 일반 신규 작성으로 떨어진다).
  const cloneSource =
    cloneSourceCandidate?.clubId === clubId ? cloneSourceCandidate : undefined;

  // 새 모집 등록은 마감일이 지난 채 OPEN 으로 남아 있는 기존 모집을 백엔드가 자동 마감한 뒤 진행된다
  // (GeneralRecruitmentService.create — 아직 진행 중인 모집이면 마감이 아니라 409 로 거부된다).
  // 마감되면 그 모집의 지원현황이 조회 전용으로 굳으므로(아카이브 스펙 §9) 제출 전에 고지한다.
  // 자동 마감 대상은 "마감일이 지난 OPEN"(isRecruitmentUnderReview) — 백엔드가 같은 today 기준으로
  // 계산해 내려준 displayStatus 를 쓰므로 FE 날짜 연산이 필요 없다.
  // 활성 모집은 동아리당 1건뿐이라(V38 부분 유니크 인덱스) 자동 마감 대상도 최대 1건이다.
  // 목록을 못 받았으면(로딩·실패) undefined — 확인 없이 기존 제출 그대로 진행한다(fail-open).
  const { data: clubRecruitments } = useClubRecruitmentsQuery(isNaN(clubId) ? undefined : clubId);
  const closingRecruitment = clubRecruitments?.find(isRecruitmentUnderReview);

  const createRecruitment = useCreateRecruitmentMutation(clubId);

  async function handleSubmit(values: CreateFormValues) {
    const newRecruitmentId = await createRecruitment.mutateAsync({
      title: values.title,
      content: values.content || undefined,
      startDate: values.startDate,
      endDate: values.endDate,
      capacity: values.capacity,
      applicationMode: values.applicationMode,
      externalFormUrl: values.applicationMode === 'EXTERNAL' ? values.externalFormUrl : undefined,
      useInterview: values.useInterview,
      targetRole: values.targetRole,
      questionItems: values.applicationMode === 'SELF' ? values.questionItems : undefined,
      interviewStartDate: values.interviewStartDate ?? undefined,
      interviewEndDate: values.interviewEndDate ?? undefined,
      showApplicantCount: values.showApplicantCount,
    });
    posthog.capture('recruitment_created', {
      club_id: clubId,
      recruitment_id: newRecruitmentId,
      application_mode: values.applicationMode,
      use_interview: values.useInterview,
      cloned: Boolean(cloneFromParam),
    });
    router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${newRecruitmentId}`));
  }

  if (isValidCloneFromId && isCloneSourceLoading) {
    return <LoadingGate label="복제할 모집 정보 불러오는 중" />;
  }

  const submitLabel = cloneSource ? '복제하여 모집 시작' : '모집 시작';

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-ink-deep">
          {cloneSource ? '모집 양식 복제' : '신규 모집 작성'}
        </h1>
        <div className="flex items-center gap-2">
          <Link href={toRoute(`/manage/clubs/${clubId}/recruitments`)} className="btn btn-secondary">
            취소
          </Link>
          <button
            type="submit"
            form={RECRUITMENT_FORM_ID}
            disabled={createRecruitment.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </header>

      {cloneSource && (
        <div className="mb-5 rounded-[13px] border border-line bg-sage-tint px-4 py-3 text-[12.5px] leading-relaxed text-charcoal-2">
          <Link
            href={toRoute(`/manage/clubs/${clubId}/recruitments/${cloneSource.id}`)}
            className="font-bold text-ink-deep hover:underline"
          >
            {cloneSource.title}
          </Link>
          의 양식을 복제해 새 모집을 작성합니다. 원본 모집은 변경되지 않으며, 모집 기간은 새로 입력해주세요.
        </div>
      )}

      <RecruitmentForm
        mode="create"
        cloneSeed={cloneSource}
        closingRecruitmentTitle={closingRecruitment?.title}
        submitLabel={submitLabel}
        onSubmit={handleSubmit}
        isPending={createRecruitment.isPending}
      />
    </div>
  );
}
