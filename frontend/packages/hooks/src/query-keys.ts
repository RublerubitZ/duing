// 서버 컴포넌트용 query key 진입점 — 배럴(index.ts)은 api-context 의 createContext 를 최상단에서 평가해
// RSC 그래프에서 쓸 수 없다. 여기는 React 의존이 없는 키 팩토리만 다시 내보낸다.
export { clubQueryKeys } from './clubQueryKeys';
export { noticeQueryKeys } from './noticeQueryKeys';
