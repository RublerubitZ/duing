'use client';

import { use } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useCreateRecruitmentMutation, useRecruitmentDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { RecruitmentForm } from '../_components/RecruitmentForm';
import type { CreateFormValues } from '../_components/RecruitmentForm';

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

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-bold">
          {cloneSource ? '모집 양식 복제로 새 모집 작성' : '신규 모집 작성'}
        </h1>
        {cloneSource && (
          <p className="mt-2 rounded-md bg-sage-tint px-3 py-2 text-xs text-charcoal-2">
            「{cloneSource.title}」의 내용을 기반으로 새 모집을 작성합니다. 원본 모집은 변경되지 않으며,
            모집 기간은 새로 입력해주세요.
          </p>
        )}
      </div>
      <RecruitmentForm
        mode="create"
        cloneSeed={cloneSource}
        onSubmit={handleSubmit}
        isPending={createRecruitment.isPending}
      />
    </div>
  );
}
