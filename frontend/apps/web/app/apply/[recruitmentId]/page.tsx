'use client';

import { use, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { RecruitmentDetail } from '@duing/types';
import { useRecruitmentDetail, useSubmitApplication } from '@duing/hooks';
import { toRoute } from '../../_lib/route';

export default function ApplyPage({
  params,
}: {
  params: Promise<{ recruitmentId: string }>;
}) {
  const { recruitmentId: idParam } = use(params);
  const recruitmentId = Number(idParam);
  const router = useRouter();

  const detail = useRecruitmentDetail(recruitmentId);

  if (detail.isLoading || !detail.data) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const recruitment = detail.data;

  // 외부 폼 모집은 렌더 시점에 모집 상세로 되돌려보낸다 (effect 내 리다이렉트 금지).
  if (recruitment.applicationMode === 'EXTERNAL') {
    router.replace(
      toRoute(`/clubs/${recruitment.clubId}/recruitments/${recruitment.id}`),
    );
    return <p className="p-6 text-sm text-slate-500">이동 중…</p>;
  }

  // 데이터 도착이 보장된 시점에 자식 컴포넌트를 마운트해 useState 초기값을 props 에서 직접 받게 한다.
  // useEffect 로 서버 상태를 클라 상태에 복사하는 안티패턴을 피한다.
  return <ApplyForm recruitment={recruitment} recruitmentId={recruitmentId} />;
}

type ApplyFormProps = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
};

function ApplyForm({ recruitment, recruitmentId }: ApplyFormProps) {
  const router = useRouter();
  const submit = useSubmitApplication(recruitmentId);
  const [answers, setAnswers] = useState<string[]>(() =>
    recruitment.questions.map(() => ''),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const applicationId = await submit.mutateAsync({ answers });
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : '지원에 실패했습니다.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-slate-500">{recruitment.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{recruitment.title}</h1>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        {recruitment.questions.length === 0 && (
          <p className="text-sm text-slate-500">
            이 모집은 별도 질문이 없습니다. 제출 버튼을 눌러 지원할 수 있습니다.
          </p>
        )}
        {recruitment.questions.map((question, idx) => (
          <label key={idx} className="block">
            <span className="text-sm font-medium text-slate-700">
              {idx + 1}. {question}
            </span>
            <textarea
              required
              rows={4}
              value={answers[idx] ?? ''}
              onChange={(event) =>
                setAnswers((prev) => {
                  const next = prev.slice();
                  next[idx] = event.target.value;
                  return next;
                })
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        ))}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {submit.isPending ? '제출 중…' : '제출'}
        </button>
      </form>
    </main>
  );
}