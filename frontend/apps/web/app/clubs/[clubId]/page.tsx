'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClubDetailQuery, useClubRecruitmentsQuery, useClubPhotosQuery } from '@duing/hooks';

export default function ClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const detail = useClubDetailQuery(clubId);
  const photos = useClubPhotosQuery(clubId);
  const recruitments = useClubRecruitmentsQuery(clubId);

  if (detail.isLoading) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  if (!detail.data) return <p className="p-6 text-sm text-rose-600">동아리를 찾을 수 없습니다.</p>;
  const club = detail.data;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {club.coverUrl && (
        <img src={club.coverUrl} alt="" className="mb-6 h-48 w-full rounded-xl object-cover" />
      )}
      <header className="mb-6 flex items-center gap-4">
        {club.logoUrl && (
          <img src={club.logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{club.name}</h1>
          <p className="text-sm text-slate-500">
            {club.division ?? ''}
            {club.leaderName ? ` · 회장 ${club.leaderName}` : ''}
          </p>
        </div>
      </header>

      {club.tags.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1">
          {club.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              #{tag}
            </li>
          ))}
        </ul>
      )}

      {club.description && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">소개</h2>
          <p className="whitespace-pre-wrap text-slate-700">{club.description}</p>
        </section>
      )}

      {recruitments.data && recruitments.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">진행 중인 모집</h2>
          <ul className="space-y-2">
            {recruitments.data
              .filter((r) => r.effectivelyOpen)
              .map((recruitment) => (
                <li key={recruitment.id}>
                  <Link
                    href={`/clubs/${club.id}/recruitments/${recruitment.id}`}
                    className="block rounded-lg border border-slate-200 p-3 hover:border-slate-400"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">{recruitment.title}</span>
                      <span className="text-xs text-slate-500">~ {recruitment.endDate}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'} ·{' '}
                      {recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'} 모집 · 정원{' '}
                      {recruitment.capacity}
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      {photos.data && photos.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">활동 사진</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.data.map((photo) => (
              <img key={photo.id} src={photo.storageKey}
                alt={photo.caption ?? ''}
                className="aspect-square rounded-md object-cover" />
            ))}
          </div>
        </section>
      )}

      {club.faqs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">FAQ</h2>
          <ul className="space-y-3">
            {club.faqs.slice().sort((a, b) => a.order - b.order).map((faq, idx) => (
              <li key={idx} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium">Q. {faq.question}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{faq.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {club.snsLinks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">SNS</h2>
          <ul className="flex flex-wrap gap-2">
            {club.snsLinks.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:border-slate-500">
                  {link.platform}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
