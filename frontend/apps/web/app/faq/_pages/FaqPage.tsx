'use client';

// 총동연 FAQ 공개 페이지. 필터 상태(카테고리·검색어·페이지·딥링크 item)는 URL searchParams 가
// 소스다 — ClubExplorePage 의 parse/serialize/updateParams 패턴(새로고침·공유·뒤로가기 유지).
// 검색 인풋 draft 만 로컬 상태. 아코디언 행(FaqAccordionRow)은 서버 기본 목록(FaqPageFallback)과 같이 쓴다.

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

import { useFederationFaqCategoriesQuery, useFederationFaqListQuery } from '@duing/hooks';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { cn } from '@/app/_lib/cn';
import { SEARCH_KEYWORD_MAX_LENGTH } from '@/app/_lib/searchKeyword';
import { InfoTabs } from '../../_components/InfoTabs';
import { HomeFooter } from '../../_components/HomeFooter';
import { toRoute } from '../../_lib/route';
import { FaqDeepLinkCard } from '../_components/FaqDeepLinkCard';
import { FaqAccordionRow } from '../_components/FaqAccordionRow';
import { parseFaqParams, serializeFaqParams, toFaqListParams, type FaqParams } from '../_lib/faqParams';
import {
  FAQ_CHIP_CLASS,
  FAQ_CHIP_ROW_CLASS,
  FAQ_LIST_CLASS,
  FAQ_SEARCH_BAR_CLASS,
  FAQ_SEARCH_BUTTON_CLASS,
  FAQ_SEARCH_INPUT_CLASS,
  FAQ_SEARCH_INPUT_STYLE,
} from '../_lib/faqUi';

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
  const listQuery = useFederationFaqListQuery(toFaqListParams(params));

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  // 검색 확정·칩·페이지 변경은 전부 딥링크 item 을 함께 제거한다(맥락이 바뀐 카드 잔존 방지).
  const handleSearch = () => {
    updateParams({
      keyword: keywordDraft.trim().slice(0, SEARCH_KEYWORD_MAX_LENGTH),
      page: 1,
      item: null,
    });
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
    // 크림 캔버스(duing min-h-lvh bg-cream)와 ExploreNav 는 faq/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
    // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky(InfoTabs)면 라우터 자동 스크롤 기준에서 제외된다.
    // 최상위 div·max-w-layout 래퍼·제목 블록·1:1 문의 CTA 는 서버 기본 목록(FaqPageFallback)과 손으로 맞춘 짝 — 고치면 저쪽도.
    <div>
      <InfoTabs />

      <div className="max-w-layout mx-auto px-4 pb-20 pt-page-top sm:px-6 md:px-10">
        <div className="mb-7">
          <h1 className="text-[32px] md:text-[40px]">자주 묻는 질문</h1>
          <p className="mt-2 text-[14px] text-charcoal-2 md:text-[15px]">
            총동아리연합회에 궁금한 점을 확인하세요
          </p>
        </div>

        {/* Search */}
        <div className={FAQ_SEARCH_BAR_CLASS}>
          <input
            value={keywordDraft}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch();
            }}
            placeholder="질문을 검색하세요"
            aria-label="질문 검색"
            className={FAQ_SEARCH_INPUT_CLASS}
            style={FAQ_SEARCH_INPUT_STYLE}
          />
          <button type="button" onClick={handleSearch} className={FAQ_SEARCH_BUTTON_CLASS}>
            검색
          </button>
        </div>

        {/* Category chips — 모바일 가로 스크롤, 데스크탑 wrap */}
        <div className={FAQ_CHIP_ROW_CLASS}>
          <button
            type="button"
            onClick={() => handleCategoryChange('ALL')}
            className={FAQ_CHIP_CLASS(params.categoryId === 'ALL')}
          >
            전체
          </button>
          {(categoriesQuery.data ?? []).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => handleCategoryChange(category.id)}
              className={FAQ_CHIP_CLASS(params.categoryId === category.id)}
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
        {listQuery.isError && !listQuery.data && (
          <p className="py-12 text-center text-[13px] text-coral-deep">FAQ를 불러오지 못했습니다</p>
        )}

        {/* 재요청이 실패해도 이미 받은 목록은 남긴다 — TanStack Query 5 는 이때 isSuccess 를 내리지만 data 는 유지한다.
            24시간 ISR 시드로 그린 첫 화면이 마운트 재요청 실패로 통째로 오류 문구로 바뀌지 않게 한다. */}
        {listQuery.isError && listQuery.data && (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper px-4 py-3 text-[13px] text-charcoal-2"
          >
            <span>최신 질문을 불러오지 못했습니다. 지금 보이는 목록은 이전 내용일 수 있습니다.</span>
            {/* 연타가 진행 중 요청을 취소·재시작하지 않게 막는다(refetch 의 cancelRefetch 기본값이 true). */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={listQuery.isFetching}
              onClick={() => void listQuery.refetch()}
            >
              {listQuery.isFetching ? '다시 불러오는 중…' : '다시 시도'}
            </button>
          </div>
        )}

        {listQuery.data && (
          <>
            {items.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-charcoal-3">
                {params.keyword || params.categoryId !== 'ALL' || params.page > 1
                  ? '검색 결과가 없어요'
                  : '아직 등록된 질문이 없어요 · 궁금한 점은 아래 1:1 문의로 보내주세요'}
              </p>
            ) : (
              <div
                // keepPreviousData 전환 중(카테고리·검색·페이지 변경)에는 이전 목록을 딤 처리해 갱신 중임을 알린다.
                aria-busy={listQuery.isPlaceholderData}
                className={cn(
                  FAQ_LIST_CLASS,
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

        {/* 상시 CTA — FAQ 컨텍스트 전체에서 항상 노출. FaqPageFallback 과 손으로 맞춘 짝 */}
        <div className="mt-10 flex flex-col items-center gap-3 rounded-[18px] border border-line bg-paper px-6 py-8 text-center">
          <p className="text-[14px] font-semibold text-ink-deep">원하는 답을 못 찾으셨나요?</p>
          <Link
            href={toRoute('/me/inquiries/new')}
            className="rounded-full bg-danger px-5 py-2.5 text-[14px] font-semibold text-paper hover:bg-danger-hover"
          >
            1:1 문의하기
          </Link>
        </div>
      </div>

      <HomeFooter />
    </div>
  );
}
