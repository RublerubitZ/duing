import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityItem } from '@duing/types';
import FacilityDetailPage from '../../app/facilities/[facilityId]/page';

const { useFacilityDetailQueryMock } = vi.hoisted(() => ({
  useFacilityDetailQueryMock: vi.fn(),
}));

vi.mock('@duing/hooks', () => ({
  useFacilityDetailQuery: (facilityId: number | undefined, yearMonth?: string) =>
    useFacilityDetailQueryMock(facilityId, yearMonth),
}));

const facility: FacilityItem = {
  id: 12,
  roomName: '공동연습실(1)',
  location: '2105',
  isUsingNow: false,
  currentReservation: null,
  nextReservation: null,
  reservations: [],
};

type FacilityParams = { facilityId: string };

// React 19 `use()` 는 status==='fulfilled' 인 thenable 을 동기 언랩한다 — Suspense 경계 없이 렌더 가능.
function fulfilledParams(value: FacilityParams): Promise<FacilityParams> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}

function renderPage() {
  return render(<FacilityDetailPage params={fulfilledParams({ facilityId: '12' })} />);
}

// 현재월 기본값·±12 클램프가 '오늘' 기준이므로 시각을 고정한다(2026-07-01 11:20 KST → 현재월 2026-07).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-01T02:20:00Z'));
  useFacilityDetailQueryMock.mockImplementation((_facilityId: number, yearMonth?: string) => ({
    isLoading: false,
    data: {
      yearMonth: yearMonth ?? '2026-07',
      lastUpdatedAt: '2026-07-01T11:20:00+09:00',
      stale: false,
      source: 'CACHE',
      facility,
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
  useFacilityDetailQueryMock.mockReset();
});

describe('FacilityDetailPage — 월 이동', () => {
  it('현재월(KST) 라벨을 렌더하고 훅에 현재월을 전달한다', () => {
    renderPage();
    expect(screen.getByText('2026년 7월')).toBeInTheDocument();
    expect(useFacilityDetailQueryMock).toHaveBeenLastCalledWith(12, '2026-07');
  });

  it('이전 달 클릭 시 훅에 이전 월이 전달되고 라벨이 갱신된다', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '← 이전 달' }));
    expect(screen.getByText('2026년 6월')).toBeInTheDocument();
    expect(useFacilityDetailQueryMock).toHaveBeenLastCalledWith(12, '2026-06');
  });

  it('다음 달 클릭 시 훅에 다음 월이 전달된다(연 경계 포함)', () => {
    renderPage();
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '다음 달 →' }));
    }
    expect(screen.getByText('2027년 1월')).toBeInTheDocument();
    expect(useFacilityDetailQueryMock).toHaveBeenLastCalledWith(12, '2027-01');
  });

  it('현재월 -12 에서 이전 달 버튼이 비활성화된다', () => {
    renderPage();
    for (let i = 0; i < 12; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '← 이전 달' }));
    }
    expect(screen.getByText('2025년 7월')).toBeInTheDocument();
    const prevButton = screen.getByRole('button', { name: '← 이전 달' });
    expect(prevButton).toBeDisabled();
    expect(prevButton).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: '다음 달 →' })).toBeEnabled();
    // 비활성 상태에서 클릭해도 경계를 넘지 않는다.
    fireEvent.click(prevButton);
    expect(useFacilityDetailQueryMock).toHaveBeenLastCalledWith(12, '2025-07');
  });

  it('현재월 +12 에서 다음 달 버튼이 비활성화된다', () => {
    renderPage();
    for (let i = 0; i < 12; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '다음 달 →' }));
    }
    expect(screen.getByText('2027년 7월')).toBeInTheDocument();
    const nextButton = screen.getByRole('button', { name: '다음 달 →' });
    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: '← 이전 달' })).toBeEnabled();
  });

  it('월 전환 시 key 리마운트로 날짜 선택이 초기화된다(현재월=오늘, 그 외=1일)', () => {
    renderPage();
    // 현재월(2026-07)의 기본 선택일은 오늘(1일) → 5일로 변경.
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'true');
    // 이전 달(2026-06)로 이동하면 리마운트되어 1일이 기본 선택된다.
    fireEvent.click(screen.getByRole('button', { name: '← 이전 달' }));
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('로딩 중이면 기존 로딩 문구를 유지한다(온디맨드 수집 대기)', () => {
    useFacilityDetailQueryMock.mockImplementation(() => ({ isLoading: true, data: undefined }));
    renderPage();
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });
});
