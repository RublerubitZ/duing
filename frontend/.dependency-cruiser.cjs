const path = require('node:path');

// 워크스페이스 의존 DAG — 각 패키지 package.json 의 **런타임 dependencies** 와 1:1.
// devDependencies(테스트 전용)는 제외한다: packages/hooks 는 test 에서만 @duing/storage 를
// 쓰므로, 아래 options.exclude 가 테스트를 그래프에서 빼는 것이 이 표의 전제다.
const WORKSPACE_DEPENDENCIES = {
  types: [],
  storage: [],
  schemas: ['types'],
  api: ['storage', 'types'],
  stores: ['api', 'types'],
  hooks: ['api', 'stores', 'types'],
};

// 패키지의 공개 entry — packages/*/package.json 의 exports 와 1:1.
// 이 목록 밖의 파일에 바깥에서 직접 닿으면 딥임포트다.
const PACKAGE_ENTRIES = [
  '^packages/[^/]+/src/index[.]ts$',
  '^packages/hooks/src/datetime[.]ts$', // exports "./datetime"
  '^packages/storage/src/(web|native)[.]ts$', // exports "./web", "./native"
];

const layerDirectionRules = Object.entries(WORKSPACE_DEPENDENCIES).map(([pkg, allowed]) => ({
  name: `layer-direction-${pkg}`,
  severity: 'error',
  comment:
    `@duing/${pkg} 는 ${allowed.length ? allowed.map((dep) => `@duing/${dep}`).join('·') : '어떤 워크스페이스 패키지도'}` +
    ` ${allowed.length ? '만 의존한다' : '의존하지 않는다'}. 선언 밖 패키지·apps/web(역방향) 을 import 하면 DAG 가 깨져 순환으로 이어진다.`,
  from: { path: `^packages/${pkg}/` },
  to: { path: `^(apps/|packages/(?!(${[pkg, ...allowed].join('|')})/))` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-runtime-cycles',
      severity: 'error',
      comment:
        '런타임 순환 금지. 모든 엣지가 비-type-only 인 순환만 잡는다(viaOnly 는 순환 전 구간에 적용 — ' +
        'to.dependencyTypesNot 은 마지막 엣지 1개에만 걸려 타입 엣지가 섞인 순환을 오탐한다).',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'no-type-only-cycles',
      severity: 'warn',
      comment:
        '타입 엣지가 섞인 순환. 번들에는 남지 않아 지금은 경고로만 노출한다(기존 건 정리 후 error 승격 예정).',
      from: {},
      to: { circular: true, via: { dependencyTypes: ['type-only'] } },
    },
    ...layerDirectionRules,
    {
      name: 'no-unresolvable',
      severity: 'warn',
      comment:
        '해석되지 않은 import 는 그래프에 엣지가 생기지 않아 위 룰들을 통째로 빠져나간다. ' +
        '(@duing/*/src/** 형태 딥임포트가 여기 걸린다 — exports 맵이 막아 typecheck·build 가 먼저 실패하지만, ' +
        '게이트 출력에서도 보이게 둔다.) 현재 0건.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-deep-imports',
      severity: 'error',
      comment:
        '패키지 내부 파일 직접 참조 금지 — entry 를 거쳐야 패키지가 공개 표면만 지키면 되는 계약이 유지된다. ' +
        '상대경로(../../packages/x/src/y)가 여기 걸리고, @duing/x/src/y 형태는 exports 맵에 막혀 ' +
        'typecheck 가 TS2307 로 먼저 잡는다(위 no-unresolvable 에도 보인다). ' +
        '($1/$2 는 from 의 캡처 그룹 — 같은 패키지 내부 참조는 허용)',
      from: { path: '^(apps|packages)/([^/]+)/' },
      to: { path: '^packages/[^/]+/src/', pathNot: ['^$1/$2/', ...PACKAGE_ENTRIES] },
    },
    {
      name: 'middleware-isolation-out',
      severity: 'error',
      comment:
        'middleware.ts 는 next/server 외 로컬 모듈을 import 하지 않는다 — Vercel Edge 번들러가 ' +
        '모노레포의 워크스페이스·별칭 import 를 인라인하지 못하고 unsupported module 로 거부한다(파일 상단 주석).',
      from: { path: '^apps/web/middleware[.]ts$' },
      to: { path: '^(apps|packages)/' },
    },
    {
      name: 'middleware-isolation-in',
      severity: 'error',
      comment:
        '앱 코드가 middleware.ts 를 import 하지 않는다 — export const config(matcher) 가 페이지 설정으로 ' +
        '오인돼 Invalid page configuration 경고가 난다. 앱 쪽은 app/_lib/auth-hint.ts 쌍둥이 구현을 쓴다.',
      from: {},
      to: { path: '^apps/web/middleware[.]ts$' },
    },
  ],
  options: {
    // .next(빌드 산출물)·node_modules(외부 패키지)·테스트는 그래프 밖.
    // 테스트 제외는 packages/*/test 까지 포함해야 한다 — hooks/test 의 devDep import 가 layer 룰 오탐이 된다.
    exclude: {
      path: '(^|/)node_modules/|(^|/)[.]next/|^apps/web/(test|e2e)/|^packages/[^/]+/test/',
    },
    // type import 도 그래프에 포함시키고(순환 탐지용), 룰 쪽에서 type-only 여부로 구분한다.
    tsPreCompilationDeps: true,
    // dependency-cruiser 기본값은 exportsFields: [] (exports 맵 무시 → main 으로만 해석)이라
    // 보조 entry(@duing/hooks/datetime 31곳·@duing/storage/web)가 통째로 그래프에서 빠진다.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    // apps/web 의 `@/*` 별칭 해석용. apps/web/tsconfig.json 을 직접 가리키면 안 된다 —
    // baseUrl 이 없어 tsconfig-paths 가 별칭을 cwd 기준으로 풀고 @/ import 974건이 통째로
    // 미해석(=룰 사각지대)이 된다. baseUrl 만 얹은 tsconfig.depcruise.json 을 대신 쓴다.
    // 경로는 절대여야 한다(상대로 주면 중첩 extends 가 cwd 기준으로 풀려 TS5083).
    tsConfig: { fileName: path.join(__dirname, 'tsconfig.depcruise.json') },
  },
};
