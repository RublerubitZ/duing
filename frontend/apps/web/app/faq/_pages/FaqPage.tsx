'use client';

// 총동연 FAQ 공개 페이지. 필터 상태(카테고리·검색어·페이지·딥링크 item)는 URL searchParams 가
// 소스다 — ClubExplorePage 의 parse/serialize/updateParams 패턴(새로고침·공유·뒤로가기 유지).
// 검색 인풋 draft 만 로컬 상태. 아코디언 항목은 pinned 뱃지·카테고리 캡션이 필요해 자체 렌더한다.

import { useCallback, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

import { useFederationFaqCategoriesQuery, useFederationFaqListQuery } from '@duing/hooks';
import type { FederationFaqItem } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { cn } from '@/app/_lib/cn';
import { InfoTabs } from '../../_components/InfoTabs';
import { HomeFooter } from '../../_components/HomeFooter';
import { toRoute } from '../../_lib/route';
import { FaqDeepLinkCard } from '../_components/FaqDeepLinkCard';
import { FaqFeedback } from '../_components/FaqFeedback';
import { parseFaqParams, serializeFaqParams, type FaqParams } from '../_lib/faqParams';

const PAGE_SIZE = 20;

function FaqAccordionRow({ faq, index }: { faq: FederationFaqItem; index: number }) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const buttonId = `${baseId}-button`;

  return (
    <div className="card px-5 transition hover:shadow-2 md:px-6">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center gap-3.5 py-4 text-left md:py-5"
      >
        <span className="shrink-0 font-mono text-[12px] font-semibold tracking-[0.12em] text-ink">
          Q.{String(index + 1).padStart(2, '0')}
        </span>
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {faq.pinned && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-bold text-paper">
                고정
              </span>
            )}
            <span className="text-[15px] font-bold text-ink-deep">{faq.question}</span>
          </span>
          {faq.categoryName && (
            <span className="mt-1 block text-[12px] text-charcoal-3">{faq.categoryName}</span>
          )}
        </span>
        <span
          className={cn(
            'relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-paper transition-colors',
            open ? 'bg-ink-deep' : 'bg-ink',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'absolute h-[2px] w-[11px] rounded-[2px] bg-paper transition-opacity',
              open && 'opacity-0',
            )}
          />
          <span
            className={cn(
              'absolute h-[11px] w-[2px] rounded-[2px] bg-paper transition-transform',
              open && 'rotate-90 opacity-0',
            )}
          />
        </span>
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-duing motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-5 pt-3.5">
            <p className="whitespace-pre-line text-[14px] leading-[1.65] text-charcoal-2">
              {faq.answer}
            </p>
            <FaqFeedback faqId={faq.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FaqPage() {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const params = useMemo<FaqParams>(
    () => parseFaqParams(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  );

  /** 검색 인풋은 입력 중 URL 을 흔들지 않도록 별도 로컬 상태로 둔다 */
  const [keywordDraft, setKeywordDraft] = useState(params.keyword);

  const updateParams = useCallback(
    (patch: Partial<FaqParams>) => {
      const next: FaqParams = { ...params, ...patch };
      const query = serializeFaqParams(next);
      router.replace(toRoute(`/faq${query ? `?${query}` : ''}`), { scroll: false });
    },
    [params, router],
  );

  const categoriesQuery = useFederationFaqCategoriesQuery();
  const listQuery = useFederationFaqListQuery({
    categoryId: params.categoryId !== 'ALL' ? params.categoryId : undefined,
    keyword: params.keyword || undefined,
    page: params.page - 1,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  // 검색 확정·칩·페이지 변경은 전부 딥링크 item 을 함께 제거한다(맥락이 바뀐 카드 잔존 방지).
  const handleSearch = () => {
    updateParams({ keyword: keywordDraft.trim(), page: 1, item: null });
  };

  const handleCategoryChange = (next: number | 'ALL') => {
    updateParams({ categoryId: next, page: 1, item: null });
  };

  const handlePageChange = (nextZeroBasedPage: number) => {
    updateParams({ page: nextZeroBasedPage + 1, item: null });
  };

  const handleDeepLinkClose = () => {
    updateParams({ item: null });
  };

  return (
    // 크림 캔버스(duing min-h-dvh bg-cream)와 ExploreNav 는 faq/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
    // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky(InfoTabs)면 라우터 자동 스크롤 기준에서 제외된다.
    <div>
      <InfoTabs />

      <div className="max-w-layout mx-auto px-4 pb-20 pt-8 sm:px-6 md:px-10">
        <div className="mb-7">
          <h1 className="text-[32px] md:text-[40px]">자주 묻는 질문</h1>
          <p className="mt-2 text-[14px] text-charcoal-2 md:text-[15px]">
            총동아리연합회에 궁금한 점을 확인하세요
          </p>
        </div>

        {/* Search */}
        <div className="mb-5 flex items-center gap-2 rounded-[14px] border border-line bg-paper px-4 py-2.5 focus-within:border-ink md:max-w-[420px]">
          <input
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch();
            }}
            placeholder="질문을 검색하세요"
            className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
            style={{ fontFamily: 'inherit' }}
          />
          <button type="button" onClick={handleSearch} className="btn btn-primary btn-sm">
            검색
          </button>
        </div>

        {/* Category chips — 모바일 가로 스크롤, 데스크탑 wrap */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          <button
            type="button"
            onClick={() => handleCategoryChange('ALL')}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold',
              params.categoryId === 'ALL'
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-charcoal-2',
            )}
          >
            전체
          </button>
          {(categoriesQuery.data ?? []).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => handleCategoryChange(category.id)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold',
                params.categoryId === category.id
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-charcoal-2',
              )}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* 딥링크 카드 — 필터/페이지 변경 시 handleXxx 에서 item 을 제거한다 */}
        {params.item !== null && (
          <FaqDeepLinkCard faqId={params.item} onClose={handleDeepLinkClose} />
        )}

        {listQuery.isLoading && (
          <ListRowsSkeleton rows={6} rowClassName="h-[64px] rounded-[20px]" label="FAQ 목록 불러오는 중" />
        )}
        {listQuery.isError && (
          <p className="py-12 text-center text-[13px] text-coral">FAQ를 불러오지 못했습니다</p>
        )}

        {listQuery.isSuccess && (
          <>
            {items.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-charcoal-3">검색 결과가 없어요</p>
            ) : (
              <div
                // keepPreviousData 전환 중(카테고리·검색·페이지 변경)에는 이전 목록을 딤 처리해 갱신 중임을 알린다.
                aria-busy={listQuery.isPlaceholderData}
                className={cn(
                  'flex flex-col gap-3',
                  listQuery.isPlaceholderData && 'opacity-60 transition-opacity',
                )}
              >
                {items.map((faq, index) => (
                  <FaqAccordionRow key={faq.id} faq={faq} index={index} />
                ))}
              </div>
            )}

            <Pagination
              page={params.page - 1}
              totalPages={totalPages}
              onChange={handlePageChange}
              ariaLabel="FAQ 페이지"
            />
          </>
        )}

        {/* 상시 CTA — FAQ 컨텍스트 전체에서 항상 노출 */}
        <div className="mt-10 flex flex-col items-center gap-3 rounded-[18px] border border-line bg-paper px-6 py-8 text-center">
          <p className="text-[14px] font-semibold text-ink-deep">원하는 답을 못 찾으셨나요?</p>
          <Link
            href={toRoute('/me/inquiries/new')}
            className="rounded-full bg-coral px-5 py-2.5 text-[14px] font-semibold text-paper"
          >
            1:1 문의하기
          </Link>
        </div>
      </div>

      <HomeFooter />
    </div>
  );
}
