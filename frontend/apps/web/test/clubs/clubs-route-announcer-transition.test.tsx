import { startTransition } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 동아리 라우트 공지 영역(스펙 P1 §3.6) — 전환 커밋의 effect 순서. 라우터 이동은 startTransition 이라 passive effect 가 스케줄러
 * 작업으로 미뤄지고, head 관찰 콜백(마이크로태스크)이 passive 정리(관찰 끊기)보다 먼저 돈다. act 는 passive 를 동기로 비워 이 순서를
 * 재현하지 못하므로 act 없이 실제 스케줄러로 커밋한다.
 */

const { navigation } = vi.hoisted(() => ({ navigation: { pathname: '/clubs' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { ClubsRouteAnnouncer } from '@/app/clubs/_components/ClubsRouteAnnouncer';

const LIST_TITLE = '동아리 탐색 | 두잉';
const SITE_TITLE = '두잉 | 대구대학교 동아리 플랫폼';
const CLUB_TITLE = '밴드부 | 두잉';

function DetailTitleProbe({ title }: { title: string | null }) {
  useDocumentTitle(title);
  return null;
}

type AppProps = {
  intercepted: boolean;
  /** head <title> 의 key — 바뀌면 React 가 변이 단계에서 새 요소로 바꾼다(Next 의 head 재렌더와 같다). */
  headKey: string;
  headTitle: string;
  detailTitle?: string | null;
  /** false 면 clubs 레이아웃 밖 화면이라 프레임(공지 영역)이 빠진다. */
  inClubsLayout?: boolean;
};

function App({ intercepted, headKey, headTitle, detailTitle, inClubsLayout = true }: AppProps) {
  return (
    <>
      <title key={headKey}>{headTitle}</title>
      {detailTitle !== undefined && <DetailTitleProbe title={detailTitle} />}
      {inClubsLayout && <ClubsRouteAnnouncer intercepted={intercepted} />}
    </>
  );
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 30));

/**
 * 커밋이 보일 때까지 기다린 뒤 한 번 더 쉬어 뒤따르는 작업(passive·공지 갱신 커밋)을 돌린다 — 부하 걸린 CI 에선 커밋 자체가 30ms 를
 * 넘겨, 고정 대기만으로는 간헐 실패했다. 상한 1.5초 — 커밋 세 번이 테스트 제한(5초) 안에 들도록.
 */
async function settle<T>(committed: () => T): Promise<T> {
  const result = await vi.waitFor(committed, { timeout: 1500, interval: 5 });
  await nextTask();
  return result;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let previousActEnvironment: unknown;
const regionTexts: string[] = [];
let regionObserver: MutationObserver | null = null;

async function commit(pathname: string, props: AppProps, expectedTitle: string): Promise<void> {
  navigation.pathname = pathname;
  window.history.pushState(null, '', pathname);
  startTransition(() => root?.render(<App {...props} />));
  await settle(() => expect(document.title).toBe(expectedTitle));
}

// 목록 → 인터셉트 상세(데이터가 커밋에 실린 진입).
async function enterIntercept(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  window.history.replaceState(null, '', '/clubs');
  root = createRoot(container);
  startTransition(() => root?.render(<App intercepted={false} headKey="list" headTitle={LIST_TITLE} />));
  const region = await settle(() => {
    const found = container?.querySelector('[role="status"]');
    if (!found) throw new Error('공지 영역이 없다');
    return found;
  });
  regionObserver = new MutationObserver(() => regionTexts.push(region.textContent ?? ''));
  regionObserver.observe(region, { childList: true, characterData: true, subtree: true });
  await commit('/clubs/7', { intercepted: true, headKey: 'list', headTitle: LIST_TITLE, detailTitle: '밴드부' }, CLUB_TITLE);
  expect(document.title).toBe(CLUB_TITLE);
}

beforeEach(() => {
  previousActEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  document.head.querySelectorAll('title').forEach((element) => element.remove());
});

afterEach(() => {
  regionObserver?.disconnect();
  regionObserver = null;
  regionTexts.length = 0;
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
  navigation.pathname = '/clubs';
  window.history.replaceState(null, '', '/');
});

describe('ClubsRouteAnnouncer — 인터셉트를 떠나는 전환 커밋(act 없음)', () => {
  it('head 가 다른 화면(같은 레이아웃의 회원 화면)으로 — 탭 제목은 새 화면 것이고 영역은 아무것도 알리지 않는다', async () => {
    await enterIntercept();
    await commit('/clubs/7/member/notices', { intercepted: false, headKey: 'member', headTitle: SITE_TITLE }, SITE_TITLE);
    expect(document.title).toBe(SITE_TITLE);
    expect(regionTexts.filter((text) => text !== '')).toEqual([]);
  });

  it('clubs 레이아웃 밖 화면으로(프레임이 빠짐) — 탭 제목은 새 화면 것이다', async () => {
    await enterIntercept();
    await commit('/notices', { intercepted: false, headKey: 'notices', headTitle: SITE_TITLE, inClubsLayout: false }, SITE_TITLE);
    expect(document.title).toBe(SITE_TITLE);
  });
});
