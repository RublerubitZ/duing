import { writeFileSync } from 'node:fs';

import {
  devices,
  errors,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * 동아리 상세 진입 측정(스펙 P1 §2·§5) — 컨트롤러 전용(환경변수가 없으면 건너뛴다).
 * 누름부터 실제 히어로(동아리 이름 h1)가 처음 그려진 프레임까지 상세 스켈레톤('동아리 정보 불러오는 중')이 있던 프레임 수·ms 를
 * 잰다. 대표 활동 스켈레톤('대표 활동 불러오는 중') 체류도 잰다(판정은 데스크탑만). rAF 마다 표식을 적어 되짚는다.
 * View Transition 중단도 센다(값만 적는다): 선조회가 늦으면 스켈레톤 로고 박스가 전환의 새 요소로 잡혔다가 히어로로 바뀌며 전환이
 * 끊길 수 있다. 신호는 셋 — 시작~끝 시각, ready 거부, 콘솔·페이지 오류 문구(시작 뒤 중단은 finished 가 그냥 끝난다).
 *
 * 환경변수
 * - E2E_MEASURE_P1_URL: P1 빌드 주소(예 http://localhost:3202, 릴리스 뒤에는 https://duings.com)
 * - E2E_MEASURE_DEVELOP_URL: 비교 기준(develop) 빌드 주소 — 없으면 P1 만 잰다(릴리스 뒤 운영 재측정)
 * - E2E_MEASURE_TARGETS: `id=검색어;id=검색어;…` — 키워드 검색 목록의 첫 화면에 그 카드가 오게 한다(추천순은 매시 섞여 첫 화면이
 *   바뀐다). 커버 유무·대표 활동 유무를 섞어 3곳.
 * - E2E_MEASURE_TRIALS(기본 10)·E2E_MEASURE_OUTPUT(결과 JSON 경로, 선택 — 프로젝트 이름이 붙는다)
 *
 * 운영 API 연결: 로컬 오리진은 운영 CORS 밖이라 브라우저 직결이 막힌다 — GET 은 route.fetch 로 운영에 보내고 응답에 CORS 만 얹는다.
 * route.fetch 는 가로챈 요청의 헤더를 그대로 쓰므로 로컬 origin 을 빼고 보낸다(실리면 운영 CORS 필터가 403). 쓰기는 운영에 보내지
 * 않는다: auth/web/refresh 는 401(204 면 익명 부팅이 '갱신 성공' 경로를 탄다), 나머지(상세 조회 기록 POST 등)는 204. 운영 주소
 * (https://duings.com)를 잴 때는 CORS 가 열려 있어 조회는 그대로 보내고 쓰기만 막는다. 분석·광고·오류 수집 요청은 늘 막는다.
 *
 * 프리페치: 목록 카드의 뷰포트 프리페치는 세그먼트 트리 요청(next-router-segment-prefetch: /_tree)이다. Vercel 은 이 요청에 전체
 * .rsc 를 주지만(x-matched-path /clubs/[clubId].rsc, 약 20KB — 상세가 통째로 프리페치된다), 로컬 next start 는 경로 트리만 준다
 * (0.5~0.8KB). 그대로 재면 로컬은 클릭 때 RSC·청크를 다시 받아 경로 로딩 경계가 커밋된다(develop 상세 스켈레톤: 로컬 18프레임,
 * 운영 0 — 2026-10-16 실측). 그래서 로컬 빌드를 잴 때는 트리 요청을 세그먼트 헤더를 뺀 전체 RSC 응답으로 바꿔 Vercel 과 맞춘다.
 * 이 흉내는 앱 오리진 호스트가 localhost·127.0.0.1 일 때만 건다 — 프리뷰·운영(Vercel)은 트리 요청도 실제 응답 그대로 받는다.
 */

const P1_URL = process.env.E2E_MEASURE_P1_URL;
const DEVELOP_URL = process.env.E2E_MEASURE_DEVELOP_URL;
const TRIALS = Number(process.env.E2E_MEASURE_TRIALS ?? '10');
const OUTPUT_PATH = process.env.E2E_MEASURE_OUTPUT;
const API_ORIGIN = 'https://api.duings.com';
const PRODUCTION_ORIGIN = 'https://duings.com';
const DETAIL_SKELETON_LABEL = '동아리 정보 불러오는 중';
const HERO_ACTIVITY_SKELETON_LABEL = '대표 활동 불러오는 중';
// 누름 유지 — 짧은 쪽으로 잡아 보수적으로(선조회가 앞설 시간이 적다).
const PRESS_HOLD_MS = 80;
// 목록이 뜬 뒤 Next 링크 프리페치가 끝나도록 기다린다(develop 의 흔한 경로).
const PREFETCH_SETTLE_MS = 2000;
// 전환 끝 대기 상한 — 전환(데스크탑 180ms·모바일 320ms)은 히어로 직후엔 대개 아직 돈다. 끝나지 않는 전환이 시행을 붙잡지 않게 넘기면 끝을 못 본 채(null) 적는다.
const TRANSITION_SETTLE_TIMEOUT_MS = 1500;
// 앱 전환 애니메이션은 데스크탑 180ms·모바일 push 320ms(globals.css ::view-transition-*). 애니메이션 도중 이름 붙은 요소가 사라지면
// ready 거부·콘솔 문구 없이 전환만 일찍 끝난다(합성 페이지 교정: 크로미엄·웹킷 모두). 그래서 ready→finished 가 이보다 짧으면 도중 중단으로
// 센다(추정). 모바일은 더 길어 이 기준으로는 늦은 중단을 놓칠 수 있다.
const MID_ANIMATION_ABORT_MS = 170;
// 시행 결과에 싣는 중단 문구 수 상한(문구는 모을 때 이미 160자로 자른다).
const ABORT_MESSAGE_LIMIT = 5;
// 스펙 §2 기준 — 포인터 진입의 상세 스켈레톤: 중앙값 0프레임·p90 ≤ 150ms(데스크탑은 대표 활동 스켈레톤도).
const P90_LIMIT_MS = 150;

type MeasureTarget = { clubId: number; keyword: string };
type BuildName = 'develop' | 'p1';
type EntryMode = 'pointer' | 'keyboard';
type EntryFrame = { t: number; detailSkeleton: boolean; activitySkeleton: boolean; hero: boolean };
type EntryTransition = {
  start: number;
  readyAt: number | null;
  finishedAt: number | null;
  readyRejected: boolean;
  reason: string | null;
};
type EntryPressMark = { type: 'pointerdown' | 'click'; t: number };
type FrameSummary = {
  detailSkeletonFrames: number;
  detailSkeletonMs: number;
  activitySkeletonFrames: number;
  activitySkeletonMs: number;
};
type TransitionSummary = {
  transitionCount: number;
  transitionAborts: number;
  transitionMs: number | null;
  // 애니메이션 구간(ready → finished). 업데이트 콜백(라우터 커밋) 시간을 빼야 도중 중단을 가를 수 있다.
  animationMs: number | null;
  midAnimationAbort: boolean;
  transitionSettleTimedOut: boolean;
  // 진단 — 갱신 시한(TimeoutError)·새 전환에 밀림(AbortError)·무관한 오류를 가른다. 이유는 전환 순서대로(없으면 null).
  transitionReasons: Array<string | null>;
  abortMessages: string[];
};
type TrialResult = FrameSummary &
  TransitionSummary & {
    build: BuildName;
    mode: EntryMode;
    project: string;
    clubId: number;
    trial: number;
    // 첫 pointerdown → 첫 click 실제 간격(선조회가 앞선 시간). 키보드는 pointerdown 이 없어 null.
    pressToClickMs: number | null;
  };
type TrialRun = { build: BuildName; baseUrl: string; target: MeasureTarget; mode: EntryMode; project: string; trial: number };

declare global {
  interface Window {
    __duingEntryFrames?: EntryFrame[];
    __duingEntryClubName?: string;
    __duingEntryTransitions?: EntryTransition[];
    __duingEntryPressMarks?: EntryPressMark[];
  }
}

function parseTargets(raw: string | undefined): MeasureTarget[] {
  if (!raw) return [];
  return raw.split(';').flatMap((entry) => {
    // 빈 항목(끝 세미콜론 등)만 넘긴다.
    if (entry.trim() === '') return [];
    const separatorIndex = entry.indexOf('=');
    const clubId = Number(entry.slice(0, separatorIndex));
    const keyword = entry.slice(separatorIndex + 1).trim();
    if (separatorIndex > 0 && Number.isInteger(clubId) && clubId > 0 && keyword !== '') return [{ clubId, keyword }];
    // 형식이 틀린 항목을 버리면 오타 하나로 대상이 조용히 줄어든다 — 실패로 알린다.
    throw new Error(`E2E_MEASURE_TARGETS 항목 형식이 틀렸다(id=검색어): '${entry}'`);
  });
}

const TARGETS = parseTargets(process.env.E2E_MEASURE_TARGETS);

test.skip(!P1_URL || TARGETS.length === 0, '컨트롤러 전용 — E2E_MEASURE_P1_URL·E2E_MEASURE_TARGETS 가 있을 때만 돈다(파일 머리말).');

// 프로젝트별 컨텍스트 옵션 — browser.newContext 는 프로젝트 use(기기 에뮬레이션)를 물려받지 않아 직접 넘긴다.
const CONTEXT_OPTIONS: Record<string, BrowserContextOptions> = {
  'desktop-mouse': { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
  'iphone-touch': { ...devices['iPhone 13'] },
};

// route.fetch 는 본문을 풀어서 준다 — 크로미엄 fulfill 은 헤더를 거르지 않고 싣는다(playwright-core 1.63, BiDi 경로만
// content-encoding 을 뺀다). 그래서 압축·길이·청크 헤더는 빼고 넘긴다.
function withoutTransferHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)),
  );
}

