import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchPublicClubDetailMock, fetchPublicClubHeroActivitiesMock } = vi.hoisted(() => ({
  fetchPublicClubDetailMock: vi.fn(),
  fetchPublicClubHeroActivitiesMock: vi.fn(),
}));

vi.mock('@/app/_lib/public-content', () => ({
  fetchPublicClubDetail: fetchPublicClubDetailMock,
  fetchPublicClubHeroActivities: fetchPublicClubHeroActivitiesMock,
}));

// 셸이 그리는 상세 화면 대신 받은 id 만 보여 주는 탐침.
vi.mock('@/app/clubs/[clubId]/_pages/ClubDetailPage', async () => {
  const { createElement } = await import('react');
  return {
    ClubDetailPage: function ClubDetailPageProbe({ clubId }: { clubId: number }) {
      return createElement('p', { 'data-testid': 'detail-probe' }, String(clubId));
    },
  };
});

vi.mock('@/app/clubs/_components/ClubsRouteLoading', async () => {
  const { createElement } = await import('react');
  return {
    ClubsRouteLoading: function ClubsRouteLoadingProbe() {
      return createElement('p', { 'data-testid': 'loading-probe' });
    },
  };
});

vi.mock('@/app/_components/RouteErrorView', async () => {
  const { createElement } = await import('react');
  return {
    RouteErrorView: function RouteErrorViewProbe() {
      return createElement('p', { 'data-testid': 'error-probe' });
    },
  };
});

import * as interceptRoute from '@/app/clubs/@modal/(...)clubs/[clubId]/page';
import InterceptError from '@/app/clubs/@modal/(...)clubs/[clubId]/error';
import InterceptLoading from '@/app/clubs/@modal/(...)clubs/[clubId]/loading';
import * as passthroughClubDetailRoute from '@/app/clubs/@modal/(passthrough)/[clubId]/page';
import * as passthroughMemberEventDetailRoute from '@/app/clubs/@modal/(passthrough)/[clubId]/member/events/[eventId]/page';
import * as passthroughMemberEventsRoute from '@/app/clubs/@modal/(passthrough)/[clubId]/member/events/page';
import * as passthroughMemberNoticeDetailRoute from '@/app/clubs/@modal/(passthrough)/[clubId]/member/notices/[noticeId]/page';
import * as passthroughMemberNoticesRoute from '@/app/clubs/@modal/(passthrough)/[clubId]/member/notices/page';
import ModalDefault from '@/app/clubs/@modal/default';
import ModalListPage from '@/app/clubs/@modal/page';

// children 의 /clubs 하위 페이지를 같은 경로로 따라 만든 modal 미러 — 키는 (passthrough) 아래 경로다.
const PASSTHROUGH_MIRROR_ROUTES = {
  '[clubId]': passthroughClubDetailRoute,
  '[clubId]/member/notices': passthroughMemberNoticesRoute,
  '[clubId]/member/notices/[noticeId]': passthroughMemberNoticeDetailRoute,
  '[clubId]/member/events': passthroughMemberEventsRoute,
  '[clubId]/member/events/[eventId]': passthroughMemberEventDetailRoute,
};

const CLUBS_APP_DIR = resolve(__dirname, '../../app/clubs');
const MODAL_SLOT_DIR = join(CLUBS_APP_DIR, '@modal');
const PASSTHROUGH_GROUP_DIR = join(MODAL_SLOT_DIR, '(passthrough)');
const PAGE_FILE = /^page\.[jt]sx?$/;

// dir 아래 page 파일이 있는 폴더를 rootDir 기준 상대 경로('' = rootDir 자신)로 모은다. 비공개 _x 는 라우트가 아니고,
// 슬롯 @x 는 children 이 아니라서 건너뛴다.
const collectPageDirs = (dir: string, rootDir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return PAGE_FILE.test(entry.name) ? [relative(rootDir, dir)] : [];
    if (/^[_@]/.test(entry.name)) return [];
    return collectPageDirs(join(dir, entry.name), rootDir);
  });

