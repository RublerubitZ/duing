import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockCloseMutateAsync = vi.fn();
const mockPendingJoinRequests = vi.fn(() => ({ data: [] as unknown[] }));
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ...actualHooks,
    useCloseRecruitmentMutation: () => ({ mutateAsync: mockCloseMutateAsync, isPending: false }),
    useJoinRequestsQuery: () => mockPendingJoinRequests(),
  };
});

// 링크 관리 패널 자체는 회원 등록 영역 테스트가 담당한다 — 여기서는 카드가 그 패널을 어떤 조건으로
// 띄우는지(다이얼로그·canCreate)만 본다.
vi.mock('@/app/manage/clubs/[clubId]/recruitments/_components/MemberEnrollmentSection', () => ({
  MemberEnrollmentPanel: ({
    recruitmentId,
    clubName,
    canCreate,
  }: {
    recruitmentId: number;
    clubName: string;
    canCreate: boolean;
  }) => <div data-testid="join-link-panel">{`${recruitmentId}/${clubName}/${String(canCreate)}`}</div>,
}));

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
    closedAt: null,
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

  it('마감 실패 시 다이얼로그를 유지하고 모달 안에서 안내한다', async () => {
    mockCloseMutateAsync.mockRejectedValue(new Error('이미 마감된 모집입니다.'));
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    fireEvent.click(screen.getByRole('button', { name: '모집 종료' }));
    fireEvent.click(screen.getByRole('button', { name: '마감' }));

    // 공통 규칙(B안) — 카드에 그리면 오버레이·aria-hidden 뒤에 갇힌다.
    const dialog = await screen.findByRole('dialog');
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('이미 마감된 모집입니다.');
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('모집을 마감할까요?')).toBeInTheDocument();
  });
});

// 외부 폼 모집은 지원서·통계를 쓰지 않는다 — 카드 액션 자체가 가입 링크 중심으로 갈린다(스펙 §5.1).
describe('CurrentRecruitmentCard — 외부 폼 모집 액션', () => {
  const externalRecruitment = () =>
    recruitment({ applicationMode: 'EXTERNAL', useInterview: false, externalFormUrl: 'https://forms.gle/abc' });

  it('지원자 관리·통계 대신 가입 링크와 가입 요청 관리를 보여준다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={externalRecruitment()} />);

    expect(screen.getByRole('button', { name: '가입 링크' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /가입 요청 관리/ })).toHaveAttribute(
      'href',
      '/manage/clubs/1/members/requests',
    );
    expect(screen.queryByRole('link', { name: '지원자 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '통계' })).not.toBeInTheDocument();
  });

  it('대기 중인 가입 요청 수를 배지로 보여준다', () => {
    mockPendingJoinRequests.mockReturnValueOnce({ data: [{}, {}, {}] });

    render(<CurrentRecruitmentCard clubId={1} recruitment={externalRecruitment()} />);

    expect(within(screen.getByRole('link', { name: /가입 요청 관리/ })).getByText('3')).toBeInTheDocument();
  });

  it('가입 링크를 누르면 상세로 가지 않고 링크 관리 다이얼로그가 열린다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={externalRecruitment()} />);

    fireEvent.click(screen.getByRole('button', { name: '가입 링크' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('join-link-panel')).toHaveTextContent('42/두잉/true');
  });

  it('마감된 모집(실질 종료)이면 패널에 생성 불가로 전달한다', () => {
    render(
      <CurrentRecruitmentCard
        clubId={1}
        recruitment={{ ...externalRecruitment(), effectivelyOpen: false }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '가입 링크' }));

    expect(screen.getByTestId('join-link-panel')).toHaveTextContent('42/두잉/false');
  });

  it('자체 폼 모집에는 가입 링크 액션을 두지 않는다', () => {
    render(<CurrentRecruitmentCard clubId={1} recruitment={recruitment()} />);

    expect(screen.queryByRole('button', { name: '가입 링크' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /가입 요청 관리/ })).not.toBeInTheDocument();
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
