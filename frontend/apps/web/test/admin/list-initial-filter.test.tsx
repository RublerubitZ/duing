import { render } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const mockReportList = vi.fn();
const mockInquiryList = vi.fn();
const mockPromotionList = vi.fn();
const mockSuccessionList = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ...actual,
    useAdminReportListQuery: (params: unknown) => mockReportList(params),
    useAdminFederationInquiryListQuery: (params: unknown) => mockInquiryList(params),
    useAdminPromotionRequestListQuery: (params: unknown) => mockPromotionList(params),
    useAdminSuccessionListQuery: (params: unknown) => mockSuccessionList(params),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import { AdminInquiriesListPage } from '@/app/admin/inquiries/_pages/AdminInquiriesListPage';
import { AdminSuccessionListPage } from '@/app/admin/leader-succession/_pages/AdminSuccessionListPage';
import { AdminPromotionRequestsListPage } from '@/app/admin/promotion-requests/_pages/AdminPromotionRequestsListPage';
import { AdminReportsListPage } from '@/app/admin/reports/_pages/AdminReportsListPage';

const LOADING = { data: undefined, isLoading: true, isError: false, isSuccess: false };
// 목록 본문 조회는 페이지 크기 20 — 문의 화면의 접수 건수 배지 조회(size 1)와 구분한다.
const LIST_PAGE_SIZE = 20;

type ListCase = { name: string; Page: ComponentType; listMock: ReturnType<typeof vi.fn>; status: string };
const cases: ListCase[] = [
  { name: '신고', Page: AdminReportsListPage, listMock: mockReportList, status: 'PENDING' },
  { name: '1:1 문의', Page: AdminInquiriesListPage, listMock: mockInquiryList, status: 'IN_PROGRESS' },
  { name: '홍보 요청', Page: AdminPromotionRequestsListPage, listMock: mockPromotionList, status: 'PENDING' },
  { name: '회장 승계', Page: AdminSuccessionListPage, listMock: mockSuccessionList, status: 'PENDING' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.mockReturnValue(new URLSearchParams());
  for (const { listMock } of cases) listMock.mockReturnValue(LOADING);
});

describe('목록 화면 주소 초기 필터', () => {
  it.each(cases)('$name 목록은 주소의 status 를 첫 상태 필터로 쓴다', ({ Page, listMock, status }) => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`status=${status}`));
    render(<Page />);
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ status, page: 0, size: LIST_PAGE_SIZE }));
  });

  it.each(cases)('$name 목록은 모르는 status 면 전체로 연다', ({ Page, listMock }) => {
    mockSearchParams.mockReturnValue(new URLSearchParams('status=DELETED'));
    render(<Page />);
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ status: undefined, size: LIST_PAGE_SIZE }));
  });

  it.each(cases)('$name 목록은 주소 쿼리만 바뀌어도 첫 값부터 다시 시작한다', ({ Page, listMock, status }) => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`status=${status}`));
    const { rerender } = render(<Page />);
    listMock.mockClear();

    mockSearchParams.mockReturnValue(new URLSearchParams());
    rerender(<Page />);

    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ status: undefined, size: LIST_PAGE_SIZE }));
    expect(listMock).not.toHaveBeenCalledWith(expect.objectContaining({ status, size: LIST_PAGE_SIZE }));
  });
});
