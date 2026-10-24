import { StrictMode, Suspense, memo, startTransition, use, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 제목 연속성 가드(스펙 2026-10-24 clubs-route-title-continuity) — Next 16.4 모양의 head 재렌더. 16.4 는 head 를 라우트 트리 옆
 * 독립 노드로 다시 그리고 메타데이터 <title> 은 Suspense 경계 안에 있다. 그래서 경계 key 가 바뀌는 커밋에서 <title> 이 빠지고(틈),
 * 제목은 트리를 바꾸지 않는 별도 공개 커밋으로 들어온다. 하네스는 React 가 <title> 을 실제로 그리게 해(호이스팅·입양 규칙 포함) 그
 * 두 커밋을 만든다.
 * - 프레임(공지 영역)은 memo 라 경로 커밋(treeKey 변경)에서만 다시 그려진다 — head 만 다시 그려지는 커밋에서는 레이아웃 effect 가 돌지 않는다.
 * - Next 공지기 모방은 경로 커밋에서만 읽고, 빈 제목이면 첫 h1 을 읽는다(app-router-announcer.js).
 * - act 없이 실제 스케줄러로 커밋한다 — 전환 커밋의 passive 가 관찰 콜백(마이크로태스크)보다 늦는 순서를 지킨다(transition 테스트와 같은 이유).
 */

const { navigation } = vi.hoisted(() => ({ navigation: { pathname: '/clubs' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { ROUTER_REFRESH_EVENT } from '@/app/_lib/useGuardedRouter';
import { ClubsRouteAnnouncer, TITLE_PLACEHOLDER_ATTRIBUTE } from '@/app/clubs/_components/ClubsRouteAnnouncer';

const LIST_TITLE = '동아리 탐색 | 두잉';
const SITE_TITLE = '두잉 | 대구대학교 동아리 플랫폼';
const NOTICES_TITLE = '소식 | 두잉';
const CLUB_TITLE = '밴드부 | 두잉';
const OTHER_CLUB_TITLE = '연극부 | 두잉';
const HARD_DETAIL_TITLE = '코드브루 | 두잉';
const LIST_HEADING = '22개 동아리를 둘러보세요';
const PLACEHOLDER_SELECTOR = `title[${TITLE_PLACEHOLDER_ATTRIBUTE}]`;

type HeadState = { key: string; title: string };
type HeadGate = { promise: Promise<void>; open: () => void };

const headGates = new Map<string, HeadGate>();

function headGate(headKey: string): HeadGate {
  const existing = headGates.get(headKey);
  if (existing) return existing;
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  const gate = { promise, open };
  headGates.set(headKey, gate);
  return gate;
}

/**
 * 열어 둔 head — 약속을 React 의 thenable 표기(status 'fulfilled')로 이미 이행된 것으로 표시해 use() 가 멈추지 않고 값을 바로
 * 돌려준다. 처음 그려질 때 틈 없이 바로 마운트된다(숨지 않은 즉시 마운트 경로).
 */
function ready(head: HeadState): HeadState {
  const gate = headGate(head.key);
  Object.assign(gate.promise, { status: 'fulfilled', value: undefined });
  gate.open();
  return head;
}

/** 열리지 않은 head 를 공개한다 — 멈춘 경계는 React 가 약속 이행을 듣고 다시 그려 별도 커밋으로 <title> 을 넣는다. */
function revealHead(headKey: string): void {
  headGate(headKey).open();
}

const listHead = (key = 'list'): HeadState => ({ key, title: LIST_TITLE });
// 모달 페이지 메타데이터 head — 제목이 없어 루트 기본 제목이다.
const modalHead = (key = 'modal'): HeadState => ({ key, title: SITE_TITLE });

// 메타데이터 <title> — use() 는 조건 없이 늘 부른다(조건부 use() 는 React DEV 경고를 낸다). 약속이 이행되지 않았으면 Suspense
// 대체(제목 없음)로 커밋되고, 이행되면 별도 공개 커밋으로 들어온다. ready 로 미리 이행한 약속은 멈추지 않는다.
function MetadataTitle({ headKey, title }: { headKey: string; title: string }) {
  use(headGate(headKey).promise);
  return <title>{title}</title>;
}

function DetailTitleProbe({ title }: { title: string | null }) {
  useDocumentTitle(title);
  return null;
}

type FrameProps = { intercepted: boolean; underlyingKey: string; treeKey: string };

// 프레임 — treeKey 는 memo 비교에만 쓴다. 실제 ClubsSlotFrame 도 경로 커밋마다 다시 그려지고 head 공개 커밋에는 그려지지 않는다.
const Frame = memo(function Frame({ intercepted, underlyingKey }: FrameProps) {
  return <ClubsRouteAnnouncer intercepted={intercepted} underlyingKey={underlyingKey} />;
});

// Next 공지기 모방이 경로 커밋마다 읽은 값 — 프레임 뒤 형제라 같은 커밋에서 공지 영역 effect 뒤에 읽는다.
const nextAnnouncerReads: string[] = [];

function NextAnnouncerProbe({ treeKey }: { treeKey: string }) {
  useEffect(() => {
    nextAnnouncerReads.push(document.title !== '' ? document.title : (document.querySelector('h1')?.textContent ?? ''));
  }, [treeKey]);
  return null;
}

type AppProps = {
  intercepted: boolean;
  underlyingKey: string;
  head: HeadState;
  /** 경로 커밋 표식 — 바뀌면 프레임이 다시 그려지고 Next 공지기 모방이 읽는다(refresh 는 같은 경로에 새 표식). */
  treeKey: string;
  /** 상세가 마운트돼 있으면 그 제목(데이터 전이면 null). undefined 면 상세 없음. */
  detailTitle?: string | null;
  /** 상세→상세에서 상세를 새로 마운트하려고 바꾼다. */
  detailKey?: string;
};

function App({ intercepted, underlyingKey, head, treeKey, detailTitle, detailKey }: AppProps) {
  return (
    <>
      <Suspense key={head.key} fallback={null}>
        <MetadataTitle headKey={head.key} title={head.title} />
      </Suspense>
      <h1>{LIST_HEADING}</h1>
      {detailTitle !== undefined && <DetailTitleProbe key={detailKey} title={detailTitle} />}
      <Frame intercepted={intercepted} underlyingKey={underlyingKey} treeKey={treeKey} />
      <NextAnnouncerProbe treeKey={treeKey} />
    </>
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let strictMode = false;
let currentProps: AppProps | null = null;
let refreshCount = 0;
let previousActEnvironment: unknown;
const regionTexts: string[] = [];
const tabTitles: string[] = [];
const recorders: MutationObserver[] = [];

function renderApp(props: AppProps): void {
  currentProps = props;
  const app = <App {...props} />;
  startTransition(() => root?.render(strictMode ? <StrictMode>{app}</StrictMode> : app));
}

function latestProps(): AppProps {
  if (currentProps === null) throw new Error('먼저 마운트한다');
  return currentProps;
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 30));

/** 조건이 맞을 때까지 기다린 뒤 한 번 더 쉬어 뒤따르는 작업을 돌린다 — React 19.3 은 Suspense 공개를 최대 300ms 미룬다. */
async function settle(condition: () => void): Promise<void> {
  await vi.waitFor(condition, { timeout: 1500, interval: 5 });
  await nextTask();
}

type RouteProps = Omit<AppProps, 'treeKey'>;

/** 경로 커밋을 내고, 그 커밋에서 Next 공지기 모방이 읽은 값을 돌려준다. */
async function routeCommit(commit: () => void): Promise<string | undefined> {
  const readsBefore = nextAnnouncerReads.length;
  commit();
  await settle(() => expect(nextAnnouncerReads.length).toBeGreaterThan(readsBefore));
  return nextAnnouncerReads.at(-1);
}

// 앞으로 — 주소를 쌓고 경로를 바꾼다.
const pushRoute = (pathname: string, props: RouteProps) =>
  routeCommit(() => {
    window.history.pushState(null, '', pathname);
    navigation.pathname = pathname;
    renderApp({ ...props, treeKey: pathname });
  });

// 뒤로 — 주소가 바뀐 popstate 를 먼저 낸다(라우터는 popstate 뒤에 커밋한다).
const popRoute = (pathname: string, props: RouteProps) =>
  routeCommit(() => {
    window.history.replaceState(null, '', pathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
    navigation.pathname = pathname;
    renderApp({ ...props, treeKey: pathname });
  });

// refresh(로그아웃) — 신호 뒤 같은 경로의 새 트리를 커밋한다. 프레임도 다시 그려진다.
const refreshRoute = (head: HeadState) =>
  routeCommit(() => {
    window.dispatchEvent(new Event(ROUTER_REFRESH_EVENT));
    refreshCount += 1;
    renderApp({ ...latestProps(), head, treeKey: `${navigation.pathname}#refresh-${refreshCount}` });
  });

/** head 만 다시 그린다 — 경로 그대로라 프레임은 다시 그려지지 않는다. */
function renderHead(head: HeadState): void {
  renderApp({ ...latestProps(), head });
}

/** 데이터 도착 — 상세 제목 훅의 값만 바뀐다. */
function arriveDetail(detailName: string): void {
  renderApp({ ...latestProps(), detailTitle: detailName });
}

const placeholderCount = () => document.head.querySelectorAll(PLACEHOLDER_SELECTOR).length;
const headTitleCount = () => document.head.querySelectorAll('title').length;
const announced = (texts: string[] = regionTexts) => texts.filter((text) => text !== '');

function startRecording(): void {
  const region = container?.querySelector('[role="status"]');
  if (!region) throw new Error('공지 영역이 없다');
  const regionRecorder = new MutationObserver(() => regionTexts.push(region.textContent ?? ''));
  regionRecorder.observe(region, { childList: true, characterData: true, subtree: true });
  // 탭 제목 — 변이 묶음마다 모든 관찰 콜백이 끝난 뒤(다음 작업)의 값을 적는다. 그 사이 값은 화면에 그려지지 않는다.
  tabTitles.push(document.title);
  const tabTitleRecorder = new MutationObserver(() => {
    setTimeout(() => {
      if (tabTitles.at(-1) !== document.title) tabTitles.push(document.title);
    }, 0);
  });
  tabTitleRecorder.observe(document.head, { childList: true, subtree: true, characterData: true });
  recorders.push(regionRecorder, tabTitleRecorder);
}

/** 탭 제목 기록을 지금 값부터 다시 시작한다. */
function restartTabTitles(): void {
  tabTitles.splice(0, tabTitles.length, document.title);
}

async function mountAt(pathname: string, props: RouteProps, { strict = false }: { strict?: boolean } = {}): Promise<void> {
  strictMode = strict;
  container = document.createElement('div');
  document.body.appendChild(container);
  window.history.replaceState(null, '', pathname);
  navigation.pathname = pathname;
  root = createRoot(container);
  renderApp({ ...props, treeKey: pathname });
  await settle(() => expect(nextAnnouncerReads.length).toBeGreaterThan(0));
  startRecording();
}

/** 목록 → 늦은 진입(모달 head 틈) → 공개 → 데이터 도착까지. 진입 커밋에서 Next 공지기 모방이 읽은 값을 돌려준다. */
async function enterLateFromList(strict = false): Promise<string | undefined> {
  await mountAt('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead()) }, { strict });
  const enteringRead = await pushRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead(), detailTitle: null });
  revealHead('modal');
  await settle(() => expect(placeholderCount()).toBe(0));
  arriveDetail('밴드부');
  await settle(() => expect(announced()).toEqual([CLUB_TITLE]));
  return enteringRead;
}

beforeEach(() => {
  previousActEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  document.head.querySelectorAll('title').forEach((element) => element.remove());
});

afterEach(() => {
  try {
    // 경우마다 끝에 head 오염이 없다 — <title> 은 1개 이하, 자리 표시는 0개(스펙 §2).
    expect(headTitleCount()).toBeLessThanOrEqual(1);
    expect(placeholderCount()).toBe(0);
  } finally {
    recorders.splice(0).forEach((recorder) => recorder.disconnect());
    regionTexts.length = 0;
    tabTitles.length = 0;
    nextAnnouncerReads.length = 0;
    root?.unmount();
    root = null;
    container?.remove();
    container = null;
    currentProps = null;
    strictMode = false;
    refreshCount = 0;
    headGates.clear();
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    navigation.pathname = '/clubs';
    window.history.replaceState(null, '', '/');
  }
});

describe('ClubsRouteAnnouncer — 제목 연속성 가드(Next 16.4 head 재렌더 모양)', () => {
  it.each([
    ['기본', false],
    ['StrictMode', true],
  ])(
    '%s — 늦은 진입: 진입 커밋의 틈을 목록 제목으로 메워 Next 가 목록 제목을 읽고(h1 아님), 공개된 기본 제목 대신 목록 제목을 잇다가 데이터 도착에 동아리 제목, 뒤로에 목록 제목을 한 번씩 알린다',
    async (_mode, strict) => {
      await mountAt('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead()) }, { strict });

      const enteringRead = await pushRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead(), detailTitle: null });
      expect(enteringRead).toBe(LIST_TITLE);
      expect(placeholderCount()).toBe(1);
      expect(document.title).toBe(LIST_TITLE);

      revealHead('modal');
      await settle(() => expect(placeholderCount()).toBe(0));
      expect(document.title).toBe(LIST_TITLE);
      expect(headTitleCount()).toBe(1);
      expect(announced()).toEqual([]);

      arriveDetail('밴드부');
      await settle(() => expect(announced()).toEqual([CLUB_TITLE]));

      await popRoute('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead('list-back')) });
      await settle(() => expect(announced()).toEqual([CLUB_TITLE, LIST_TITLE]));
      expect(document.title).toBe(LIST_TITLE);
      expect(tabTitles).toEqual([LIST_TITLE, CLUB_TITLE, LIST_TITLE]);
    },
  );

  it('틈 동안 데이터가 먼저 오면 동아리 제목이 자리 표시에 쓰이고 공개 때 새 <title> 로 옮겨진다 — 영역은 동아리 제목 한 번', async () => {
    await mountAt('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead()) });
    await pushRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead(), detailTitle: null });

    arriveDetail('밴드부');
    await settle(() => expect(announced()).toEqual([CLUB_TITLE]));
    expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe(CLUB_TITLE);

    revealHead('modal');
    await settle(() => expect(placeholderCount()).toBe(0));
    expect(document.title).toBe(CLUB_TITLE);
    expect(headTitleCount()).toBe(1);
    expect(announced()).toEqual([CLUB_TITLE]);
  });

  it('공개 뒤 head 가 틈과 함께 한 번 더 다시 그려져도(프레임 재렌더 없음) 동아리 제목을 잇고 알리지 않는다 — 관찰 콜백이 넣은 자리 표시라 정리 관찰이 head 관찰보다 나중에 불린다', async () => {
    await enterLateFromList();

    renderHead(modalHead('modal-again'));
    await settle(() => expect(placeholderCount()).toBe(1));
    expect(document.title).toBe(CLUB_TITLE);

    revealHead('modal-again');
    await settle(() => expect(placeholderCount()).toBe(0));
    expect(document.title).toBe(CLUB_TITLE);
    expect(headTitleCount()).toBe(1);
    expect(announced()).toEqual([CLUB_TITLE]);
  });

  it('틈 동안 숨지 않은 <title> 이 바로 마운트되면 React 는 새 요소를 자리 표시 앞에 넣는다 — 자리 표시 글자는 그대로이고, 보이던 목록 제목을 이은 뒤 자리 표시를 지운다', async () => {
    await mountAt('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead()) });
    await pushRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead(), detailTitle: null });
    const placeholder = document.head.querySelector(PLACEHOLDER_SELECTOR);
    expect(placeholder).not.toBeNull();

    renderHead(ready(modalHead('modal-ready')));
    await settle(() => expect(placeholderCount()).toBe(0));
    expect(placeholder?.textContent).toBe(LIST_TITLE);
    expect(placeholder?.isConnected).toBe(false);
    expect(headTitleCount()).toBe(1);
    expect(document.title).toBe(LIST_TITLE);
    expect(announced()).toEqual([]);
  });

  it('상세 → 상세(head 를 다시 그리며 틈) — 뒤 상세의 데이터 도착에 뒤 동아리 제목을 한 번 알린다', async () => {
    await mountAt('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead()) });
    await pushRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead('modal-7'), detailKey: '7', detailTitle: null });
    revealHead('modal-7');
    await settle(() => expect(placeholderCount()).toBe(0));
    arriveDetail('밴드부');
    await settle(() => expect(announced()).toEqual([CLUB_TITLE]));

    await pushRoute('/clubs/8', { intercepted: true, underlyingKey: '', head: modalHead('modal-8'), detailKey: '8', detailTitle: null });
    revealHead('modal-8');
    await settle(() => expect(placeholderCount()).toBe(0));
    arriveDetail('연극부');
    await settle(() => expect(announced()).toEqual([CLUB_TITLE, OTHER_CLUB_TITLE]));
    expect(document.title).toBe(OTHER_CLUB_TITLE);
    expect(headTitleCount()).toBe(1);
  });

  it('refresh(로그아웃) 커밋이 head 를 새 요소로 다시 그려도 동아리 제목을 잇는다 — Next 는 그 커밋에서 동아리 제목을 읽고 영역은 침묵', async () => {
    await enterLateFromList();

    expect(await refreshRoute(ready(modalHead('modal-refresh')))).toBe(CLUB_TITLE);
    expect(document.title).toBe(CLUB_TITLE);
    expect(headTitleCount()).toBe(1);
    await nextTask();
    expect(announced()).toEqual([CLUB_TITLE]);
  });

  it.each([
    ['기본', false],
    ['StrictMode', true],
  ])(
    '%s — 로그아웃 뒤 뒤로(목록 head 가 늦어 틈): 나가는 커밋을 진입 전 제목으로 메워 Next 가 목록 제목을 읽고, 목록 head 공개 뒤 자리 표시를 지운다',
    async (_mode, strict) => {
      await enterLateFromList(strict);
      await refreshRoute(ready(modalHead('modal-refresh')));

      const backRead = await popRoute('/clubs', { intercepted: false, underlyingKey: '', head: listHead('list-back') });
      expect(backRead).toBe(LIST_TITLE);
      expect(placeholderCount()).toBe(1);

      revealHead('list-back');
      await settle(() => expect(placeholderCount()).toBe(0));
      expect(document.title).toBe(LIST_TITLE);
      expect(headTitleCount()).toBe(1);
      // Next 가 목록 제목을 읽었으므로(refresh 신호 뒤 nextTitle 은 동아리 제목) 영역은 침묵한다.
      expect(announced()).toEqual([CLUB_TITLE]);
    },
  );

  it('회원 화면으로 나가는 틈은 메우지 않는다 — 자리 표시 없이, 공개된 회원 화면 head 제목이 그대로 보인다', async () => {
    await enterLateFromList();

    const leavingRead = await pushRoute('/clubs/7/member/notices', {
      intercepted: false,
      underlyingKey: '7/member/notices',
      head: { key: 'member', title: SITE_TITLE },
    });
    expect(placeholderCount()).toBe(0);
    // 다른 주소로 나가는 틈에서 Next 가 h1 을 읽는 것은 16.4 의 일반 동작이라 수용한다(스펙 §7).
    expect(leavingRead).toBe(LIST_HEADING);

    revealHead('member');
    await settle(() => expect(headTitleCount()).toBe(1));
    expect(document.title).toBe(SITE_TITLE);
    expect(announced()).toEqual([CLUB_TITLE]);
  });

  // StrictMode(dev)는 공개된 <title> 을 같은 요소로 뺐다가 다시 넣는다 — 빈 자리 표시 뒤 공개가 먼저인 갈래(9b)에서 그 재삽입을 데이터
  // 도착으로 읽지 않는지 본다.
  describe.each([
    ['기본', false],
    ['StrictMode', true],
  ])('%s — 회원 화면 → 뒤로 → 돌아온 인터셉트 엔트리(밑 화면이 바뀐 진입, 틈)', (_mode, strict) => {
    async function returnToInterceptEntry(): Promise<number> {
      await enterLateFromList(strict);
      await pushRoute('/clubs/7/member/notices', {
        intercepted: false,
        underlyingKey: '7/member/notices',
        head: { key: 'member', title: SITE_TITLE },
      });
      revealHead('member');
      await settle(() => expect(document.title).toBe(SITE_TITLE));
      const regionMark = regionTexts.length;
      await popRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead('modal-return'), detailTitle: null });
      // 직전 글자(회원 화면 제목)를 잇지 않는다 — 빈 자리 표시가 상세 제목 훅의 쓰기를 받는다.
      expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe('');
      return regionMark;
    }

    async function backToList(): Promise<void> {
      await popRoute('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead('list-back')) });
      await settle(() => expect(document.title).toBe(LIST_TITLE));
    }

    it('데이터 → 공개 — 동아리 제목이 빈 자리 표시에 쓰였다가 공개된 <title> 로 옮겨지고, 영역은 동아리 제목만 알린다', async () => {
      const regionMark = await returnToInterceptEntry();

      arriveDetail('밴드부');
      await settle(() => expect(announced(regionTexts.slice(regionMark))).toEqual([CLUB_TITLE]));
      revealHead('modal-return');
      await settle(() => expect(placeholderCount()).toBe(0));
      expect(document.title).toBe(CLUB_TITLE);

      await backToList();
      expect(announced(regionTexts.slice(regionMark))).toEqual([CLUB_TITLE]);
    });

    it('공개 → 데이터 — 공개된 기본 제목을 데이터 도착으로 알리지 않고, 뒤이은 데이터 도착에 동아리 제목만 알린다', async () => {
      const regionMark = await returnToInterceptEntry();

      revealHead('modal-return');
      await settle(() => expect(placeholderCount()).toBe(0));
      expect(document.title).toBe(SITE_TITLE);
      await nextTask();
      expect(announced(regionTexts.slice(regionMark))).toEqual([]);

      arriveDetail('밴드부');
      await settle(() => expect(announced(regionTexts.slice(regionMark))).toEqual([CLUB_TITLE]));

      await backToList();
      expect(announced(regionTexts.slice(regionMark))).toEqual([CLUB_TITLE]);
    });
  });

  it('나가는 틈을 메운 자리 표시가 남은 채 직전 글자를 모르는 엔트리로 건너뛰면(기록 메뉴) 그 글자를 비운다 — 옛 화면 제목을 잇지 않는다', async () => {
    await enterLateFromList();
    await popRoute('/clubs', { intercepted: false, underlyingKey: '', head: listHead('list-back') });
    expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe(LIST_TITLE);

    // 목록 head 가 들어오기 전에 밑 화면이 다른(하드 로드 상세 5 위) 인터셉트 엔트리로 건너뛴다.
    await popRoute('/clubs/9', { intercepted: true, underlyingKey: '5', head: modalHead('modal-9'), detailTitle: null });
    expect(placeholderCount()).toBe(1);
    expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe('');

    revealHead('modal-9');
    await settle(() => expect(placeholderCount()).toBe(0));
    expect(document.title).toBe(SITE_TITLE);
    const regionMark = regionTexts.length;
    arriveDetail('연극부');
    await settle(() => expect(announced(regionTexts.slice(regionMark))).toEqual([OTHER_CLUB_TITLE]));
    expect(headTitleCount()).toBe(1);
  });

  it('나가는 틈을 메운 자리 표시가 남은 채 직전 글자를 모르는 엔트리로 건너뛰는데 그 head 가 바로 마운트되면(캐시 적중) 자리 표시를 지우고 공개된 제목을 기억한다 — 옛 글자를 옮기지 않고 데이터 도착을 알린다', async () => {
    await enterLateFromList();
    await popRoute('/clubs', { intercepted: false, underlyingKey: '', head: listHead('list-back') });
    expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe(LIST_TITLE);

    await popRoute('/clubs/9', { intercepted: true, underlyingKey: '5', head: ready(modalHead('modal-9')), detailTitle: null });
    expect(placeholderCount()).toBe(0);
    await nextTask();
    expect(document.title).toBe(SITE_TITLE);

    const regionMark = regionTexts.length;
    arriveDetail('연극부');
    await settle(() => expect(announced(regionTexts.slice(regionMark))).toEqual([OTHER_CLUB_TITLE]));
    expect(document.title).toBe(OTHER_CLUB_TITLE);
    expect(headTitleCount()).toBe(1);
  });

  it('하드 로드 상세(스트리밍 메타데이터라 <title> 이 body)에서 가로채 들어와도 그 제목을 잇는다 — 가드는 head 가 아니라 문서의 <title> 을 본다', async () => {
    const streamedTitle = document.createElement('title');
    streamedTitle.textContent = HARD_DETAIL_TITLE;
    document.body.appendChild(streamedTitle);
    // head 에는 제목이 없다 — 공개되지 않는 head 로 둔다.
    await mountAt('/clubs/5', { intercepted: false, underlyingKey: '5', head: { key: 'detail-ssr', title: HARD_DETAIL_TITLE } });
    expect(document.title).toBe(HARD_DETAIL_TITLE);

    // 16.4 는 가로채는 커밋에서 head 를 다시 그려 스트리밍 <title> 도 빠진다(여기서는 그 커밋 직전에 뺀다).
    streamedTitle.remove();
    const enteringRead = await pushRoute('/clubs/9', { intercepted: true, underlyingKey: '5', head: modalHead('modal-9'), detailTitle: null });
    expect(enteringRead).toBe(HARD_DETAIL_TITLE);
    expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe(HARD_DETAIL_TITLE);

    revealHead('modal-9');
    await settle(() => expect(placeholderCount()).toBe(0));
    expect(document.title).toBe(HARD_DETAIL_TITLE);
    arriveDetail('연극부');
    await settle(() => expect(announced()).toEqual([OTHER_CLUB_TITLE]));
  });

  it('StrictMode 에서 인터셉트 상태로 처음 마운트(틈) — 직전 글자를 모르는 진입으로 다뤄 데이터 도착에 동아리 제목 한 번, 뒤로 뒤 탭 제목은 목록 제목', async () => {
    await mountAt('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead(), detailTitle: null }, { strict: true });
    expect(placeholderCount()).toBe(1);
    expect(document.head.querySelector(PLACEHOLDER_SELECTOR)?.textContent).toBe('');

    revealHead('modal');
    await settle(() => expect(placeholderCount()).toBe(0));
    expect(document.title).toBe(SITE_TITLE);
    arriveDetail('밴드부');
    await settle(() => expect(announced()).toEqual([CLUB_TITLE]));

    await popRoute('/clubs', { intercepted: false, underlyingKey: '', head: ready(listHead('list-back')) });
    await settle(() => expect(document.title).toBe(LIST_TITLE));
    expect(announced()).toEqual([CLUB_TITLE]);
  });

  it('소프트 도착의 실측 순서 — 옛 화면 제목이 있는 채 목록 마운트 → 틈 → 목록 제목 공개(프레임 재렌더 없음) → 늦은 진입: 목록 제목을 이어 Next 가 목록 제목을 읽고, 영역은 동아리 제목 한 번', async () => {
    await mountAt('/clubs', { intercepted: false, underlyingKey: '', head: ready({ key: 'notices', title: NOTICES_TITLE }) });
    renderHead(listHead());
    await settle(() => expect(headTitleCount()).toBe(0));
    revealHead('list');
    await settle(() => expect(document.title).toBe(LIST_TITLE));
    restartTabTitles();

    const enteringRead = await pushRoute('/clubs/7', { intercepted: true, underlyingKey: '', head: modalHead(), detailTitle: null });
    expect(enteringRead).toBe(LIST_TITLE);
    revealHead('modal');
    await settle(() => expect(placeholderCount()).toBe(0));
    arriveDetail('밴드부');
    await settle(() => expect(announced()).toEqual([CLUB_TITLE]));
    expect(tabTitles).toEqual([LIST_TITLE, CLUB_TITLE]);
  });
});
