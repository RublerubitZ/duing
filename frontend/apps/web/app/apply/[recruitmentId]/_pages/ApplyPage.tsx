'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError } from '@duing/api';
import {
  useRecruitmentDetailQuery,
  useApplicationDraftQuery,
  useApplicationEligibilityQuery,
} from '@duing/hooks';
import { ResourceNotFound } from '@/app/_components/ResourceNotFound';
import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { toRoute } from '../../../_lib/route';
import { captureEvent } from '../../../_lib/analytics';
import { ApplyForm } from '../_components/ApplyForm';
import type { DraftAnswer, RecruitmentQuestionItem } from '@duing/types';

export function ApplyPage() {
  const params = useParams<{ recruitmentId: string }>();
  const recruitmentId = Number(params.recruitmentId);
  const router = useGuardedRouter();

  const detail = useRecruitmentDetailQuery(recruitmentId);
  const draftQuery = useApplicationDraftQuery(recruitmentId);

  useEffect(() => {
    captureEvent('apply_page_viewed', { recruitment_id: recruitmentId });
  }, [recruitmentId]);

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

  // 정적 셸이라 서버가 제목을 못 붙인다(generateMetadata 금지) — 데이터 도착 후 탭 제목만 갱신.
  useDocumentTitle(recruitment ? `${recruitment.clubName} 지원` : null);

  // 없는 모집(404)은 오류가 아니라 "찾을 수 없음" 이다 — 서버 메시지를 그대로 띄우는 아래 오류 패널과
  // 구분해, 전역 404 와 같은 시각 언어로 안내한다.
  if (detail.isError && detail.error instanceof ApiError && detail.error.status === 404) {
    return (
      <ResourceNotFound
        title="이 모집은 찾을 수 없어요"
        description="마감 후 정리됐거나 주소가 바뀌었을 수 있어요."
        actionHref="/clubs"
        actionLabel="동아리 탐색으로"
      />
    );
  }

  // 상세 조회 실패 시 isLoading=false·data=undefined 라 아래 로딩 분기가 영구 표류한다 — 먼저 탈출.
  // clubId 를 모르는 상태라 안전한 복귀처는 탐색 목록뿐이다.
  if (detail.isError) {
    const detailErrorMessage =
      detail.error instanceof ApiError
        ? detail.error.message
        : '모집 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-center text-sm text-coral">
          {detailErrorMessage}
        </p>
        <Link href={toRoute('/clubs')} className="btn btn-secondary">
          동아리 탐색으로 돌아가기
        </Link>
      </div>
    );
  }

  if (
    detail.isLoading ||
    !recruitment ||
    draftQuery.isLoading ||
    (isSelf && eligibility.isLoading)
  ) {
    return (
      <div
        className="min-h-dvh"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <LoadingGate label="불러오는 중" className="min-h-dvh" />
      </div>
    );
  }

  if (isExternal) {
    return (
      <div
        className="min-h-dvh"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <LoadingGate label="이동 중" className="min-h-dvh" />
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

  const questionItems: RecruitmentQuestionItem[] =
    recruitment.questionItems ??
    recruitment.questions.map((text, index) => ({
      // 구 BE 시차 fallback — 제출은 신 BE 배포 전까지 400 으로 명확히 실패한다.
      id: `legacy-${index}`,
      text,
      type: 'TEXT',
      required: true,
      choices: [],
    }));

  // draft 가 settle 된 뒤 mount 하므로 자식은 initialAnswers 만 받아 useState 초기값으로 쓴다.
  const draft = draftQuery.data;
  const initialAnswers: DraftAnswer[] = questionItems.map((question) => {
    const saved = draft?.exists
      ? draft.answers.find((answer) => answer.questionId === question.id)
      : undefined;
    const savedValues = saved?.values ?? [];
    if (question.type === 'TEXT') {
      return { questionId: question.id, values: savedValues.slice(0, 1) };
    }
    // 임시저장 이후 폼이 수정됐을 수 있다 — 사라진 선택지 id 를 그대로 되살리면 제출이 400 난다.
    const knownValues = savedValues.filter((value) =>
      question.choices.some((choice) => choice.id === value),
    );
    // 단일 선택은 2개 이상을 되살리면 라디오가 여러 개 checked 로 시드되고 제출도 400 이 된다.
    const values =
      question.type === 'SINGLE_CHOICE' ? knownValues.slice(0, 1) : knownValues;
    return { questionId: question.id, values };
  });

  return (
    <ApplyForm
      recruitment={recruitment}
      recruitmentId={recruitmentId}
      questionItems={questionItems}
      initialAnswers={initialAnswers}
    />
  );
}
