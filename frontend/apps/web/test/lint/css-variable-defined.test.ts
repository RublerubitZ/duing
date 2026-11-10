// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// 인라인 스타일·SVG 속성에 쓰는 var(--이름) 은 정의가 없어도 타입 검사·렌더 테스트가 통과하고, 화면에서만 색이 사라진다.
// app·components 에서 쓰는 변수는 globals.css 에 정의돼 있거나 같은 범위에서 인라인으로 넣는 것이어야 한다.
// sky 숫자 스케일(sky-100 등)은 extend 병합 때문에 설정에서 지워도 Tailwind 기본 하늘색으로 살아 있어, 사용 0건을 함께 지킨다.
const WEB_ROOT = resolve(__dirname, '../..');
const SCANNED_DIRS = ['app', 'components'];
const SOURCE_FILE = /\.(ts|tsx|css)$/;
const VARIABLE_USE = /var\(--([a-z0-9-]+)/g;
const CSS_DEFINITION = /(?<![\w-])--([a-z0-9-]+)\s*:/g;
const INLINE_DEFINITION = /['"]--([a-z0-9-]+)['"]\s*:/g;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
// 라이브러리가 런타임에 넣는 변수.
const RUNTIME_PREFIXES = ['radix-', 'tw-'];
const SKY_NUMBER_SCALE = /\bsky-\d/;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return SOURCE_FILE.test(entry.name) ? [entryPath] : [];
  });
}

// tailwind.config.ts 도 hsl(var(--border)) 처럼 변수를 쓴다 — 같이 읽는다.
const sources = [
  ...SCANNED_DIRS.flatMap((directory) => listSourceFiles(join(WEB_ROOT, directory))),
  join(WEB_ROOT, 'tailwind.config.ts'),
].map((filePath) => ({
  file: relative(WEB_ROOT, filePath),
  // 주석 속 예시(var(--xxx))는 사용이 아니다 — CSS 주석만 걷는다(TS 주석에는 예시가 없다).
  text: filePath.endsWith('.css') ? readFileSync(filePath, 'utf8').replace(CSS_COMMENT, '') : readFileSync(filePath, 'utf8'),
}));

describe('CSS 변수 정의 가드', () => {
  it('app·components 에서 쓰는 var(--이름) 은 모두 정의돼 있다', () => {
    const defined = new Set<string>();
    for (const { file, text } of sources) {
      const pattern = file.endsWith('.css') ? CSS_DEFINITION : INLINE_DEFINITION;
      for (const match of text.matchAll(pattern)) if (match[1] !== undefined) defined.add(match[1]);
    }
    const undefinedUses = sources.flatMap(({ file, text }) =>
      [...text.matchAll(VARIABLE_USE)]
        .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
        .filter((name) => !defined.has(name) && !RUNTIME_PREFIXES.some((prefix) => name.startsWith(prefix)))
        .map((name) => `${file}: --${name}`),
    );
    expect(undefinedUses).toEqual([]);
  });

  it('검사가 실제 정의·사용을 읽는다 — 빈 목록으로 통과하지 않는다', () => {
    const globals = sources.find(({ file }) => file === 'app/globals.css');
    expect(globals?.text).toMatch(/--ink\s*:/);
    expect(sources.some(({ file, text }) => file.endsWith('.tsx') && text.includes('var(--ink)'))).toBe(true);
  });

  // /apply·/join 은 레이아웃이 없어 래퍼 대부분이 .duing 밖이다 — 거기서는 :root 에 있는 변수만 풀린다(#1678 에서 지원서 바탕이 사라졌다).
  it('.duing 밖에서 그려지는 /apply·/join 은 :root 변수(--pill-*·--page-top)만 쓴다', () => {
    const scopedUses = sources
      .filter(({ file }) => file.startsWith('app/apply/') || file.startsWith('app/join/'))
      .flatMap(({ file, text }) =>
        [...text.matchAll(VARIABLE_USE)]
          .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
          .filter((name) => !name.startsWith('pill-') && name !== 'page-top')
          .map((name) => `${file}: --${name}`),
      );
    expect(scopedUses).toEqual([]);
  });

  it('sky 숫자 스케일(Tailwind 기본 하늘색)을 쓰지 않는다 — sky·sky-deep 만 쓴다', () => {
    expect(SKY_NUMBER_SCALE.test('hover:bg-sky-100')).toBe(true);
    expect(SKY_NUMBER_SCALE.test('bg-sky/10 text-sky-deep')).toBe(false);
    const uses = sources.flatMap(({ file, text }) => (SKY_NUMBER_SCALE.test(text) ? [file] : []));
    expect(uses).toEqual([]);
  });
});
