import { writeFileSync } from 'node:fs';

import {
  devices,
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
// 스펙 §2 기준 — 포인터 진입의 상세 스켈레톤: 중앙값 0프레임·p90 ≤ 150ms(데스크탑은 대표 활동 스켈레톤도).
const P90_LIMIT_MS = 150;

type MeasureTarget = { clubId: number; keyword: string };
type BuildName = 'develop' | 'p1';
type EntryMode = 'pointer' | 'keyboard';
type EntryFrame = { t: number; detailSkeleton: boolean; activitySkeleton: boolean; hero: boolean };
type EntryTransition = { start: number; finishedAt: number | null; readyRejected: boolean; reason: string | null };
type FrameSummary = {
  detailSkeletonFrames: number;
  detailSkeletonMs: number;
  activitySkeletonFrames: number;
  activitySkeletonMs: number;
};
type TransitionSummary = { transitionCount: number; transitionAborts: number; transitionMs: number | null };
type TrialResult = FrameSummary & TransitionSummary & { build: BuildName; mode: EntryMode; project: string; clubId: number; trial: number };
type TrialRun = { build: BuildName; baseUrl: string; target: MeasureTarget; mode: EntryMode; project: string; trial: number };

declare global {
  interface Window {
    __duingEntryFrames?: EntryFrame[];
    __duingEntryClubName?: string;
    __duingEntryTransitions?: EntryTransition[];
  }
}

function parseTargets(raw: string | undefined): MeasureTarget[] {
  if (!raw) return [];
  return raw.split(';').flatMap((entry) => {
    const separatorIndex = entry.indexOf('=');
    const clubId = Number(entry.slice(0, separatorIndex));
    const keyword = entry.slice(separatorIndex + 1).trim();
    return separatorIndex > 0 && Number.isInteger(clubId) && clubId > 0 && keyword !== '' ? [{ clubId, keyword }] : [];
  });
}

const TARGETS = parseTargets(process.env.E2E_MEASURE_TARGETS);

test.skip(!P1_URL || TARGETS.length === 0, '컨트롤러 전용 — E2E_MEASURE_P1_URL·E2E_MEASURE_TARGETS 가 있을 때만 돈다(파일 머리말).');

// 프로젝트별 컨텍스트 옵션 — browser.newContext 는 프로젝트 use(기기 에뮬레이션)를 물려받지 않아 직접 넘긴다.
const CONTEXT_OPTIONS: Record<string, BrowserContextOptions> = {
  'desktop-mouse': { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
  'iphone-touch': { ...devices['iPhone 13'] },
};

async function routeApi(context: BrowserContext, appOrigin: string): Promise<void> {
  const relaysToProduction = appOrigin !== PRODUCTION_ORIGIN;
  const cors = { 'access-control-allow-origin': appOrigin, 'access-control-allow-credentials': 'true' };
  await context.route(/^https:\/\/([^/]+\.)?(googlesyndication\.com|sentry\.io|posthog\.com)\//, (route) => route.abort());
  await context.route(`${appOrigin}/ingest/**`, (route) => route.abort());
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
    // route.fetch 는 본문을 풀어서 준다 — 크로미엄 fulfill 은 헤더를 거르지 않고 싣는다(playwright-core 1.63, BiDi 경로만
    // content-encoding 을 뺀다). 그래서 압축·길이·청크 헤더는 빼고 넘긴다.
    const relayedHeaders = Object.fromEntries(
      Object.entries(response.headers()).filter(
        ([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name),
      ),
    );
    return route.fulfill({ response, headers: { ...relayedHeaders, ...cors } });
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
          const record: EntryTransition = { start: performance.now(), finishedAt: null, readyRejected: false, reason: null };
          transitions.push(record);
          const transition = originalStartViewTransition(callbackOptions);
          transition.ready.catch((readyError: unknown) => {
            record.readyRejected = true;
            record.reason = readyError instanceof Error ? readyError.name : String(readyError);
          });
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
      if (abortPattern.test(`${pageError.name} ${pageError.message}`)) transitionAbortMessages.push(pageError.message.slice(0, 160));
    });
    await page.goto(`/clubs?q=${encodeURIComponent(run.target.keyword)}`);
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
    const frames = (await page.evaluate(() => window.__duingEntryFrames ?? [])).filter((frame) => frame.t >= pressedAt);
    const transitions = (await page.evaluate(() => window.__duingEntryTransitions ?? [])).filter(
      (transition) => transition.start >= pressedAt,
    );
    const firstTransition = transitions[0];
    const transitionSummary: TransitionSummary = {
      transitionCount: transitions.length,
      transitionAborts:
        transitions.filter((transition) => transition.readyRejected).length +
        (transitionAbortMessages.length - abortMessagesBeforePress),
      transitionMs:
        firstTransition && firstTransition.finishedAt !== null ? firstTransition.finishedAt - firstTransition.start : null,
    };
    return {
      build: run.build,
      mode: run.mode,
      project: run.project,
      clubId: run.target.clubId,
      trial: run.trial,
      ...summarizeFrames(frames),
      ...transitionSummary,
    };
  } finally {
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
  const builds: Array<{ build: BuildName; baseUrl: string }> = [];
  if (DEVELOP_URL) builds.push({ build: 'develop', baseUrl: DEVELOP_URL });
  if (P1_URL) builds.push({ build: 'p1', baseUrl: P1_URL });

  const results: TrialResult[] = [];
  for (let trial = 0; trial < TRIALS; trial += 1) {
    for (const target of TARGETS) {
      // 두 빌드를 번갈아 — 회차마다 순서를 뒤집어 시간대(운영 부하) 영향이 한쪽에 몰리지 않게.
      const order = trial % 2 === 0 ? builds : [...builds].reverse();
      for (const { build, baseUrl } of order) {
        for (const mode of ['pointer', 'keyboard'] as const) {
          results.push(await measureEntry(browser, { build, baseUrl, target, mode, project, trial }));
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
    console.log(`[진입 측정] ${project} ${build} ${mode} — 전환 중단 1건 이상인 시행 ${abortedTrials}/${trials}`);
  }
  if (OUTPUT_PATH) {
    writeFileSync(OUTPUT_PATH.replace(/(\.json)?$/, `-${project}.json`), JSON.stringify({ project, rows, results }, null, 2));
  }

  // 판정(스펙 §2) — P1 포인터 진입만 기준이 있다(키보드는 값만 적는다). 넘으면 2단계(서버 시드)를 같은 PR 에 더한다(Task 12).
  const p1Pointer = rows.find((row) => row.build === 'p1' && row.mode === 'pointer');
  expect.soft(p1Pointer?.detailFramesMedian, '상세 스켈레톤 중앙값 0프레임').toBe(0);
  expect.soft(p1Pointer?.detailMsP90 ?? Number.POSITIVE_INFINITY, '상세 스켈레톤 p90 ≤ 150ms').toBeLessThanOrEqual(P90_LIMIT_MS);
  if (project === 'desktop-mouse') {
    expect.soft(p1Pointer?.activityFramesMedian, '대표 활동 스켈레톤 중앙값 0프레임(데스크탑)').toBe(0);
    expect
      .soft(p1Pointer?.activityMsP90 ?? Number.POSITIVE_INFINITY, '대표 활동 스켈레톤 p90 ≤ 150ms(데스크탑)')
      .toBeLessThanOrEqual(P90_LIMIT_MS);
  }
});
