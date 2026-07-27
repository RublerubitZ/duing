import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ClubSnsLink } from '@duing/types';

import { ClubContactCard } from '@/app/clubs/[clubId]/_components/ClubContactCard';

const CLUB_NAME = 'AIS';

function renderCard(props: Partial<Parameters<typeof ClubContactCard>[0]>) {
  return render(
    <ClubContactCard
      clubName={CLUB_NAME}
      snsLinks={[]}
      location={null}
      contactPhone={null}
      contactVisibility="PUBLIC"
      {...props}
    />,
  );
}

/** URL 전체 대신 [라벨, 값] 두 줄만 나와야 하는 링크들. */
const NAMED_LINKS: ReadonlyArray<readonly [ClubSnsLink, string, string]> = [
  [{ platform: 'KAKAO', label: null, url: 'https://open.kakao.com/o/abc123' }, 'AIS 오픈채팅', '참여하기'],
  [{ platform: 'FACEBOOK', label: null, url: 'https://www.facebook.com/duing' }, 'AIS 페이스북', '페이지 보기'],
  [{ platform: 'OTHER', label: null, url: 'https://discord.gg/abc123' }, 'Discord', '참가하기'],
  [{ platform: 'OTHER', label: null, url: 'https://github.com/duing' }, 'GitHub', '저장소 보기'],
  [{ platform: 'OTHER', label: null, url: 'https://youtu.be/abc123' }, 'YouTube', '채널 보기'],
  [{ platform: 'OTHER', label: null, url: 'https://duing.notion.site/abc' }, 'Notion', '문서 보기'],
  [{ platform: 'OTHER', label: null, url: 'https://duings.com/about' }, '공식 홈페이지', '방문하기'],
  [{ platform: 'OTHER', label: '동아리 블로그', url: 'https://velog.io/@duing' }, '동아리 블로그', '방문하기'],
];

describe('ClubContactCard — SNS 표시', () => {
  it.each(NAMED_LINKS)('URL 전체 대신 라벨·값(%#: $1 / $2)만 노출한다', (link, label, value) => {
    renderCard({ snsLinks: [link] });

    const anchor = screen.getByRole('link');
    expect(anchor).toHaveAttribute('href', link.url);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(anchor).toHaveTextContent(label);
    expect(anchor).toHaveTextContent(value);
    expect(anchor.textContent).not.toContain('http');
  });

  it.each([
    ['https://www.instagram.com/ais.__.1', '@ais.__.1'],
    ['https://instagram.com/cert_is_/', '@cert_is_'],
    ['https://www.instagram.com/cert_is_?igsh=xxxx', '@cert_is_'],
  ])('인스타그램 프로필 URL(%s)은 동아리명 라벨 + 핸들로 표시한다', (url, handle) => {
    renderCard({ snsLinks: [{ platform: 'INSTAGRAM', label: null, url }] });

    const anchor = screen.getByRole('link');
    expect(anchor).toHaveAttribute('href', url);
    expect(anchor).toHaveAttribute('title', url);
    expect(anchor).toHaveTextContent('AIS 인스타그램');
    expect(anchor).toHaveTextContent(handle);
  });

  it.each([
    'https://www.instagram.com/p/ABC123/',
    'https://www.instagram.com/reel/ABC123/',
    'https://instagram.com.evil.example/hijack',
  ])('핸들을 뽑을 수 없는 인스타그램 URL(%s)은 브랜드 기본 문구로 떨어진다', (url) => {
    renderCard({ snsLinks: [{ platform: 'INSTAGRAM', label: null, url }] });

    expect(screen.getByText('AIS 인스타그램')).toBeInTheDocument();
    expect(screen.getByText('프로필 보기')).toBeInTheDocument();
  });

  it('위험한 SNS URL(javascript: 등)은 링크를 만들지 않고 텍스트로 렌더한다', () => {
    const link: ClubSnsLink = { platform: 'OTHER', label: 'Blog', url: 'javascript:alert(1)' };
    const { container } = renderCard({ snsLinks: [link] });

    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('Blog')).toBeInTheDocument();
  });
});

describe('ClubContactCard — 라벨', () => {
  it('위치·연락처는 값 위에 라벨을 함께 보여준다', () => {
    renderCard({ location: '공학5관 5401', contactPhone: '010-1234-5678' });

    expect(screen.getByText('동아리방 위치')).toBeInTheDocument();
    expect(screen.getByText('공학5관 5401')).toBeInTheDocument();
    expect(screen.getByText('대표 연락처')).toBeInTheDocument();
  });
});

describe('ClubContactCard — 대표 연락처 정책', () => {
  it('전화번호는 tel: 링크로 렌더된다', () => {
    renderCard({ contactPhone: '010-1234-5678' });

    const anchor = screen.getByRole('link');
    expect(anchor).toHaveAttribute('href', 'tel:01012345678');
    expect(anchor).toHaveTextContent('대표 연락처');
    expect(anchor).toHaveTextContent('010-1234-5678');
  });

  it('LOGGED_IN_ONLY 인데 전화번호가 없으면 안내 문구를 링크 없이 표시한다', () => {
    renderCard({ contactVisibility: 'LOGGED_IN_ONLY' });

    expect(screen.getByText('로그인 후 확인 가능')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('PRIVATE 이면 비공개 안내를 표시한다', () => {
    renderCard({ contactVisibility: 'PRIVATE' });

    expect(screen.getByText('대표 연락처 비공개')).toBeInTheDocument();
  });

  it('PUBLIC + 전화번호 없음 + 다른 정보도 없으면 컨테이너를 렌더하지 않는다', () => {
    const { container } = renderCard({});

    expect(container.firstChild).toBeNull();
  });
});
