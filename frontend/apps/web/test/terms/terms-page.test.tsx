import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav data-testid="info-tabs" />,
}));
vi.mock('../../app/_components/HomeFooter', () => ({
  HomeFooter: () => <footer data-testid="home-footer" />,
}));

import TermsPage from '../../app/terms/page';

// 개정일은 상수 하나로 두고 시행일은 개정일 + 7일(개정 고지 유예)로 산출한다 — 헤더·약관 부칙·처리방침 13조가
// 같은 값을 쓰므로, 상수를 바꾸면 세 곳이 함께 움직여야 한다.
describe('TermsPage 개정일·시행일', () => {
  it('최종 개정일 2026-10-02 과 시행일 2026-10-09(개정일 + 7일)를 헤더에 나란히 보여준다', () => {
    render(<TermsPage />);

    expect(screen.getByText(/최종 개정일: 2026-10-02/)).toBeInTheDocument();
    expect(screen.getByText(/시행일: 2026-10-09/)).toBeInTheDocument();
  });

  it('약관 부칙과 처리방침 13조가 같은 시행일로 "부터 시행합니다" 를 말한다', () => {
    render(<TermsPage />);

    expect(screen.getAllByText(/2026-10-09부터 시행합니다/)).toHaveLength(2);
    expect(screen.queryByText(/2026-09-15/)).not.toBeInTheDocument();
  });
});

// 애드센스 게시자 정책의 필수 고지(제3자 광고 쿠키·웹 비콘·IP)와 처리방침 작성지침의 행태정보 항목 — 빠지면 광고 게재 자격을 잃는다.
describe('TermsPage 광고 쿠키·행태정보 고지', () => {
  it('10조가 제3자 광고 쿠키와 웹 비콘·IP 주소 수집을 고지한다', () => {
    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: '10. 쿠키 등 자동 수집 장치와 행태정보' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google과 Google이 인증한 제3자 광고 네트워크는 쿠키를 사용해/)).toBeInTheDocument();
    expect(screen.getByText(/웹 비콘이나 IP 주소를 이용해 정보를 수집할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/개인정보를 광고 사업자에게 제공하지 않습니다/)).toBeInTheDocument();
  });

  it('Google·제3자 맞춤 광고 해제와 Google 의 데이터 사용 방식 안내를 새 탭 링크로 연다', () => {
    render(<TermsPage />);

    const adsSettingsLink = screen.getByRole('link', { name: 'Google 광고 설정' });
    expect(adsSettingsLink).toHaveAttribute('href', 'https://www.google.com/settings/ads');
    expect(adsSettingsLink).toHaveAttribute('target', '_blank');
    expect(adsSettingsLink).toHaveAttribute('rel', 'noopener noreferrer');

    const thirdPartyOptOutLink = screen.getByRole('link', { name: 'aboutads.info' });
    expect(thirdPartyOptOutLink).toHaveAttribute('href', 'https://www.aboutads.info/choices/');
    expect(thirdPartyOptOutLink).toHaveAttribute('target', '_blank');
    expect(thirdPartyOptOutLink).toHaveAttribute('rel', 'noopener noreferrer');

    const partnerSitesLink = screen.getByRole('link', {
      name: 'Google이 파트너 사이트·앱에서 데이터를 사용하는 방식',
    });
    expect(partnerSitesLink).toHaveAttribute(
      'href',
      'https://policies.google.com/technologies/partner-sites?hl=ko',
    );
    expect(partnerSitesLink).toHaveAttribute('target', '_blank');
    expect(partnerSitesLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
