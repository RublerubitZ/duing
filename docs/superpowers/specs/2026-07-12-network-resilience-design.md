# 프론트엔드 네트워크 내성(resilience) 설계 — 타임아웃 정책·VT TimeoutError 근본 해결·오프라인 방어

- 날짜: 2026-07-12
- 상태: 설계 승인 대기
- 근거: 프로덕션 빌드 + Playwright 재현 실험 5종 (본문 §1 요약, 상세는 대화 로그의 검증 보고서)

## 0. 목표

인터넷 장애(오프라인·불안정 회선·무응답 서버)에서도 서비스가 일관되게 동작한다:

1. 어떤 상황에서도 무한 로딩이 없다 — 모든 대기는 유한하고, 끝나면 사용자에게 원인을 알린다
2. `TimeoutError: Transition was aborted because of timeout in DOM update`가 정상 회선에서 재발하지 않는다
3. 타임아웃·네트워크 오류 시: 로딩 해제, 버튼 재활성화, 이해 가능한 한글 안내, 재시도 가능

## 1. 검증으로 확정된 사실 (설계의 전제)

| # | 사실 | 근거 |
|---|------|------|
| F1 | 모든 네트워크 I/O는 `packages/api` 단일 ky 클라이언트 경유, 직접 fetch 0건, 전역 타임아웃 15s 존재 | 전수 인벤토리 |
| F2 | VT TimeoutError = 클릭 시점 RSC 페이로드 fetch가 라우트 커밋을 4초 이상 지연시킬 때 발생. 라이브러리가 커밋 완료까지 VT 업데이트 콜백을 잡아두고, abort된 프로미스가 unhandledrejection으로 샘 | next-view-transitions 0.3.5 소스 + 재현 실험(클릭 +3.95s 발생) + Sentry NEXT-DUING-9 시그니처 일치 |
| F3 | 동적 라우트에 `loading.tsx`를 추가하면 동일 조건에서 TimeoutError 0건, 클릭 +0.5s에 로딩 UI 커밋 | 변인 실험 |
| F4 | 오프라인 + 프리페치 캐시 미스 내비게이션 = 하드 내비게이션 폴백 → 브라우저 오프라인 에러 페이지로 앱 이탈. `loading.tsx`로는 못 막음(커밋 직후 하드내비) | 재현 실험 |
| F5 | 오프라인 + 풀 프리페치 캐시 히트(정적 라우트) = 정상 SPA 전환 | 재현 실험 |
| F6 | API 무응답 시 로그인은 15.1s 후 복구되나 "학번 또는 비밀번호가 올바르지 않습니다"로 오안내 (ky TimeoutError가 ApiError로 정규화되지 않아 기본 메시지 폴백) | 재현 실험 |
| F7 | 조회는 ky 15s × React Query 재시도 1회 = 31.1s 로딩 지속 | 재현 실험 |
| F8 | 파일 업로드는 ky 직접 multipart POST인데 전용 타임아웃이 없어 전역 15s에 걸림 — 권장(30~60s)과 반대로 유일하게 "너무 짧은" 곳 | 코드 확인 |

## 2. PR 분할

| PR | 내용 | 영역 |
|----|------|------|
| PR-A | 네트워크 레이어: 타임아웃 세분화 + 에러 정규화 + 오프라인 fail-fast + retry 정책 | `packages/api`, `apps/web/app/providers.tsx` |
| PR-B | 내비게이션 UX: 동적 라우트 loading.tsx + 오프라인 감지·내비게이션 가드·배너 | `apps/web` |

두 PR은 독립적으로 머지·검증 가능하다. PR-A가 먼저다(PR-B의 오프라인 안내가 PR-A의 정규화된 에러 메시지와 문구를 공유).

## 3. PR-A 설계 — 네트워크 레이어

### 3.1 타임아웃 정책 (client.ts 단일 지점)

상수 묶음으로 선언하고 엔드포인트별 오버라이드한다:

