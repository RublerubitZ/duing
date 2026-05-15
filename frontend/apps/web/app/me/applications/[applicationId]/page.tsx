'use client';

import { use } from 'react';
import { useMyApplicationDetail } from '@duing/hooks';
import { APPLICATION_STATUS_LABEL } from '../../../_constants/application-status';

export default function MyApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId: idParam } = use(params);
  const applicationId = Number(idParam);
  const query = useMyApplicationDetail(applicationId);

  if (query.isLoading) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  if (!query.data) return <p className="p-6 text-sm text-rose-600">지원 내역을 찾을 수 없습니다.</p>;
  const application = query.data;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-slate-500">{application.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{application.recruitmentTitle}</h1>
      <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm">
        {APPLICATION_STATUS_LABEL[application.status]}
      </p>

      {application.status === 'INTERVIEW_PENDING' && (
        <section className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">면접 일정 안내</p>
          {application.interviewAt ? (
            <p className="mt-1">
              {new Date(application.interviewAt).toLocaleString()} ·{' '}
              {application.interviewLocation ?? '장소 미정'}
            </p>
          ) : (
            <p className="mt-1">아직 면접 일정이 등록되지 않았습니다.</p>
          )}
        </section>
      )}

      {application.questions.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="font-semibold">지원서 답변</h2>
          {application.questions.map((question, idx) => (
            <div key={idx} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">
                {idx + 1}. {question}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {application.answers[idx] ?? ''}
              </p>
            </div>
          ))}
        </section>
      )}

      <p className="mt-6 text-xs text-slate-500">
        제출일: {new Date(application.submittedAt).toLocaleString()}
      </p>
    </main>
  );
}
