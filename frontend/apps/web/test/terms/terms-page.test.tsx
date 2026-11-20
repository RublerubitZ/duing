import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav data-testid="info-tabs" />,
}));
vi.mock('../../app/_components/HomeFooter', () => ({
  HomeFooter: () => <footer data-testid="home-footer" />,
}));

import TermsPage from '../../app/terms/page';

// 조항 제목으로 그 조의 article 을 찾는다 — 문구를 다른 조에 적어 두고 통과하는 구현을 막으려고 조 안에서만 찾는다.
function articleOf(title: string): HTMLElement {
  const article = screen.getByRole('heading', { name: title }).closest('article');
  if (article === null) throw new Error(`"${title}" 조항의 article 을 찾지 못했다`);
  return article;
}

// 개정일은 상수 하나로 두고 시행일은 개정일 + 7일(개정 고지 유예)로 산출한다 — 헤더·약관 부칙·처리방침 13조가
// 같은 값을 쓰므로, 상수를 바꾸면 세 곳이 함께 움직여야 한다.
describe('TermsPage 개정일·시행일', () => {
  it('최종 개정일 2026-11-20 과 시행일 2026-11-27(개정일 + 7일)를 헤더에 나란히 보여준다', () => {
    render(<TermsPage />);

    expect(screen.getByText(/최종 개정일: 2026-11-20/)).toBeInTheDocument();
    expect(screen.getByText(/시행일: 2026-11-27/)).toBeInTheDocument();
  });

  it('약관 부칙과 처리방침 13조가 같은 시행일로 "부터 시행합니다" 를 말한다', () => {
    render(<TermsPage />);

    expect(screen.getAllByText(/2026-11-27부터 시행합니다/)).toHaveLength(2);
    expect(screen.queryByText(/2026-10-14/)).not.toBeInTheDocument();
  });
});

