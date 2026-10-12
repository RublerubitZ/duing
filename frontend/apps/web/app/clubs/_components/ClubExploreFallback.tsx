// Suspense fallback 전용 — 쿼리 없는 첫 진입의 기본 목록을 서버에서 그린다(크롤러용 본문). 하이드레이션되지 않고
// 클라이언트 렌더(ClubExplorePage)로 교체된다. 그래서 컨트롤에 핸들러가 없어도 되고, 모바일 행 D-day 같은 시각 의존
// 표시도 불일치를 만들지 않는다. 교체 순간 카드가 밀리지 않게 카드 위 행은 ClubExplorePage 의 같은 행을 같은
// 문구·클래스로 그린다 — 컨트롤·행·그리드 클래스와 스코프·정렬 선택지는 exploreUi 공용 상수가 양쪽을 묶고, 나머지
// (섹션·제목 블록·검색 자리 틀·레일 틀·목록 래퍼)는 손으로 맞춘다(저쪽을 고치면 여기도). 깜빡이는 것은 회색 자리
// (검색·사이드바)뿐이다. 데이터가 없으면(빌드 국면 장애) 지금 스켈레톤을 그대로 그린다.
// 카드 래퍼에는 등장 스태거(.enter-stagger)를 달아 JS 를 기다리지 않고 첫 화면에서 CSS 로 떠오르게 한다. 최상위의
// data-explore-server-list(SERVER_LIST_ATTRIBUTE)를 실제 화면이 마운트 때 보고, 바꿔 끼울 때는 다시 재생하지 않는다.

import type { ClubSummary, PageResponse } from '@duing/types';

import { SparkleFull } from '../../_components/Sparkle';
import { summaryToClub } from '../_lib/clubAdapter';
import { SCOPE_CLUB_LABEL } from '../_lib/clubs';
import { CATEGORY_OPTIONS } from '../_lib/exploreParams';
import {
  CARD_GRID_CLASS,
  CATEGORY_TAB_CLASS,
  FAVORITE_CHIP_CLASS,
  FILTER_BUTTON_CLASS,
  LIST_TOOLBAR_CLASS,
  SCOPE_SEGMENTS,
  SCOPE_SEGMENT_CLASS,
  SORT_OPTIONS,
  SORT_SELECT_CLASS,
  staggerStyle,
} from '../_lib/exploreUi';
import { ClubCard } from './ClubCard';
import { ClubExploreSkeleton } from './ClubExploreSkeleton';
import { ClubListItem } from './ClubListItem';

