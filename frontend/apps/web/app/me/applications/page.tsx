'use client';

import Link from 'next/link';
import { useMyApplicationsQuery } from '@duing/hooks';
import { APPLICATION_STATUS_LABEL } from '../../_constants/application-status';

export default function MyApplicationsPage() {
  const query = useMyApplicationsQuery();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">내 지원 목록</h1>
      {query.isLoading && <p className="mt-4 text-sm text-slate-500">불러오는 중…</p>}
      {query.data?.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">아직 제출한 지원이 없습니다.</p>
      )}
      {query.data && query.data.length > 0 && (
        <ul className="mt-4 space-y-3">
          {query.data.map((application) => (
            <li
              key={application.id}
              className="rounded-lg border border-slate-200 p-4 hover:border-slate-400"
            >
              <Link href={`/me/applications/${application.id}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{application.recruitmentTitle}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {APPLICATION_STATUS_LABEL[application.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{application.clubName}</p>
                {application.interviewAt && (
                  <p className="mt-1 text-xs text-emerald-700">
                    면접: {new Date(application.interviewAt).toLocaleString()} ·{' '}
                    {application.interviewLocation ?? '장소 미정'}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}