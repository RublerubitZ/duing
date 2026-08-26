/**
 * 공개 브라우징 데이터의 freshness contract.
 *
 * <p>전역 기본 staleTime 30초(apps/web providers.tsx)는 회비·은행·시설 가용성·지원 적격성·권한
 * 게이트처럼 정합성이 우선인 쿼리에 맞춘 보수적 기본값이다. 공개 콘텐츠까지 같은 값을 쓰면
 * 세션 안에서 목록↔상세를 오갈 때마다 재요청이 나가 백엔드 요청·DB 조회·Supabase egress 가
 * 불필요하게 반복된다(2026-08 성능 감사 P0-2). 여기 상수로 도메인별 신선도 계층을 정의한다.
 *
 * <p>안전 근거 — staleTime 은 "재마운트·재관측 시 자동 재요청" 만 미루고,
 * mutation 의 invalidateQueries 는 staleTime 과 무관하게 활성 쿼리를 즉시 다시 가져온다.
 * 따라서 본인 수정은 기존 무효화 경로로 즉시 반영되고, 지연되는 것은 "타인 수정의 노출" 뿐이다.
 * 지원 가능 여부는 지원 클릭 시점의 eligibility 재확인(staleTime 0)이 최종 게이트라 모집
 * 표시가 잠시 낡아도 잘못된 지원으로 이어지지 않는다.
 *
 * <p>적용 금지 영역 — 회비(fee)·은행(bank)·시설 가용성(facilities)·적격성(applications
 * eligibility)·권한 게이트(managed)·admin 콘솔(15s 관례)은 이 상수를 쓰지 않는다.
 */

/**
 * 공개 콘텐츠(클럽 상세·사진·대표활동, 공지, 공개 FAQ): 5분.
 * 운영진·총동연이 수정하는 저변동 콘텐츠 — 타인 수정이 최대 5분 늦게 보이는 것을 허용한다.
 */
export const PUBLIC_CONTENT_STALE_TIME_MS = 5 * 60_000;

/**
 * 캘린더·모집 축(전역 행사 공개 조회, 모집 캘린더, 클럽별 모집 목록, 모집 상세, 동아리 일정): 2분.
 * 마감·일정 변경의 노출 지연을 2분 이내로 묶는다. 같은 queryKey 를 여러 화면(캘린더 그리드·
 * Upcoming·단독 훅)이 관측하므로 반드시 이 상수를 공유한다 — 관측자마다 staleTime 이 다르면
 * 가장 짧은 쪽이 재요청을 일으켜 계층화가 무의미해진다.
 */
export const CALENDAR_STALE_TIME_MS = 2 * 60_000;
