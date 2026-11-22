'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { FederationInquiryStatus } from '@duing/types';
import { formatDateKst, useMyFederationInquiriesQuery } from '@duing/hooks';

import { HomeNav } from '@/app/_components/HomeNav';
import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { cn } from '@/app/_lib/cn';
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

  // 실패한 뒤 진짜 목록 없이 다시 받는 중 — 찜 목록(app/me/favorites/page.tsx)과 같은 판정(재시도 대기 중 멈춤 'paused' 도 다시 받는 중). 쪽·상태를 옮기면 기준이 새 키로 잡혀
  // 일반 이동과 갈린다. 그동안 실패 안내를 두고 버튼만 잠근다 — 누른 버튼이 사라지면 포커스가 문서로 빠진다(#1756).
  const isRetrying =
    listQuery.fetchStatus !== 'idle' &&
    listQuery.isFetchedAfterMount &&
    (listQuery.data === undefined || listQuery.isPlaceholderData);
  // 다시 받는 동안에는 이전 쪽 자리표시로 목록·페이지 버튼을 그리지 않는다.
  const shownList = isRetrying ? undefined : listQuery.data;
  const inquiries = shownList?.content ?? [];
  const totalPages = shownList?.totalPages ?? 0;
  // 이전 탭·쪽 자리표시가 0건이면 받는 동안 빈 안내 대신 로딩으로 둔다.
  const isEmptyPlaceholder = listQuery.isPlaceholderData && inquiries.length === 0;
  // 진짜 목록이 없으면 페이지 버튼도 없다 — 2쪽 이후의 실패엔 돌아갈 길을 둔다.
  const showsFirstPageButton = page > 0 && (listQuery.data === undefined || listQuery.isPlaceholderData);
  // 받는 중(멈춤 포함)에는 판단하지 않는다 — 그동안 data 는 이전 탭·쪽의 자리표시라 쪽 수가 다르다.
  const loadedTotalPages = listQuery.fetchStatus !== 'idle' ? undefined : listQuery.data?.totalPages;

  // 상태 탭을 바꾸는 동안 이전 탭 자리표시의 페이지 버튼으로 새 탭에 없는 쪽에 갈 수 있다 — 그대로 두면 빈 쪽에 갇히므로
  // 남은 마지막 쪽(없으면 첫 쪽)으로 옮긴다(찜 목록 보정과 같은 모양).
  useEffect(() => {
    if (loadedTotalPages !== undefined && page > 0 && page >= loadedTotalPages) {
      setPage(Math.max(loadedTotalPages - 1, 0));
    }
  }, [loadedTotalPages, page]);

  const handleStatusTabChange = (next: FederationInquiryStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  // PC 에는 이 페이지들만 상단바가 없었다. 레이아웃이 아니라 페이지에서 감싼다 —
  // MyPage 의 100dvh 래퍼와 충돌하기 때문(SettingsPage 패턴).
  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
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

        {!isRetrying && (listQuery.isLoading || isEmptyPlaceholder) && (
          <ListRowsSkeleton
            rows={5}
            rowClassName="h-[64px] rounded-xl"
            className="space-y-2"
            label="문의 목록 불러오는 중"
          />
        )}
        {(listQuery.isError || isRetrying) && (
          <div className="py-12 text-center">
            <p className="text-[13px] text-coral-deep">문의 목록을 불러오지 못했습니다.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                // 잠갔다고 알린 버튼은 동작하지 않게 둔다(aria-disabled 와 행동을 맞춘다). 데이터 없이 받는 중이라 다시 불러도
                // 요청은 진행 중인 것으로 합쳐진다 — 그래서 이 분기는 테스트로 가를 수 없다.
                aria-disabled={isRetrying || undefined}
                onClick={() => {
                  if (!isRetrying) void listQuery.refetch();
                }}
                className="btn btn-secondary btn-sm"
              >
                {isRetrying ? '다시 불러오는 중' : '다시 시도'}
              </button>
              {showsFirstPageButton && (
                <button type="button" onClick={() => setPage(0)} className="btn btn-ghost btn-sm">
                  첫 페이지로
                </button>
              )}
            </div>
          </div>
        )}

        {/* 빈 판정은 전체 수로 — 없는 쪽에 간 한 프레임(이 쪽은 비었지만 전체는 남음, 보정 전)에 거짓 빈 안내를 그리지 않는다(찜 목록과 같음). */}
        {listQuery.isSuccess && !listQuery.isPlaceholderData && shownList?.totalElements === 0 && (
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
          <ul
            // 쪽·상태를 옮기는 동안은 이전 목록이 남는다 — 흐림으로 갱신 중임을 알린다. 각 행은 자기 id 로 이동해 잠그지 않는다.
            aria-busy={listQuery.isPlaceholderData}
            className={cn('space-y-2 transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}
          >
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
                      작성 {formatDateKst(inquiry.createdAt)}
                      {inquiry.answeredAt && ` · 답변 ${formatDateKst(inquiry.answeredAt)}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="문의 페이지" />
      </main>
    </div>
  );
}
