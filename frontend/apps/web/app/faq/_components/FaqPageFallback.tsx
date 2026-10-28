// Suspense fallback 전용 — 쿼리 없는 첫 진입의 FAQ 기본 목록을 서버에서 그린다(크롤러용 본문). 서버 전용이라 하이드레이션되지
// 않고 클라이언트 렌더(FaqPage)로 교체된다. 그래서 검색줄·칩에 핸들러가 없어도 된다.
// 서버 컴포넌트라 클라이언트 구성요소에는 직렬화 가능한 props 만 넘긴다 — 함수 prop 은 RSC 렌더가 throw 하는데, CI 빌드는
// 데이터 경로를 프리렌더하지 않아 잡지 못한다. 같은 이유로 페이지네이션(onChange 필수)은 그리지 않는다(목록 아래라 교체 때
// 행 위치에 영향이 없다).
// 교체 순간 행이 밀리지 않게 검색줄·칩·목록 래퍼 클래스는 faqUi 공용 상수가 묶고, 최상위 div·max-w-layout 래퍼·제목 블록·
// 1:1 문의 CTA 는 FaqPage 와 손으로 맞춘다(저쪽을 고치면 여기도). 목록이 없으면(빈 목록·장애) 지금 로딩 화면을 그린다.

import Link from 'next/link';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { InfoTabs } from '../../_components/InfoTabs';
import { HomeFooter } from '../../_components/HomeFooter';
import { toRoute } from '../../_lib/route';
import {
  FAQ_CHIP_CLASS,
  FAQ_CHIP_ROW_CLASS,
  FAQ_LIST_CLASS,
  FAQ_SEARCH_BAR_CLASS,
  FAQ_SEARCH_BUTTON_CLASS,
  FAQ_SEARCH_INPUT_CLASS,
  FAQ_SEARCH_INPUT_STYLE,
} from '../_lib/faqUi';
import { FaqAccordionRow } from './FaqAccordionRow';

import type { FederationFaqCategory, FederationFaqItem, PageResponse } from '@duing/types';

type Props = {
  page: PageResponse<FederationFaqItem> | null;
  categories: FederationFaqCategory[] | null;
};

export function FaqPageFallback({ page, categories }: Props) {
  // 빈 목록도 로딩 화면 — 빈 래퍼만 그렸다가 FaqPage 의 빈 상태 문구가 끼어들며 아래가 밀리지 않게(라우트도 빈 목록은 null 로 넘긴다).
  if (page === null || page.content.length === 0) return <RouteLoading />;

  return (
    // FaqPage 와 같은 최상위 정적 div(손으로 맞춤)
    <div>
      <InfoTabs />

      {/* FaqPage 와 같은 래퍼·제목 블록(손으로 맞춤) */}
      <div className="max-w-layout mx-auto px-4 pb-20 pt-page-top sm:px-6 md:px-10">
        <div className="mb-7">
          <h1 className="text-[32px] md:text-[40px]">자주 묻는 질문</h1>
          <p className="mt-2 text-[14px] text-charcoal-2 md:text-[15px]">
            총동아리연합회에 궁금한 점을 확인하세요
          </p>
        </div>

        {/* 검색줄 — JS 전에 친 글자가 교체 때 사라지지 않게 읽기 전용으로 둔다. disabled 는 .btn:disabled 딤이 교체 때
            깜빡여 쓰지 않는다. */}
        <div className={FAQ_SEARCH_BAR_CLASS}>
          <input
            readOnly
            placeholder="질문을 검색하세요"
            aria-label="질문 검색"
            className={FAQ_SEARCH_INPUT_CLASS}
            style={FAQ_SEARCH_INPUT_STYLE}
          />
          <button type="button" className={FAQ_SEARCH_BUTTON_CLASS}>
            검색
          </button>
        </div>

        {/* 카테고리 칩 — "전체" 선택 모양. 카테고리를 못 받았으면(빌드 국면 장애) "전체"만 */}
        <div className={FAQ_CHIP_ROW_CLASS}>
          <button type="button" className={FAQ_CHIP_CLASS(true)}>
            전체
          </button>
          {(categories ?? []).map((category) => (
            <button key={category.id} type="button" className={FAQ_CHIP_CLASS(false)}>
              {category.name}
            </button>
          ))}
        </div>

        <div className={FAQ_LIST_CLASS}>
          {page.content.map((faq, index) => (
            <FaqAccordionRow key={faq.id} faq={faq} index={index} withFeedback={false} />
          ))}
        </div>

        {/* FaqPage 와 같은 상시 CTA(손으로 맞춤) */}
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
