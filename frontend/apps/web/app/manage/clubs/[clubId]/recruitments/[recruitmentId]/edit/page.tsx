'use client';

import { use } from 'react';
import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useRecruitmentDetailQuery, useUpdateRecruitmentMutation } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import {
  RecruitmentForm,
  RECRUITMENT_FORM_ID,
} from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import type { EditFormValues } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

export default function EditRecruitmentPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);
  const router = useGuardedRouter();

  const { data: recruitment, isLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const updateRecruitment = useUpdateRecruitmentMutation(recruitmentId);

  if (isLoading || !recruitment) {
    return <LoadingGate label="모집 정보 불러오는 중" />;
  }

  if (recruitment.displayStatus === 'CLOSED') {
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
      questionItems: isSelfMode ? values.questionItems : undefined,
      interviewStartDate: values.interviewStartDate ?? undefined,
      interviewEndDate: values.interviewEndDate ?? undefined,
      showApplicantCount: values.showApplicantCount,
    });
    router.push(toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`));
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-ink-deep">모집 수정</h1>
        <div className="flex items-center gap-2">
          <Link
            href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
            className="btn btn-secondary"
          >
            취소
          </Link>
          <button
            type="submit"
            form={RECRUITMENT_FORM_ID}
            disabled={updateRecruitment.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            수정 저장
          </button>
        </div>
      </header>

      <RecruitmentForm
        mode="edit"
        initialValues={recruitment}
        submitLabel="수정 저장"
        onSubmit={handleSubmit}
        isPending={updateRecruitment.isPending}
      />
    </div>
  );
}
