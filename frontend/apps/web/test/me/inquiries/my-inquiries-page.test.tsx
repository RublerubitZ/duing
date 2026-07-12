import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FederationInquirySummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseMyFederationInquiriesQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useMyFederationInquiriesQuery: (...args: unknown[]) => mockUseMyFederationInquiriesQuery(...args),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { MyInquiriesPage } from '@/app/me/inquiries/_pages/MyInquiriesPage';

function makeInquiry(overrides: Partial<FederationInquirySummary> = {}): FederationInquirySummary {
  return {
    id: 1,
    title: '동아리 등록 절차 문의',
    status: 'RECEIVED',
    createdAt: '2026-06-01T00:00:00Z',
    answeredAt: null,
    ...overrides,
  };
}

function listResponse(items: FederationInquirySummary[], totalPages = 1) {
  return {
    data: { content: items, totalPages, totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('MyInquiriesPage', () => {
  beforeEach(() => {
    mockUseMyFederationInquiriesQuery.mockReset();
  });

  it('목록을 렌더하고 상태 뱃지 라벨("접수")을 보여준다', () => {
    mockUseMyFederationInquiriesQuery.mockReturnValue(listResponse([makeInquiry()]));

    render(<MyInquiriesPage />);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('동아리 등록 절차 문의')).toBeInTheDocument();
    expect(within(row).getByText('접수')).toBeInTheDocument();
  });

  it('상태 탭을 클릭하면 훅 인자에 status 가 반영되고 page 는 0 으로 초기화된다', () => {
    mockUseMyFederationInquiriesQuery.mockReturnValue(listResponse([]));

    render(<MyInquiriesPage />);

    // 초기 호출: status=undefined(전체), page=0
    expect(mockUseMyFederationInquiriesQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, page: 0 }),
    );

    fireEvent.click(screen.getByRole('button', { name: '답변중' }));

    expect(mockUseMyFederationInquiriesQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'IN_PROGRESS', page: 0 }),
    );
  });

  it('문의 내역이 없으면 안내 문구·FAQ 링크·새 문의 CTA 가 노출된다', () => {
    mockUseMyFederationInquiriesQuery.mockReturnValue(listResponse([]));

    render(<MyInquiriesPage />);

    expect(screen.getByText('아직 문의 내역이 없어요.')).toBeInTheDocument();

    const faqLink = screen.getByRole('link', { name: '자주 묻는 질문' });
    expect(faqLink).toHaveAttribute('href', '/faq');

    const ctaLink = screen.getByRole('link', { name: '새 문의 작성' });
    expect(ctaLink).toHaveAttribute('href', '/me/inquiries/new');
  });
});
