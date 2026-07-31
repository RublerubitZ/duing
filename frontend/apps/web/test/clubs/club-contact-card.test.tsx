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

/**
 * URL 전체 대신 [라벨, 값] 두 줄만 나와야 하는 링크들.
 * OTHER 는 저장 단계에서 플랫폼명이 강제(clubSnsLinkSchema refine + BE @AssertTrue)이므로
 * 픽스처도 label 을 반드시 채운다 — label:null 인 OTHER 는 저장될 수 없는 상태다.
 */
const NAMED_LINKS: ReadonlyArray<readonly [ClubSnsLink, string, string]> = [
  [{ platform: 'KAKAO', label: null, url: 'https://open.kakao.com/o/abc123' }, 'AIS 오픈채팅', '참여하기'],
  [{ platform: 'FACEBOOK', label: null, url: 'https://www.facebook.com/duing' }, 'AIS 페이스북', '페이지 보기'],
  [{ platform: 'OTHER', label: 'Discord', url: 'https://discord.gg/abc123' }, 'Discord', '참가하기'],
  [{ platform: 'OTHER', label: '깃허브', url: 'https://github.com/duing' }, '깃허브', '저장소 보기'],
  // V91 이 레거시 YOUTUBE/WEB 행을 OTHER + label 로 바꿔 둔 형태.
  [{ platform: 'OTHER', label: 'YouTube', url: 'https://youtu.be/abc123' }, 'YouTube', '채널 보기'],
  [{ platform: 'OTHER', label: 'Website', url: 'https://duings.com/about' }, 'Website', '방문하기'],
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
  ])('핸들을 뽑을 수 없는 인스타그램 URL(%s)은 브랜드 기본 문구로 떨어진다', (url) => {
    renderCard({ snsLinks: [{ platform: 'INSTAGRAM', label: null, url }] });

    expect(screen.getByText('AIS 인스타그램')).toBeInTheDocument();
    expect(screen.getByText('프로필 보기')).toBeInTheDocument();
  });

  it('인스타그램 호스트를 흉내 낸 주소는 인스타그램으로 소개하지 않는다', () => {
    const url = 'https://instagram.com.evil.example/hijack';
    renderCard({ snsLinks: [{ platform: 'INSTAGRAM', label: null, url }] });

    expect(screen.getByText('공식 홈페이지')).toBeInTheDocument();
    expect(screen.queryByText(/인스타그램/)).not.toBeInTheDocument();
  });

  it('위험한 SNS URL(javascript: 등)은 링크를 만들지 않고 텍스트로 렌더한다', () => {
    const link: ClubSnsLink = { platform: 'OTHER', label: 'Blog', url: 'javascript:alert(1)' };
    const { container } = renderCard({ snsLinks: [link] });

    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('Blog')).toBeInTheDocument();
  });

  it('브랜드는 저장된 플랫폼이 아니라 URL 호스트로 정한다', () => {
    // platform 만 믿으면 엉뚱한 주소에 인스타그램 신원을 빌려준다 — 운영에 실제로 있는 데이터 형태.
    renderCard({ snsLinks: [{ platform: 'INSTAGRAM', label: null, url: 'https://naver.com' }] });

    expect(screen.getByText('공식 홈페이지')).toBeInTheDocument();
    expect(screen.queryByText(/인스타그램/)).not.toBeInTheDocument();
  });

  it('호스트를 위장한 스킴(javascript://instagram.com/…)은 브랜드를 얻지 못한다', () => {
    const link: ClubSnsLink = { platform: 'OTHER', label: '블로그', url: 'javascript://instagram.com/duing' };
    renderCard({ snsLinks: [link] });

    expect(screen.getByText('블로그')).toBeInTheDocument();
    expect(screen.queryByText('@duing')).not.toBeInTheDocument();
  });

  it.each(['https://www.instagram.com/explore', 'https://instagram.com/accounts'])(
    '인스타그램 예약 경로(%s)는 계정으로 소개하지 않는다',
    (url) => {
      renderCard({ snsLinks: [{ platform: 'INSTAGRAM', label: null, url }] });

      expect(screen.getByText('프로필 보기')).toBeInTheDocument();
      expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    },
  );

  it('여러 링크를 함께 렌더해도 행마다 제 라벨·값을 유지한다', () => {
    renderCard({
      snsLinks: [
        { platform: 'INSTAGRAM', label: null, url: 'https://www.instagram.com/ais.__.1' },
        { platform: 'OTHER', label: '모집 안내', url: 'https://duing.notion.site/recruit' },
        { platform: 'OTHER', label: '활동 기록', url: 'https://duing.notion.site/archive' },
      ],
    });

    const anchors = screen.getAllByRole('link');
    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toHaveAccessibleName(/AIS 인스타그램/);
    expect(anchors[0]).toHaveAccessibleName(/@ais\.__\.1/);
    // 같은 브랜드 링크 두 개 — 운영진이 적은 플랫폼명이 서로를 구분해 준다.
    expect(anchors[1]).toHaveAccessibleName(/모집 안내/);
    expect(anchors[2]).toHaveAccessibleName(/활동 기록/);
    expect(anchors[1]).toHaveAttribute('href', 'https://duing.notion.site/recruit');
    expect(anchors[2]).toHaveAttribute('href', 'https://duing.notion.site/archive');
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
