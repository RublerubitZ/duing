'use client';

// 총동연 FAQ 공개 페이지. NoticePage.tsx 의 검색(draft/확정)·칩 필터 패턴을 따르되,
// 사이드바 없이 단일 컬럼으로 구성한다. 아코디언 항목은 pinned 뱃지·카테고리 캡션이 필요해 자체 렌더한다.

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

import { useFederationFaqCategoriesQuery, useFederationFaqListQuery } from '@duing/hooks';
import type { FederationFaqItem } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { cn } from '@/app/_lib/cn';
import { EASE_DUING } from '@/app/introduce/_components/motion/constants';
import { ExploreNav } from '../../_components/ExploreNav';
import { HomeFooter } from '../../_components/HomeFooter';
import { toRoute } from '../../_lib/route';
import { FaqDeepLinkCard } from '../_components/FaqDeepLinkCard';

const PAGE_SIZE = 20;

function parseDeepLinkId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function FaqAccordionRow({ faq, index }: { faq: FederationFaqItem; index: number }) {
  const [open, setOpen] = useState(false);
  const shouldReduce = useReducedMotion();
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
      <motion.div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.32, ease: EASE_DUING }}
        className="overflow-hidden"
      >
        <div className="whitespace-pre-line border-t border-dashed border-line pb-5 pt-3.5 text-[14px] leading-[1.65] text-charcoal-2">
          {faq.answer}
        </div>
      </motion.div>
    </div>
  );
}

export function FaqPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkId = useMemo(
    () => parseDeepLinkId(searchParams?.get('item') ?? null),
    [searchParams],
  );

  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState<number | 'ALL'>('ALL');
  const [page, setPage] = useState(0);

  const categoriesQuery = useFederationFaqCategoriesQuery();
  const listQuery = useFederationFaqListQuery({
    categoryId: categoryId !== 'ALL' ? categoryId : undefined,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const clearDeepLink = () => {
    if (deepLinkId !== null) {
      router.replace(toRoute('/faq'), { scroll: false });
    }
  };

  const handleSearch = () => {
    setKeyword(keywordInput);
    setPage(0);
    clearDeepLink();
  };

  const handleCategoryChange = (next: number | 'ALL') => {
    setCategoryId(next);
    setPage(0);
    clearDeepLink();
  };

  const handlePageChange = (next: number) => {
    setPage(next);
    clearDeepLink();
  };

  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />

      <div className="max-w-layout mx-auto px-4 pb-20 pt-8 sm:px-6 md:px-10">
        <div className="mb-7">
          <h1 className="text-[32px] md:text-[40px]">자주 묻는 질문</h1>
          <p className="mt-2 text-[14px] text-charcoal-2 md:text-[15px]">
            총동아리연합회에 궁금한 점을 확인하세요
          </p>
        </div>

        {/* Search */}
        <div className="mb-5 flex items-center gap-2 rounded-[14px] border border-line bg-paper px-4 py-2.5 md:max-w-[420px]">
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
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
              categoryId === 'ALL'
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
                categoryId === category.id
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-charcoal-2',
              )}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* 딥링크 카드 — 필터/페이지 변경 시 handleXxx 에서 item 을 제거한다 */}
        {deepLinkId !== null && (
          <FaqDeepLinkCard faqId={deepLinkId} onClose={clearDeepLink} />
        )}

        {listQuery.isLoading && (
          <p className="py-12 text-center text-[13px] text-charcoal-3">불러오는 중…</p>
        )}
        {listQuery.isError && (
          <p className="py-12 text-center text-[13px] text-coral">FAQ를 불러오지 못했습니다</p>
        )}

        {listQuery.isSuccess && (
          <>
            {items.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-charcoal-3">검색 결과가 없어요</p>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((faq, index) => (
                  <FaqAccordionRow key={faq.id} faq={faq} index={index} />
                ))}
              </div>
            )}

            <Pagination
              page={page}
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
