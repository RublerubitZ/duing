# MO 인증 상태 조회 POST body 전환 (#626) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MO 인증 상태 조회에서 세션 토큰을 URL path에서 제거해 URL 기반 기록 경로(Access Log·Reverse Proxy·Sentry URL breadcrumb)의 토큰 노출을 폐쇄한다.

**Architecture:** `GET /auth/phone-verifications/{verificationToken}` → `POST /auth/phone-verifications/status` + body `{verificationToken}`. 서비스 계층(`PhoneVerificationService.getStatus`)·레이트리밋·폴링 훅 시그니처는 무변경 — 전송 형태만 바꾼다. 구 GET 엔드포인트는 완전 삭제(프로덕션 배포 전이라 하위호환 불필요).

**Tech Stack:** Spring Boot 3.4(record DTO·@Valid), ky(FE client), TanStack Query(훅 무변경), RestAssured+Testcontainers, Vitest+MSW.

## Global Constraints

- 커밋 메시지: 한글 Conventional Commits, Co-Authored-By/🤖 라인 금지.
- 조회용 POST의 성공 응답은 **200 OK**(생성 아님 — POST→201 컨벤션의 명시적 예외, Swagger description에 폴링용임을 유지).
- 경로 суффикс 패턴은 기존 `POST /auth/password-resets/complete`를 따른다 → `POST /auth/phone-verifications/status`.
- 서비스·레이트리밋·에러 계약(404/429/503) 무변경. FE 훅 `usePhoneVerificationStatusQuery(verificationToken, {enabled})` 시그니처·queryKey 무변경.
- 시각은 `LocalDateTime.now(clock)`, 테스트 상대 날짜만.
- push·PR 생성은 컨트롤러(오케스트레이터)가 한다 — 구현자는 로컬 커밋만.

---

### Task 1: [BE] 상태 조회 엔드포인트 POST 전환

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/PhoneVerificationStatusRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java` (GET 정의 교체)
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AuthController.java` (구현 시그니처 교체)
- Test: 기존 상태조회를 치는 모든 RestAssured 테스트(`rg -l "phone-verifications/" backend/src/test`) — GET path → POST body 전환

**Interfaces:**
- Consumes: 기존 `PhoneVerificationService.getStatus(verificationToken, clientIp, userAgent)` — 무변경.
- Produces: `POST /api/v1/auth/phone-verifications/status`, body `{"verificationToken": "..."}`, 200 + 기존 `PhoneVerificationStatusResponse`. 에러 400(빈 토큰 검증)/404/429/503 기존 유지.

- [ ] **Step 1: 실패 테스트 — 대표 케이스 1개를 POST로 먼저 전환**

기존 상태조회 테스트 파일에서 해피패스 1개를 POST 형태로 바꾼다:
```java
// given: 발급된 세션 토큰
// when
ExtractableResponse<Response> statusResponse = RestAssured.given()
        .contentType(ContentType.JSON)
        .body(Map.of("verificationToken", verificationToken))
        .when().post("/api/v1/auth/phone-verifications/status")
        .then().extract();
// then: 200 + status 필드
```
Run: `cd backend && ./gradlew test --tests '*PhoneVerification*'` → 해당 케이스 404/405로 FAIL, 나머지(GET) PASS.

- [ ] **Step 2: DTO 신설**

```java
package com.duing.domain.user.controller.dto.request;

import jakarta.validation.constraints.NotBlank;

/** 상태 조회는 토큰이 URL 에 남지 않도록 POST body 로 받는다(#626 — Access Log·Sentry breadcrumb 노출 차단). */
public record PhoneVerificationStatusRequest(
        @NotBlank(message = "인증 토큰은 필수 입력값입니다.")
        String verificationToken
) {
}
```
(@NotBlank 메시지는 기존 Request DTO들의 한글 메시지 관례를 파일에서 확인해 동일 톤으로.)

- [ ] **Step 3: AuthApi·AuthController 교체**

