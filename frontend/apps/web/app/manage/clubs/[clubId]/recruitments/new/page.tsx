'use client';

import { use } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useCreateRecruitmentMutation } from '@duing/hooks';
import { toRoute } from '../../../../../_lib/route';
import { RecruitmentForm } from '../_components/RecruitmentForm';
import type { CreateFormValues } from '../_components/RecruitmentForm';

export default function NewRecruitmentPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const router = useGuardedRouter();

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

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-xl font-bold">신규 모집 작성</h1>
      <RecruitmentForm
        mode="create"
        onSubmit={handleSubmit}
        isPending={createRecruitment.isPending}
      />
    </div>
  );
}