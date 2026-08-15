import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ApplicantsFilters, ApplicationStatus } from '@duing/types';
import { ApplicantNavBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantNavBar';

let mockNeighborsData: () => { prevApplicationId: number | null; nextApplicationId: number | null };

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@duing/hooks', () => ({
  useApplicantNeighborsQuery: (_rId: number, _aId: number, _filters: unknown) => ({
    data: mockNeighborsData(),
  }),
}));

function renderNavBar({
  prevId = null,
  nextId = null,
  filters = {},
  currentStatus = 'SUBMITTED',
}: {
  prevId?: number | null;
  nextId?: number | null;
  filters?: ApplicantsFilters;
  currentStatus?: ApplicationStatus;
} = {}) {
  mockNeighborsData = () => ({ prevApplicationId: prevId, nextApplicationId: nextId });
  return render(
    <ApplicantNavBar
      clubId={1}
      recruitmentId={2}
      applicationId={3}
      filters={filters}
      currentStatus={currentStatus}
    />,
  );
}

describe('ApplicantNavBar', () => {
  it('prevApplicationId 가 null 이면 이전 버튼이 disabled 이다', () => {
    renderNavBar({ prevId: null, nextId: 2 });
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();
  });

  it('nextApplicationId 가 null 이면 다음 버튼이 disabled 이다', () => {
    renderNavBar({ prevId: 5, nextId: null, currentStatus: 'ON_HOLD' });
    expect(screen.getByRole('button', { name: '이전' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  /* 비식별 조건만 주소에 싣는다 — 검색어는 이름·학번이라 주소에 들어가면 방문 기록·referrer·
   * 액세스 로그로 새어나간다(#913). 이웃 계산에는 여전히 반영되지만 링크에는 남지 않아야 한다. */
  it('목록·이전/다음 링크에 비식별 필터만 싣고 검색어는 빼놓는다', () => {
    renderNavBar({
      prevId: 1,
      nextId: 3,
      filters: { status: 'ON_HOLD', q: '홍길동' },
      currentStatus: 'ON_HOLD',
    });
    const listLink = screen.getByRole('link', { name: '목록' });
    expect(listLink).toHaveAttribute('href', expect.stringContaining('status=ON_HOLD'));
    expect(listLink.getAttribute('href')).not.toContain('q=');
    expect(listLink.getAttribute('href')).not.toContain('홍길동');
  });

  it('이전/다음 이동 주소에도 검색어가 실리지 않는다', () => {
    renderNavBar({
      prevId: 1,
      nextId: 3,
      filters: { status: 'ON_HOLD', q: '홍길동' },
      currentStatus: 'ON_HOLD',
    });
    mockPush.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedHref = String(mockPush.mock.calls[0]?.[0]);
    expect(pushedHref).toContain('status=ON_HOLD');
    expect(pushedHref).not.toContain('q=');
  });

  it('현재 상태 뱃지가 표시된다', () => {
    renderNavBar({ currentStatus: 'INTERVIEW_PENDING' });
    expect(screen.getByText('면접 대상')).toBeInTheDocument();
  });

  /* 화살표는 장식이라 accname 에서 뺀다 — SR 이 "홑화살괄호 이전"으로 읽던 문제의 회귀 가드.
   * role name 은 정규화된 전체 문자열 매치라 '‹ 이전' 이 남아 있으면 실패한다. */
  it('이전/다음 접근 이름에 장식 화살표가 섞이지 않는다', () => {
    renderNavBar({ prevId: 1, nextId: 3 });
    expect(screen.getByRole('button', { name: '이전' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
  });

  /* jsdom 은 CSS 를 모르니 클래스로 못박는다 — 44px 터치 기준(DESIGN.md Touch Target). */
  it('내비 버튼과 목록 링크는 44px 히트 영역을 가진다', () => {
    renderNavBar({ prevId: 1, nextId: 3 });
    expect(screen.getByRole('button', { name: '이전' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: '다음' })).toHaveClass('min-h-11');
    expect(screen.getByRole('link', { name: '목록' })).toHaveClass('min-h-11');
  });

  it('상태 배지는 공용 pill 상수를 쓴다', () => {
    renderNavBar({ currentStatus: 'SUBMITTED' });
    expect(screen.getByText('지원 완료').className).toContain('pill');
  });
});
