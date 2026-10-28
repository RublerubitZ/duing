/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  // InfoTabs(useRoutePathname)·HomeFooter(FooterClubApplyCta 의 useGuardedRouter)가 부른다.
  usePathname: () => '/faq',
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  // 정적 렌더 중 fallback 트리가 useSearchParams 를 부르면 가장 가까운 Suspense 경계(faq/loading.tsx)까지 클라이언트 렌더로
  // 넘어가 크롤러가 받는 HTML 이 다시 로딩 화면이 된다 — fallback 트리에 들어오면 여기서 깨지게 한다.
  useSearchParams: () => {
    throw new Error('FAQ 서버 기본 목록 트리에서 useSearchParams 금지 — ISR HTML 이 로딩 화면으로 바뀐다(CSR bailout)');
  },
}));

import { FaqPageFallback } from '@/app/faq/_components/FaqPageFallback';
import { FAQ_CHIP_CLASS } from '@/app/faq/_lib/faqUi';

import { faqCategories, faqListPage } from './faq-page-fallback-fixture';

// 칩은 공용 클래스로 센다 — 행의 카테고리 캡션과 같은 이름이 섞이지 않게.
const countChips = (html: string, selected: boolean) => html.split(`class="${FAQ_CHIP_CLASS(selected)}"`).length - 1;

/** React 개발 경고(key 누락·잘못된 DOM 속성·제어 입력 등)는 서버 렌더에서 throw 없이 console 로만 남는다. */
function spyConsoleWarnings() {
  return {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  };
}

// 단언이 실패해도 console 이 막힌 채 남지 않게 매 테스트 뒤 되돌린다.
afterEach(() => vi.restoreAllMocks());

// 빌드·재생성 중 서버에서 그려진다 — throw 하면 빌드가 깨지거나 재생성이 실패한다.
describe('FaqPageFallback — 서버 렌더', () => {
  it('질문·답변·카테고리 캡션과 칩(질문 없는 카테고리 포함)을 경고 없이 담는다', () => {
    const consoleSpies = spyConsoleWarnings();

    const html = renderToString(<FaqPageFallback page={faqListPage} categories={faqCategories} />);

    expect(consoleSpies.error).not.toHaveBeenCalled();
    expect(consoleSpies.warn).not.toHaveBeenCalled();
    // Suspense 안 SSR 오류는 renderToString 이 삼키고 <!--$!--> 표식만 남긴다.
    expect(html).not.toContain('<!--$!-->');
    // InfoTabs·푸터에도 같은 문구가 있어 제목 요소로 좁힌다.
    expect(html).toMatch(/<h1[^>]*>자주 묻는 질문<\/h1>/);
    expect(html).toContain('두잉은 어떤 서비스인가요?');
    expect(html).toContain('우리 동아리도 두잉에 등록할 수 있나요?');
    // 답변은 접힌 패널 안에 있어도 HTML 에 있어야 한다(크롤러 본문).
    expect(html).toContain('대구대학교 동아리를 둘러보고 지원부터 운영까지 한곳에서 하는 통합 플랫폼이에요.');
    expect(html).toContain('총동아리연합회 심사를 거쳐 등록돼요.\n1:1 문의로 신청해 주세요.');
    expect(html).toContain('>동아리 등록</span>');
    expect(html).toContain('>고정</span>');
    // 칩 — "전체"가 선택된 모양이고, 질문이 하나도 없는 카테고리도 칩으로 그린다.
    expect(countChips(html, true)).toBe(1);
    expect(countChips(html, false)).toBe(faqCategories.length);
    expect(html).toContain('>전체</button>');
    expect(html).toContain('>기타</button>');
    expect(html).toContain('>지원사업·예산</button>');
    // 검색줄은 같은 자리에 읽기 전용으로 그린다 — disabled 는 .btn:disabled 딤이 교체 때 깜빡여 쓰지 않는다.
    expect(html).toContain('aria-label="질문 검색"');
    expect(html).toContain('readOnly=""');
    expect(html).not.toContain('disabled=""');
    // 피드백 위젯은 뺀다 — 하이드레이션되지 않아 동작하지 않고, 문구가 크롤러 본문에 섞인다.
    expect(html).not.toContain('도움됐어요');
    expect(html).toContain('href="/me/inquiries/new"');
  });

  it('여러 페이지여도 경고 없이 그리고 페이지네이션은 그리지 않는다(onChange 는 함수 prop)', () => {
    const consoleSpies = spyConsoleWarnings();
    const multiPage = { ...faqListPage, totalElements: 45, totalPages: 3, hasNext: true };

    const html = renderToString(<FaqPageFallback page={multiPage} categories={faqCategories} />);

    expect(consoleSpies.error).not.toHaveBeenCalled();
    expect(consoleSpies.warn).not.toHaveBeenCalled();
    expect(html).not.toContain('<!--$!-->');
    expect(html).toContain('두잉은 어떤 서비스인가요?');
    expect(html).not.toContain('aria-label="FAQ 페이지"');
  });

  it('목록이 없으면 지금 로딩 화면을 그린다', () => {
    const html = renderToString(<FaqPageFallback page={null} categories={faqCategories} />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="페이지 불러오는 중"');
    expect(html).not.toContain('두잉은 어떤 서비스인가요?');
    expect(html).not.toContain('>기타</button>');
  });

  it('빈 목록이 와도 로딩 화면을 그린다 — 빈 래퍼만 그리면 교체 때 빈 상태 문구가 끼어들며 아래가 밀린다', () => {
    const emptyPage = { ...faqListPage, content: [], totalElements: 0, totalPages: 0, hasNext: false };
    const html = renderToString(<FaqPageFallback page={emptyPage} categories={faqCategories} />);

    expect(html).toContain('aria-label="페이지 불러오는 중"');
    expect(html).not.toContain('>기타</button>');
  });

  it('카테고리가 없으면(빌드 국면 장애) 칩은 "전체"만 그린다', () => {
    const consoleSpies = spyConsoleWarnings();

    const html = renderToString(<FaqPageFallback page={faqListPage} categories={null} />);

    expect(consoleSpies.error).not.toHaveBeenCalled();
    expect(countChips(html, true)).toBe(1);
    expect(countChips(html, false)).toBe(0);
    expect(html).toContain('>전체</button>');
    expect(html).toContain('두잉은 어떤 서비스인가요?');
  });
});
