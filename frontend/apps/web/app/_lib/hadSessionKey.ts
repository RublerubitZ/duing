// 이 브라우저에서 세션이 살아 있던 적이 있는지 표시하는 로컬 플래그의 키.
// 서버 레이아웃(첫 페인트 전 스크립트)과 클라이언트 부팅(authBoot)이 함께 쓴다 — 서버 그래프에 스토어가
// 딸려 오지 않게 의존성 없는 모듈에 둔다.
export const HAD_SESSION_KEY = 'duing:had-session';

// 첫 페인트 전 스크립트 — 로그인 이력이 있으면 <html data-had-session> 을 단다. 정적 HTML 의 상단 내비는 늘
// 비로그인("로그인·회원가입")으로 그려지므로, 이력이 있는 브라우저는 하이드레이션 전까지 그 자리를 숨긴다(globals.css).
// 저장소 접근이 막히면(프라이빗 모드·쿠키 차단) 삼킨다 — 그러면 지금처럼 로그인 버튼이 보인다.
// CSP 를 좁힐 때 이 스크립트는 hash 대상이다 — 정적·ISR HTML 은 요청마다 다른 nonce 를 실을 수 없다.
export const HAD_SESSION_PREPAINT_SCRIPT = `try{if(window.localStorage.getItem(${JSON.stringify(HAD_SESSION_KEY)})==='1')document.documentElement.setAttribute('data-had-session','')}catch(e){}`;
