import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@duing/api';
import type { AdminClubSignals } from '@duing/types';

const mockClubSignals = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useAdminClubSignalsQuery: () => mockClubSignals(),
}));

import { AdminClubSignalsCard } from '@/app/admin/_components/home/AdminClubSignalsCard';

const NOW = new Date('2026-11-01T12:00:00+09:00');

function makeSignals(overrides: Partial<AdminClubSignals> = {}): AdminClubSignals {
  return {
    activeClubCount: 165,
    resultWaiting: { clubCount: 6, applicationCount: 15, oldestEndedOn: '2026-07-25' },
    joinRequestWaiting: { clubCount: 1, requestCount: 1, oldestRequestedAt: '2026-10-23T03:00:00Z' },
    noRecordClubCount: 110,
    operatorInactiveClubCount: 119,
    ...overrides,
  };
}

const loaded = (data: AdminClubSignals) => ({ data, isError: false, error: null });
const failed = (status: number) => ({ data: undefined, isError: true, error: new ApiError(status, '오류') });
const loading = () => ({ data: undefined, isError: false, error: null });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mockClubSignals.mockReturnValue(loaded(makeSignals()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('AdminClubSignalsCard', () => {
  it('제목·운영 중 수·두 묶음 문구를 스펙 그대로 쓴다', () => {
    render(<AdminClubSignalsCard />);
    expect(screen.getByRole('heading', { name: '동아리 현황' })).toBeInTheDocument();
    expect(screen.getByText('운영 중 165곳')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '운영진에게 알릴 일' })).toBeInTheDocument();
    expect(screen.getByText('총동연이 대신 처리할 수 없어요 · 운영진에게 연락해 주세요')).toBeInTheDocument();
    expect(screen.getByText('결과 미확정 지원 15건 · 모집 끝나고 7일 넘김')).toBeInTheDocument();
    expect(screen.getByText('가장 오래된 모집은 99일 전에 끝났어요')).toBeInTheDocument();
    expect(screen.getByText('대기 신청 1건 · 가장 오래된 신청은 9일 전')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '두잉 사용 현황 (참고)' })).toBeInTheDocument();
    expect(screen.getByText('동아리 활동 평가 기준이 아니에요')).toBeInTheDocument();
    expect(screen.getByText('두잉에 기록을 올린 동아리')).toBeInTheDocument();
    expect(screen.getByText('55 / 165곳')).toBeInTheDocument();
    expect(screen.getByText('사진·대표 활동·일정·모집이 하나라도 있는 곳')).toBeInTheDocument();
    expect(screen.getByText('운영진이 30일 안에 들어온 동아리')).toBeInTheDocument();
    expect(screen.getByText('46 / 165곳')).toBeInTheDocument();
  });

  it('① 행 전체가 신호 목록 링크이고 › 는 읽지 않는다, ② 는 보조 줄 아래 글자 링크다', () => {
    render(<AdminClubSignalsCard />);
    expect(screen.getByRole('link', { name: /^지원 결과 미확정/ })).toHaveAttribute('href', '/admin/clubs?signal=RESULT_WAITING');
    expect(screen.getByRole('link', { name: /^가입 신청 7일 넘게 대기/ })).toHaveAttribute('href', '/admin/clubs?signal=JOIN_REQUEST_WAITING');
    expect(screen.getByRole('link', { name: '기록 없는 110곳 보기' })).toHaveAttribute('href', '/admin/clubs?signal=NO_RECORD');
    expect(screen.getByRole('link', { name: '30일 넘게 안 들어온 119곳 보기' })).toHaveAttribute('href', '/admin/clubs?signal=OPERATOR_INACTIVE');
    const arrows = screen.getAllByText('›');
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows) expect(arrow).toHaveAttribute('aria-hidden', 'true');
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('min-h-11');
  });

  it('① 0곳인 행은 "없음"으로 쓰고 링크를 걸지 않는다', () => {
    mockClubSignals.mockReturnValue(loaded(makeSignals({ resultWaiting: { clubCount: 0, applicationCount: 0, oldestEndedOn: null } })));
    render(<AdminClubSignalsCard />);
    expect(screen.queryByRole('link', { name: /^지원 결과 미확정/ })).toBeNull();
    expect(screen.getByText('없음')).toBeInTheDocument();
    expect(screen.queryByText(/결과 미확정 지원 0건/)).toBeNull();
    expect(screen.getByRole('link', { name: /^가입 신청 7일 넘게 대기/ })).toBeInTheDocument();
  });

  it('① 두 행이 모두 0곳이면 묶음을 "지금은 운영진에게 알릴 일이 없어요" 한 줄로 접는다', () => {
    mockClubSignals.mockReturnValue(loaded(makeSignals({
      resultWaiting: { clubCount: 0, applicationCount: 0, oldestEndedOn: null },
      joinRequestWaiting: { clubCount: 0, requestCount: 0, oldestRequestedAt: null },
    })));
    render(<AdminClubSignalsCard />);
    expect(screen.getByText('지금은 운영진에게 알릴 일이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('총동연이 대신 처리할 수 없어요 · 운영진에게 연락해 주세요')).toBeNull();
    expect(screen.queryByText('지원 결과 미확정')).toBeNull();
  });

  it('② 링크 숫자가 0 이면 링크를 빼고 "모두 올렸어요"·"모두 들어왔어요"로 쓰고, 뺄셈은 0 아래로 자른다', () => {
    mockClubSignals.mockReturnValue(loaded(makeSignals({ noRecordClubCount: 0, operatorInactiveClubCount: 170 })));
    render(<AdminClubSignalsCard />);
    expect(screen.getByText('모두 올렸어요')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /기록 없는/ })).toBeNull();
    expect(screen.getByText('165 / 165곳')).toBeInTheDocument();
    expect(screen.getByText('0 / 165곳')).toBeInTheDocument();
    mockClubSignals.mockReturnValue(loaded(makeSignals({ operatorInactiveClubCount: 0 })));
    render(<AdminClubSignalsCard />);
    expect(screen.getByText('모두 들어왔어요')).toBeInTheDocument();
  });

  it('운영 중 동아리가 0곳이면 ② 본문을 "운영 중 동아리가 없어요"로 쓴다', () => {
    mockClubSignals.mockReturnValue(loaded(makeSignals({
      activeClubCount: 0,
      resultWaiting: { clubCount: 0, applicationCount: 0, oldestEndedOn: null },
      joinRequestWaiting: { clubCount: 0, requestCount: 0, oldestRequestedAt: null },
      noRecordClubCount: 0,
      operatorInactiveClubCount: 0,
    })));
    render(<AdminClubSignalsCard />);
    expect(screen.getByText('운영 중 0곳')).toBeInTheDocument();
    expect(screen.getByText('운영 중 동아리가 없어요')).toBeInTheDocument();
    expect(screen.queryByText('두잉에 기록을 올린 동아리')).toBeNull();
  });

  it('경고색을 쓰지 않는다', () => {
    const { container } = render(<AdminClubSignalsCard />);
    expect(container.querySelector('[class*="coral"]')).toBeNull();
  });

  it('받는 중이면 로딩, 404(옛 백엔드)면 카드를 그리지 않고, 그 밖의 오류는 기존 오류 안내를 쓴다', () => {
    mockClubSignals.mockReturnValue(loading());
    const { unmount } = render(<AdminClubSignalsCard />);
    expect(screen.getByRole('heading', { name: '동아리 현황' })).toBeInTheDocument();
    expect(screen.queryByText('운영진에게 알릴 일')).toBeNull();
    unmount();

    mockClubSignals.mockReturnValue(failed(404));
    const { container, unmount: unmountNotFound } = render(<AdminClubSignalsCard />);
    expect(container).toBeEmptyDOMElement();
    unmountNotFound();

    mockClubSignals.mockReturnValue(failed(500));
    render(<AdminClubSignalsCard />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('창 포커스 재조회가 실패해도 받은 숫자는 남고 "일부 정보를 불러오지 못했어요."만 붙는다', () => {
    mockClubSignals.mockReturnValue({ data: makeSignals(), isError: true, error: new ApiError(500, '오류') });
    render(<AdminClubSignalsCard />);
    expect(screen.getByText('55 / 165곳')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });
});
