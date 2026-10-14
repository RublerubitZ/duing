// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// delayed-show(·-late)와 animate-* 는 둘 다 animation 축약이라 한 요소에 함께 걸면 CSS 에서 뒤에 오는 쪽만 남는다.
// Tailwind 가 만든 접두사 없는 animate-*(utilities 레이어)는 빌드 CSS 에서 .delayed-show 보다 앞이라 펄스가 꺼진 채 정지한
// 상자로 남는다(대표 활동 스켈레톤, #1463). globals.css 에서 .delayed-show 뒤에 둔 .animate-spin-slow·.animate-heart-pop 은
// 반대로 지연이 사라진다.
// className 속성 하나의 값 하위 트리(문자열·템플릿·cn(...) 인자)에 있는 문자열 조각을 모두 모아 함께 걸렸는지 본다.
// 변수로 건넨 클래스(className={cls})·*ClassName prop·다른 animation 축약 클래스(enter-content·enter-stagger)·컴포넌트 경계를
// 넘는 조합은 보지 않는다. 특히 className 을 자기 애니메이션 요소에 붙이는 컴포넌트(TextLinesSkeleton·ListRowsSkeleton·
// Spinner)에 className="delayed-show" 를 건네는 것이 가장 그럴듯한 재발 경로다 — 그때도 지연은 래퍼에 둔다.
const WEB_ROOT = resolve(__dirname, '../..');
const SCANNED_DIRS = ['app', 'components'];
// 같은 요소에 걸리는 접두사 변형(md:·group-hover:·data-[state=open]: 등)·important(!) 포함. animate-none 도 예외가 아니다 —
// 변형은 빌드 CSS 끝(.delayed-show 뒤)에 붙어, 같은 요소의 motion-reduce:animate-none 은 동작 줄이기 설정에서 지연까지 지운다
// (접두사 없는 animate-none 은 .delayed-show 보다 앞이라 효과가 없다).
const ANIMATION_UTILITY = /(?:^|:)!?animate-/;
const FIX_HINT =
  'delayed-show(·-late)와 animate-*(animate-none 포함)를 한 요소에 걸면 animation 축약끼리 덮어써 한쪽이 꺼진다(CSS 에서 뒤에 오는 쪽만 남는다) — ' +
  '지연은 래퍼에, 애니메이션은 안쪽 요소에 둔다(ClubDetailSkeleton 과 같은 규약, #1463)';

type ClassNameScan = { classNameAttributeCount: number; conflictLines: number[] };

function collectStringFragments(node: ts.Node, fragments: string[]): void {
  if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) fragments.push(node.text);
  ts.forEachChild(node, (child) => collectStringFragments(child, fragments));
}

/** className 속성을 세고, delayed-show 와 animate-* 가 함께 걸린 속성의 행(1부터)을 모은다. */
function scanClassNames(source: string, fileName: string): ClassNameScan {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
  const classNameScan: ClassNameScan = { classNameAttributeCount: 0, conflictLines: [] };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'className' && node.initializer) {
      classNameScan.classNameAttributeCount += 1;
      const fragments: string[] = [];
      collectStringFragments(node.initializer, fragments);
      const classTokens = fragments.flatMap((fragment) => fragment.split(/\s+/));
      if (
        classTokens.some((classToken) => classToken.startsWith('delayed-show')) &&
        classTokens.some((classToken) => ANIMATION_UTILITY.test(classToken))
      ) {
        classNameScan.conflictLines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return classNameScan;
}

const SCANNED_FILES = SCANNED_DIRS.flatMap((scannedDir) =>
  readdirSync(join(WEB_ROOT, scannedDir), { encoding: 'utf8', recursive: true })
    .filter((relativePath) => relativePath.endsWith('.tsx'))
    .map((relativePath) => join(scannedDir, relativePath)),
);

describe('animation 축약 충돌(delayed-show × animate-*) 회귀 가드', () => {
  it('className 하나의 문자열·cn(...) 인자·템플릿에서 접두사 변형·animate-none 까지 찾고, 래퍼 분리는 넘긴다', () => {
    const source = [
      'export const views = [',
      '  <div className="delayed-show mb-10 animate-pulse" />,',
      "  <div className={cn('delayed-show-late', isOpen && 'md:animate-spin')} />,",
      '  <div className={`delayed-show ${isOpen ? "motion-safe:animate-bounce" : ""}`} />,',
      '  <div className="delayed-show motion-reduce:animate-none" />,',
      '  <div className="delayed-show"><div className="animate-pulse" /></div>,',
      '];',
      '',
    ].join('\n');
    expect(scanClassNames(source, 'sample.tsx')).toEqual({ classNameAttributeCount: 6, conflictLines: [2, 3, 4, 5] });
  });

  it('app·components 의 className 에 delayed-show 와 animate-* 를 함께 걸지 않는다', () => {
    const fileScans = SCANNED_FILES.map((file) => ({
      file,
      ...scanClassNames(readFileSync(join(WEB_ROOT, file), 'utf8'), file),
    }));
    // 파일을 하나도 못 읽거나 className 을 못 찾고 통과하는 일이 없게 한다.
    expect(fileScans.length).toBeGreaterThan(0);
    expect(fileScans.some((fileScan) => fileScan.classNameAttributeCount > 0)).toBe(true);
    // 파일 순서는 파일시스템마다 달라 여러 건일 때 실패 메시지가 흔들리지 않게 정렬한다.
    const conflicts = fileScans
      .flatMap(({ file, conflictLines }) => conflictLines.map((line) => `${file}:${line}`))
      .sort();
    expect(conflicts, FIX_HINT).toEqual([]);
  });
});