async function routeApi(context: BrowserContext, appOrigin: string): Promise<void> {
  const relaysToProduction = appOrigin !== PRODUCTION_ORIGIN;
  const simulatesVercelPrefetch = ['localhost', '127.0.0.1'].includes(new URL(appOrigin).hostname);
  const cors = { 'access-control-allow-origin': appOrigin, 'access-control-allow-credentials': 'true' };
  await context.route(/^https:\/\/([^/]+\.)?(googlesyndication\.com|sentry\.io|posthog\.com)\//, (route) => route.abort());
  await context.route(`${appOrigin}/ingest/**`, (route) => route.abort());
  if (simulatesVercelPrefetch) {
    // 머리말 '프리페치' — 트리 요청을 Vercel 처럼 전체 RSC 로 준다. 헤더가 바뀌면 _rsc 해시가 안 맞아 로컬 서버가 307 로 고쳐
    // 보내고 route.fetch 가 따라간다. 늦게 등록한 경로가 먼저 돌므로 나머지 요청은 fallback 으로 위 처리(ingest 차단 등)에 넘긴다.
    await context.route(`${appOrigin}/**`, async (route) => {
      const { 'next-router-segment-prefetch': segmentPrefetch, ...fullRequestHeaders } = route.request().headers();
      if (segmentPrefetch !== '/_tree') return route.fallback();
      const response = await route.fetch({ headers: fullRequestHeaders });
      return route.fulfill({ response, headers: withoutTransferHeaders(response.headers()) });
    });
  }
  await context.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method !== 'GET' && method !== 'OPTIONS') {
      if (new URL(request.url()).pathname.endsWith('/auth/web/refresh')) {
        return route.fulfill({
          status: 401,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify({ ok: false, data: null, message: '인증이 필요합니다.' }),
        });
      }
      return route.fulfill({ status: 204, headers: cors });
    }
    if (!relaysToProduction) return route.continue();
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }
    // accept-encoding 도 뺀다 — Playwright 기본(gzip·deflate·br, route.fetch 가 풀 수 있는 것)으로 받게.
    const headers = Object.fromEntries(
      Object.entries(request.headers()).filter(([name]) => name !== 'origin' && name !== 'accept-encoding'),
    );
    const response = await route.fetch({ headers });
    return route.fulfill({ response, headers: { ...withoutTransferHeaders(response.headers()), ...cors } });
  });
}

