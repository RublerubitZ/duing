import { fireEvent, render, screen } from '@testing-library/react';
import type { Ref } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClubCategory, ClubDetail, ClubPhoto } from '@duing/types';
import {
  ClubDetailHero,
  resolveHeroImageUrl,
} from '../../app/clubs/[clubId]/_components/ClubDetailHero';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
// 커버 배너는 next/image 라 jsdom 에서 로더가 돌지 않는다 — src/alt 와 페이드 배선(className·onLoad·onError·ref)만 넘기는
// <img> 로 대체한다(전례: test/home/home-hero.test.tsx). React 19 는 ref 를 일반 prop 으로 넘긴다.
type ImageMockProps = {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  ref?: Ref<HTMLImageElement>;
};
vi.mock('next/image', () => ({
  default: ({ src, alt, className, onLoad, onError, ref }: ImageMockProps) => (
    <img src={src} alt={alt} className={className} onLoad={onLoad} onError={onError} ref={ref} />
  ),
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

describe('ClubDetailHero — 분류 라벨', () => {
  it('백엔드가 먼저 배포한 모르는 분류는 빈칸 대신 기타로 그린다', () => {
    render(<ClubDetailHero club={{ ...baseClub, category: 'NEW_CATEGORY' as unknown as ClubCategory }} />);

    // 브레드크럼과 분류 pill 두 자리에 그린다.
    expect(screen.getAllByText('기타')).toHaveLength(2);
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

function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`요소가 없다: ${selector}`);
  return element;
}

describe('ClubDetailHero — 커버 로드 페이드(iOS 깜빡임 P0 §6.2)', () => {
  const COVER = 'https://files.duings.com/cover.jpg';
  afterEach(() => vi.restoreAllMocks());

  it('클라이언트 마운트한 커버는 로드 전 투명이고 load 뒤 200ms 전이로 보인다 — 데스크탑은 감싼 요소에(opacity-50 보존), 모바일은 이미지 자신에', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    const { container } = render(<ClubDetailHero club={{ ...baseClub, coverUrl: COVER }} />);

    const desktopCover = requireElement(container, `div.md\\:block img[src="${COVER}"]`);
    const desktopFadeTarget = desktopCover.parentElement;
    expect(desktopCover).toHaveClass('opacity-50');
    expect(desktopCover).not.toHaveClass('opacity-0');
    expect(desktopFadeTarget?.classList.contains('opacity-0')).toBe(true);

    const mobileCover = requireElement(container, `div.md\\:hidden img[src="${COVER}"]`);
    expect(mobileCover).toHaveClass('opacity-0');

    fireEvent.load(desktopCover);
    fireEvent.load(mobileCover);
    expect(desktopFadeTarget?.classList.contains('opacity-0')).toBe(false);
    for (const fadeClass of ['opacity-100', 'transition-opacity', 'duration-200', 'ease-duing', 'motion-reduce:transition-none']) {
      expect(desktopFadeTarget?.classList.contains(fadeClass)).toBe(true);
      expect(mobileCover).toHaveClass(fadeClass);
    }
    expect(desktopCover).toHaveClass('opacity-50');
  });

  // 실제 next/image 커버는 srcset+lazy 라 ref 시점 complete 가 대개 false 여서 앞으로 이동으로 다시 들어와도 짧게 페이드한다(훅 문서) — 여기선 판정 입력만 고정한다.
  it('마운트 때 이미 complete(캐시 적중)인 커버는 숨기지 않는다', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const { container } = render(<ClubDetailHero club={{ ...baseClub, coverUrl: COVER }} />);

    expect(requireElement(container, `div.md\\:block img[src="${COVER}"]`).parentElement?.className).toBe('absolute inset-0');
    expect(requireElement(container, `div.md\\:hidden img[src="${COVER}"]`)).not.toHaveClass('opacity-0');
  });

  it('서버 렌더 HTML 의 커버는 보이는 상태다(투명도 0 없음) — 첫 화면 LCP', () => {
    const html = renderToString(<ClubDetailHero club={{ ...baseClub, coverUrl: COVER }} />);

    expect(html).toContain(COVER);
    expect(html).not.toContain('opacity-0');
  });
});

describe('ClubDetailHero — 로고 박스(썸네일·배경, iOS 깜빡임 P0 §5)', () => {
  const LOGO = 'https://files.duings.com/club/logo/x.png';
  const THUMBNAIL = 'https://files.duings.com/club/logo/x-thumb.png';

  // 데스크탑(140px)·모바일(80px) 로고 박스 — 둘 다 DOM 에 있다(반응형은 CSS 로만 갈린다). 블록(hidden md:block · md:hidden)으로
  // 좁혀 고르고, style 을 읽으려고 위 requireElement(HTMLElement 로 좁힌다 — as 금지)를 쓴다.
  function logoBoxes(container: HTMLElement): HTMLElement[] {
    return [
      requireElement(container, 'div.md\\:block div.h-\\[140px\\]'),
      requireElement(container, 'div.md\\:hidden div.h-20'),
    ];
  }

  it.each([
    ['로고가 있어도', LOGO],
    ['로고가 없어도', null],
  ])('%s 로고 박스 배경은 목록과 같은 시그니처 색 그라데이션이다 — 디코딩 전 한 프레임·(데스크탑) 모핑 중 초록(ink) 상자가 비치지 않게', (_case, logoUrl) => {
    const { container } = render(<ClubDetailHero club={{ ...baseClub, logoUrl }} />);

    for (const logoBox of logoBoxes(container)) {
      // jsdom 은 hex 를 rgb 로 정규화한다 — pickColor(1) = #143025 → rgb(20, 48, 37), 옛 ink #1F4A36 → rgb(31, 74, 54).
      expect(logoBox.style.background).toContain('linear-gradient(135deg');
      expect(logoBox.style.background).toContain('rgb(20, 48, 37)');
      expect(logoBox.style.background).not.toContain('rgb(31, 74, 54)');
    }
  });

  it('데스크탑 히어로 로고만 club-logo-<id> 이름을 갖는다 — 목록 카드에서 모핑해 들어오는 짝이고, 모바일 히어로는 push 라 이름이 없다', () => {
    const { container } = render(<ClubDetailHero club={baseClub} />);
    const desktopLogoBox = requireElement(container, 'div.md\\:block div.h-\\[140px\\]');
    const mobileLogoBox = requireElement(container, 'div.md\\:hidden div.h-20');
    expect(desktopLogoBox.style.getPropertyValue('view-transition-name')).toBe(`club-logo-${baseClub.id}`);
    expect(mobileLogoBox.style.getPropertyValue('view-transition-name')).toBe('');
  });

  it('썸네일 URL 이 있으면 데스크탑·모바일 히어로 로고 모두 썸네일을 즉시(eager·sync) 그린다 — 목록과 같은 URL 이라 캐시가 이어지고 데스크탑은 모핑도 이어진다', () => {
    const { container } = render(
      <ClubDetailHero club={{ ...baseClub, logoUrl: LOGO, logoThumbnailUrl: THUMBNAIL }} />,
    );

    const logos = container.querySelectorAll(`img[src="${THUMBNAIL}"]`);
    expect(logos).toHaveLength(2);
    for (const logo of logos) {
      expect(logo).toHaveAttribute('loading', 'eager');
      expect(logo).toHaveAttribute('decoding', 'sync');
    }
  });

  it('썸네일 필드가 없으면(구 응답) 원본을 지금처럼 lazy 로 그린다 — fail-open', () => {
    const { container } = render(<ClubDetailHero club={{ ...baseClub, logoUrl: LOGO }} />);

    const logos = container.querySelectorAll(`img[src="${LOGO}"]`);
    expect(logos).toHaveLength(2);
    for (const logo of logos) expect(logo).toHaveAttribute('loading', 'lazy');
  });
});
