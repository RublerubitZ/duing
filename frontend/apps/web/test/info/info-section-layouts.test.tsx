import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ExploreNav 는 usePathname·인증 스토어·알림 훅 체인을 물고 있어, 레이아웃 골격 검증과 무관한
// 부분만 스텁으로 대체한다(test/components/explore-nav.test.tsx 와 동일한 모킹 세트).
vi.mock('next/navigation', () => ({ usePathname: () => '/notices' }));
vi.mock('@/components/duing/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));
vi.mock('../../app/_components/NotificationBell', () => ({
  NotificationBell: () => <button type="button">알림</button>,
}));
vi.mock('../../app/_components/HomeNavAuthSlot', () => ({ HomeNavAuthSlot: () => <span>인증</span> }));

import FaqLayout from '@/app/faq/layout';
import IntroduceLayout from '@/app/introduce/layout';
import NoticesLayout from '@/app/notices/layout';
import TermsLayout from '@/app/terms/layout';

// 정보 섹션 4개 라우트의 크림 캔버스·GNB 는 페이지가 아니라 세그먼트 레이아웃이 소유한다 —
// 페이지 안에 있으면 RSC 재페치 중 로딩 폴백이 둘을 통째로 걷어가 문서 높이가 뷰포트 아래로 붕괴하고,
// 안드로이드 크롬 주소창이 펴지며 fixed 하단 탭바가 흔들린다.
type LayoutCase = {
  name: string;
  Layout: (props: { children: ReactNode }) => ReactElement;
};

const layoutCases: ReadonlyArray<LayoutCase> = [
  { name: 'notices', Layout: NoticesLayout },
  { name: 'faq', Layout: FaqLayout },
  { name: 'terms', Layout: TermsLayout },
  { name: 'introduce', Layout: IntroduceLayout },
];

describe('정보 섹션 세그먼트 레이아웃', () => {
  it.each(layoutCases)('$name 레이아웃이 크림 캔버스를 소유한다', ({ Layout }) => {
    const { container } = render(
      <Layout>
        <p>본문</p>
      </Layout>,
    );
    const canvas = container.firstElementChild;

    expect(canvas).not.toBeNull();
    // 모바일은 lvh+탭바 높이(3.5rem) 플로어 — 접힌 상태 스크롤 여유 112px(시설 탭과 동일 밴드).
    // lvh 단독이면 여유가 스페이서 56px 뿐이라 실기기 공지 진입 직후 브라우저 컨트롤이 펴진 채 시작한다.
    expect(canvas).toHaveClass(
      'duing',
      'min-h-lvh',
      'max-md:min-h-[calc(100lvh+3.5rem)]',
      'bg-cream',
    );
    // dvh 로 되돌리면 콘텐츠가 한 화면인 허브(공지)의 스크롤 여유가 탭바 스페이서 56px 뿐이라
    // 안드로이드 크롬 주소창·chin 접힘 유지 임계에 못 미쳐, 정보 탭에서만 하단 탭바의
    // 높이·safe-area 가 달라 보이는 증상이 되살아난다(notices/layout.tsx 참조).
    expect(canvas?.className ?? '').not.toMatch(/\b(min-h-dvh|h-screen|min-h-screen)\b/);
    // 인라인 style 우회도 막는다 — #783 이전 버그가 정확히 인라인 100vh 였다(100lvh 는 허용).
    expect(canvas?.getAttribute('style') ?? '').not.toMatch(/100(d|s)?vh/);
  });

  it.each(layoutCases)('$name 레이아웃이 상단 GNB 를 캔버스 안에 렌더한다', ({ Layout }) => {
    render(
      <Layout>
        <p>본문</p>
      </Layout>,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('introduce 레이아웃은 등장 모션의 가로 스크롤을 클립한다', () => {
    const { container } = render(
      <IntroduceLayout>
        <p>본문</p>
      </IntroduceLayout>,
    );

    expect(container.firstElementChild).toHaveClass('overflow-x-clip');
  });

  // 세그먼트 loading.tsx 가 사라지면 로딩 폴백이 루트 loading.tsx 로 올라가 레이아웃 바깥에서 걸린다
  // — 캔버스·GNB 가 통째로 교체되어 이 PR 이 막은 하단 탭바 흔들림이 조용히 되살아난다. 존재 자체가 가드.
  it.each(['notices', 'faq', 'terms', 'introduce'])(
    '%s 세그먼트에 loading.tsx 가 있다',
    (segment) => {
      expect(existsSync(path.resolve(__dirname, '../../app', segment, 'loading.tsx'))).toBe(true);
    },
  );
});