async function recordEntryFrames(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ detailLabel, activityLabel }) => {
      // View Transition 을 감싸 시작·끝 시각과 ready 거부를 적는다(startViewTransition 이 없는 엔진은 감싸지 않는다 — 기록 0건).
      const transitions: EntryTransition[] = [];
      window.__duingEntryTransitions = transitions;
      const originalStartViewTransition = document.startViewTransition?.bind(document);
      if (originalStartViewTransition) {
        document.startViewTransition = (callbackOptions?: Parameters<typeof originalStartViewTransition>[0]) => {
          const record: EntryTransition = {
            start: performance.now(),
            readyAt: null,
            finishedAt: null,
            readyRejected: false,
            reason: null,
          };
          transitions.push(record);
          const transition = originalStartViewTransition(callbackOptions);
          transition.ready.then(
            () => {
              record.readyAt = performance.now();
            },
            (readyError: unknown) => {
              record.readyRejected = true;
              record.reason = readyError instanceof Error ? readyError.name : String(readyError);
            },
          );
          transition.finished.then(
            () => {
              record.finishedAt = performance.now();
            },
            (finishedError: unknown) => {
              record.finishedAt = performance.now();
              record.reason ??= finishedError instanceof Error ? finishedError.name : String(finishedError);
            },
          );
          return transition;
        };
      }
      // 실제 누름 간격 — 캡처 단계에서 pointerdown·click 시각을 적는다(터치는 합성 pointerdown 뒤 tap 까지의 지연이 담긴다).
      const pressMarks: EntryPressMark[] = [];
      window.__duingEntryPressMarks = pressMarks;
      document.addEventListener('pointerdown', () => pressMarks.push({ type: 'pointerdown', t: performance.now() }), true);
      document.addEventListener('click', () => pressMarks.push({ type: 'click', t: performance.now() }), true);
      const frames: EntryFrame[] = [];
      window.__duingEntryFrames = frames;
      const poll = () => {
        const clubName = window.__duingEntryClubName;
        frames.push({
          t: performance.now(),
          detailSkeleton: document.querySelector(`[role="status"][aria-label="${detailLabel}"]`) !== null,
          activitySkeleton: document.querySelector(`[role="status"][aria-label="${activityLabel}"]`) !== null,
          // 모바일 히어로 h1 은 중앙동아리면 이름 뒤에 화면 읽기용 ' 중앙동아리' 가 붙는다 — 두 꼴 모두 히어로다(E2E detailHeading 과
          // 같은 규칙). 접두 일치(startsWith)는 쓰지 않는다 — 목록 제목('166개 동아리를 …')이 숫자로 시작하는 이름과 겹칠 수 있다.
          hero:
            clubName !== undefined &&
            Array.from(document.querySelectorAll('h1')).some((heading) => {
              const headingText = heading.textContent?.trim();
              return (
                (headingText === clubName || headingText === `${clubName} 중앙동아리`) &&
                heading.getClientRects().length > 0
              );
            }),
        });
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    },
    { detailLabel: DETAIL_SKELETON_LABEL, activityLabel: HERO_ACTIVITY_SKELETON_LABEL },
  );
}

