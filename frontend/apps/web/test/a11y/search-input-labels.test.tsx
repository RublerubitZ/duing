import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// FaqPage 렌더에 필요한 최소 셋업 — test/faq/faq-page.test.tsx 의 모킹을 그대로 따른다.
vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));

vi.mock('../../app/_components/HomeFooter', () => ({
  HomeFooter: () => <footer aria-label="푸터" />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/faq',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@duing/hooks', () => ({
  useFederationFaqCategoriesQuery: () => ({ data: [] }),
  useFederationFaqListQuery: () => ({
    data: { content: [], totalPages: 0, totalElements: 0 },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  }),
  useFederationFaqDetailQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useSubmitFaqFeedbackMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
  useOptionalToast: () => vi.fn(),
}));

/* ── 테스트 ─────────────────────────────────────────────────── */
import { FaqPage } from '../../app/faq/_pages/FaqPage';

describe('검색 입력 접근 이름', () => {
  it('FAQ 검색 입력은 "질문 검색" 이름을 가진다', () => {
    render(<FaqPage />);
    expect(screen.getByRole('textbox', { name: '질문 검색' })).toBeInTheDocument();
  });
});
