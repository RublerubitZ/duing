'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useRecruitmentDetailQuery, useUpdateRecruitmentMutation } from '@duing/hooks';
import { toRoute } from '../../../../../../_lib/route';
import { RecruitmentForm } from '../../_components/RecruitmentForm';
import type { EditFormValues } from '../../_components/RecruitmentForm';

export default function EditRecruitmentPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);
  const router = useRouter();

  const { data: recruitment, isLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const updateRecruitment = useUpdateRecruitmentMutation(recruitmentId);

  if (isLoading || !recruitment) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  if (!recruitment.effectivelyOpen) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
          마감된 모집은 수정할 수 없습니다.
        </div>
      </div>
    );
  }

  const isSelfMode = recruitment.applicationMode === 'SELF';

  async function handleSubmit(values: EditFormValues) {
    await updateRecruitment.mutateAsync({
      title: values.title,
      content: values.content || null,
      startDate: values.startDate,
      endDate: values.endDate,
      capacity: values.capacity,
      useInterview: values.useInterview,
      questions: isSelfMode ? values.questions : undefined,
    });
    router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-xl font-bold">모집 수정</h1>
      <RecruitmentForm
        mode="edit"
        initialValues={recruitment}
        onSubmit={handleSubmit}
        isPending={updateRecruitment.isPending}
      />
    </div>
  );
}