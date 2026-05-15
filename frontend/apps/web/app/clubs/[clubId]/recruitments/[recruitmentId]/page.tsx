'use client';

import { use } from 'react';
import { useRecruitmentDetail } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

export default function RecruitmentDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { recruitmentId: recruitmentIdParam } = use(params);
  const recruitmentId = Number(recruitmentIdParam);
  const authStatus = useAuthStore((s) => s.status);

  const query = useRecruitmentDetail(recruitmentId);
  if (query.isLoading) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  if (!query.data) return <p className="p-6 text-sm text-rose-600">모집을 찾을 수 없습니다.</p>;
  const recruitment = query.data;

  function handleApplyClick() {
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      window.open(recruitment.externalFormUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const applyPath = `/apply/${recruitment.id}`;
    if (authStatus !== 'authenticated') {
      window.location.assign(`/login?next=${encodeURIComponent(applyPath)}`);
      return;
    }
    window.location.assign(applyPath);
  }

  const canApply = recruitment.effectivelyOpen;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm text-slate-500">{recruitment.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{recruitment.title}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {recruitment.startDate} ~ {recruitment.endDate} · 정원 {recruitment.capacity}명 ·{' '}
        {recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'} 모집
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {recruitment.effectivelyOpen ? '모집중' : '마감'} ·{' '}
        {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼으로 진행' : '자체 폼'} ·{' '}
        {recruitment.useInterview ? '면접 진행' : '면접 없음'}
      </p>

      {recruitment.content && (
        <article className="mt-6 whitespace-pre-wrap text-slate-700">
          {recruitment.content}
        </article>
      )}

      {recruitment.applicationMode === 'SELF' && recruitment.questions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">지원서 질문</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {recruitment.questions.map((question, idx) => (
              <li key={idx}>{question}</li>
            ))}
          </ol>
        </section>
      )}

      {recruitment.targetRole === 'OFFICER' && (
        <p className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          ⚠ 이 모집은 운영진 모집입니다. 이 동아리의 기존 부원만 지원할 수 있습니다.
        </p>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={handleApplyClick}
          disabled={!canApply}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
        >
          {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼으로 이동' : '지원하기'}
        </button>
      </div>
    </main>
  );
}