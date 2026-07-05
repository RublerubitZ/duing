import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FederationFaqItem } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// ExploreNav/HomeFooter 는 인증 스토어·알림 훅 체인을 물고 있어 FAQ 본문과 무관한 복잡도를
// 늘리므로 단순 스텁으로 대체한다(notices-page.test.tsx 의 ExploreNav 스텁 패턴과 동일).
vi.mock('../../app/_components/ExploreNav', () => ({
  ExploreNav: () => <nav aria-label="탐색 네비게이션" />,
}));

vi.mock('../../app/_components/HomeFooter', () => ({
  HomeFooter: () => <footer aria-label="푸터" />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockRouterReplace = vi.fn();
let mockItemParam: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'item' ? mockItemParam : null) }),
}));

const mockUseFederationFaqCategoriesQuery = vi.fn();
const mockUseFederationFaqListQuery = vi.fn();
const mockUseFederationFaqDetailQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFederationFaqCategoriesQuery: (...args: unknown[]) => mockUseFederationFaqCategoriesQuery(...args),
  useFederationFaqListQuery: (...args: unknown[]) => mockUseFederationFaqListQuery(...args),
  useFederationFaqDetailQuery: (...args: unknown[]) => mockUseFederationFaqDetailQuery(...args),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { FaqPage } from '../../app/faq/_pages/FaqPage';

function makeFaqItem(overrides: Partial<FederationFaqItem> = {}): FederationFaqItem {
  return {
    id: 1,
    categoryId: 1,
    categoryName: '일반',
    question: '테스트 질문입니다',
    answer: '테스트 답변입니다',
    pinned: false,
    ...overrides,
  };
}

function makeListResponse(items: FederationFaqItem[]) {
  return {
    data: { content: items, totalPages: Math.ceil(items.length / 20), totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('FaqPage', () => {
  beforeEach(() => {
    mockRouterReplace.mockReset();
    mockItemParam = null;
    mockUseFederationFaqCategoriesQuery.mockReset().mockReturnValue({ data: [] });
    mockUseFederationFaqListQuery.mockReset().mockReturnValue(makeListResponse([]));
    mockUseFederationFaqDetailQuery
      .mockReset()
      .mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('목록에 고정 뱃지·질문·카테고리명이 노출된다', () => {
    const pinned = makeFaqItem({
      id: 1,
      question: '동아리 가입 절차가 궁금해요',
      categoryName: '가입',
      pinned: true,
    });
    const normal = makeFaqItem({
      id: 2,
      question: '동아리 탈퇴는 어떻게 하나요',
      categoryName: '탈퇴',
      pinned: false,
    });
    mockUseFederationFaqListQuery.mockReturnValue(makeListResponse([pinned, normal]));

    render(<FaqPage />);

    expect(screen.getByText('동아리 가입 절차가 궁금해요')).toBeInTheDocument();
    expect(screen.getByText('동아리 탈퇴는 어떻게 하나요')).toBeInTheDocument();
    expect(screen.getByText('고정')).toBeInTheDocument();
    expect(screen.getByText('가입')).toBeInTheDocument();
    expect(screen.getByText('탈퇴')).toBeInTheDocument();
  });

  it('검색어 입력만으로는 keyword 가 전달되지 않고, Enter 로 확정해야 keyword 를 포함한 인자로 훅이 호출된다', () => {
    render(<FaqPage />);

    const input = screen.getByPlaceholderText('질문을 검색하세요');
    fireEvent.change(input, { target: { value: '휴학' } });

    // 입력만 한 상태에서는 훅 호출 인자에 keyword 가 아직 반영되지 않는다.
    expect(
      mockUseFederationFaqListQuery.mock.calls.some((call) => call[0]?.keyword === '휴학'),
    ).toBe(false);

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockUseFederationFaqListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '휴학', page: 0 }),
    );
  });

  it('검색 결과가 없으면 안내 문구와 1:1 문의 CTA 가 노출된다', () => {
    mockUseFederationFaqListQuery.mockReturnValue(makeListResponse([]));

    render(<FaqPage />);

    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument();
    const inquiryLink = screen.getByRole('link', { name: '1:1 문의하기' });
    expect(inquiryLink).toHaveAttribute('href', '/me/inquiries/new');
  });

  it('item 쿼리스트링으로 진입하면 FaqDeepLinkCard 가 렌더되고 해당 id 로 상세 조회 훅이 호출된다', () => {
    mockItemParam = '5';
    mockUseFederationFaqDetailQuery.mockReturnValue({
      data: makeFaqItem({ id: 5, question: '공유된 질문 내용' }),
      isLoading: false,
      isError: false,
    });

    render(<FaqPage />);

    expect(screen.getByText('공유된 질문')).toBeInTheDocument();
    expect(screen.getByText('공유된 질문 내용')).toBeInTheDocument();
    expect(mockUseFederationFaqDetailQuery).toHaveBeenCalledWith(5);
  });

  it('딥링크 대상 FAQ 조회가 에러이면 "해당 FAQ를 찾을 수 없어요" 문구가 보인다', () => {
    mockItemParam = '5';
    mockUseFederationFaqDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<FaqPage />);

    expect(screen.getByText('해당 FAQ를 찾을 수 없어요')).toBeInTheDocument();
  });
});