AuthApi — 기존 GET `@Operation` 블록을 다음으로 교체(설명 본문·404/429/503 응답 정의는 그대로 유지하고 한 줄만 추가):
```java
    @Operation(summary = "휴대폰 MO 인증 상태 조회",
            description = "발급 토큰으로 인증 상태(PENDING/VERIFIED/EXPIRED)를 조회한다. 프론트 폴링용(3초 간격 권장) — "
                    + "PENDING 이면 서버가 Octomo 수신 여부를 확인한다(세션당 2.5초 스로틀, 일일 상한 초과 시 503). "
                    + "토큰이 URL 에 남지 않도록 body 로 받는 조회용 POST 다(#626).")
    @ApiResponses({ /* 기존 200/404/429/503 그대로 */ })
    @PostMapping("/auth/phone-verifications/status")
    ResponseEntity<ApiResponse<PhoneVerificationStatusResponse>> getPhoneVerificationStatus(
            @Valid @RequestBody PhoneVerificationStatusRequest statusRequest,
            HttpServletRequest httpServletRequest);
```
AuthController — `@PathVariable String verificationToken` → `@Valid @RequestBody PhoneVerificationStatusRequest statusRequest`, 서비스 호출은 `statusRequest.verificationToken()` 전달로만 변경. SecurityConfig `/api/v1/auth/**` permitAll 매처에 이미 포함 — 구조 확인만(수정 없음).

- [ ] **Step 4: 나머지 테스트 일괄 전환 + 전체 확인**

`rg -n "phone-verifications/" backend/src/test` 로 GET path 호출 전부 POST body 헬퍼로 전환(파일 내 공용 헬퍼로 뽑아 중복 제거 가능 — 기존 테스트 헬퍼 관례 따름). 빈 토큰 400 검증 케이스 1개 추가.
Run: `cd backend && ./gradlew test` → BUILD SUCCESSFUL, 실패 0.

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "fix(backend): MO 인증 상태 조회를 POST body 로 전환해 토큰 URL 노출 제거"
```

### Task 2: [FE] client 전환 + MSW 핸들러 일괄 갱신

**Files:**
- Modify: `frontend/packages/api/src/client.ts` (`getPhoneVerificationStatus` 1개)
- Test-Modify: MSW로 `*/auth/phone-verifications/:token` GET을 목킹하는 모든 테스트(`rg -l "phone-verifications" frontend --glob '*.tsx' --glob '*.ts'`) — hooks 패키지 + apps/web(signup·phone-change-dialog·ForgotPasswordPanel·use-phone-verification)

**Interfaces:**
- Consumes: Task 1 의 `POST auth/phone-verifications/status` + `{verificationToken}` body.
- Produces: `client.auth.getPhoneVerificationStatus(verificationToken)` — **시그니처·반환 무변경**(호출부인 `usePhoneVerificationStatusQuery`·queryKey·컴포넌트 전부 무수정이 목표).

- [ ] **Step 1: 실패 확인 — client 만 먼저 전환**

```ts
      getPhoneVerificationStatus: (verificationToken) =>
        jsonOk<PhoneVerificationStatus>(
          http.post('auth/phone-verifications/status', { json: { verificationToken } }),
        ),
```
Run: `cd frontend && pnpm --filter @duing/hooks test` → 기존 GET 핸들러 미매치로 폴링 관련 케이스 FAIL(RED 증거).

- [ ] **Step 2: MSW 핸들러 전환**

각 테스트의 `http.get('*/auth/phone-verifications/:token', ...)` → `http.post('*/auth/phone-verifications/status', ...)`. 토큰 단언이 필요한 곳은 `await request.json()` 의 `verificationToken` 으로 단언(기존 params.token 단언을 body 단언으로 승격 — 검증 강도 유지). pollCount 클로저·advanceTimersByTimeAsync 패턴은 그대로.

- [ ] **Step 3: 전체 그린**

Run: `cd frontend && pnpm --filter @duing/hooks test && pnpm --filter @duing/web exec vitest run && pnpm typecheck && pnpm lint`
Expected: 전부 그린 — `usePhoneVerificationStatusQuery`·컴포넌트 파일 무수정 확인(`git status` 에 client.ts 와 테스트 파일만).

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "fix(web): MO 인증 상태 조회 호출을 POST body 방식으로 전환"
```

---

## Self-Review

1. **Spec coverage** — #626 요구(폴링 URL 에서 secret 제거)는 T1(BE 계약)+T2(FE 호출) 로 전부 커버. 구 GET 삭제로 노출 경로 잔존 없음.
2. **Placeholder scan** — 테스트 전환은 rg 로 전수 식별 지시, 코드 블록 완전 제공. TBD 없음.
3. **Type consistency** — `PhoneVerificationStatusRequest.verificationToken` = client json 키 `verificationToken` 일치. 서비스·훅 시그니처 무변경이라 리플 없음.

**Out of Scope:** #627(breadcrumb 마스킹 — 본 변경으로 무의미해져 종료 예정), 완료 API 들의 body 토큰 전달(기존 유지), pollId 분리(A안 기각).
