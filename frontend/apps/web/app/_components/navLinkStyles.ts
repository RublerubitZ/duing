/**
 * 상단바(HomeNav·ExploreNav) 네비 링크의 공통 클래스.
 *
 * <p>두 컴포넌트는 같은 바를 서로 다른 화면에서 렌더한다 — 값이 갈리면 페이지를 옮길 때마다
 * 같은 자리의 메뉴가 다르게 보인다. 예전에는 각자 같은 문자열을 들고 있어 실제로 어긋날 뻔했다.
 *
 * <p>시안 홈 헤더(Figma node 608:4884 안의 210:2735)는 24px SemiBold·항목 간격 88px 이고, 캔버스 1920 에
 * 콘텐츠 1472 라 이 프로젝트의 콘텐츠 폭 1200 으로 환산(×0.815)하면 ≈20px·72px 다. 그 환산값이 커 보인다는
 * 요청으로 한 단계 낮춘 16px·56px 를 쓴다. md 는 폭이 좁아 다시 한 단계 내린다 — 곧장 16px·큰 간격을
 * 쓰면 다섯 항목이 로고·우측 CTA 와 겹친다.
 */
export const NAV_LIST_BASE =
  'items-center gap-6 text-[14px] font-semibold tracking-tightest lg:gap-10 lg:text-[16px] xl:gap-14';

/** 비활성 — 시안 #6C6C6C 에 대응하는 기존 토큰. */
export const NAV_LINK_INACTIVE = 'relative py-1 text-charcoal-3 hover:text-charcoal';

/** 활성 — 잉크색 + 아래 밑줄 바(밑줄은 호출부가 span 으로 얹는다). */
export const NAV_LINK_ACTIVE = 'relative py-1 text-ink-deep';

/** 활성 표시 밑줄 바. */
export const NAV_LINK_UNDERLINE = 'absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-ink';

/**
 * 로고와 네비 사이 간격 — 시안은 로고가 끝나고 네비가 시작하기까지 여백이 크다.
 * 네비 항목 간격과 같은 단계로 올린다.
 *
 * <p>상단바 크기는 본문과 같은 축척(콘텐츠 1200 = ×0.815)을 지킨다 — 전체화면(2xl)에서 상단바만 시안 1:1 로 키웠더니
 * 본문 대비 상단바만 커 보여 되돌렸다(#1099 → revert). 시안이 "커 보이는" 건 크기가 아니라 상단바 위 여백(캔버스 66)이라,
 * xl 부터 위 여백만 28 로 둔다(헤더 총 ≈79 — 시안 헤더 115 를 뷰포트 캡 비율 1280/1920 로 옮긴 값. 콘텐츠 축척 ×0.815 면
 * 94 인데 그건 본문 대비 두꺼워 보였다). 아래는 12 그대로 — 상단바→헤드라인 64 는 히어로가 맡는다.
 */
export const NAV_ROW_BASE =
  'max-w-layout mx-auto flex items-center gap-8 px-4 sm:px-6 md:px-10 py-3 lg:gap-12 xl:pt-7';
