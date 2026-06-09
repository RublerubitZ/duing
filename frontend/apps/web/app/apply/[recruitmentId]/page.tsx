'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { DraftAnswer } from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useApplicationDraftQuery,
} from '@duing/hooks';
import { ApplyForm } from './_components/ApplyForm';
import { toRoute } from '../../_lib/route';

export default function ApplyPage({
  params,
}: {
  params: Promise<{ recruitmentId: string }>;
}) {
  const { recruitmentId: idParam } = use(params);
  const recruitmentId = Number(idParam);
  const router = useRouter();

  const detail = useRecruitmentDetailQuery(recruitmentId);
  const draftQuery = useApplicationDraftQuery(recruitmentId);

  // 외부 폼 모집은 동아리 상세로 되돌려보낸다. side-effect 라 effect 로 격리한다.
  const recruitment = detail.data;
  const isExternal = recruitment?.applicationMode === 'EXTERNAL';
  useEffect(() => {
    if (isExternal && recruitment) {
      router.replace(toRoute(`/clubs/${recruitment.clubId}`));
    }
  }, [isExternal, recruitment, router]);

  if (detail.isLoading || !recruitment || draftQuery.isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p className="font-mono text-sm text-charcoal-3">불러오는 중…</p>
      </div>
    );
  }

  if (isExternal) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p className="font-mono text-sm text-charcoal-3">이동 중…</p>
      </div>
    );
  }

  // draft 가 settle 된 뒤 mount 하므로 자식은 initialAnswers 만 받아 useState 초기값으로 쓴다.
  const draft = draftQuery.data;
  const initialAnswers: DraftAnswer[] = recruitment.questions.map((_, idx) => ({
    questionId: idx,
    value:
      draft?.exists
        ? draft.answers.find((answer) => answer.questionId === idx)?.value ?? ''
        : '',
  }));

  return (
    <ApplyForm
      recruitment={recruitment}
      recruitmentId={recruitmentId}
      initialAnswers={initialAnswers}
    />
  );
}