// 애드센스 게시자 정책의 필수 고지(제3자 광고 쿠키·웹 비콘·IP)와 처리방침 작성지침의 행태정보 항목 — 빠지면 광고 게재 자격을 잃는다.
describe('TermsPage 광고 쿠키·행태정보 고지', () => {
  it('10조가 제3자 광고 쿠키와 웹 비콘·IP 주소 수집을 고지한다', () => {
    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: '10. 쿠키 등 자동 수집 장치와 행태정보' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Google과 Google이 인증한 제3자 광고 네트워크는 쿠키를 사용해/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/웹 비콘이나 IP 주소를 이용해 정보를 수집할 수 있습니다/),
    ).toBeInTheDocument();
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

// 처리방침은 코드가 실제로 외부에 보내는 개인정보를 빠짐없이 적어야 한다(#1365) — 사업자 이름만이 아니라
// 그 사업자에게 가는 항목까지 줄마다 고정한다.
describe('TermsPage 처리 위탁·국외 이전·분석 쿠키 고지', () => {
  it('삭제한 메일 서비스 Resend 를 어느 조에도 남기지 않는다', () => {
    const { container } = render(<TermsPage />);

    expect(container.textContent).not.toContain('Resend');
  });

  it('5조가 오류 수집·이용 통계·운영 알림·백업 실행·계좌 거래내역 조회 위탁과 R2 백업 보관을 적는다', () => {
    render(<TermsPage />);
    const entrustment = within(articleOf('5. 개인정보 처리의 위탁'));

    expect(entrustment.getAllByText(/^Cloudflare — /)).toHaveLength(1);
    expect(entrustment.getByText(/^Cloudflare — .*데이터베이스 백업 보관/)).toBeInTheDocument();
    expect(entrustment.getByText(/^Sentry — 웹·서버 오류 수집 및 분석$/)).toBeInTheDocument();
    expect(entrustment.getByText(/^PostHog — 서비스 이용 통계 분석$/)).toBeInTheDocument();
    expect(entrustment.getByText(/^Slack — .*회원가입 알림에 이름·학번 포함/)).toBeInTheDocument();
    expect(entrustment.getByText(/^GitHub — 데이터베이스 백업 작업 실행/)).toBeInTheDocument();
    expect(
      entrustment.getByText(
        /^Bank API\(bankapi\.co\.kr\) — .*계좌번호·계좌 비밀번호·예금주 생년월일 전달/,
      ),
    ).toBeInTheDocument();
  });

  it('6조가 Vercel·Sentry·PostHog·Slack·GitHub 로 이전되는 항목을 줄마다 적는다', () => {
    render(<TermsPage />);
    const transfer = within(articleOf('6. 개인정보의 국외 이전'));

    expect(transfer.getByText(/^Vercel Inc\.\(미국\) \/ 이전 항목:/)).toBeInTheDocument();
    expect(
      transfer.getByText(
        /^Functional Software, Inc\.\(Sentry, 미국\) \/ 이전 항목: .*접속 IP 대역 일부/,
      ),
    ).toBeInTheDocument();
    expect(
      transfer.getByText(
        /^PostHog, Inc\.\(미국\) \/ 이전 항목: .*역할·학년·단과대학.*IP 주소, IP 주소로 추정한 위치 \/ 이전 목적:/,
      ),
    ).toBeInTheDocument();
    expect(
      transfer.getByText(
        /^Slack Technologies, LLC\(미국\) \/ 이전 항목: 회원가입 알림의 이름·학번.*보유·이용기간: Slack 워크스페이스의 메시지 보관 설정과 요금제에 따릅니다$/,
      ),
    ).toBeInTheDocument();
    expect(
      transfer.getByText(
        /^GitHub, Inc\.\(미국\) \/ 이전 항목: .* \/ 이전 일시: 매일 04시 15분 무렵 정기 백업/,
      ),
    ).toBeInTheDocument();
  });

  it('6조 도입부가 R2 백업의 국외 저장·Bank API 의 국외 경유·이전 일시 예외를, 끝 문단이 거부 방법을 말한다', () => {
    render(<TermsPage />);
    const transfer = within(articleOf('6. 개인정보의 국외 이전'));

    expect(
      transfer.getByText(
        /Cloudflare R2는 한국 내 저장 위치를 지정할 수 없어 업로드 파일과 데이터베이스 백업에 포함된 개인정보가 국외 데이터센터에 저장될 수 있으며/,
      ),
    ).toBeInTheDocument();
    expect(transfer.queryByText(/국외 서버를 경유할 수 있습니다/)).not.toBeInTheDocument();
    expect(
      transfer.getByText(
        /데이터베이스 백업은 매일 04시 15분 무렵 정기 백업과 수동 백업 때 Cloudflare R2에 업로드됩니다/,
      ),
    ).toBeInTheDocument();
    expect(
      transfer.getByText(
        /Bank API는 Google Cloud Platform에서 운영되어 .*국외 서버를 거칠 수 있으며/,
      ),
    ).toBeInTheDocument();
    expect(transfer.getByText(/따로 적은 경우를 빼고 서비스 이용 시점에/)).toBeInTheDocument();
    expect(
      transfer.getByText(/이전 거부를 요청할 수 있으며, 이 경우 서비스 이용이 제한될 수 있습니다/),
    ).toBeInTheDocument();
  });

  it('10조가 PostHog 분석 쿠키·브라우저 저장소와 마지막 방문 후 1년 유지를 고지한다', () => {
    render(<TermsPage />);
    const cookies = within(articleOf('10. 쿠키 등 자동 수집 장치와 행태정보'));

    expect(
      cookies.getByText(
        /PostHog가 이용자 브라우저에 ph_로 시작하는 쿠키와 브라우저 저장소\(localStorage·sessionStorage\)/,
      ),
    ).toBeInTheDocument();
    expect(cookies.getByText(/쿠키는 마지막 방문 후 1년간 유지됩니다/)).toBeInTheDocument();
    expect(cookies.getByText(/6\. 개인정보의 국외 이전 항목과 같고/)).toBeInTheDocument();
  });

  it('1조가 회비 거래내역 조회 때 받는 계좌 비밀번호·생년월일을 저장하지 않는다고 적는다', () => {
    render(<TermsPage />);
    const collected = within(articleOf('1. 수집하는 개인정보 항목'));

    expect(
      collected.getByText(
        /^동아리 회비 계좌 관리\(운영진\): .*계좌 비밀번호와 예금주 생년월일\(주민등록번호 앞 6자리 — 조회에만 쓰고 저장하지 않음\)/,
      ),
    ).toBeInTheDocument();
  });
});