| 분류 | 값 | 적용 대상 |
|------|-----|----------|
| 로그인 | 5s | `auth.login` |
| 인증 플로우 | 8s | `auth.signup`, MO 인증(`startPhoneVerification`, `getPhoneVerificationStatus`), 비밀번호 재설정, 번호 변경 |
| 검색 | 8s | 사용자가 타이핑 후 대기하는 검색성 목록(`clubs.list`, admin 사용자/동아리 검색, 지원자 검색) |
| 일반(전역 기본) | 10s | 나머지 전부 (기존 15s에서 하향) |
| 파일 업로드 | 60s | `files.upload` (신설 — F8 해소) |
| 로그아웃 | 5s | 기존 유지 |
| 은행 동기화 | 30s | 기존 유지 (백엔드 외부 API 대기 구조) |

구현 방식은 ky의 `timeout` 옵션을 유지한다. 요구사항의 `AbortSignal.timeout()` 우선 원칙은 "ky를 경유하지 않는 fetch가 생길 경우"의 지침으로 문서화한다 — 현재 직접 fetch가 0건이고(F1), ky timeout이 동일 보장을 이미 제공하며 전 요청에 강제된다.

### 3.2 에러 정규화 (toApiError 확장)

- ky `TimeoutError` → `ApiError(status: 0, code: 'TIMEOUT', message: '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')`
- fetch 네트워크 실패(`TypeError`) → `ApiError(status: 0, code: 'NETWORK', message: '인터넷 연결을 확인해주세요.')`
- 효과: 전 화면의 표준 패턴 `error instanceof ApiError ? error.message : '<기본 메시지>'`가 자동으로 올바른 안내를 표시 (F6의 오안내 해소 — 개별 화면 수정 불필요)
- 그 외 알 수 없는 에러는 기존대로 재던짐

### 3.3 오프라인 fail-fast