export function ClubExploreFallback({ page }: { page: PageResponse<ClubSummary> | null }) {
  if (page === null) return <ClubExploreSkeleton />;
  const clubs = page.content.map(summaryToClub);
  const { totalElements } = page;

  return (
    <div data-explore-server-list="">
      {/* ─── 데스크탑 (md+) ─── */}
      <div className="hidden md:block">
        <section className="bg-cream pt-page-top pb-7">
          <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10">
            {/* ClubExplorePage 의 같은 행과 맞춘다(손으로 맞춤) — 제목 블록 + 검색 폼(회색 자리) */}
            <div className="flex items-end justify-between mb-7">
              <div>
                <div className="text-[13px] font-semibold text-ink tracking-wide08 mb-2.5">
                  EXPLORE · 동아리 탐색
                </div>
                <h1 className="text-[48px] mb-3">
                  {totalElements > 0 ? `${totalElements}개 동아리를 둘러보세요` : '동아리를 둘러보세요'}
                  <SparkleFull
                    size={28}
                    color="#9DB6A0"
                    className="inline-block ml-2.5 align-middle"
                  />
                </h1>
                <p className="text-[15px] text-charcoal-2">
                  관심사·요일·인원 규모로 필터링할 수 있어요.
                </p>
              </div>
              <div className="h-12 w-[360px] rounded-[14px] bg-graysoft animate-pulse motion-reduce:animate-none" />
            </div>

            {/* ClubExplorePage 의 같은 행 — 스코프 세그먼트('전체' 선택). 선택지·클래스는 exploreUi 공용 상수가 묶는다. */}
            <div className="flex gap-1.5 mb-4">
              {SCOPE_SEGMENTS.map((segment) => {
                const on = segment.key === '전체';
                return (
                  <button key={segment.key} type="button" className={SCOPE_SEGMENT_CLASS(on)}>
                    {segment.key === '전체' ? '전체' : SCOPE_CLUB_LABEL[segment.key]}
                    {on && (
                      <span className="text-[11px] text-sage font-medium tracking-wide04">
                        · {segment.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pt-6 pb-20">
          <div className="max-w-layout mx-auto grid grid-cols-[256px_1fr] gap-8 px-4 sm:px-6 md:px-10">
            <div className="h-[420px] rounded-[18px] border border-line bg-paper animate-pulse motion-reduce:animate-none" />

            <div>
              {/* ClubExplorePage 의 같은 행 — 카운트 문구·찜 칩·정렬. 행·칩·정렬 클래스와 정렬 선택지는 exploreUi 공용
                  상수가 묶고, 카운트 문구는 손으로 맞춘다. */}
              <div className={LIST_TOOLBAR_CLASS.desktop}>
                <div className="text-sm text-charcoal-2">
                  <span className="font-bold text-ink">{clubs.length}개</span>{' '}
                  <span className="text-charcoal-3">
                    · 현재 페이지 (전체 {totalElements}개)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" aria-pressed={false} className={FAVORITE_CHIP_CLASS(false)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    찜한 동아리
                  </button>
                  {/* 하이드레이션되지 않는 fallback 이라 비제어 select 는 onChange 가 필요 없다 — 실제 컨트롤로 교체된다. */}
                  <select defaultValue="RECOMMENDED" className={SORT_SELECT_CLASS.desktop}>
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ClubExplorePage 의 같은 그리드 — CARD_GRID_CLASS 공용. 카드마다 grid 래퍼(같은 행 카드 높이 맞춤) */}
              <div className={CARD_GRID_CLASS}>
                {clubs.map((club, index) => (
                  <div key={club.id} className="grid enter-stagger" style={staggerStyle(index)}>
                    <ClubCard club={club} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ─── 모바일 (<md) ─── */}
      <div className="md:hidden">
        {/* ClubExplorePage 의 같은 행과 맞춘다(손으로 맞춤) — 제목 블록 */}
        <section className="bg-cream px-4 pt-page-top pb-4 sm:px-6">
          <div className="text-[11px] font-bold tracking-wide08 text-ink">EXPLORE</div>
          <h1 className="mt-1 text-[27px] tracking-tightx">동아리 탐색</h1>
        </section>

        {/* ClubExplorePage 의 같은 행과 맞춘다(손으로 맞춤) — sticky 검색 바(회색 자리, 폼 높이 46px) */}
        <div className="sticky top-0 z-40 border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="h-[46px] w-full rounded-[14px] bg-graysoft animate-pulse motion-reduce:animate-none" />
        </div>

        {/* ClubExplorePage 의 같은 행 — 카테고리 레일('전체' 선택). 탭 클래스는 CATEGORY_TAB_CLASS 공용, 레일 틀은 손으로 맞춘다. */}
        <nav className="flex gap-5 overflow-x-auto overscroll-x-contain bg-cream px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
          {[{ value: null, label: '전체' }, ...CATEGORY_OPTIONS].map((option) => (
            <button key={option.label} type="button" className={CATEGORY_TAB_CLASS(option.value === null)}>
              {option.label}
            </button>
          ))}
        </nav>

        {/* ClubExplorePage 의 같은 행 — 모집 중 카운트(미로딩처럼 빈 자리)·필터 버튼·정렬. 행·버튼·정렬 클래스와 정렬
            선택지는 exploreUi 공용 상수가 묶는다. */}
        <div className={LIST_TOOLBAR_CLASS.mobile}>
          <div className="text-[13.5px] text-charcoal-2" />
          <div className="flex items-center gap-2">
            <button type="button" className={FILTER_BUTTON_CLASS}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="10" y1="17" x2="14" y2="17" />
              </svg>
              필터
            </button>
            <div className="relative inline-flex items-center">
              {/* 하이드레이션되지 않는 fallback 이라 비제어 select 는 onChange 가 필요 없다 — 실제 컨트롤로 교체된다. */}
              <select defaultValue="RECOMMENDED" className={SORT_SELECT_CLASS.mobile}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-0 h-[15px] w-[15px] text-charcoal-2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {/* ClubExplorePage 의 같은 목록 래퍼와 맞춘다(손으로 맞춤) */}
        <div className="px-4 pb-8 sm:px-6">
          <div className="flex flex-col gap-3">
            {clubs.map((club, index) => (
              // 실제 화면과 같은 행 래퍼 — 세로 플렉스 아이템이라 폭·간격이 그대로다. 스태거는 래퍼에 단다.
              <div key={club.id} className="enter-stagger" style={staggerStyle(index)}>
                <ClubListItem club={club} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
