'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { FederationInquiryStatus } from '@duing/types';
import { useAdminFederationInquiryListQuery } from '@duing/hooks';

import { Pagination } from '@/components/Pagination';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import {
  INQUIRY_STATUS_BADGE_CLASS,
  INQUIRY_STATUS_LABEL,
} from '@/app/_lib/federationInquiryLabels';

const PAGE_SIZE = 20;

const STATUS_TABS: (FederationInquiryStatus | 'ALL')[] = [
  'ALL',
  'RECEIVED',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
];

export function AdminInquiriesListPage() {
  const [statusFilter, setStatusFilter] = useState<FederationInquiryStatus | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);

  const listQuery = useAdminFederationInquiryListQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });

  // 접수 탭 옆 미답변 배지 — 현재 필터와 무관하게 항상 RECEIVED 건수만 별도 조회한다.
  const unansweredCountQuery = useAdminFederationInquiryListQuery({
    status: 'RECEIVED',
    page: 0,
    size: 1,
  });
  const unansweredCount = unansweredCountQuery.data?.totalElements ?? 0;

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const handleStatusTabChange = (next: FederationInquiryStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  const handleKeywordSubmit = () => {
    setKeyword(keywordInput);
    setPage(0);
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">1:1 문의</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          학생이 남긴 비밀문의를 확인하고 답변합니다.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-1">
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
            {tab === 'RECEIVED' && unansweredCount > 0 && (
              <span className="ml-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-coral px-1.5 py-0.5 text-[11px] font-bold leading-none text-paper">
                {unansweredCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleKeywordSubmit();
        }}
        className="mb-5 flex gap-2"
      >
        <input
          type="search"
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          placeholder="제목 검색"
          className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md bg-ink text-paper text-[13px] font-semibold"
        >
          검색
        </button>
      </form>

      {listQuery.isLoading && <LoadingGate label="문의 목록 불러오는 중" />}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && items.length === 0 && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">조건에 맞는 문의가 없습니다.</p>
      )}
      {listQuery.isSuccess && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-graysoft text-charcoal-2">
              <tr>
                <Th>제목</Th>
                <Th>작성자</Th>
                <Th>상태</Th>
                <Th>작성일</Th>
                <Th>상세</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((inquiry) => (
                <tr key={inquiry.id} className="border-t border-line hover:bg-graysoft/50">
                  <Td>{inquiry.title}</Td>
                  <Td>
                    {inquiry.authorName} ({inquiry.authorStudentId})
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                        INQUIRY_STATUS_BADGE_CLASS[inquiry.status],
                      )}
                    >
                      {INQUIRY_STATUS_LABEL[inquiry.status]}
                    </span>
                  </Td>
                  <Td>{new Date(inquiry.createdAt).toLocaleString('ko-KR')}</Td>
                  <Td>
                    <Link
                      href={toRoute(`/admin/inquiries/${inquiry.id}`)}
                      className="text-[12px] text-charcoal-2 hover:text-ink hover:underline"
                    >
                      상세 보기
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
