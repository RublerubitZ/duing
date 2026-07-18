import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FacilityLastUpdated, FacilityStaleNotice } from '../../app/facilities/_components/FacilityUpdateBanner';

describe('FacilityLastUpdated', () => {
  it('마지막 업데이트 시각을 KST 로 표시한다', () => {
    render(<FacilityLastUpdated lastUpdatedAt="2026-07-01T11:20:00+09:00" />);
    expect(screen.getByText('마지막 업데이트 2026-07-01 11:20')).toBeInTheDocument();
  });

  it('lastUpdatedAt 이 null(콜드/미수집)이면 1970 같은 잘못된 날짜 대신 아무것도 렌더하지 않는다', () => {
    const { container } = render(<FacilityLastUpdated lastUpdatedAt={null} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/1970/)).toBeNull();
  });
});

describe('FacilityStaleNotice', () => {
  it('stale=true 이면 캐시 안내 배너를 노출한다', () => {
    render(<FacilityStaleNotice stale={true} />);
    expect(screen.getByText('현재 최신 캐시 데이터를 표시하고 있습니다')).toBeInTheDocument();
  });

  it('stale=false 이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<FacilityStaleNotice stale={false} />);
    expect(container.firstChild).toBeNull();
  });
});
