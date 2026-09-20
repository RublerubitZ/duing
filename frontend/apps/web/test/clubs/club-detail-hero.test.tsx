import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubDetail, ClubPhoto } from '@duing/types';
import {
  ClubDetailHero,
  resolveHeroImageUrl,
} from '../../app/clubs/[clubId]/_components/ClubDetailHero';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
// 커버 배너는 next/image 라 jsdom 에서 로더가 돌지 않는다 — src/alt 만 넘기는 <img> 로 대체한다
// (전례: test/home/home-hero.test.tsx).
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
// 찜 버튼은 useSeededAuthStatus 로 스토어를 직접 구독한다(useSyncExternalStore) — 셀렉터 호출만
// 흉내 내면 subscribe/getState 가 없어 렌더가 터진다.
vi.mock('@duing/stores', () => {
  const state = { status: 'unauthenticated' };
  return {
    useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      subscribe: () => () => {},
      getState: () => state,
      getInitialState: () => state,
    }),
  };
});
vi.mock('@duing/hooks', () => ({
  useFavoriteIdsQuery: () => ({ data: [] }),
  useFavoriteToggleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

const baseClub: ClubDetail = {
  id: 1,
  name: 'X',
  category: 'ACADEMIC',
  division: null,
  college: null,
  department: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: [],
  centralClub: false,
  description: null,
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: null,
  leaderName: null,
  photos: [],
  foundedYear: null,
  cohortNumber: null,
  location: null,
  contactPhone: null,
  contactVisibility: 'PUBLIC',
  activityFrequency: null,
  activeDays: [],
  membershipFeeAmount: null,
  feeCycle: 'NONE',
  feeNote: null,
  tagline: null,
  highlights: [],
  projects: [],
  useGeneration: false,
  activeRecruitment: null,
};

// 이름 아래는 해시태그 전용 — 소개 본문·한줄 소개는 히어로에 표시하지 않는다.
describe('ClubDetailHero — 이름 아래 해시태그', () => {
  it('tags 를 "#태그" 칩으로 노출하고, 데이터에 "#" 가 있어도 중복 부착하지 않는다', () => {
    render(<ClubDetailHero club={{ ...baseClub, tags: ['AI', '#창업'] }} />);
    // 데스크탑·모바일 히어로가 함께 렌더되므로 칩은 각 2개
    expect(screen.getAllByText('#AI')).toHaveLength(2);
    expect(screen.getAllByText('#창업')).toHaveLength(2);
    expect(screen.queryByText('##창업')).toBeNull();
  });

  it('소개(description)·한줄 소개(tagline)는 히어로에 렌더하지 않는다', () => {
    render(
      <ClubDetailHero
        club={{ ...baseClub, description: '소개 본문', tagline: '한줄 소개 문구', tags: ['AI'] }}
      />,
    );
    expect(screen.queryByText('소개 본문')).toBeNull();
    expect(screen.queryByText('한줄 소개 문구')).toBeNull();
  });

  it('모바일 히어로는 단과대 동아리에 단과대학·학과를 표기한다', () => {
    render(
      <ClubDetailHero
        club={{
          ...baseClub,
          centralClub: false,
          college: 'GLOBAL_BUSINESS',
          department: '회계학과',
          foundedYear: 2002,
          cohortNumber: 24,
        }}
      />,
    );

    expect(screen.getByText('글로벌경영대학 · 회계학과')).toBeInTheDocument();
  });

  it('모바일 히어로 소속 줄에는 창설년도·기수를 겹쳐 싣지 않는다', () => {
    // 데스크탑 히어로는 같은 트리에 함께 렌더되므로(반응형은 CSS 로만 갈린다) 모바일 블록으로 좁힌다.
    const { container } = render(
      <ClubDetailHero
        club={{
          ...baseClub,
          centralClub: false,
          college: 'GLOBAL_BUSINESS',
          department: '회계학과',
          foundedYear: 2002,
          cohortNumber: 24,
        }}
      />,
    );

    const mobileHero = container.querySelector('div.md\\:hidden');
    expect(mobileHero?.textContent).toContain('글로벌경영대학 · 회계학과');
    expect(mobileHero?.textContent).not.toContain('2002년 창설');
    expect(mobileHero?.textContent).not.toContain('24기');
  });

  it('모바일 히어로는 중앙동아리에 분과를 표기한다', () => {
    render(
      <ClubDetailHero
        club={{ ...baseClub, centralClub: true, division: '학술', foundedYear: 2002, cohortNumber: 24 }}
      />,
    );

    expect(screen.getByText('학술분과')).toBeInTheDocument();
  });

  it('모바일 히어로 소속 줄은 중앙동아리에 분과명을, 단과대 동아리에 단과대학·학과를 같은 자리에 그린다', () => {
    const central = render(
      <ClubDetailHero club={{ ...baseClub, centralClub: true, division: '스포츠레저' }} />,
    );
    const centralLine = central.container
      .querySelector('div.md\\:hidden')
      ?.querySelector('div.min-w-0.text-\\[12px\\]');
    expect(centralLine?.textContent).toBe('스포츠레저분과');
    central.unmount();

    const collegeClub = render(
      <ClubDetailHero
        club={{ ...baseClub, centralClub: false, college: 'HEALTH_BIO', department: '의생명공학과' }}
      />,
    );
    const collegeLine = collegeClub.container
      .querySelector('div.md\\:hidden')
      ?.querySelector('div.min-w-0.text-\\[12px\\]');
    expect(collegeLine?.textContent).toBe('보건바이오대학 · 의생명공학과');
  });

  it('모바일 히어로는 학과가 없으면 단과대학만 남기고, 소속이 전부 없으면 줄 자체를 그리지 않는다', () => {
    const { unmount } = render(
      <ClubDetailHero
        club={{ ...baseClub, centralClub: false, college: 'GLOBAL_BUSINESS', department: null, foundedYear: 2002 }}
      />,
    );
    expect(screen.getByText('글로벌경영대학')).toBeInTheDocument();
    unmount();

    render(
      <ClubDetailHero
        club={{ ...baseClub, centralClub: false, college: null, department: null, foundedYear: 2002 }}
      />,
    );
    expect(screen.queryByText(/글로벌경영대학/)).toBeNull();
  });
});
function makePhoto(id: number, storageKey: string, displayOrder: number): ClubPhoto {
  return { id, storageKey, caption: null, width: null, height: null, displayOrder };
}

// 히어로는 데스크탑·모바일이 같은 트리에 함께 렌더되므로(반응형은 CSS 로만 갈린다) 모바일 블록으로 좁힌다.
// 배너 유무는 스페이서(safe-area 높이) 와 로고 걸침 마진으로 함께 확인한다.
function mobileHeroParts(container: HTMLElement) {
  const mobileHero = container.querySelector('div.md\\:hidden');
  return {
    bannerImage: mobileHero?.querySelector('img') ?? null,
    // 상단 액션바도 safe-area 패딩을 쓰므로 스페이서 고유의 높이 계산식으로 좁힌다.
    spacer: mobileHero?.querySelector('div[class*="h-[calc(3.25rem"]') ?? null,
    logoBox: mobileHero?.querySelector('div[class*="h-20"]') ?? null,
  };
}

describe('ClubDetailHero — 모바일 히어로 배너 이미지', () => {
  it('커버가 없으면 활동 사진 첫 장(displayOrder 최소)을 배너로 그린다', () => {
    const { container } = render(
      <ClubDetailHero
        club={{
          ...baseClub,
          coverUrl: null,
          photos: [
            makePhoto(2, 'https://files.duings.com/second.jpg', 1),
            makePhoto(1, 'https://files.duings.com/first.jpg', 0),
          ],
        }}
      />,
    );

    const { bannerImage, spacer, logoBox } = mobileHeroParts(container);
    expect(bannerImage).toHaveAttribute('src', 'https://files.duings.com/first.jpg');
    expect(spacer).toBeNull();
    expect(logoBox?.classList.contains('-mt-6')).toBe(true);
  });

  it('커버와 활동 사진이 둘 다 있으면 커버가 우선한다', () => {
    const { container } = render(
      <ClubDetailHero
        club={{
          ...baseClub,
          coverUrl: 'https://files.duings.com/cover.jpg',
          photos: [makePhoto(1, 'https://files.duings.com/first.jpg', 0)],
        }}
      />,
    );

    const { bannerImage, spacer } = mobileHeroParts(container);
    expect(bannerImage).toHaveAttribute('src', 'https://files.duings.com/cover.jpg');
    expect(spacer).toBeNull();
  });

  it('커버도 활동 사진도 없으면 배너 없이 스페이서 + 로고 mt-1 을 유지한다', () => {
    const { container } = render(<ClubDetailHero club={{ ...baseClub, coverUrl: null, photos: [] }} />);

    const { bannerImage, spacer, logoBox } = mobileHeroParts(container);
    expect(bannerImage).toBeNull();
    expect(spacer).not.toBeNull();
    expect(logoBox?.classList.contains('mt-1')).toBe(true);
  });

  it('활동 사진 배너가 로드에 실패하면 배너를 접고 스페이서 레이아웃으로 돌아간다', () => {
    const { container } = render(
      <ClubDetailHero
        club={{
          ...baseClub,
          coverUrl: null,
          photos: [makePhoto(1, 'http://localhost:8080/broken.jpg', 0)],
        }}
      />,
    );

    const { bannerImage } = mobileHeroParts(container);
    expect(bannerImage).not.toBeNull();
    fireEvent.error(bannerImage as HTMLImageElement);

    const afterError = mobileHeroParts(container);
    expect(afterError.bannerImage).toBeNull();
    expect(afterError.spacer).not.toBeNull();
    expect(afterError.logoBox?.classList.contains('mt-1')).toBe(true);
  });
});

describe('resolveHeroImageUrl', () => {
  it('커버 우선 · 사진 없으면 null · 빈 키는 건너뛰고 displayOrder 최소를 고른다', () => {
    expect(
      resolveHeroImageUrl({ coverUrl: 'https://files.duings.com/cover.jpg', photos: [] }),
    ).toBe('https://files.duings.com/cover.jpg');

    expect(resolveHeroImageUrl({ coverUrl: null, photos: [] })).toBeNull();

    expect(
      resolveHeroImageUrl({
        coverUrl: null,
        photos: [makePhoto(1, '   ', 0), makePhoto(2, 'https://files.duings.com/second.jpg', 1)],
      }),
    ).toBe('https://files.duings.com/second.jpg');

    expect(
      resolveHeroImageUrl({
        coverUrl: null,
        photos: [
          makePhoto(1, 'https://files.duings.com/third.jpg', 5),
          makePhoto(2, 'https://files.duings.com/first.jpg', 2),
          makePhoto(3, 'https://files.duings.com/second.jpg', 3),
        ],
      }),
    ).toBe('https://files.duings.com/first.jpg');
  });
});