- `packages/api`에 connectivity 어댑터 주입점 신설(`registerConnectivityAdapter`) — 기존 `registerCookieAdapter`/`setStorage` 패턴과 동일한 플랫폼 추상화 (packages/*에 DOM API 직접 참조 금지 규칙 준수)
- `apps/web`의 Providers에서 `() => navigator.onLine` 등록
- ky `beforeRequest`에서 어댑터가 명시적으로 `false`를 반환하면 즉시 `ApiError(0, '인터넷 연결을 확인해주세요.', undefined, 'NETWORK')` — 타임아웃 대기 없이 실패
- `navigator.onLine`은 false-negative가 있으므로 신호가 없으면(undefined) 요청을 정상 진행 — 타임아웃이 최종 방어선 (요구사항 4 충족)

### 3.4 React Query retry 정책 (providers.tsx)

- **query**: 재시도 1회 유지하되 제외 조건 확장 — `ApiError`이고 (401 · 403 · `code === 'TIMEOUT'`)이면 재시도 안 함. 이유: 타임아웃은 이미 8~10s를 기다렸으므로 재시도가 대기를 배가(F7: 31s → 최대 ~10s로 단축). 연결 거부·오프라인(수백 ms 내 실패)은 재시도 가치가 있어 유지
- **mutation**: React Query 기본값(재시도 0) 유지 — 비멱등 요청의 이중 실행 위험 차단. 명시적 주석으로 고정
- 훅별 커스텀 retry 헬퍼(`retryUnlessNotFound` 등)는 유지하되 TIMEOUT 제외 조건을 공통 헬퍼로 합류

### 3.5 테스트

- `toApiError` 정규화(TimeoutError/TypeError → ApiError code·메시지) 단위 테스트
- 오프라인 어댑터 fail-fast 테스트 (어댑터 false 시 즉시 ApiError, 미등록 시 통과)
- retry 정책 테스트 (TIMEOUT 무재시도, NETWORK 1회 재시도, 401/403 무재시도)
- 로그인 폼: 타임아웃 에러 시 "요청 시간 초과" 안내 표시 회귀 테스트 (F6 재발 방지)

## 4. PR-B 설계 — 내비게이션 UX

### 4.1 동적 라우트 loading.tsx (F2·F3 근본 해결)

1차 대상 — VT Link가 향하는 동적 라우트 + 공개 트래픽 상위 동적 라우트:

- `/clubs/[clubId]` (Sentry 실이벤트 경로, ClubCard·ClubListItem VT Link)
- `/facilities/[facilityId]` (FacilityOverviewTimeline VT Link)
- `/notices/[noticeId]` (공개 상위 트래픽)

로딩 UI는 기존 지배 패턴(중앙 정렬 "불러오는 중…" 텍스트 + 최소 펄스)을 따르는 공용 `RouteLoading` 컴포넌트 1개로 통일 — 라우트별 스켈레톤 디자인은 범위 외.

### 4.2 오프라인 감지·안내 (F4·F5 방어)

- `online`/`offline` 이벤트 기반 `useOnlineStatus` 훅 (`useSyncExternalStore`, apps/web `_lib`)
- **전역 오프라인 배너**: 오프라인 동안 상단 슬림 고정 배너 "인터넷 연결을 확인해주세요" (`role="status"`, 온라인 복귀 시 제거). `.duing` 스코프의 bg-cream 전파 함정 회피 — 배너 컨테이너에 명시적 배경만 사용
- **전역 내비게이션 가드** (`OfflineNavigationGuard`): document 레벨 click 캡처 리스너 — 오프라인 상태에서 내부 라우트 앵커 클릭 시 `preventDefault` + 에러 토스트("인터넷 연결을 확인해주세요."). VT Link·일반 Link를 한 지점에서 모두 방어(F4의 하드 내비게이션 이탈은 라우터 내부 동작이라 시도 차단이 유일한 방어). 수정자 키·`target!=_self`·다운로드 앵커·외부 href는 통과
- `useTransitionRouter` 사용 1곳(recruitment redirect)은 프로그래매틱이라 가드 대상 아님 — 해당 화면은 API 실패 UX(PR-A)로 커버

### 4.3 Sentry 가드 현상 유지

`ignoreErrors` 2종과 unhandledrejection 콘솔 가드는 유지한다. 근본 원인(4.1) 해결로 발생 빈도가 급감하지만, bfcache·백그라운드 탭의 InvalidStateError 등 무해 잔존 케이스가 남는다. 유지 근거 주석을 현행화한다.

### 4.4 검증 (구현 후 필수)

- 재현 실험 E1(RSC 10s 지연 + VT Link 클릭)을 프로덕션 빌드에서 재실행 → TimeoutError 0건 + 로딩 UI 즉시 커밋 확인
- 재현 실험 E2(오프라인 클릭) 재실행 → 공룡 페이지 이탈 대신 토스트+배너 확인
- jsdom이 못 잡는 실브라우저 동작(클릭 캡처·배너)이므로 Playwright 실브라우저 QA 필수
- 기존 테스트 전체 그린 + 신규: useOnlineStatus·가드 단위 테스트

## 5. Out of Scope

- AbortSignal 기반 in-flight 요청 취소(React Query `signal` 연동) — 별도 과제
- 라우트별 스켈레톤 디자인 시스템 — 공용 RouteLoading 텍스트 패턴으로 한정
- manage/admin 동적 라우트 loading.tsx 전면 배치 — 1차는 공개 경로 3곳
- `/api/v1/me/favorites/ids` 중복 호출(5회/3s) 제거 — 별도 이슈로 등록
- next-view-transitions 교체·업그레이드(0.3.5가 최신), React 공식 ViewTransition 마이그레이션
- 서비스워커/PWA 오프라인 캐싱
- 백엔드 타임아웃·재시도 정책

## 6. 리스크

- 전역 10s 하향: 정상적으로 10~15s 걸리던 요청이 있으면 회귀 — 은행 동기화(30s) 외 장시간 API는 인벤토리상 없음. 배포 후 Sentry에서 TIMEOUT 코드 빈도 모니터링
- 클릭 캡처 가드: 이벤트 위임 순서에 민감 — 캡처 단계 사용으로 React 위임(버블)보다 먼저 실행됨을 테스트로 고정
- `navigator.onLine` false-positive(온라인인데 false): 가드가 내비게이션을 오차단할 수 있으나, 브라우저 구현상 false는 "확실한 오프라인"이라 위험 낮음. false-negative는 타임아웃이 방어
