'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DraftAnswer } from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useApplicationDraftQuery,
  useApplicationEligibilityQuery,
} from '@duing/hooks';
import { ApiError } from '@duing/api';
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
  const isSelf = recruitment?.applicationMode === 'SELF';
  useEffect(() => {
    if (isExternal && recruitment) {
      router.replace(toRoute(`/clubs/${recruitment.clubId}`));
    }
  }, [isExternal, recruitment, router]);

  // 딥링크로 바로 들어오는 진입점이라 제출 시와 동일한 정책으로 부적격 사유를 미리 확인한다.
  // 외부 폼(EXTERNAL)은 위 effect 가 동아리 상세로 되돌려보내므로 대상에서 제외한다.
  const eligibility = useApplicationEligibilityQuery(recruitmentId, Boolean(recruitment) && isSelf);

  if (
    detail.isLoading ||
    !recruitment ||
    draftQuery.isLoading ||
    (isSelf && eligibility.isLoading)
  ) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p className="font-mono text-sm text-charcoal-3">불러오는 중…</p>
      </div>
    );
  }

  if (isExternal) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p className="font-mono text-sm text-charcoal-3">이동 중…</p>
      </div>
    );
  }

  if (eligibility.isError) {
    const blockedMessage =
      eligibility.error instanceof ApiError
        ? eligibility.error.message
        : '지원 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-center text-sm text-coral">
          {blockedMessage}
        </p>
        <Link href={toRoute(`/clubs/${recruitment.clubId}`)} className="btn btn-secondary">
          동아리 페이지로 돌아가기
        </Link>
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
