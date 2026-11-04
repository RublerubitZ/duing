import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminClubSignal, AdminClubSignalDetail, AdminClubSummary } from '@duing/types';

import { AdminClubsTable } from '@/app/admin/clubs/_components/AdminClubsTable';

vi.mock('next/link', () => ({
  default: ({ href, children, ...anchorProps }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  ),
}));

const NOW = new Date('2026-11-01T12:00:00+09:00');
const LONG_TITLE = '2026학년도 2학기 정기 신입 부원 모집 — 면접 일정은 개별 안내 예정';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 7, name: '두잉 코딩 동아리', category: 'ACADEMIC', division: '공과대학', college: null, logoUrl: null,
    status: 'ACTIVE', tags: [], leaderId: 3, leaderName: '김회장', leaderStudentId: '20250002', centralClub: false,
    facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt: null, statusChangedByName: null,
    ...overrides,
  };
}

const RESULT_DETAIL: AdminClubSignalDetail = {
  operatorsLastActiveAt: '2026-10-01T03:00:00Z',
  resultWaiting: {
    oldestRecruitmentId: 31, oldestRecruitmentTitle: LONG_TITLE, oldestEndedOn: '2026-10-20',
    recruitmentCount: 2, applicationCount: 5,
  },
  joinRequestWaiting: null,
};

function renderTable(clubs: AdminClubSummary[], signal?: AdminClubSignal) {
  return render(
    <AdminClubsTable
      clubs={clubs}
      signal={signal}
      onActionClick={vi.fn()}
      onCentralClubToggleClick={vi.fn()}
      onSecuredTargetToggleClick={vi.fn()}
      onCloseClick={vi.fn()}
      onPendingCleanupClick={vi.fn()}
    />,
  );
}

describe('AdminClubsTable — 신호 화면', () => {
  it('이름·회장 열만 두고 상태 변경·지정 버튼을 그리지 않는다(첫 열 16rem)', () => {
    renderTable([makeClub({ signalDetail: RESULT_DETAIL })], 'RESULT_WAITING');
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['이름', '회장']);
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveClass('min-w-[16rem]');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText('공과대학')).toBeNull();
  });

  it('결과 대기 — 모집 제목 링크는 같은 창 모집 상세로 가고, 접근 이름·title 에 전체 제목, 폭 상한으로 말줄임한다', () => {
    renderTable([makeClub({ signalDetail: RESULT_DETAIL })], 'RESULT_WAITING');
    const recruitmentLink = screen.getByRole('link', { name: `두잉 코딩 동아리 모집: ${LONG_TITLE}` });
    expect(recruitmentLink).toHaveAttribute('href', '/admin/recruitments/31');
    expect(recruitmentLink).toHaveAttribute('title', LONG_TITLE);
    expect(recruitmentLink).not.toHaveAttribute('target');
    expect(recruitmentLink).toHaveClass('max-w-[12rem]', 'truncate');
    expect(screen.getByText('· 끝난 지 12일')).toBeInTheDocument();
    expect(screen.getByText('결과 미확정 지원 5건 · 모집 2건')).toBeInTheDocument();
    expect(screen.getByText('운영진 마지막 접속 31일 전 · 두잉 알림이 닿지 않을 수 있어요')).toBeInTheDocument();
  });

  it('신호 화면 어느 줄에도 경고색을 쓰지 않는다 — 회장 정보 없음도 중립색', () => {
    const { container } = renderTable(
      [
        makeClub({ signalDetail: RESULT_DETAIL }),
        makeClub({ id: 8, name: '회장 없는 동아리', leaderId: null, leaderName: null, leaderStudentId: null, signalDetail: RESULT_DETAIL }),
      ],
      'RESULT_WAITING',
    );
    expect(screen.getByText('회장 정보 없음')).toBeInTheDocument();
    expect(container.querySelector('[class*="coral"]')).toBeNull();
    expect(container.querySelector('[class*="rose"]')).toBeNull();
  });

  it('재료가 없는 행(처리 경합)은 운영진 줄만, signalDetail 이 null 인 행은 살펴볼 점이 없다', () => {
    renderTable(
      [
        makeClub({ id: 8, name: '경합 동아리', signalDetail: { operatorsLastActiveAt: null, resultWaiting: null, joinRequestWaiting: null } }),
        makeClub({ id: 9, name: '재료 키 null 동아리', signalDetail: null }),
      ],
      'RESULT_WAITING',
    );
    expect(screen.getByText('운영진 접속 기록 없음 · 두잉 알림이 닿지 않을 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText(/결과 미확정 지원/)).toBeNull();
    expect(screen.getAllByText(/운영진/)).toHaveLength(1);
  });

  it('신호가 없는 일반 목록은 여섯 열 그대로다', () => {
    renderTable([makeClub()]);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '이름', '분류', '회장', '상태', '최근 변경', '액션',
    ]);
  });
});
