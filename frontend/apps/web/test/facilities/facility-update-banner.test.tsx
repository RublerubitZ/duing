import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FacilityUpdateBanner } from '../../app/facilities/_components/FacilityUpdateBanner';

describe('FacilityUpdateBanner', () => {
  it('마지막 업데이트 시각을 KST 로 표시한다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt="2026-07-01T11:20:00+09:00" stale={false} />);
    expect(screen.getByText('마지막 업데이트 2026-07-01 11:20')).toBeInTheDocument();
  });

  it('stale=true 이면 캐시 안내 배너를 노출한다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt="2026-07-01T11:20:00+09:00" stale={true} />);
    expect(screen.getByText('현재 최신 캐시 데이터를 표시하고 있습니다')).toBeInTheDocument();
  });

  it('stale=false 이면 캐시 안내 배너를 노출하지 않는다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt="2026-07-01T11:20:00+09:00" stale={false} />);
    expect(screen.queryByText('현재 최신 캐시 데이터를 표시하고 있습니다')).toBeNull();
  });

  it('lastUpdatedAt 이 null(콜드/미수집)이면 1970 같은 잘못된 날짜 대신 업데이트 줄을 숨기고, stale 안내는 그대로 노출한다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt={null} stale={true} />);
    expect(screen.queryByText(/마지막 업데이트/)).toBeNull();
    expect(screen.queryByText(/1970/)).toBeNull();
    expect(screen.getByText('현재 최신 캐시 데이터를 표시하고 있습니다')).toBeInTheDocument();
  });
});
