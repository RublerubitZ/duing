import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ClubSnsLink } from '@duing/types';

import { ClubContactCard } from '@/app/clubs/[clubId]/_components/ClubContactCard';

describe('ClubContactCard — SNS 표시', () => {
  it('기타 플랫폼은 label 로 표시된다', () => {
    const link: ClubSnsLink = { platform: 'OTHER', label: 'GitHub', url: 'https://github.com/doing' };
    render(<ClubContactCard snsLinks={[link]} location={null} contactPhone={null} contactVisibility="PUBLIC" />);

    const anchor = screen.getByRole('link', { name: /GitHub/ });
    expect(anchor).toHaveAttribute('href', 'https://github.com/doing');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('기본 플랫폼은 고정 명칭으로 표시된다', () => {
    const link: ClubSnsLink = { platform: 'KAKAO', label: null, url: 'https://open.kakao.com/o/abc123' };
    render(<ClubContactCard snsLinks={[link]} location={null} contactPhone={null} contactVisibility="PUBLIC" />);

    expect(screen.getByRole('link', { name: /카카오톡/ })).toBeInTheDocument();
  });

  it('위험한 SNS URL(javascript: 등)은 링크를 만들지 않고 텍스트로 렌더한다', () => {
    const link: ClubSnsLink = { platform: 'OTHER', label: 'Blog', url: 'javascript:alert(1)' };
    const { container } = render(
      <ClubContactCard snsLinks={[link]} location={null} contactPhone={null} contactVisibility="PUBLIC" />,
    );

    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText(/Blog/)).toBeInTheDocument();
  });
});

describe('ClubContactCard — 대표 연락처 정책', () => {
  it('전화번호는 tel: 링크로 렌더된다', () => {
    render(<ClubContactCard snsLinks={[]} location={null} contactPhone="010-1234-5678" contactVisibility="PUBLIC" />);

    const anchor = screen.getByRole('link', { name: '010-1234-5678' });
    expect(anchor).toHaveAttribute('href', 'tel:01012345678');
  });

  it('LOGGED_IN_ONLY 인데 전화번호가 없으면 안내 문구를 링크 없이 표시한다', () => {
    render(<ClubContactCard snsLinks={[]} location={null} contactPhone={null} contactVisibility="LOGGED_IN_ONLY" />);

    expect(screen.getByText('로그인 후 확인 가능')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('PRIVATE 이면 비공개 안내를 표시한다', () => {
    render(<ClubContactCard snsLinks={[]} location={null} contactPhone={null} contactVisibility="PRIVATE" />);

    expect(screen.getByText('대표 연락처 비공개')).toBeInTheDocument();
  });

  it('PUBLIC + 전화번호 없음 + 다른 정보도 없으면 컨테이너를 렌더하지 않는다', () => {
    const { container } = render(
      <ClubContactCard snsLinks={[]} location={null} contactPhone={null} contactVisibility="PUBLIC" />,
    );

    expect(container.firstChild).toBeNull();
  });
});
