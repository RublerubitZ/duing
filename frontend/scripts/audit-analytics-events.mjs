#!/usr/bin/env node
/**
 * 죽은 분석 이벤트 감사 — 레지스트리에 등재됐지만 아무 데서도 발화하지 않는 PostHog 이벤트를 막는다.
 *
 * 반대 축(미등재 이벤트 발화)은 이미 타입 검사와 dev 콘솔 경고가 잡는다. 안 잡히는 쪽은 화면 개편으로
 * 발화 코드만 사라지고 레지스트리·대시보드에는 이름이 남는 경우다 — "데이터가 안 들어오는 이벤트"가
 * 조용히 쌓이므로 CI 에서 끊는다.
 *
 * 정적 스캔이라 소스 형태가 바뀌면 조용히 전량 통과할 수 있다. 그래서 ① 레지스트리 추출 0개
 * ② captureEvent 호출 수집 0건 ③ 첫 인자에 문자열 리터럴이 없는 호출 — 셋 중 하나라도 걸리면
 * "스캐너가 소스를 못 따라간 것"으로 보고 실패시킨다(fail-loud).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

/** 레지스트리 파일 자체는 발화 수집 대상이 아니다 — 함수 선언·오버로드가 `captureEvent(` 에 자기 매칭된다. */
const REGISTRY_FILE = 'apps/web/app/_lib/analytics.ts';

/**
 * 제외 경로 — P1-11 depcruise 게이트와 같은 세트로 맞춘다(두 게이트의 규칙이 갈리지 않도록).
 * 테스트 제외는 load-bearing 이다: 테스트가 이벤트명을 리터럴로 발화하고 있어, 포함하면 실발화처를
 * 지워도 살아있음으로 오판한다.
 */
const EXCLUDED_PATHS = [
  /^apps\/web\/test\//,
  /^apps\/web\/e2e\//,
  /^packages\/[^/]+\/test\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
];

const CALL_PATTERN = /\bcaptureEvent\s*\(/g;
const STRING_LITERAL_PATTERN = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;

/** 문자열 리터럴 끝(닫는 따옴표) 위치 — 리터럴 안의 괄호·쉼표를 코드로 세지 않기 위해 통째로 건너뛴다. */
function endOfStringLiteral(source, quoteIndex) {
  const quote = source[quoteIndex];
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === quote) return index;
  }
  return source.length;
}

/**
 * 호출의 첫 인자 표현식만 잘라낸다(리터럴-가지 삼항 포함). 속성 객체까지 훑으면 거기 든 문자열이
 * 이벤트명으로 오인돼 죽은 이벤트를 가린다.
 */
function firstArgumentSource(source, openParenIndex) {
  let depth = 0;
  for (let index = openParenIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, index);
    } else if (character === ',' && depth === 1) {
      return source.slice(openParenIndex + 1, index);
    } else if (character === "'" || character === '"' || character === '`') {
      index = endOfStringLiteral(source, index);
    }
  }
  return null;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

const registrySource = readFileSync(path.join(FRONTEND_ROOT, REGISTRY_FILE), 'utf8');
const registryBlock = registrySource.match(/const REGISTERED_EVENTS[^{]*\{([\s\S]*?)^\};/m);
const registeredEvents = [
  ...(registryBlock?.[1] ?? '').matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm),
].map((match) => match[1]);

// git ls-files 는 .gitignore(node_modules·.next)를 공짜로 존중한다. 대신 아직 git 에 없는 새 파일은
// 보지 못한다 — CI 는 체크아웃된 트리를 검사하므로 무차이고, 로컬에서만 생기는 미세 갭이다.
const sourceFiles = execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages'], {
  cwd: FRONTEND_ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
  .split('\0')
  .filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      file !== REGISTRY_FILE &&
      !EXCLUDED_PATHS.some((excluded) => excluded.test(file)),
  );

const firedEvents = new Set();
const literalLessCalls = [];
let callCount = 0;

for (const file of sourceFiles) {
  const source = readFileSync(path.join(FRONTEND_ROOT, file), 'utf8');
  if (!source.includes('captureEvent')) continue;
  for (const call of source.matchAll(CALL_PATTERN)) {
    callCount += 1;
    const openParenIndex = call.index + call[0].length - 1;
    const argumentSource = firstArgumentSource(source, openParenIndex) ?? '';
    const literals = [...argumentSource.matchAll(STRING_LITERAL_PATTERN)].map(
      (match) => match[1] ?? match[2],
    );
    if (literals.length === 0)
      literalLessCalls.push(`${file}:${lineNumberAt(source, openParenIndex)}`);
    for (const literal of literals) firedEvents.add(literal);
  }
}

const deadEvents = registeredEvents.filter((event) => !firedEvents.has(event));
const failures = [];

if (registeredEvents.length === 0) {
  failures.push(
    `${REGISTRY_FILE} 의 REGISTERED_EVENTS 에서 이벤트명을 하나도 추출하지 못했습니다.\n` +
      '레지스트리 형태가 바뀌었다면 이 스크립트의 추출 정규식도 함께 고쳐야 합니다.',
  );
}

if (callCount === 0) {
  failures.push(
    'captureEvent 호출을 하나도 찾지 못했습니다.\n' +
      '발화 경로나 제외 경로가 바뀌었다면 이 스크립트의 스캔 범위도 함께 고쳐야 합니다.',
  );
}

if (literalLessCalls.length > 0) {
  failures.push(
    `첫 인자에 문자열 리터럴이 없는 captureEvent 호출 ${literalLessCalls.length}곳:\n  ` +
      `${literalLessCalls.join('\n  ')}\n` +
      '이벤트명을 변수·템플릿으로 넘기면 정적 스캔이 발화를 셀 수 없습니다 — 리터럴로 넘기세요.',
  );
}

if (deadEvents.length > 0) {
  failures.push(
    `등재됐지만 발화하지 않는 이벤트 ${deadEvents.length}종:\n  ${deadEvents.join('\n  ')}\n` +
      `발화 코드를 되살리거나, 더 쓰지 않는 이벤트라면 ${REGISTRY_FILE} 에서 내리세요.`,
  );
}

if (failures.length > 0) {
  console.error(`분석 이벤트 감사 실패\n\n${failures.join('\n\n')}\n`);
  process.exit(1);
}

console.log(
  `분석 이벤트 감사 통과 — 등재 ${registeredEvents.length}종 전부 발화 ` +
    `(captureEvent 호출 ${callCount}곳, 소스 ${sourceFiles.length}개 스캔)`,
);