async function pressCard(page: Page, card: Locator, mode: EntryMode, project: string): Promise<void> {
  if (mode === 'keyboard') {
    await card.focus();
    await page.keyboard.press('Enter');
    return;
  }
  if (project === 'iphone-touch') {
    // Playwright 터치스크린은 tap() 하나뿐이다 — 누름(pointerdown, touch)을 먼저 합성하고 유지 시간 뒤 tap 한다(tap 의 pointerdown 은
    // 진행 중인 선조회를 함께 쓴다, 스펙 §5).
    await card.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 });
    await page.waitForTimeout(PRESS_HOLD_MS);
    await card.tap();
    return;
  }
  const box = await card.boundingBox();
  if (!box) throw new Error('카드 위치를 읽지 못했다');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(PRESS_HOLD_MS);
  await page.mouse.up();
}

function summarizeFrames(frames: EntryFrame[]): FrameSummary {
  const heroIndex = frames.findIndex((frame) => frame.hero);
  const beforeHero = heroIndex === -1 ? frames : frames.slice(0, heroIndex);
  const heroFrame = heroIndex === -1 ? undefined : frames[heroIndex];
  const firstDetailSkeleton = beforeHero.find((frame) => frame.detailSkeleton);
  const activityIndexes = frames.flatMap((frame, index) => (frame.activitySkeleton ? [index] : []));
  const firstActivityIndex = activityIndexes[0];
  const lastActivityIndex = activityIndexes[activityIndexes.length - 1];
  const firstActivity = firstActivityIndex === undefined ? undefined : frames[firstActivityIndex];
  const afterActivity = lastActivityIndex === undefined ? undefined : frames[lastActivityIndex + 1];
  return {
    detailSkeletonFrames: beforeHero.filter((frame) => frame.detailSkeleton).length,
    detailSkeletonMs: firstDetailSkeleton && heroFrame ? heroFrame.t - firstDetailSkeleton.t : 0,
    activitySkeletonFrames: activityIndexes.length,
    activitySkeletonMs: firstActivity && afterActivity ? afterActivity.t - firstActivity.t : 0,
  };
}

