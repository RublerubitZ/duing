'use client';

import { use } from 'react';
import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useCreateRecruitmentMutation, useRecruitmentDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
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
  const { data: cloneSource, isLoading: isCloneSourceLoading } = useRecruitmentDetailQuery(
    isValidCloneFromId ? cloneFromId : undefined,
  );

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
        submitLabel={submitLabel}
        onSubmit={handleSubmit}
        isPending={createRecruitment.isPending}
      />
    </div>
  );
}
