// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// delayed-show(·-late)와 animate-* 는 둘 다 animation 축약이라 한 요소에 함께 걸면 CSS 에서 뒤에 오는 쪽만 남는다.
// 빌드 CSS 는 .delayed-show 가 뒤라 펄스가 꺼진 채 정지한 상자로 남는다(대표 활동 스켈레톤, #1463).
// className 속성 하나의 값 하위 트리(문자열·템플릿·cn(...) 인자)에 있는 문자열 조각을 모두 모아 함께 걸렸는지 본다.
// className prop 으로 컴포넌트 경계를 넘어 합쳐지는 조합은 보지 않는다.
const WEB_ROOT = resolve(__dirname, '../..');
const SCANNED_DIRS = ['app', 'components'];
// 접두사 변형(motion-safe:·md:·[&>*]: 등)·important(!) 포함 — animate-none 은 끄는 쪽이라 충돌이 아니다.
const ANIMATION_UTILITY = /(?:^|:)!?animate-(?!none$)/;
const FIX_HINT =
  'delayed-show(·-late)와 animate-* 를 한 요소에 걸면 animation 축약끼리 덮어써 애니메이션이 꺼진다 — ' +
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
  it('className 하나의 문자열·cn(...) 인자·템플릿에서 접두사 변형까지 찾고, animate-none·래퍼 분리는 넘긴다', () => {
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
    expect(scanClassNames(source, 'sample.tsx')).toEqual({ classNameAttributeCount: 6, conflictLines: [2, 3, 4] });
  });

  it('app·components 의 className 에 delayed-show 와 animate-* 를 함께 걸지 않는다', () => {
    const fileScans = SCANNED_FILES.map((file) => ({
      file,
      ...scanClassNames(readFileSync(join(WEB_ROOT, file), 'utf8'), file),
    }));
    // 파일을 하나도 못 읽거나 className 을 못 찾고 통과하는 일이 없게 한다.
    expect(fileScans.length).toBeGreaterThan(0);
    expect(fileScans.some((fileScan) => fileScan.classNameAttributeCount > 0)).toBe(true);
    const conflicts = fileScans.flatMap(({ file, conflictLines }) => conflictLines.map((line) => `${file}:${line}`));
    expect(conflicts, FIX_HINT).toEqual([]);
  });
});
