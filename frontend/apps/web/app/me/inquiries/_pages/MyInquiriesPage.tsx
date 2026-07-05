'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { FederationInquiryStatus } from '@duing/types';
import { useMyFederationInquiriesQuery } from '@duing/hooks';

import { Pagination } from '@/components/Pagination';
import { cn } from '@/app/_lib/cn';
import { formatDateDot } from '@/app/_lib/formatDateDot';
import { toRoute } from '@/app/_lib/route';
import {
  INQUIRY_STATUS_BADGE_CLASS,
  INQUIRY_STATUS_LABEL,
} from '@/app/_lib/federationInquiryLabels';

const PAGE_SIZE = 10;

const STATUS_TABS: (FederationInquiryStatus | 'ALL')[] = [
  'ALL',
  'RECEIVED',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
];

export function MyInquiriesPage() {
  const [statusFilter, setStatusFilter] = useState<FederationInquiryStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0);

  const listQuery = useMyFederationInquiriesQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    page,
    size: PAGE_SIZE,
  });

  const inquiries = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const handleStatusTabChange = (next: FederationInquiryStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">내 문의</h1>
          <p className="mt-1 text-sm text-charcoal-3">
            총동아리연합회에 궁금한 점을 1:1로 문의할 수 있습니다.
          </p>
        </div>
        <Link href={toRoute('/me/inquiries/new')} className="btn btn-primary btn-sm shrink-0">
          새 문의
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleStatusTabChange(tab)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors',
              statusFilter === tab ? 'bg-ink text-paper' : 'text-charcoal-2 hover:bg-graysoft',
            )}
          >
            {tab === 'ALL' ? '전체' : INQUIRY_STATUS_LABEL[tab]}
          </button>
        ))}
      </div>

      {listQuery.isLoading && (
        <p className="py-12 text-center text-[13px] text-charcoal-3">불러오는 중…</p>
      )}
      {listQuery.isError && (
        <p className="py-12 text-center text-[13px] text-coral">문의 목록을 불러오지 못했습니다.</p>
      )}

      {listQuery.isSuccess && inquiries.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-charcoal-2">아직 문의 내역이 없어요.</p>
          <p className="mt-1 text-xs text-charcoal-3">
            먼저{' '}
            <Link href={toRoute('/faq')} className="font-semibold text-ink hover:underline">
              자주 묻는 질문
            </Link>
            에서 답을 찾아보세요.
          </p>
          <Link href={toRoute('/me/inquiries/new')} className="btn btn-primary btn-sm mt-4 inline-flex">
            새 문의 작성
          </Link>
        </div>
      )}

      {listQuery.isSuccess && inquiries.length > 0 && (
        <ul className="space-y-2">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id}>
              <Link
                href={toRoute(`/me/inquiries/${inquiry.id}`)}
                className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition-colors hover:bg-graysoft/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{inquiry.title}</p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        INQUIRY_STATUS_BADGE_CLASS[inquiry.status],
                      )}
                    >
                      {INQUIRY_STATUS_LABEL[inquiry.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-charcoal-3">
                    작성 {formatDateDot(inquiry.createdAt)}
                    {inquiry.answeredAt && ` · 답변 ${formatDateDot(inquiry.answeredAt)}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="문의 페이지" />
    </main>
  );
}
