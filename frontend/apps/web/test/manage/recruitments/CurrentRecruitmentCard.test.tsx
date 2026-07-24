import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockCloseMutateAsync = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ...actualHooks,
    useCloseRecruitmentMutation: () => ({ mutateAsync: mockCloseMutateAsync, isPending: false }),
  };
});

import { CurrentRecruitmentCard } from '@/app/manage/clubs/[clubId]/recruitments/_components/CurrentRecruitmentCard';
import { RecruitmentEmptyState } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentEmptyState';

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 42,
    clubId: 1,
    clubName: '두잉',
    title: '10기 신입 모집',
    startDate: '2026-09-15',
    endDate: '2026-09-27',
    capacity: 20,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    ...over,
  };
}

describe('CurrentRecruitmentCard', () => {
  it('제목은 상세 페이지 링크이고, 뱃지·기간·전형 단계를 렌더한다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    expect(screen.getByRole('link', { name: '10기 신입 모집' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42',
    );
    expect(screen.getByText('모집중')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15 ~ 2026-09-27')).toBeInTheDocument();
    expect(screen.getByText('1. 서류')).toBeInTheDocument();
    expect(screen.getByText('2. 면접')).toBeInTheDocument();
    expect(screen.getByText('3. 최종')).toBeInTheDocument();
  });

  it('링크 순서: 제목 → 지원자 관리 → 면접 관리 → 통계 → 모집글 편집, 모집 종료는 버튼이다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    const linkTexts = screen.getAllByRole('link').map((el) => el.textContent);
    expect(linkTexts).toEqual(['10기 신입 모집', '지원자 관리', '면접 관리', '통계', '모집글 편집']);
    expect(screen.getByRole('link', { name: '지원자 관리' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/applicants',
    );
    expect(screen.getByRole('link', { name: '면접 관리' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/interview',
    );
    expect(screen.getByRole('link', { name: '통계' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/stats',
    );
    expect(screen.getByRole('link', { name: '모집글 편집' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/42/edit',
    );
    expect(screen.getByRole('button', { name: '모집 종료' })).toBeInTheDocument();
  });

  it('면접 미사용 모집은 면접 관리 링크와 면접 단계를 숨긴다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment({ useInterview: false })} />);

    expect(screen.queryByRole('link', { name: '면접 관리' })).not.toBeInTheDocument();
    expect(screen.getByText('1. 서류')).toBeInTheDocument();
    expect(screen.getByText('2. 최종')).toBeInTheDocument();
    expect(screen.queryByText(/면접/)).not.toBeInTheDocument();
  });

  it('모집 종료 버튼 → 확인 모달 → 마감 클릭 시 마감 뮤테이션을 호출한다', async () => {
    mockCloseMutateAsync.mockResolvedValue(undefined);
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    fireEvent.click(screen.getByRole('button', { name: '모집 종료' }));
    expect(screen.getByText('모집을 마감할까요?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '마감' }));
    await waitFor(() => expect(mockCloseMutateAsync).toHaveBeenCalled());
  });

  it('마감 실패 시 다이얼로그를 닫고 에러 메시지를 카드에 렌더한다', async () => {
    mockCloseMutateAsync.mockRejectedValue(new Error('이미 마감된 모집입니다.'));
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    fireEvent.click(screen.getByRole('button', { name: '모집 종료' }));
    fireEvent.click(screen.getByRole('button', { name: '마감' }));

    await waitFor(() => expect(screen.getByText('이미 마감된 모집입니다.')).toBeInTheDocument());
    expect(screen.queryByText('모집을 마감할까요?')).not.toBeInTheDocument();
  });
});

describe('RecruitmentEmptyState', () => {
  it('안내 문구와 새 모집 만들기 CTA를 렌더한다', () => {
    render(<RecruitmentEmptyState clubId={1} />);
    expect(screen.getByText('진행 중인 모집이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /새 모집 만들기/ })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/new',
    );
  });
});
