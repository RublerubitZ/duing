# 운영 API Base URL Fail-Fast 설계

- 작성일: 2026-07-12
- 대상: `frontend/apps/web`
- 목적: 운영 빌드가 잘못된 API 주소로 배포되는 것을 빌드 단계에서 차단한다.

## 1. 배경

웹 앱의 API client 생성 지점 네 곳은 `NEXT_PUBLIC_API_BASE_URL`이 없으면
`http://localhost:8080/api/v1`로 폴백한다. 이 동작은 로컬 개발에는 유용하지만 운영 빌드에서는
사용자 자신의 localhost 호출 또는 HTTPS mixed-content 차단을 일으킨다. 일부 Server Component
조회는 네트워크 오류를 빈 데이터로 폴백하므로 설정 오류가 빌드와 배포에서 드러나지 않을 수도 있다.

## 2. 검토한 접근

### A. 각 호출부에서 개별 검증

변경량은 작지만 네 곳의 조건과 메시지가 쉽게 달라지고 새 호출부에서 검증을 빠뜨릴 수 있어 채택하지 않는다.

### B. Next config에서만 검증

빌드를 일찍 실패시킬 수 있지만 런타임 코드가 사용하는 실제 URL 해석 규칙과 검증 규칙이 분리된다.
테스트·개발 서버·향후 실행 경로에서 같은 계약을 재사용하기 어려워 채택하지 않는다.

### C. web 전용 공통 resolver 사용 — 채택

`app/_lib/apiBaseUrl.ts`가 환경과 URL을 받아 단일 규칙으로 주소를 반환한다. 모든 API client 생성
지점은 이 함수만 사용한다. 운영의 잘못된 값은 모듈 초기화 또는 Server Component 실행 중 예외가 되어
Next production build를 실패시키고, 개발·테스트에서는 기존 localhost 폴백을 유지한다.

## 3. 계약

`resolveApiBaseUrl(apiBaseUrl, nodeEnvironment)`의 규칙은 다음과 같다.

1. `nodeEnvironment === 'production'`
   - 값 누락 또는 공백: 예외
   - 파싱할 수 없는 URL: 예외
   - `https:` 이외의 프로토콜: 예외
   - `localhost` 및 하위 도메인, IPv4 `127.0.0.0/8`, IPv6 `::1`, IPv4-mapped IPv6의
     `127.0.0.0/8`: 예외
   - 검증 성공: 마지막 `/`를 제거한 URL 반환
2. production 이외
   - 값 누락 또는 공백: `http://localhost:8080/api/v1`
   - 값 존재: 마지막 `/`를 제거해 반환

운영 예외 메시지는 시크릿이 아닌 환경변수 이름과 실패 이유만 포함하며 입력 URL 전체를 출력하지 않는다.

## 4. 적용 범위

- Client Provider의 공유 API client
- 홈 데이터 조회 client
- 동아리 통계 조회 client
- 공개 활동 조회 client

API 패키지는 React Native와 공유하므로 환경별 정책을 넣지 않는다. 검증 함수는 Next.js 웹 앱 내부에만 둔다.

## 5. 테스트

공통 resolver의 실제 동작을 Vitest로 검증한다.

- production에서 누락 값을 거부한다.
- production에서 `http://`를 거부한다.
- production에서 localhost 계열과 IPv4·IPv6 loopback의 동등 표기까지 거부한다.
- production에서 정상 HTTPS URL을 정규화해 반환한다.
- development에서 누락 값은 기존 localhost 폴백을 반환한다.
- development에서 명시된 URL을 정규화해 반환한다.

테스트를 먼저 작성해 기존 코드에 resolver가 없어 실패하는 것을 확인한 뒤 최소 구현과 호출부 교체를 진행한다.

## 6. 제외 범위

- 백엔드 CORS 설정 변경
- Vercel 환경변수 자동 생성
- 모바일 API URL 정책 변경
- 런타임 원격 config 또는 feature flag 도입
- API 가용성 health check

## 7. 성공 조건

- 운영 빌드는 API URL 누락·HTTP·loopback 주소에서 실패한다.
- 로컬 개발은 환경변수 없이 기존 주소로 동작한다.
- 네 API client 생성 지점에 localhost 폴백 문자열이 중복되지 않는다.
- frontend lint, typecheck, test, production build가 통과한다.