describe('동아리 modal 슬롯 라우트(스펙 P1 §3.1)', () => {
  beforeEach(() => {
    fetchPublicClubDetailMock.mockReset();
    fetchPublicClubHeroActivitiesMock.mockReset();
  });

  it('인터셉트 상세는 데이터 없는 셸이다 — 경로 id 로 상세 화면만 그리고 서버 조회·시드를 하지 않는다', async () => {
    render(await interceptRoute.default({ params: Promise.resolve({ clubId: '38' }) }));

    expect(screen.getByTestId('detail-probe')).toHaveTextContent('38');
    expect(fetchPublicClubDetailMock).not.toHaveBeenCalled();
    expect(fetchPublicClubHeroActivitiesMock).not.toHaveBeenCalled();
  });

  it('인터셉트 상세는 정적(●)이다 — generateStaticParams 는 빈 목록이고, 재생성 주기·generateMetadata 는 두지 않으며 정적 메타데이터는 색인 차단뿐이다', () => {
    expect(interceptRoute.generateStaticParams()).toEqual([]);
    expect('revalidate' in interceptRoute).toBe(false);
    expect('generateMetadata' in interceptRoute).toBe(false);
    // 결과 경로(/clubs/(...)clubs/<id>)를 주소로 직접 열 때 쓰이는 head — 색인하지 않는다(링크는 따라간다).
    expect(interceptRoute.metadata).toEqual({ robots: { index: false, follow: true } });
  });

  it('인터셉트 상세의 로딩 경계는 탐색 로딩 그림(ClubsRouteLoading)을, 오류 경계는 공용 오류 화면을 그린다', () => {
    render(<InterceptLoading />);
    expect(screen.getByTestId('loading-probe')).toBeInTheDocument();

    render(<InterceptError error={new Error('조회 실패')} reset={() => {}} />);
    expect(screen.getByTestId('error-probe')).toBeInTheDocument();
  });

  it('modal 슬롯의 목록 짝(@modal/page)·기본값(@modal/default)·children 미러((passthrough) 아래)는 비어 있고, 미러는 정적(●)이다', () => {
    const { container } = render(
      <>
        <ModalListPage />
        <ModalDefault />
        {Object.entries(PASSTHROUGH_MIRROR_ROUTES).map(([mirrorPath, { default: MirrorPage }]) => (
          <MirrorPage key={mirrorPath} />
        ))}
      </>,
    );

    expect(container).toBeEmptyDOMElement();
    for (const mirrorRoute of Object.values(PASSTHROUGH_MIRROR_ROUTES)) {
      expect(mirrorRoute.generateStaticParams()).toEqual([]);
    }
  });

  // 미러를 잊으면 그 주소로 소프트 이동할 때 modal 이 기본값(직전 세그먼트 유지)이 돼 인터셉트 상세가 남는다(스펙 P1 §3.1).
  it('app/clubs 아래 children 페이지마다 modal 미러가 있고, children 없는 미러는 없다 — 목록은 @modal/page, 그 밖은 @modal/(passthrough)/<같은 경로>', () => {
    const childrenPageDirs = collectPageDirs(CLUBS_APP_DIR, CLUBS_APP_DIR).sort();
    // 걷기가 틀려 목록이 비면 아무것도 검사하지 않고 통과하므로, 목록·상세·회원 화면이 실제로 걷혔는지 먼저 본다.
    expect(childrenPageDirs).toEqual(expect.arrayContaining(['', '[clubId]', '[clubId]/member/notices']));

    const hasListMirror = readdirSync(MODAL_SLOT_DIR).some((name) => PAGE_FILE.test(name));
    const mirrorPageDirs = [
      ...(hasListMirror ? [''] : []),
      ...collectPageDirs(PASSTHROUGH_GROUP_DIR, PASSTHROUGH_GROUP_DIR),
    ].sort();

    expect(
      mirrorPageDirs,
      'app/clubs 의 children 페이지와 modal 미러가 어긋납니다 — 새 /clubs 하위 페이지는 @modal/(passthrough)/<같은 경로>/page.tsx 에 빈 미러(generateStaticParams 빈 배열 포함)를 더하세요',
    ).toEqual(childrenPageDirs);
    // 새 미러도 위 PASSTHROUGH_MIRROR_ROUTES 에 넣어야 통과한다 — 그래야 비어 있음·generateStaticParams(정적 ●) 검사를 받는다.
    expect(Object.keys(PASSTHROUGH_MIRROR_ROUTES).sort()).toEqual(mirrorPageDirs.filter((dir) => dir !== ''));
  });
});