async function measureEntry(browser: Browser, run: TrialRun): Promise<TrialResult> {
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS[run.project],
    baseURL: run.baseUrl,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  try {
    await routeApi(context, new URL(run.baseUrl).origin);
    await recordEntryFrames(context);
    const page = await context.newPage();
    // 시작 뒤 중단은 ready 가 이미 풀려 있어 콘솔·페이지 오류 문구로만 보인다(크로미엄 'Transition was aborted …').
    const transitionAbortMessages: string[] = [];
    const abortPattern = /transition was aborted|invalidstateerror|transition.*skipped/i;
    page.on('console', (message) => {
      if (abortPattern.test(message.text())) transitionAbortMessages.push(message.text().slice(0, 160));
    });
    page.on('pageerror', (pageError) => {
      // 이름(TimeoutError·AbortError·InvalidStateError)까지 실어야 진단에서 원인을 가른다.
      if (abortPattern.test(`${pageError.name} ${pageError.message}`)) {
        transitionAbortMessages.push(`${pageError.name}: ${pageError.message}`.slice(0, 160));
      }
    });
    await page.goto(`/clubs?q=${encodeURIComponent(run.target.keyword)}`);
    // 서버가 먼저 그린 목록(data-explore-server-list)이 하이드레이션 뒤 실제 목록으로 바뀐다 — 바뀌기 전에 카드를 잡으면 누르기 전에
    // 노드가 떨어진다(스모크에서 scrollIntoViewIfNeeded 'not attached').
    await expect(page.locator('[data-explore-server-list]')).toHaveCount(0, { timeout: 30_000 });
    const card = page.locator(`a[href="/clubs/${run.target.clubId}"]:visible`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    // 누르기 전에 화면 안으로 — 마우스 경로는 스스로 스크롤하지 않고, 스크롤이 부르는 뷰포트 프리페치도 아래 정착 대기 안에 끝난다.
    await card.scrollIntoViewIfNeeded();
    const logoLabel = await card.locator('[aria-label$=" 로고"]').first().getAttribute('aria-label');
    if (!logoLabel) throw new Error('카드 로고 라벨이 없다');
    await page.waitForTimeout(PREFETCH_SETTLE_MS);
    await page.evaluate((clubName) => {
      window.__duingEntryClubName = clubName;
    }, logoLabel.slice(0, -' 로고'.length));

    const pressedAt = await page.evaluate(() => performance.now());
    const abortMessagesBeforePress = transitionAbortMessages.length;
    await pressCard(page, card, run.mode, run.project);
    await page.waitForFunction(() => (window.__duingEntryFrames ?? []).some((frame) => frame.hero), undefined, {
      timeout: 30_000,
    });
    // 대표 활동 스켈레톤이 끝날 때까지(0개면 자리가 접힌다) 본 뒤 두 프레임 더 적는다.
    await page.waitForFunction(
      (activityLabel) => document.querySelector(`[role="status"][aria-label="${activityLabel}"]`) === null,
      HERO_ACTIVITY_SKELETON_LABEL,
      { timeout: 30_000 },
    );
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    // 읽기 전에 누름 뒤 시작된 전환이 모두 끝나기를 기다린다(상한을 넘기면 그대로 적고 시한 초과로 센다).
    let transitionSettleTimedOut = false;
    try {
      await page.waitForFunction(
        (pressedAtArg) =>
          (window.__duingEntryTransitions ?? [])
            .filter((transition) => transition.start >= pressedAtArg)
            .every((transition) => transition.finishedAt !== null),
        pressedAt,
        { timeout: TRANSITION_SETTLE_TIMEOUT_MS },
      );
    } catch (settleError) {
      if (!(settleError instanceof errors.TimeoutError)) throw settleError;
      transitionSettleTimedOut = true;
    }
    const frames = (await page.evaluate(() => window.__duingEntryFrames ?? [])).filter((frame) => frame.t >= pressedAt);
    const transitions = (await page.evaluate(() => window.__duingEntryTransitions ?? [])).filter(
      (transition) => transition.start >= pressedAt,
    );
    const pressMarks = (await page.evaluate(() => window.__duingEntryPressMarks ?? [])).filter((mark) => mark.t >= pressedAt);
    const firstPointerdown = pressMarks.find((mark) => mark.type === 'pointerdown');
    const firstClick = pressMarks.find((mark) => mark.type === 'click');
    const firstTransition = transitions[0];
    const firstAnimationMs =
      firstTransition && firstTransition.readyAt !== null && firstTransition.finishedAt !== null
        ? firstTransition.finishedAt - firstTransition.readyAt
        : null;
    const transitionSummary: TransitionSummary = {
      transitionCount: transitions.length,
      transitionAborts:
        transitions.filter((transition) => transition.readyRejected).length +
        (transitionAbortMessages.length - abortMessagesBeforePress),
      transitionMs:
        firstTransition && firstTransition.finishedAt !== null ? firstTransition.finishedAt - firstTransition.start : null,
      animationMs: firstAnimationMs,
      midAnimationAbort: transitions.some((transition) => {
        if (transition.readyAt === null || transition.finishedAt === null) return false;
        return transition.finishedAt - transition.readyAt < MID_ANIMATION_ABORT_MS;
      }),
      transitionSettleTimedOut,
      transitionReasons: transitions.map((transition) => transition.reason),
      abortMessages: transitionAbortMessages.slice(abortMessagesBeforePress, abortMessagesBeforePress + ABORT_MESSAGE_LIMIT),
    };
    return {
      build: run.build,
      mode: run.mode,
      project: run.project,
      clubId: run.target.clubId,
      trial: run.trial,
      pressToClickMs: firstPointerdown && firstClick ? firstClick.t - firstPointerdown.t : null,
      ...summarizeFrames(frames),
      ...transitionSummary,
    };
  } finally {
    // 진행 중인 중계 요청이 닫힌 컨텍스트에서 끝나며 내는 'Request context disposed' 를 막는다.
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function percentile90(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)] ?? 0;
}

test('동아리 상세 진입 — 포인터·키보드 × 비교 기준·P1(번갈아), 시행마다 새 컨텍스트', async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  // 기본 설정(playwright.config.ts)의 desktop 프로젝트도 e2e/ 를 통째로 집는다 — 기기 옵션이 없는 프로젝트에서는 재지 않는다.
  test.skip(!Object.hasOwn(CONTEXT_OPTIONS, project), '측정 전용 설정(playwright.entry-measure.config.ts)으로만 돈다');
  const builds: Array<{ build: BuildName; baseUrl: string }> = [];
  if (DEVELOP_URL) builds.push({ build: 'develop', baseUrl: DEVELOP_URL });
  if (P1_URL) builds.push({ build: 'p1', baseUrl: P1_URL });

  // 결과 파일은 시행마다 지금까지의 결과로 덮어쓴다 — 중간에 멈춰도 앞 시행이 남는다(요약 rows 는 끝에서 함께 쓴다).
  const outputFile = OUTPUT_PATH?.replace(/(\.json)?$/, `-${project}.json`);
  const results: TrialResult[] = [];
  for (let trial = 0; trial < TRIALS; trial += 1) {
    for (const target of TARGETS) {
      // 두 빌드를 번갈아 — 회차마다 순서를 뒤집어 시간대(운영 부하) 영향이 한쪽에 몰리지 않게.
      const order = trial % 2 === 0 ? builds : [...builds].reverse();
      for (const { build, baseUrl } of order) {
        for (const mode of ['pointer', 'keyboard'] as const) {
          results.push(await measureEntry(browser, { build, baseUrl, target, mode, project, trial }));
          if (outputFile) writeFileSync(outputFile, JSON.stringify({ project, results }, null, 2));
        }
      }
    }
  }

  const rows = builds.flatMap(({ build }) =>
    (['pointer', 'keyboard'] as const).map((mode) => {
      const group = results.filter((result) => result.build === build && result.mode === mode);
      const finishedTransitionMs = group.flatMap((result) => (result.transitionMs === null ? [] : [result.transitionMs]));
      return {
        build,
        mode,
        trials: group.length,
        detailFramesMedian: median(group.map((result) => result.detailSkeletonFrames)),
        detailMsP90: percentile90(group.map((result) => result.detailSkeletonMs)),
        activityFramesMedian: median(group.map((result) => result.activitySkeletonFrames)),
        activityMsP90: percentile90(group.map((result) => result.activitySkeletonMs)),
        // View Transition — 수·중단은 시행 합계, ms 는 끝을 본 전환의 중앙값(끝을 본 전환이 없으면 '-').
        '전환 수': group.reduce((total, result) => total + result.transitionCount, 0),
        중단: group.reduce((total, result) => total + result.transitionAborts, 0),
        '도중 중단': group.filter((result) => result.midAnimationAbort).length,
        '전환 ms': finishedTransitionMs.length > 0 ? median(finishedTransitionMs) : '-',
      };
    }),
  );
  console.log(`[진입 측정] ${project}`);
  console.table(rows);
  for (const { build, mode, trials } of rows) {
    const abortedTrials = results.filter(
      (result) => result.build === build && result.mode === mode && result.transitionAborts > 0,
    ).length;
    const settleTimedOutTrials = results.filter(
      (result) => result.build === build && result.mode === mode && result.transitionSettleTimedOut,
    ).length;
    console.log(`[진입 측정] ${project} ${build} ${mode} — 전환 중단 1건 이상인 시행 ${abortedTrials}/${trials}`);
    const midAbortTrials = results.filter(
      (result) => result.build === build && result.mode === mode && result.midAnimationAbort,
    ).length;
    console.log(
      `[진입 측정] ${project} ${build} ${mode} — 애니메이션 도중 중단(추정, ready→finished < ${MID_ANIMATION_ABORT_MS}ms) 시행 ${midAbortTrials}/${trials}`,
    );
    console.log(
      `[진입 측정] ${project} ${build} ${mode} — 전환 끝 대기 시한(${TRANSITION_SETTLE_TIMEOUT_MS}ms) 초과 시행 ${settleTimedOutTrials}/${trials}`,
    );
  }
  if (outputFile) {
    writeFileSync(outputFile, JSON.stringify({ project, rows, results }, null, 2));
  }

  // 판정(스펙 §2) — P1 포인터 진입만 기준이 있다(키보드는 값만 적는다). 넘으면 2단계(서버 시드)를 같은 PR 에 더한다(Task 12).
  const p1Pointer = rows.find((row) => row.build === 'p1' && row.mode === 'pointer');
  // 시행이 0이면 빈 배열의 중앙값·p90 이 0이라 판정이 저절로 통과한다 — P1 포인터와 잰 빌드·모드마다 시행이 있어야 한다.
  expect(p1Pointer?.trials ?? 0, 'P1 포인터 시행 수').toBeGreaterThan(0);
  for (const row of rows) expect(row.trials, `${row.build} ${row.mode} 시행 수`).toBeGreaterThan(0);
  expect.soft(p1Pointer?.detailFramesMedian, '상세 스켈레톤 중앙값 0프레임').toBe(0);
  expect.soft(p1Pointer?.detailMsP90 ?? Number.POSITIVE_INFINITY, '상세 스켈레톤 p90 ≤ 150ms').toBeLessThanOrEqual(P90_LIMIT_MS);
  if (project === 'desktop-mouse') {
    expect.soft(p1Pointer?.activityFramesMedian, '대표 활동 스켈레톤 중앙값 0프레임(데스크탑)').toBe(0);
    expect
      .soft(p1Pointer?.activityMsP90 ?? Number.POSITIVE_INFINITY, '대표 활동 스켈레톤 p90 ≤ 150ms(데스크탑)')
      .toBeLessThanOrEqual(P90_LIMIT_MS);
  }
});
