# PR4 — 번호 변경 재인증 + 비밀번호 재설정 + /forgot-password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MO 인증 세션(purpose)을 범용화해 (a) 로그인 사용자의 전화번호 변경 재인증(§7.5)과 (b) 비로그인 비밀번호 재설정(§7.6·§10.2) + `/forgot-password` 페이지를 추가한다.

**Architecture:** BE는 기존 PR1 인프라(PhoneVerification 세션·SessionManager·RateLimiter·감사 이벤트)를 재사용 — 발급을 purpose-aware 로 확장하고(전용 인증 엔드포인트), 완료 API 2개(PATCH /users/me/phone, POST /auth/password-resets/complete)를 signup 과 동일한 `getVerifiedSessionForUpdate → 검증 → 변경 → consume` 패턴으로 추가한다. FE는 signup 의 인증 컴포넌트·훅을 공용 승격 후 상태머신 코어를 3개 래퍼(signup/phone-change/password-reset)로 범용화해, 설정 다이얼로그와 `/forgot-password` 페이지가 동일 UX 를 재사용한다.

**Tech Stack:** Spring Boot 3.4 / Java 21, RestAssured + Testcontainers(BE) · Next.js 15 + React 19, TanStack Query, MSW + Vitest + RTL(FE), pnpm workspaces.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md` §5.1(완료 창: SIGNUP 30분 / PHONE_CHANGE·PASSWORD_RESET **10분**), §7.5, §7.6, §7.8, §10.1, §10.2, §11(리밋).
- **시각은 반드시 `LocalDateTime.now(clock)`(seoulClock 주입)** — raw `LocalDateTime.now()` 금지(prod JVM=UTC, CI 어긋남). 테스트 시드도 동일.
- 세션 소비 경로는 기존 패턴 고정: `sessionManager.getVerifiedSessionForUpdate(token, purpose, now)`(403 선행) → 도메인 검증 → 변경 → `sessionManager.consume(session, userId, ip, ua)`. 두 메서드는 **MANDATORY** — 호출 서비스 메서드에 `@Transactional` 필수.
- 에러 코드(§7.8): 세션 미존재·미인증·만료(완료 창 초과)·용도 불일치·targetUserId 불일치 = **403 `PHONE_NOT_VERIFIED`**(사유 미특정). 재설정 시작의 계정 미존재/완료의 계정 소실 = **400 `PASSWORD_RESET_NOT_ALLOWED`** "등록된 정보를 확인할 수 없습니다."(사유 미특정). 발급 시 타인 소유 번호 = 409 `PHONE_ALREADY_REGISTERED`. 완료 시 TOCTOU 중복 = 409(기존 `DuplicateAccountException`).
- 레이트리밋(§11): 재설정 시작 = **학번당 시간당 3회**(`PhoneVerificationRateLimiter` 확장, in-memory 단일 인스턴스 Javadoc 유지) + 기존 IP 발급 리밋·60초 쿨다운 그대로 적용.
- **스펙 §7.1 이탈(승인 필요 시 리뷰에서 판단)**: purpose 를 공개 발급 API body 로 노출하지 않고, PHONE_CHANGE 발급은 **전용 인증 엔드포인트 `POST /api/v1/users/me/phone-verifications`** 로 분리한다. 근거 — `/auth/**` 는 permitAll 이라 body purpose 방식은 컨트롤러 수동 null-principal 검사가 필요(fail-open 위험). 전용 엔드포인트는 필터체인이 401 을 강제(fail-closed)하고, 공개 API 계약은 PR1 그대로(비파괴). PASSWORD_RESET 발급은 §7.1 명시대로 직접 호출 불가(시작 API 내부 전용).
- §7.6 "202 균일 응답" vs §10.2 "계정 미존재 400" 충돌은 **§10.2 채택**(뒤에 정제된 상세 절이고, 계정 열거는 §10.2 에 수용 리스크로 명시 + 학번당 리밋으로 완화).
- BE 컨벤션: api/ 인터페이스 → controller 구현, DTO 는 record(`toCommand()`/`Response.from()`), `@DisplayName` 은 요구사항 문장, RestAssured+Testcontainers(Docker 필요), 기존 마이그레이션 수정 금지(**이번 PR 은 스키마 변경 없음** — V79 에 target_user_id 이미 존재).
- FE 컨벤션: `type`(interface 금지)·`any`/`as` 금지(`as const` 허용)·auth 폼은 manual useState+zod(`safeParse`) — RHF 금지·TanStack Query 내부 모킹 금지(MSW 네트워크 레벨)·한국어 카피·EOF 개행. 서버 상태는 React Query.
- 명령: BE = `backend/` 에서 `./gradlew test --tests '...'`(출력에서 BUILD SUCCESSFUL 확인, `| tail` 로 exit code 가리지 말 것) · FE = `frontend/` 에서 `pnpm typecheck` / `pnpm --filter @duing/web exec vitest run <패턴>` / `pnpm --filter @duing/hooks test` / `pnpm lint`.
- 커밋: Conventional Commits 한국어(`feat(backend):` / `feat(web):`), attribution 라인 금지. **구현자는 push·PR 생성 금지.**
- 브랜치: `feat/phone-change-password-reset` (develop 기반, 체크아웃됨).

---

## File Structure

**Backend (모두 `backend/src/main/java/com/duing/` 하위)**
- Modify `domain/user/entity/VerificationPurpose.java` — Javadoc "PR4 에서 구현" 문구 제거.
- Modify `domain/user/entity/User.java` — `changePhone(String, LocalDateTime)` 추가.
- Modify `domain/user/repository/UserRepository.java` — `existsByPhoneAndIdNot`, `findByStudentId` 추가.
- Modify `domain/user/service/PhoneVerificationSessionManager.java` — `upsert` 에 `targetUserId` 파라미터 추가.
- Modify `domain/user/service/dto/command/IssuePhoneVerificationCommand.java` — `targetUserId` 필드 추가, PR1 주석 갱신.
- Modify `domain/user/service/GeneralPhoneVerificationService.java` — purpose 별 중복검사 분기 + `startPasswordReset` 구현.
- Modify `domain/user/service/PhoneVerificationService.java` — `startPasswordReset` 시그니처 추가.
- Modify `domain/user/service/PhoneVerificationRateLimiter.java` — 학번당 재설정 시작 리밋(시간당 3회).
- Modify `domain/user/exception/UserException.java` — code 지원 ctor + `PasswordResetNotAllowedException`(400).
- Modify `domain/user/api/UserApi.java` + `controller/UserController.java` — 번호변경 발급 + PATCH phone.
- Modify `domain/user/api/AuthApi.java` + `controller/AuthController.java` — password-resets 시작/완료.
- Modify `domain/user/service/UserService.java` + `GeneralUserService.java` — `changePhone`, `resetPassword`.
- Create `domain/user/controller/dto/request/StartPhoneChangeVerificationRequest.java`, `ChangePhoneRequest.java`, `PasswordResetStartRequest.java`, `CompletePasswordResetRequest.java`.
- Create `domain/user/controller/dto/response/PasswordResetStartResponse.java`.
- Create `domain/user/service/dto/command/ChangePhoneCommand.java`, `ResetPasswordCommand.java`.
- Create `domain/user/service/dto/query/PasswordResetStartResult.java`.
- Test: `domain/user/controller/UserPhoneChangeTest.java`(신규), `AuthPasswordResetTest.java`(신규).

**Frontend (모두 `frontend/` 하위)**
- Move(승격) `apps/web/app/(auth)/signup/_lib/phone-verification.ts` → `apps/web/app/_lib/phone-verification.ts`; `.../_lib/use-phone-verification.ts` → `apps/web/app/_lib/use-phone-verification.ts`; `.../_components/PhoneVerificationField.tsx`·`PhoneInput.tsx` → `apps/web/app/_components/`. (테스트 파일은 제자리 유지 — `GradeSelect` 승격 전례와 동일, import 경로만 갱신.)
- Modify `packages/types/src/user.ts` — 신규 payload/세션 타입.
- Modify `packages/api/src/client.ts` — `users.startPhoneChangeVerification`·`users.changePhone`·`auth.requestPasswordReset`·`auth.completePasswordReset`.
- Modify `packages/hooks/src/auth.ts`(+`index.ts`) — 뮤테이션 훅 4개.
- Modify `apps/web/app/_lib/use-phone-verification.ts` — 코어 + 래퍼 3개(공개 시그니처 `usePhoneVerification(phone)` 불변).
- Modify `apps/web/app/_lib/phone-verification.ts` — `mapPhoneChangeIssueError` 추가.
- Create `apps/web/app/me/settings/_components/PhoneChangeDialog.tsx` + Modify `_pages/SettingsPage.tsx`(전화번호 행 action).
- Create `apps/web/app/(auth)/forgot-password/page.tsx` + `_components/ForgotPasswordPanel.tsx`.
- Modify `apps/web/middleware.ts` — `/forgot-password` 인증 시 `/me` 리다이렉트 + matcher.
- Modify `apps/web/app/(auth)/login/_components/LoginFormPanel.tsx` — `<a>` → `<Link>`.
- Test: `packages/hooks/test/phoneChangePasswordReset.test.tsx`(신규), `apps/web/test/me/settings/phone-change-dialog.test.tsx`(신규), `apps/web/test/(auth)/forgot-password/ForgotPasswordPanel.test.tsx`(신규), 기존 signup 스위트 그린 유지.

**BE 테스트 하네스 공통 주의**: 새 테스트 클래스는 `AuthPhoneVerificationTest`·`AuthControllerSignupTest` 의 기존 헬퍼(스텁 등록·세션 발급·가입·로그인)를 **파일을 먼저 읽고 실제 시그니처대로 재사용**한다. 이 계획서의 테스트 코드에서 `issueSignupSession(...)`/`registerInbound(...)`/`signupUser(...)`/`loginAndGetToken(...)` 형태의 헬퍼 호출은 그 파일들의 실제 헬퍼명·시그니처에 맞춰 조정한다(로직·단언은 그대로).

---

### Task 1: [BE] 번호 변경 인증 발급 — `POST /users/me/phone-verifications`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/dto/command/IssuePhoneVerificationCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/PhoneVerificationSessionManager.java:41-60`
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralPhoneVerificationService.java:69-89`
- Modify: `backend/src/main/java/com/duing/domain/user/repository/UserRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/user/entity/VerificationPurpose.java`(Javadoc)
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/StartPhoneChangeVerificationRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/UserApi.java`, `controller/UserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/UserPhoneChangeTest.java`

**Interfaces:**
- Consumes: 기존 `PhoneVerificationService.issue(command, clientIp)`, `PhoneVerificationIssueResponse.from(result)`.
- Produces: `IssuePhoneVerificationCommand(String phone, VerificationPurpose purpose, boolean includeQr, Long targetUserId)` · `sessionManager.upsert(phone, token, purpose, targetUserId, now)` · `userRepository.existsByPhoneAndIdNot(phone, id)` · 엔드포인트 `POST /api/v1/users/me/phone-verifications?qr=` → 201 `PhoneVerificationIssueResponse`. Task 2·3 이 이 커맨드/업서트 시그니처를 사용한다.

- [ ] **Step 1: 실패 테스트 작성**

`UserPhoneChangeTest.java` 신규 — 하네스는 `AuthPhoneVerificationTest` 와 동일(@Import TestcontainersConfiguration, RANDOM_PORT, `@BeforeEach` 에서 rateLimiter/moPollThrottle/stubMoClient 리셋). 가입+로그인 헬퍼는 `AuthControllerSignupTest` 의 흐름(스텁 MO 로 SIGNUP 세션 인증 → signup → login → accessToken)을 재사용해 `String signupAndLogin(String phone, String studentId)` 형태로 클래스 내 헬퍼로 만든다. 테스트 4개:

```java
@Test
@DisplayName("로그인 없이 번호 변경 인증을 시작하면 401 로 거부된다")
void issuePhoneChangeWithoutAuthReturns401() {
    given().contentType(ContentType.JSON)
            .body(Map.of("phone", uniquePhone()))
            .when().post("/api/v1/users/me/phone-verifications")
            .then().statusCode(HttpStatus.UNAUTHORIZED.value());
}

@Test
@DisplayName("새 번호로 번호 변경 인증을 시작하면 PHONE_CHANGE 세션이 본인을 대상으로 발급된다")
void issuePhoneChangeCreatesSessionWithTargetUser() {
    String accessToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    Long myUserId = userRepository.findByStudentId(lastStudentId).orElseThrow().getId(); // 헬퍼가 보관한 학번 사용
    String newPhone = uniquePhone();

    String token = given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("phone", newPhone))
            .when().post("/api/v1/users/me/phone-verifications")
            .then().statusCode(HttpStatus.CREATED.value())
            .extract().jsonPath().getString("data.verificationToken");

    PhoneVerification session = phoneVerificationRepository.findByToken(token).orElseThrow();
    assertThat(session.getPurpose()).isEqualTo(VerificationPurpose.PHONE_CHANGE);
    assertThat(session.getTargetUserId()).isEqualTo(myUserId);
    assertThat(session.getPhone()).isEqualTo(newPhone);
}

@Test
@DisplayName("타인이 사용 중인 번호로 번호 변경 인증을 시작하면 409 를 반환한다")
void issuePhoneChangeWithOthersPhoneReturns409() {
    String otherPhone = uniquePhone();
    signupAndLogin(otherPhone, uniqueStudentId());          // 선점 사용자
    String accessToken = signupAndLogin(uniquePhone(), uniqueStudentId()); // 요청 사용자

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("phone", otherPhone))
            .when().post("/api/v1/users/me/phone-verifications")
            .then().statusCode(HttpStatus.CONFLICT.value())
            .body("code", equalTo("PHONE_ALREADY_REGISTERED"));
}

@Test
@DisplayName("자기 번호 그대로도 번호 변경 인증을 시작할 수 있다(소급 재인증 경로)")
void issuePhoneChangeWithOwnPhoneSucceeds() {
    String myPhone = uniquePhone();
    String accessToken = signupAndLogin(myPhone, uniqueStudentId());

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("phone", myPhone))
            .when().post("/api/v1/users/me/phone-verifications")
            .then().statusCode(HttpStatus.CREATED.value());
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.UserPhoneChangeTest'`
Expected: FAIL — 404(엔드포인트 미존재)·컴파일 에러(existsByPhoneAndIdNot 미존재).

- [ ] **Step 3: 구현**

`IssuePhoneVerificationCommand.java` 전체 교체:
```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.VerificationPurpose;

/**
 * MO 인증 발급 커맨드. targetUserId 는 PHONE_CHANGE(요청자 본인)·PASSWORD_RESET(재설정 대상)에서
 * 세션에 귀속되고, SIGNUP 은 null 이다.
 */
public record IssuePhoneVerificationCommand(
        String phone,
        VerificationPurpose purpose,
        boolean includeQr,
        Long targetUserId
) {
}
```

`PhoneVerificationSessionManager.upsert` — 시그니처에 `Long targetUserId` 추가(4번째 파라미터, `now` 앞), 내부의 `reissue(token, purpose, null, now)` → `reissue(token, purpose, targetUserId, now)`, `PhoneVerification.issue(phone, token, purpose, null, now)` → `...targetUserId, now)`.

`GeneralPhoneVerificationService.issue` — 중복검사를 purpose 분기로 교체(라인 74-78):
```java
        // purpose 별 발급 전 중복검사 (spec §7.1·§7.5) — 어느 경우든 권위 있는 차단은 완료 API 의
        // 재검증 + DB 유니크가 담당하고, 여기는 UX 선안내다.
        switch (issueCommand.purpose()) {
            // 이미 가입된 번호면 즉시 409 — 이메일 인증의 발송 전 409 와 동일한 UX 우선 트레이드오프.
            case SIGNUP -> {
                if (userRepository.existsByPhone(issueCommand.phone())) {
                    throw new PhoneVerificationException.PhoneAlreadyRegisteredException();
                }
            }
            // 타인 소유 번호만 409 — 자기 번호 재인증(소급 인증 경로)은 허용한다 (spec §7.5).
            case PHONE_CHANGE -> {
                if (userRepository.existsByPhoneAndIdNot(issueCommand.phone(), issueCommand.targetUserId())) {
                    throw new PhoneVerificationException.PhoneAlreadyRegisteredException();
                }
            }
            // 계정에 등록된 번호로만 발급되므로 중복검사가 성립하지 않는다 (spec §10.2).
            case PASSWORD_RESET -> { }
        }
```
같은 메서드의 upsert 호출을 `sessionManager.upsert(issueCommand.phone(), token, issueCommand.purpose(), issueCommand.targetUserId(), now)` 로 갱신.

`UserRepository.java` 에 추가(existsByPhone 아래):
```java
    /** 번호 변경 발급·완료의 중복검사 — 본인 소유는 허용(소급 재인증), 타인 소유만 걸러낸다. */
    boolean existsByPhoneAndIdNot(String phone, Long id);

    Optional<User> findByStudentId(String studentId);
```

`StartPhoneChangeVerificationRequest.java` 신규:
```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record StartPhoneChangeVerificationRequest(
        @NotBlank(message = "전화번호는 필수 입력값입니다.")
        @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.")
        String phone
) {
    public IssuePhoneVerificationCommand toCommand(boolean includeQr, Long currentUserId) {
        return new IssuePhoneVerificationCommand(phone, VerificationPurpose.PHONE_CHANGE, includeQr, currentUserId);
    }
}
```

`IssuePhoneVerificationRequest.toCommand`(SIGNUP 고정) — `new IssuePhoneVerificationCommand(phone, VerificationPurpose.SIGNUP, includeQr, null)` 로 갱신 + Javadoc 을 "공개 발급은 회원가입 전용 — 번호 변경 발급은 인증 전용 `/users/me/phone-verifications`, 재설정 발급은 시작 API 내부 전용." 으로 교체.

`VerificationPurpose.java` Javadoc 의 "PHONE_CHANGE·PASSWORD_RESET 플로우는 PR4 에서 구현되며 여기서는 값만 정의한다." 라인 삭제(용도 설명만 남김).

`UserApi.java` 에 추가(changePassword 아래):
```java
    @Operation(summary = "번호 변경 MO 인증 시작",
            description = "새 번호에 대한 PHONE_CHANGE 인증 세션을 발급한다(본인 JWT 필수). 세션 5분 유효, "
                    + "재발급 60초 쿨다운. 타인이 사용 중인 번호는 409(PHONE_ALREADY_REGISTERED) — 자기 번호 "
                    + "재인증은 허용된다. qr=true 면 SMSTO 딥링크 QR 을 함께 반환한다(실패 시 null).")
    @SecurityRequirement(name = "BearerAuth")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발급됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "타인이 사용 중인 번호"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429",
                    description = "재발급 쿨다운(60초) 또는 IP 요청 한도 초과")
    })
    @PostMapping("/users/me/phone-verifications")
    ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> startPhoneChangeVerification(
            @Valid @RequestBody StartPhoneChangeVerificationRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest);
```
(UserApi 에 `@ApiResponses`·`@PostMapping`·`@RequestParam`·`HttpServletRequest`·해당 DTO import 추가.)

`UserController.java` 구현(패턴은 AuthController.issuePhoneVerification 과 동일):
```java
    @Override
    public ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> startPhoneChangeVerification(
            @Valid @RequestBody StartPhoneChangeVerificationRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        PhoneVerificationIssueResult issueResult = phoneVerificationService
                .issue(startRequest.toCommand(includeQr, currentUser.id()), clientIp);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(PhoneVerificationIssueResponse.from(issueResult)));
    }
```
(UserController 에 `PhoneVerificationService` 주입 추가.)

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.UserPhoneChangeTest' --tests 'com.duing.domain.user.controller.AuthPhoneVerificationTest' --tests 'com.duing.domain.user.controller.AuthControllerSignupTest'`
Expected: BUILD SUCCESSFUL — 신규 4개 + 기존 발급·가입 회귀 그린.

- [ ] **Step 5: 커밋**

```bash
git add backend && git commit -m "feat(backend): 번호 변경 MO 인증 발급 API 추가(purpose·targetUserId 확장)"
```

---

### Task 2: [BE] 번호 변경 완료 — `PATCH /users/me/phone`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/entity/User.java`(markPhoneVerified 아래)
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/ChangePhoneRequest.java`, `service/dto/command/ChangePhoneCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/UserService.java`, `GeneralUserService.java`, `api/UserApi.java`, `controller/UserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/UserPhoneChangeTest.java`(확장)

**Interfaces:**
- Consumes: Task 1 의 발급 엔드포인트·`existsByPhoneAndIdNot`, 기존 `getVerifiedSessionForUpdate`/`consume`(MANDATORY)·`findByIdForUpdate`.
- Produces: `PATCH /api/v1/users/me/phone {verificationToken}` → 204 · `User.changePhone(String newPhone, LocalDateTime verifiedAt)` · `UserService.changePhone(ChangePhoneCommand, clientIp, userAgent)`.

- [ ] **Step 1: 실패 테스트 추가**

`UserPhoneChangeTest` 에 추가. PHONE_CHANGE 세션 인증 헬퍼: 발급(Task 1 엔드포인트) → `stubMoClient` 에 (새 번호 digits, code) 등록 → `GET /auth/phone-verifications/{token}` 폴링으로 VERIFIED 확정(기존 AuthPhoneVerificationTest 의 인증 확정 헬퍼 재사용).

```java
@Test
@DisplayName("인증된 세션으로 번호를 변경하면 번호와 인증 시각이 갱신되고 세션은 소비된다")
void changePhoneUpdatesPhoneAndConsumesSession() {
    String accessToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    Long myUserId = currentUserId(accessToken);
    String newPhone = uniquePhone();
    String token = issueAndVerifyPhoneChangeSession(accessToken, newPhone);

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("verificationToken", token))
            .when().patch("/api/v1/users/me/phone")
            .then().statusCode(HttpStatus.NO_CONTENT.value());

    User updated = userRepository.findById(myUserId).orElseThrow();
    assertThat(updated.getPhone()).isEqualTo(newPhone);
    assertThat(updated.getPhoneVerifiedAt()).isNotNull();
    assertThat(phoneVerificationRepository.findByToken(token)).isEmpty(); // consume 로 행 삭제
    // CONSUMED 감사 이벤트에 userId 가 기록된다
    assertThat(phoneVerificationEventRepository.findAll())
            .anyMatch(event -> event.getEventType() == PhoneVerificationEventType.CONSUMED
                    && myUserId.equals(event.getUserId()));
}

@Test
@DisplayName("다른 사용자의 인증 세션으로 번호 변경을 시도하면 403 을 반환한다")
void changePhoneWithOthersSessionReturns403() {
    String attackerToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    String victimToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    String sessionToken = issueAndVerifyPhoneChangeSession(victimToken, uniquePhone()); // 피해자 세션

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + attackerToken)
            .body(Map.of("verificationToken", sessionToken))
            .when().patch("/api/v1/users/me/phone")
            .then().statusCode(HttpStatus.FORBIDDEN.value())
            .body("code", equalTo("PHONE_NOT_VERIFIED"));
}

@Test
@DisplayName("가입용(SIGNUP) 세션으로는 번호를 변경할 수 없다")
void changePhoneWithSignupPurposeSessionReturns403() {
    String accessToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    // 공개 발급(SIGNUP purpose) 세션을 인증까지 끌어올린 뒤 완료 API 에 투입한다.
    String signupSessionToken = issueAndVerifySignupSession(uniquePhone());

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("verificationToken", signupSessionToken))
            .when().patch("/api/v1/users/me/phone")
            .then().statusCode(HttpStatus.FORBIDDEN.value())
            .body("code", equalTo("PHONE_NOT_VERIFIED"));
}

@Test
@DisplayName("인증 후 완료 창(10분)이 지난 세션으로 번호 변경을 시도하면 403 을 반환한다")
void changePhoneAfterCompletionWindowReturns403() {
    String accessToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    String token = issueAndVerifyPhoneChangeSession(accessToken, uniquePhone());
    // verified_at 을 11분 전으로 되돌려 완료 창(10분) 초과를 시뮬레이트한다 — 절대날짜 금지, 상대 시각.
    jdbcTemplate.update(
            "UPDATE phone_verifications SET verified_at = verified_at - INTERVAL '11 minutes' WHERE token = ?",
            token);

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("verificationToken", token))
            .when().patch("/api/v1/users/me/phone")
            .then().statusCode(HttpStatus.FORBIDDEN.value())
            .body("code", equalTo("PHONE_NOT_VERIFIED"));
}

@Test
@DisplayName("인증과 완료 사이에 타인이 같은 번호로 가입했다면 409 로 차단된다")
void changePhoneToctouDuplicateReturns409() {
    String accessToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    String contestedPhone = uniquePhone();
    String token = issueAndVerifyPhoneChangeSession(accessToken, contestedPhone);
    signupAndLogin(contestedPhone, uniqueStudentId()); // 인증~완료 사이 창에서 타인이 선점

    given().contentType(ContentType.JSON)
            .header("Authorization", "Bearer " + accessToken)
            .body(Map.of("verificationToken", token))
            .when().patch("/api/v1/users/me/phone")
            .then().statusCode(HttpStatus.CONFLICT.value());
}
```
(`issueAndVerifySignupSession` 은 공개 발급 → 스텁 등록 → 상태조회 VERIFIED 흐름 — AuthControllerSignupTest 의 가입 전 인증 헬퍼와 동일. TOCTOU 케이스에서 signupAndLogin 이 발급 409 로 실패하면 안 되므로, 선점 가입은 SIGNUP 발급 검사(existsByPhone) 기준 아직 미가입 번호라 통과한다 — 세션(PHONE_CHANGE)과 users 는 별개 테이블이라 충돌 없음. 단 phone_verifications 의 번호당 1행 upsert 때문에 같은 번호의 SIGNUP 발급이 기존 PHONE_CHANGE 세션 행을 덮어쓴다(reissue) — 이 케이스에서는 **미리 확보해 둔 PHONE_CHANGE token 문자열**로 완료를 시도하므로, 덮어써진 시점에 그 token 은 미존재 → PhoneNotVerified 403 이 되어 버린다. 그러면 409 검증이 안 되므로, 선점 가입자는 **다른 번호로 가입 후 jdbcTemplate 로 phone 만 contestedPhone 으로 직접 UPDATE** 해 users 에만 중복을 만든다:
```java
    String preemptorToken = signupAndLogin(uniquePhone(), uniqueStudentId());
    jdbcTemplate.update("UPDATE users SET phone = ? WHERE student_id = ?", contestedPhone, lastStudentId);
```
이렇게 세션 행을 건드리지 않고 TOCTOU 를 재현한다.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.UserPhoneChangeTest'`
Expected: FAIL — PATCH 엔드포인트 404·컴파일 에러(changePhone 미존재).

- [ ] **Step 3: 구현**

`User.java` — `markPhoneVerified` 아래에 추가:
```java
    /**
     * MO 재인증을 통과한 새 번호로 교체하고 인증 시각을 갱신한다 (spec §7.5).
     * 같은 번호 재인증(소급 인증)도 이 메서드를 그대로 쓴다 — phone 값은 같고 verifiedAt 만 갱신된다.
     */
    public void changePhone(String newPhone, LocalDateTime verifiedAt) {
        this.phone = newPhone;
        this.phoneVerifiedAt = verifiedAt;
    }
```

`ChangePhoneRequest.java`:
```java
package com.duing.domain.user.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePhoneRequest(
        // 새 번호는 요청에 없다 — 인증 세션에 귀속된 번호가 저장된다 (spec §7.5, signup 과 동일 원칙).
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken
) {
}
```

`ChangePhoneCommand.java`:
```java
package com.duing.domain.user.service.dto.command;

public record ChangePhoneCommand(Long userId, String verificationToken) {
}
```

`UserService.java` 인터페이스에 추가:
```java
    /** MO 재인증 세션(PHONE_CHANGE·본인 대상)으로 전화번호를 교체한다 — 세션은 소비된다 (spec §7.5). */
    void changePhone(ChangePhoneCommand changePhoneCommand, String clientIp, String userAgent);
```

`GeneralUserService.java` 에 구현(changePassword 아래) — signup 소비 패턴과 동일 구조:
```java
    @Override
    @Transactional
    public void changePhone(ChangePhoneCommand changePhoneCommand, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now(clock);

        // 세션 검증(403)이 최우선 — 미존재·미인증·완료 창(10분) 초과·용도 불일치 전부 사유 미특정 403.
        PhoneVerification verifiedSession = phoneVerificationSessionManager.getVerifiedSessionForUpdate(
                changePhoneCommand.verificationToken(), VerificationPurpose.PHONE_CHANGE, now);
        // 세션 대상과 요청자가 다르면 동일하게 403 — 타인 세션 토큰 탈취로 내 계정 번호를 바꾸는 경로 차단.
        if (!changePhoneCommand.userId().equals(verifiedSession.getTargetUserId())) {
            throw new PhoneVerificationException.PhoneNotVerifiedException();
        }

        String verifiedPhone = verifiedSession.getPhone();
        // 발급 시 검사했더라도 인증~완료 사이 창의 선점을 재검증한다(TOCTOU) — 최종 방어는 ux_users_phone.
        if (userRepository.existsByPhoneAndIdNot(verifiedPhone, changePhoneCommand.userId())) {
            throw new UserException.DuplicateAccountException();
        }

        User user = userRepository.findByIdForUpdate(changePhoneCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        user.changePhone(verifiedPhone, now);
        phoneVerificationSessionManager.consume(verifiedSession, user.getId(), clientIp, userAgent);
    }
```
(import 에 `PhoneVerification`·`PhoneVerificationException`·`ChangePhoneCommand` 추가 — `VerificationPurpose`·세션매니저는 이미 있음.)

`UserApi.java` 에 추가:
```java
    @Operation(summary = "전화번호 변경",
            description = "PHONE_CHANGE 용 MO 인증 세션(본인 대상·인증 후 10분 내)으로 전화번호를 교체한다. "
                    + "새 번호는 요청에 없으며 세션에 귀속된 번호가 저장되고, 사용된 세션은 즉시 소비된다. "
                    + "미인증·만료·대상 불일치 세션은 403(PHONE_NOT_VERIFIED), 타인 선점 번호는 409.")
    @SecurityRequirement(name = "BearerAuth")
    @PatchMapping("/users/me/phone")
    ResponseEntity<Void> changePhone(
            @Valid @RequestBody ChangePhoneRequest changePhoneRequest,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest);
```

`UserController.java` 구현:
```java
    @Override
    public ResponseEntity<Void> changePhone(
            @Valid @RequestBody ChangePhoneRequest changePhoneRequest,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        userService.changePhone(
                new ChangePhoneCommand(currentUser.id(), changePhoneRequest.verificationToken()),
                clientIp, userAgent);
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.UserPhoneChangeTest'`
Expected: BUILD SUCCESSFUL (Task 1+2 테스트 전부).

- [ ] **Step 5: 커밋**

```bash
git add backend && git commit -m "feat(backend): 재인증 기반 전화번호 변경 API 추가"
```

---

### Task 3: [BE] 비밀번호 재설정 시작 — `POST /auth/password-resets`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/PhoneVerificationRateLimiter.java`
- Modify: `backend/src/main/java/com/duing/domain/user/exception/UserException.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/PhoneVerificationService.java`, `GeneralPhoneVerificationService.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/PasswordResetStartRequest.java`, `controller/dto/response/PasswordResetStartResponse.java`, `service/dto/query/PasswordResetStartResult.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java`, `controller/AuthController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthPasswordResetTest.java`

**Interfaces:**
- Consumes: Task 1 의 `IssuePhoneVerificationCommand(…, targetUserId)`·purpose 분기, `userRepository.findByStudentId`, `PhoneMasker.mask`.
- Produces: `POST /api/v1/auth/password-resets?qr= {studentId}` → 202 `PasswordResetStartResponse(verificationToken, code, moNumber, qrCode, expiresAt, expiresInSeconds, maskedPhone)` · `PhoneVerificationService.startPasswordReset(String studentId, boolean includeQr, String clientIp)` · `rateLimiter.assertAndRecordPasswordResetStart(studentId, now)` · `UserException.PasswordResetNotAllowedException`(400, code `PASSWORD_RESET_NOT_ALLOWED`). Task 4 가 같은 테스트 클래스·시작 흐름을 사용.

- [ ] **Step 1: 실패 테스트 작성**

`AuthPasswordResetTest.java` 신규(하네스 동일):
```java
@Test
@DisplayName("가입된 학번으로 재설정을 시작하면 등록 번호로 세션이 발급되고 마스킹된 번호를 안내한다")
void startPasswordResetIssuesSessionForRegisteredPhone() {
    String phone = uniquePhone();
    String studentId = uniqueStudentId();
    signupUser(phone, studentId); // 가입만 — 로그인 불필요

    JsonPath body = given().contentType(ContentType.JSON)
            .body(Map.of("studentId", studentId))
            .when().post("/api/v1/auth/password-resets")
            .then().statusCode(HttpStatus.ACCEPTED.value())
            .extract().jsonPath();

    assertThat(body.getString("data.maskedPhone")).isEqualTo("010-****-" + phone.substring(9));
    String token = body.getString("data.verificationToken");
    PhoneVerification session = phoneVerificationRepository.findByToken(token).orElseThrow();
    assertThat(session.getPurpose()).isEqualTo(VerificationPurpose.PASSWORD_RESET);
    assertThat(session.getPhone()).isEqualTo(phone);
    assertThat(session.getTargetUserId())
            .isEqualTo(userRepository.findByStudentId(studentId).orElseThrow().getId());
}

@Test
@DisplayName("가입되지 않은 학번으로 재설정을 시작하면 사유를 특정하지 않는 400 을 반환한다")
void startPasswordResetWithUnknownStudentIdReturns400() {
    given().contentType(ContentType.JSON)
            .body(Map.of("studentId", "99999999"))
            .when().post("/api/v1/auth/password-resets")
            .then().statusCode(HttpStatus.BAD_REQUEST.value())
            .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
}

@Test
@DisplayName("같은 학번의 재설정 시작은 시간당 3회로 제한된다")
void startPasswordResetIsRateLimitedPerStudentId() {
    String studentId = uniqueStudentId();
    signupUser(uniquePhone(), studentId);
    // 60초 쿨다운(번호당 1행) 회피를 위해 각 시도 전 last_issued_at 을 과거로 되돌린다.
    for (int attempt = 0; attempt < 3; attempt++) {
        given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.ACCEPTED.value());
        jdbcTemplate.update(
                "UPDATE phone_verifications SET last_issued_at = last_issued_at - INTERVAL '2 minutes'");
    }
    given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
            .when().post("/api/v1/auth/password-resets")
            .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
            .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
}

@Test
@DisplayName("탈퇴한 학번으로 재설정을 시작하면 400 을 반환한다")
void startPasswordResetForWithdrawnUserReturns400() {
    String studentId = uniqueStudentId();
    signupUser(uniquePhone(), studentId);
    jdbcTemplate.update("UPDATE users SET deleted_at = now() WHERE student_id = ?", studentId);

    given().contentType(ContentType.JSON)
            .body(Map.of("studentId", studentId))
            .when().post("/api/v1/auth/password-resets")
            .then().statusCode(HttpStatus.BAD_REQUEST.value())
            .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.AuthPasswordResetTest'`
Expected: FAIL — 404·컴파일 에러.

- [ ] **Step 3: 구현**

`PhoneVerificationRateLimiter.java` — 필드·창·메서드 추가:
```java
    static final int RESET_START_PER_HOUR_LIMIT = 3;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> resetStartTimesByStudentId =
            new ConcurrentHashMap<>();

    /** 재설정 시작 학번 윈도우(시간당 3회) — 계정 열거·문자 폭탄 완화 (spec §10.2·§11). 초과 시 429. */
    public void assertAndRecordPasswordResetStart(String studentId, LocalDateTime now) {
        assertAndRecordWithin(resetStartTimesByStudentId, studentId, now,
                RESET_START_PER_HOUR_LIMIT, RESET_START_PER_HOUR_LIMIT);
    }
```
`reset()` 에 `resetStartTimesByStudentId.clear();` 추가. (공용 `assertAndRecordWithin` 의 파라미터명 `clientIp` 는 키 일반화로 `windowKey` 로 바꿔도 되고 그대로 둬도 된다 — 동작 무변경 범위에서 택1.)

`UserException.java` — code 지원 ctor 오버로드 + 신규 예외:
```java
    protected UserException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }
```
```java
    /** 재설정 시작(계정 미존재)·완료(대상 계정 소실) 공통 — 사유 미특정 단일 400 (spec §7.8·§10.2). */
    public static class PasswordResetNotAllowedException extends UserException {
        private static final String MESSAGE = "등록된 정보를 확인할 수 없습니다.";

        public PasswordResetNotAllowedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "PASSWORD_RESET_NOT_ALLOWED");
        }
    }
```

`PasswordResetStartResult.java`:
```java
package com.duing.domain.user.service.dto.query;

public record PasswordResetStartResult(PhoneVerificationIssueResult issueResult, String maskedPhone) {
}
```

`PhoneVerificationService.java` 인터페이스에 추가:
```java
    /**
     * 비밀번호 재설정 인증 시작 — 학번으로 계정을 찾아 <b>등록된 번호로만</b> PASSWORD_RESET 세션을
     * 발급한다(번호를 입력받지 않는다, spec §10.2). 계정 미존재 400, 학번당 시간당 3회 제한.
     */
    PasswordResetStartResult startPasswordReset(String studentId, boolean includeQr, String clientIp);
```

`GeneralPhoneVerificationService.java` 에 구현(issue 아래) — 오케스트레이터라 무트랜잭션 유지:
```java
    @Override
    public PasswordResetStartResult startPasswordReset(String studentId, boolean includeQr, String clientIp) {
        LocalDateTime now = LocalDateTime.now(clock);
        rateLimiter.assertAndRecordPasswordResetStart(studentId, now);

        // @SQLRestriction 으로 탈퇴 계정은 조회되지 않는다 — 미존재와 동일한 400 으로 수렴(사유 미특정).
        User targetUser = userRepository.findByStudentId(studentId)
                .orElseThrow(UserException.PasswordResetNotAllowedException::new);

        PhoneVerificationIssueResult issueResult = issue(
                new IssuePhoneVerificationCommand(
                        targetUser.getPhone(), VerificationPurpose.PASSWORD_RESET, includeQr, targetUser.getId()),
                clientIp);
        return new PasswordResetStartResult(issueResult, PhoneMasker.mask(targetUser.getPhone()));
    }
```
(import 에 `User`·`UserException`·`VerificationPurpose`·`PasswordResetStartResult` 추가.)

`PasswordResetStartRequest.java`:
```java
package com.duing.domain.user.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record PasswordResetStartRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId
) {
}
```

`PasswordResetStartResponse.java`:
```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.PasswordResetStartResult;
import java.time.LocalDateTime;

public record PasswordResetStartResponse(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        LocalDateTime expiresAt,
        long expiresInSeconds,
        String maskedPhone
) {
    public static PasswordResetStartResponse from(PasswordResetStartResult startResult) {
        var issueResult = startResult.issueResult();
        return new PasswordResetStartResponse(
                issueResult.verificationToken(), issueResult.code(), issueResult.moNumber(),
                issueResult.qrCode(), issueResult.expiresAt(), issueResult.expiresInSeconds(),
                startResult.maskedPhone());
    }
}
```

`AuthApi.java` 에 추가(상태조회 아래):
```java
    @Operation(summary = "비밀번호 재설정 시작",
            description = "학번으로 계정을 찾아 등록된 번호로 PASSWORD_RESET MO 인증 세션을 발급한다 — 번호는 "
                    + "입력받지 않으며 응답에 마스킹된 번호를 안내한다. 이후 폴링은 공용 상태조회 API 를 쓴다. "
                    + "학번당 시간당 3회 제한. 계정을 확인할 수 없으면 400(PASSWORD_RESET_NOT_ALLOWED).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "202", description = "발급됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "계정을 확인할 수 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "학번·IP 한도 또는 쿨다운")
    })
    @PostMapping("/auth/password-resets")
    ResponseEntity<ApiResponse<PasswordResetStartResponse>> startPasswordReset(
            @Valid @RequestBody PasswordResetStartRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest);
```

`AuthController.java` 구현:
```java
    @Override
    public ResponseEntity<ApiResponse<PasswordResetStartResponse>> startPasswordReset(
            @Valid @RequestBody PasswordResetStartRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        PasswordResetStartResult startResult = phoneVerificationService
                .startPasswordReset(startRequest.studentId(), includeQr, clientIp);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(PasswordResetStartResponse.from(startResult)));
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.AuthPasswordResetTest' --tests 'com.duing.domain.user.service.PhoneVerificationRateLimiterTest'`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend && git commit -m "feat(backend): 비밀번호 재설정 MO 인증 시작 API 추가(학번당 시간당 3회 제한)"
```

---

### Task 4: [BE] 비밀번호 재설정 완료 — `POST /auth/password-resets/complete`

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/CompletePasswordResetRequest.java`, `service/dto/command/ResetPasswordCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/UserService.java`, `GeneralUserService.java`, `api/AuthApi.java`, `controller/AuthController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthPasswordResetTest.java`(확장)

**Interfaces:**
- Consumes: Task 3 의 시작 API·`PasswordResetNotAllowedException`, 기존 `getVerifiedSessionForUpdate`/`consume`·`findByIdForUpdate`·`passwordEncoder`·`bumpTokenVersion`.
- Produces: `POST /api/v1/auth/password-resets/complete {verificationToken, newPassword}` → 204 · `UserService.resetPassword(ResetPasswordCommand, clientIp, userAgent)`.

- [ ] **Step 1: 실패 테스트 추가**

`AuthPasswordResetTest` 에 추가. 재설정 세션 인증 헬퍼 `issueAndVerifyResetSession(studentId)` = 시작 API → 스텁 등록(등록 번호 digits, code) → 상태조회 VERIFIED:
```java
@Test
@DisplayName("인증된 세션으로 재설정하면 새 비밀번호로 로그인되고 기존 토큰은 전부 무효화된다")
void completePasswordResetChangesPasswordAndInvalidatesTokens() {
    String phone = uniquePhone();
    String studentId = uniqueStudentId();
    signupUser(phone, studentId);
    String oldAccessToken = login(studentId, ORIGINAL_PASSWORD);
    String token = issueAndVerifyResetSession(studentId);

    given().contentType(ContentType.JSON)
            .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
            .when().post("/api/v1/auth/password-resets/complete")
            .then().statusCode(HttpStatus.NO_CONTENT.value());

    // 새 비밀번호로 로그인 성공 + 세션 소비 + tokenVersion bump 로 구 토큰 401 (전 기기 로그아웃)
    login(studentId, "newPass123!");
    assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
    given().header("Authorization", "Bearer " + oldAccessToken)
            .when().get("/api/v1/users/me")
            .then().statusCode(HttpStatus.UNAUTHORIZED.value());
}

@Test
@DisplayName("문자 인증 전의 세션으로 재설정을 완료하려 하면 403 을 반환한다")
void completePasswordResetWithPendingSessionReturns403() {
    String studentId = uniqueStudentId();
    signupUser(uniquePhone(), studentId);
    // 시작만 하고(PENDING) 인증 없이 완료 시도
    String token = given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
            .when().post("/api/v1/auth/password-resets")
            .then().statusCode(HttpStatus.ACCEPTED.value())
            .extract().jsonPath().getString("data.verificationToken");

    given().contentType(ContentType.JSON)
            .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
            .when().post("/api/v1/auth/password-resets/complete")
            .then().statusCode(HttpStatus.FORBIDDEN.value())
            .body("code", equalTo("PHONE_NOT_VERIFIED"));
}

@Test
@DisplayName("가입용 세션으로는 비밀번호를 재설정할 수 없다")
void completePasswordResetWithSignupSessionReturns403() {
    String token = issueAndVerifySignupSession(uniquePhone()); // purpose=SIGNUP
    given().contentType(ContentType.JSON)
            .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
            .when().post("/api/v1/auth/password-resets/complete")
            .then().statusCode(HttpStatus.FORBIDDEN.value())
            .body("code", equalTo("PHONE_NOT_VERIFIED"));
}

@Test
@DisplayName("인증 후 완료 창(10분)이 지난 세션으로 재설정하면 403 을 반환한다")
void completePasswordResetAfterCompletionWindowReturns403() {
    String studentId = uniqueStudentId();
    signupUser(uniquePhone(), studentId);
    String token = issueAndVerifyResetSession(studentId);
    jdbcTemplate.update(
            "UPDATE phone_verifications SET verified_at = verified_at - INTERVAL '11 minutes' WHERE token = ?",
            token);

    given().contentType(ContentType.JSON)
            .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
            .when().post("/api/v1/auth/password-resets/complete")
            .then().statusCode(HttpStatus.FORBIDDEN.value());
}

@Test
@DisplayName("인증과 완료 사이에 계정이 탈퇴되면 400 을 반환한다")
void completePasswordResetForWithdrawnUserReturns400() {
    String studentId = uniqueStudentId();
    signupUser(uniquePhone(), studentId);
    String token = issueAndVerifyResetSession(studentId);
    jdbcTemplate.update("UPDATE users SET deleted_at = now() WHERE student_id = ?", studentId);

    given().contentType(ContentType.JSON)
            .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
            .when().post("/api/v1/auth/password-resets/complete")
            .then().statusCode(HttpStatus.BAD_REQUEST.value())
            .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
}

@Test
@DisplayName("형식에 맞지 않는 새 비밀번호는 400 검증 오류를 반환한다")
void completePasswordResetWithWeakPasswordReturns400() {
    given().contentType(ContentType.JSON)
            .body(Map.of("verificationToken", "any-token", "newPassword", "short"))
            .when().post("/api/v1/auth/password-resets/complete")
            .then().statusCode(HttpStatus.BAD_REQUEST.value());
}
```
(`ORIGINAL_PASSWORD`·`login(studentId, password)` 헬퍼는 signupAndLogin 계열에서 분리해 재사용.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.user.controller.AuthPasswordResetTest'`
Expected: FAIL — complete 404.

- [ ] **Step 3: 구현**

`CompletePasswordResetRequest.java` (newPassword 규칙은 SignupRequest.password 와 동일 regex):
```java
package com.duing.domain.user.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CompletePasswordResetRequest(
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        @Pattern(
                regexp = "^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])|(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])).+$",
                message = "비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다."
        )
        String newPassword
) {
}
```

`ResetPasswordCommand.java`:
```java
package com.duing.domain.user.service.dto.command;

public record ResetPasswordCommand(String verificationToken, String newPassword) {
}
```

`UserService.java` 인터페이스에 추가:
```java
    /**
     * 비로그인 비밀번호 재설정 완료 — PASSWORD_RESET 세션(인증 후 10분 내)의 대상 계정 비밀번호를
     * 교체하고 token_version 을 올려 전 기기에서 로그아웃시킨다. 세션은 소비된다 (spec §10.2).
     */
    void resetPassword(ResetPasswordCommand resetPasswordCommand, String clientIp, String userAgent);
```

`GeneralUserService.java` 구현(changePhone 아래):
```java
    @Override
    @Transactional
    public void resetPassword(ResetPasswordCommand resetPasswordCommand, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now(clock);

        PhoneVerification verifiedSession = phoneVerificationSessionManager.getVerifiedSessionForUpdate(
                resetPasswordCommand.verificationToken(), VerificationPurpose.PASSWORD_RESET, now);

        Long targetUserId = verifiedSession.getTargetUserId();
        if (targetUserId == null) {
            throw new UserException.PasswordResetNotAllowedException();
        }
        // 인증~완료 사이에 탈퇴하면 @SQLRestriction 으로 조회되지 않는다 — 사유 미특정 400 으로 수렴.
        User user = userRepository.findByIdForUpdate(targetUserId)
                .orElseThrow(UserException.PasswordResetNotAllowedException::new);

        user.changePassword(passwordEncoder.encode(resetPasswordCommand.newPassword()));
        // 재설정 = 계정 탈취 대응 경로일 수 있다 — 발급된 모든 토큰을 무효화한다(전 기기 로그아웃).
        user.bumpTokenVersion();
        phoneVerificationSessionManager.consume(verifiedSession, user.getId(), clientIp, userAgent);
    }
```

`AuthApi.java` 에 추가:
```java
    @Operation(summary = "비밀번호 재설정 완료",
            description = "PASSWORD_RESET MO 인증 세션(인증 후 10분 내)으로 새 비밀번호를 설정한다. 완료 시 "
                    + "token_version 을 올려 전 기기에서 로그아웃되며, 세션은 즉시 소비된다. "
                    + "미인증·만료·용도 불일치 세션은 403(PHONE_NOT_VERIFIED), 대상 계정 소실은 400.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "재설정됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "계정을 확인할 수 없음 또는 형식 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "유효하지 않은 인증 세션")
    })
    @PostMapping("/auth/password-resets/complete")
    ResponseEntity<Void> completePasswordReset(
            @Valid @RequestBody CompletePasswordResetRequest completeRequest,
            HttpServletRequest httpServletRequest);
```

`AuthController.java` 구현:
```java
    @Override
    public ResponseEntity<Void> completePasswordReset(
            @Valid @RequestBody CompletePasswordResetRequest completeRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        userService.resetPassword(
                new ResetPasswordCommand(completeRequest.verificationToken(), completeRequest.newPassword()),
                clientIp, userAgent);
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 4: 통과 + BE 전체 회귀**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — 전체 스위트 그린(회귀 0).

- [ ] **Step 5: 커밋**

```bash
git add backend && git commit -m "feat(backend): 비밀번호 재설정 완료 API 추가(전 기기 로그아웃 포함)"
```

---

### Task 5: [FE] 인증 컴포넌트·훅 공용 승격 (mechanical)

**Files:**
- Move: `frontend/apps/web/app/(auth)/signup/_lib/phone-verification.ts` → `frontend/apps/web/app/_lib/phone-verification.ts`
- Move: `frontend/apps/web/app/(auth)/signup/_lib/use-phone-verification.ts` → `frontend/apps/web/app/_lib/use-phone-verification.ts`
- Move: `frontend/apps/web/app/(auth)/signup/_components/PhoneVerificationField.tsx` → `frontend/apps/web/app/_components/PhoneVerificationField.tsx`
- Move: `frontend/apps/web/app/(auth)/signup/_components/PhoneInput.tsx` → `frontend/apps/web/app/_components/PhoneInput.tsx`
- Modify(임포트만): `SignupStepVerify.tsx`, `SignupFormPanel.tsx`, 테스트 5개(`PhoneVerificationField.test.tsx`, `use-phone-verification.test.tsx`, `phone-verification.test.ts`, `phone-input.test.tsx`, `SignupStepVerify.test.tsx`) — 테스트 파일 위치는 유지(GradeSelect 승격 전례).

**Interfaces:**
- Produces: `@/app/_lib/phone-verification`, `@/app/_lib/use-phone-verification`, `@/app/_components/PhoneVerificationField`, `@/app/_components/PhoneInput` — Task 7~9 가 이 경로를 사용. **코드 내용 무변경**(경로만).

- [ ] **Step 1: git mv + 임포트 갱신**

```bash
cd frontend/apps/web
git mv "app/(auth)/signup/_lib/phone-verification.ts" app/_lib/phone-verification.ts
git mv "app/(auth)/signup/_lib/use-phone-verification.ts" app/_lib/use-phone-verification.ts
git mv "app/(auth)/signup/_components/PhoneVerificationField.tsx" app/_components/PhoneVerificationField.tsx
git mv "app/(auth)/signup/_components/PhoneInput.tsx" app/_components/PhoneInput.tsx
```
갱신할 임포트(전부 기계적):
- `app/_components/PhoneVerificationField.tsx`: `'../_lib/phone-verification'` → `'@/app/_lib/phone-verification'`, `'../_lib/use-phone-verification'` → `'@/app/_lib/use-phone-verification'`(type import), `'./PhoneInput'` 은 그대로(같은 폴더로 함께 이동).
- `app/_lib/use-phone-verification.ts`: `'./phone-verification'` 그대로(같은 폴더).
- `app/(auth)/signup/_components/SignupStepVerify.tsx`: `'./PhoneVerificationField'` → `'@/app/_components/PhoneVerificationField'`, `'../_lib/use-phone-verification'` → `'@/app/_lib/use-phone-verification'`.
- `app/(auth)/signup/_components/SignupFormPanel.tsx`: `'../_lib/use-phone-verification'` → `'@/app/_lib/use-phone-verification'`.
- 테스트 5개의 해당 모듈 임포트 경로를 새 경로로 갱신(상대 → `@/app/...`).
- 그 외 참조 잔재 확인: `grep -rn "signup/_lib/phone-verification\|signup/_lib/use-phone-verification\|signup/_components/PhoneInput\|signup/_components/PhoneVerificationField" apps/web` → 0건이어야 한다.

- [ ] **Step 2: 검증(무변경 확인)**

Run: `cd frontend && pnpm typecheck && pnpm --filter @duing/web exec vitest run signup && pnpm lint`
Expected: 전부 그린 — 시그니처·동작 무변경, 경로만 이동.

- [ ] **Step 3: 커밋**

```bash
git add -A && git commit -m "refactor(web): 휴대폰 인증 컴포넌트·훅을 공용 위치로 승격"
```

---

### Task 6: [FE] 타입·API 클라이언트·뮤테이션 훅

**Files:**
- Modify: `frontend/packages/types/src/user.ts`
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/hooks/src/auth.ts`, `frontend/packages/hooks/src/index.ts`
- Test: `frontend/packages/hooks/test/phoneChangePasswordReset.test.tsx`

**Interfaces:**
- Consumes: BE Task 1~4 의 계약(endpoint·상태코드·필드).
- Produces(Task 7~9 가 사용):
  - types: `ChangePhonePayload {verificationToken}` · `RequestPasswordResetPayload {studentId}` · `CompletePasswordResetPayload {verificationToken; newPassword}` · `PasswordResetSession = PhoneVerificationSession & {maskedPhone: string}`
  - client: `users.startPhoneChangeVerification(payload: StartPhoneVerificationPayload, includeQr): Promise<PhoneVerificationSession>` · `users.changePhone(payload: ChangePhonePayload): Promise<void>` · `auth.requestPasswordReset(payload: RequestPasswordResetPayload, includeQr): Promise<PasswordResetSession>` · `auth.completePasswordReset(payload: CompletePasswordResetPayload): Promise<void>`
  - hooks: `useStartPhoneChangeVerificationMutation` · `useChangePhoneMutation`(성공 시 `userQueryKeys.me()` invalidate) · `useRequestPasswordResetMutation` · `useCompletePasswordResetMutation`

- [ ] **Step 1: 실패 테스트 작성**

`packages/hooks/test/phoneChangePasswordReset.test.tsx` — 기존 `authLogout.test.tsx` 의 MSW+wrapper 패턴 재사용(setupServer, createApiClient, ApiClientProvider+QueryClientProvider wrapper, renderHook):
```tsx
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  useChangePhoneMutation,
  useCompletePasswordResetMutation,
  useRequestPasswordResetMutation,
  useStartPhoneChangeVerificationMutation,
} from '../src/auth';

// wrapper/newQueryClient 헬퍼는 같은 폴더 authLogout.test.tsx 와 동일 구성으로 작성한다.

const SESSION = {
  verificationToken: 'token-1', code: 'CODE1234', moNumber: '16663538',
  qrCode: null, expiresAt: '2099-01-01T00:00:00', expiresInSeconds: 300,
};

describe('번호 변경·비밀번호 재설정 훅', () => {
  it('번호 변경 인증 시작은 인증 전용 엔드포인트를 호출한다', async () => {
    let requestedPath = '';
    server.use(http.post('*/users/me/phone-verifications', ({ request }) => {
      requestedPath = new URL(request.url).pathname + new URL(request.url).search;
      return HttpResponse.json({ ok: true, data: SESSION, message: null }, { status: 201 });
    }));
    const { result } = renderHook(() => useStartPhoneChangeVerificationMutation(), { wrapper });
    await act(() => result.current.mutateAsync({ payload: { phone: '010-1234-5678' }, includeQr: true }));
    expect(requestedPath).toContain('/users/me/phone-verifications');
    expect(requestedPath).toContain('qr=true');
  });

  it('번호 변경 성공 시 내 정보 쿼리를 무효화한다', async () => {
    server.use(http.patch('*/users/me/phone', () =>
      HttpResponse.json({ ok: true, data: null, message: null })));
    const queryClient = newQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useChangePhoneMutation(), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ verificationToken: 'token-1' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user', 'me'] });
  });

  it('재설정 시작은 마스킹 번호가 포함된 세션을 반환한다', async () => {
    server.use(http.post('*/auth/password-resets', () =>
      HttpResponse.json({ ok: true, data: { ...SESSION, maskedPhone: '010-****-5678' }, message: null },
        { status: 202 })));
    const { result } = renderHook(() => useRequestPasswordResetMutation(), { wrapper });
    const session = await act(() =>
      result.current.mutateAsync({ payload: { studentId: '20240001' }, includeQr: false }));
    expect(session.maskedPhone).toBe('010-****-5678');
  });

  it('재설정 완료는 토큰과 새 비밀번호를 전송한다', async () => {
    let requestBody: unknown = null;
    server.use(http.post('*/auth/password-resets/complete', async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json({ ok: true, data: null, message: null }, { status: 204 });
    }));
    const { result } = renderHook(() => useCompletePasswordResetMutation(), { wrapper });
    await act(() => result.current.mutateAsync({ verificationToken: 'token-1', newPassword: 'newPass123!' }));
    expect(requestBody).toEqual({ verificationToken: 'token-1', newPassword: 'newPass123!' });
  });
});
```
(userQueryKeys.me() 실제 키는 `packages/hooks/src/userQueryKeys.ts` 를 읽어 단언값을 맞춘다. 204 가 빈 바디면 `jsonVoid` 처리에 맞춰 `HttpResponse` 를 빈 바디/`new HttpResponse(null, {status:204})` 로 조정 — 기존 `changePassword` 훅 테스트가 있으면 그 방식을 따른다.)

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/hooks test`
Expected: FAIL — 훅/클라이언트 메서드 미존재.

- [ ] **Step 3: 구현**

`packages/types/src/user.ts` — `PhoneVerificationStatus` 아래 추가:
```ts
export type ChangePhonePayload = {
  verificationToken: string;
};

export type RequestPasswordResetPayload = {
  studentId: string;
};

export type PasswordResetSession = PhoneVerificationSession & {
  maskedPhone: string;
};

export type CompletePasswordResetPayload = {
  verificationToken: string;
  newPassword: string;
};
```

`packages/api/src/client.ts` — auth 블록 타입·구현에 추가:
```ts
  requestPasswordReset(
    payload: RequestPasswordResetPayload,
    includeQr: boolean,
  ): Promise<PasswordResetSession>;
  completePasswordReset(payload: CompletePasswordResetPayload): Promise<void>;
```
```ts
      requestPasswordReset: (payload, includeQr) =>
        jsonOk<PasswordResetSession>(
          http.post('auth/password-resets', {
            json: payload,
            searchParams: includeQr ? { qr: 'true' } : undefined,
          }),
        ),
      completePasswordReset: (payload) =>
        jsonVoid(http.post('auth/password-resets/complete', { json: payload })),
```
users 블록 타입·구현에 추가:
```ts
  startPhoneChangeVerification(
    payload: StartPhoneVerificationPayload,
    includeQr: boolean,
  ): Promise<PhoneVerificationSession>;
  changePhone(payload: ChangePhonePayload): Promise<void>;
```
```ts
      startPhoneChangeVerification: (payload, includeQr) =>
        jsonOk<PhoneVerificationSession>(
          http.post('users/me/phone-verifications', {
            json: payload,
            searchParams: includeQr ? { qr: 'true' } : undefined,
          }),
        ),
      changePhone: (payload) => jsonVoid(http.patch('users/me/phone', { json: payload })),
```
(type import 4종 추가.)

`packages/hooks/src/auth.ts` — `useStartPhoneVerificationMutation` 아래 추가:
```ts
export function useStartPhoneChangeVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ payload, includeQr }: { payload: StartPhoneVerificationPayload; includeQr: boolean }) =>
      client.users.startPhoneChangeVerification(payload, includeQr),
  });
}

export function useChangePhoneMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangePhonePayload) => client.users.changePhone(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
    },
  });
}

export function useRequestPasswordResetMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ payload, includeQr }: { payload: RequestPasswordResetPayload; includeQr: boolean }) =>
      client.auth.requestPasswordReset(payload, includeQr),
  });
}

export function useCompletePasswordResetMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: CompletePasswordResetPayload) => client.auth.completePasswordReset(payload),
  });
}
```
(type import 3종 추가, `index.ts` barrel 에 4개 훅 재수출.)

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/hooks test && pnpm typecheck`
Expected: 그린.

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat(web): 번호 변경·비밀번호 재설정 API 클라이언트와 훅 추가"
```

---

### Task 7: [FE] 인증 훅 범용화 — 코어 + 래퍼 3종

**Files:**
- Modify: `frontend/apps/web/app/_lib/use-phone-verification.ts`
- Modify: `frontend/apps/web/app/_lib/phone-verification.ts`(에러 매퍼 1개 추가)
- Test: `frontend/apps/web/test/(auth)/signup/use-phone-verification.test.tsx`(기존 전부 유지 + 래퍼 케이스 추가)

**Interfaces:**
- Consumes: Task 6 의 `useStartPhoneChangeVerificationMutation`·`useRequestPasswordResetMutation`, `PasswordResetSession`.
- Produces:
  - `usePhoneVerification(phone: string)` — **기존과 완전 동일 시그니처·반환**(signup 무변경).
  - `usePhoneChangeVerification(phone: string)` — 동일 반환 형태, 발급만 인증 전용 엔드포인트, 409 메시지는 변경 문맥용.
  - `usePasswordResetVerification(studentId: string)` — 동일 반환 형태 + `maskedPhone: string | null`.
  - `PhoneVerificationController`·`PhoneVerificationFieldStatus` 익스포트 유지.

- [ ] **Step 1: 실패 테스트 추가**

`use-phone-verification.test.tsx` 의 기존 케이스는 **한 줄도 수정하지 않는다**(공개 시그니처 불변 증명). 아래 describe 2개 추가 — 하네스(MSW server, SESSION_FIXTURE, makeWrapper, fake timers)는 파일 상단 것을 그대로 재사용:
```tsx
describe('usePhoneChangeVerification', () => {
  it('발급이 인증 전용 엔드포인트로 나가고 세션을 잡는다', async () => {
    server.use(
      http.post('*/users/me/phone-verifications', () =>
        HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null }, { status: 201 })),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => usePhoneChangeVerification(VALID_PHONE), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => { await result.current.issue(false); });
    expect(result.current.status).toBe('issued');
    expect(result.current.code).toBe(SESSION_FIXTURE.code);
  });

  it('타인 소유 번호(409)면 변경 문맥의 안내를 보여준다', async () => {
    server.use(
      http.post('*/users/me/phone-verifications', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '이미 가입된 휴대폰 번호입니다.', code: 'PHONE_ALREADY_REGISTERED' },
          { status: 409 })),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => usePhoneChangeVerification(VALID_PHONE), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => { await result.current.issue(false); });
    expect(result.current.errorMessage).toBe('이미 다른 계정에서 사용 중인 번호예요.');
  });
});

describe('usePasswordResetVerification', () => {
  it('학번으로 발급하면 마스킹 번호를 노출하고 폴링 준비 상태가 된다', async () => {
    server.use(
      http.post('*/auth/password-resets', () =>
        HttpResponse.json(
          { ok: true, data: { ...SESSION_FIXTURE, maskedPhone: '010-****-5678' }, message: null },
          { status: 202 })),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => usePasswordResetVerification('20240001'), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => { await result.current.issue(false); });
    expect(result.current.status).toBe('issued');
    expect(result.current.maskedPhone).toBe('010-****-5678');
  });

  it('학번이 8자리가 아니면 발급하지 않고 안내한다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => usePasswordResetVerification('2024'), {
      wrapper: makeWrapper(queryClient),
    });
    expect(result.current.canIssue).toBe(false);
    await act(async () => { await result.current.issue(false); });
    expect(result.current.errorMessage).toBe('학번은 8자리 숫자여야 해요.');
  });

  it('학번이 바뀌면 진행 중이던 인증이 리셋된다', async () => {
    server.use(
      http.post('*/auth/password-resets', () =>
        HttpResponse.json(
          { ok: true, data: { ...SESSION_FIXTURE, maskedPhone: '010-****-5678' }, message: null },
          { status: 202 })),
    );
    const queryClient = newQueryClient();
    const { result, rerender } = renderHook(({ sid }) => usePasswordResetVerification(sid), {
      wrapper: makeWrapper(queryClient), initialProps: { sid: '20240001' },
    });
    await act(async () => { await result.current.issue(false); });
    expect(result.current.status).toBe('issued');
    rerender({ sid: '20240002' });
    expect(result.current.status).toBe('idle');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run use-phone-verification`
Expected: 신규 케이스 FAIL(래퍼 미존재), 기존 케이스 PASS.

- [ ] **Step 3: 구현**

`app/_lib/phone-verification.ts` — `mapIssueError` 아래 추가:
```ts
/** 번호 변경 문맥의 발급 에러 — 409 는 "다른 계정 사용 중" 으로 안내한다(가입 문맥과 카피 분리). */
export function mapPhoneChangeIssueError(error: unknown): string {
  if (error instanceof ApiError && (error.code === 'PHONE_ALREADY_REGISTERED' || error.status === 409)) {
    return '이미 다른 계정에서 사용 중인 번호예요.';
  }
  return mapIssueError(error);
}
```

`app/_lib/use-phone-verification.ts` — 기존 훅 본문을 **제네릭 코어로 개명**하고 래퍼 3개를 노출한다. 코어는 기존 상태머신 로직을 그대로 유지하되 4곳만 일반화한다: (1) `phone` → `resetKey`(리셋·stale 가드 키), (2) `PHONE_PATTERN` 검사 → `validateBeforeIssue()`(null=통과, string=에러 메시지), (3) `startMutation.mutateAsync(...)` → `issueSession(includeQr)` 콜백 + 로컬 `issuing` state, (4) `mapIssueError` → `issueErrorMapper` 파라미터. 전체 코드:
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useRequestPasswordResetMutation,
  useStartPhoneChangeVerificationMutation,
  useStartPhoneVerificationMutation,
  usePhoneVerificationStatusQuery,
} from '@duing/hooks';
import type { PasswordResetSession, PhoneVerificationSession } from '@duing/types';
import {
  RESEND_COOLDOWN_SECONDS,
  mapIssueError,
  mapPhoneChangeIssueError,
  mapStatusError,
} from './phone-verification';

export type PhoneVerificationFieldStatus = 'idle' | 'issued' | 'waiting' | 'verified' | 'expired';

const PHONE_PATTERN = /^010-\d{4}-\d{4}$/;
const STUDENT_ID_PATTERN = /^\d{8}$/;
const WAITING_STALL_SECONDS = 40;

type CoreOptions<S extends PhoneVerificationSession> = {
  /** 발급 전 검증 — null 이면 통과, 문자열이면 그 메시지로 발급을 막는다. */
  validateBeforeIssue: () => string | null;
  issueSession: (includeQr: boolean) => Promise<S>;
  issueErrorMapper: (error: unknown) => string;
};

/**
 * MO 인증 상태 머신 코어 — signup·번호 변경·비밀번호 재설정이 공유한다.
 * idle → (발급) → issued → (문자를 보냈어요) → waiting → (폴링 VERIFIED) → verified.
 * remainingSeconds 만료 또는 폴링 EXPIRED 시 expired 로 전이한다.
 * resetKey(전화번호·학번)가 바뀌면 idle 로 리셋 — 검증된 대상이 아닌 값으로 완료되는 것을 막는
 * UX 정합이며, 최종 방어는 서버가 세션 귀속 값 기준으로 한다.
 */
function usePhoneVerificationCore<S extends PhoneVerificationSession>(
  resetKey: string,
  { validateBeforeIssue, issueSession, issueErrorMapper }: CoreOptions<S>,
) {
  const [status, setStatus] = useState<PhoneVerificationFieldStatus>('idle');
  const [session, setSession] = useState<S | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitingSeconds, setWaitingSeconds] = useState(0);

  const previousKeyRef = useRef(resetKey);
  useEffect(() => {
    if (previousKeyRef.current === resetKey) return;
    previousKeyRef.current = resetKey;
    setStatus('idle');
    setSession(null);
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
    setWaitingSeconds(0);
  }, [resetKey]);

  // 발급(issue) 응답이 도착하기 전에 키가 바뀌면 그 결과를 무시한다 — stale dead-end 방지 (spec §14).
  const latestKeyRef = useRef(resetKey);
  latestKeyRef.current = resetKey;

  // 대기 40초가 지나면 자동 폴링을 멈추고 수동 [지금 확인]으로 전환한다(방치 세션 exists 콜 절감).
  const stalled = status === 'waiting' && waitingSeconds >= WAITING_STALL_SECONDS;

  const poll = usePhoneVerificationStatusQuery(session?.verificationToken ?? null, {
    enabled: status === 'waiting' && !stalled,
  });

  useEffect(() => {
    const polledStatus = poll.data?.status;
    if (polledStatus === 'VERIFIED') {
      setStatus('verified');
    } else if (polledStatus === 'EXPIRED') {
      setStatus('expired');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.data?.status]);

  useEffect(() => {
    if (status !== 'waiting') return;
    setErrorMessage(poll.error ? mapStatusError(poll.error) : null);
  }, [status, poll.error]);

  useEffect(() => {
    if (status !== 'issued' && status !== 'waiting') return;
    const timerId = setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1));
      if (status === 'waiting') {
        setWaitingSeconds((seconds) => seconds + 1);
      }
    }, 1000);
    return () => clearInterval(timerId);
  }, [status]);

  useEffect(() => {
    if ((status === 'issued' || status === 'waiting') && remainingSeconds === 0) {
      setStatus('expired');
    }
  }, [status, remainingSeconds]);

  async function issue(includeQr: boolean) {
    const validationError = validateBeforeIssue();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    const requestedKey = resetKey;
    setErrorMessage(null);
    setIssuing(true);
    try {
      const issuedSession = await issueSession(includeQr);
      if (latestKeyRef.current !== requestedKey) return; // 키가 바뀜 — stale 응답 무시
      setSession(issuedSession);
      setStatus('issued');
      setRemainingSeconds(issuedSession.expiresInSeconds);
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (issueError) {
      if (latestKeyRef.current !== requestedKey) return; // 키가 바뀜 — stale 에러 무시
      setErrorMessage(issueErrorMapper(issueError));
    } finally {
      setIssuing(false);
    }
  }

  function markSent() {
    if (status !== 'issued') return;
    setWaitingSeconds(0);
    setStatus('waiting');
  }

  function reset() {
    setStatus('idle');
    setSession(null);
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
    setWaitingSeconds(0);
  }

  // 스톨로 자동 폴링이 멈춘 상태에서 사용자가 문자 도착 후 직접 재확인한다(단발 조회).
  function recheck() {
    void poll.refetch();
  }

  const canIssue =
    validateBeforeIssue() === null &&
    !issuing &&
    status !== 'verified' &&
    resendCooldownSeconds === 0;

  return {
    status,
    verified: status === 'verified',
    session,
    verificationToken: session?.verificationToken ?? null,
    code: session?.code ?? '',
    moNumber: session?.moNumber ?? '',
    qrCode: session?.qrCode ?? null,
    remainingSeconds,
    resendCooldownSeconds,
    stalled,
    issuing,
    canIssue,
    errorMessage,
    issue,
    markSent,
    reset,
    recheck,
  };
}

/** 회원가입 MO 인증 — 공개 발급 엔드포인트(purpose=SIGNUP). 기존 시그니처 불변. */
export function usePhoneVerification(phone: string) {
  const startMutation = useStartPhoneVerificationMutation();
  return usePhoneVerificationCore<PhoneVerificationSession>(phone, {
    validateBeforeIssue: () =>
      PHONE_PATTERN.test(phone) ? null : '휴대폰 번호 형식이 올바르지 않아요.',
    issueSession: (includeQr) => startMutation.mutateAsync({ payload: { phone }, includeQr }),
    issueErrorMapper: mapIssueError,
  });
}

/** 전화번호 변경 재인증 — 본인 JWT 필수 발급 엔드포인트(purpose=PHONE_CHANGE). */
export function usePhoneChangeVerification(phone: string) {
  const startMutation = useStartPhoneChangeVerificationMutation();
  return usePhoneVerificationCore<PhoneVerificationSession>(phone, {
    validateBeforeIssue: () =>
      PHONE_PATTERN.test(phone) ? null : '휴대폰 번호 형식이 올바르지 않아요.',
    issueSession: (includeQr) => startMutation.mutateAsync({ payload: { phone }, includeQr }),
    issueErrorMapper: mapPhoneChangeIssueError,
  });
}

/** 비밀번호 재설정 인증 — 학번으로 시작하고 등록된 번호(마스킹)로만 인증한다 (spec §10.2). */
export function usePasswordResetVerification(studentId: string) {
  const requestMutation = useRequestPasswordResetMutation();
  const controller = usePhoneVerificationCore<PasswordResetSession>(studentId, {
    validateBeforeIssue: () =>
      STUDENT_ID_PATTERN.test(studentId) ? null : '학번은 8자리 숫자여야 해요.',
    issueSession: (includeQr) =>
      requestMutation.mutateAsync({ payload: { studentId }, includeQr }),
    issueErrorMapper: mapIssueError,
  });
  return { ...controller, maskedPhone: controller.session?.maskedPhone ?? null };
}

export type PhoneVerificationController = ReturnType<typeof usePhoneVerification>;
```

- [ ] **Step 4: 통과 + 회귀**

Run: `cd frontend && pnpm typecheck && pnpm --filter @duing/web exec vitest run signup use-phone-verification && pnpm lint`
Expected: 전부 그린 — 기존 signup 스위트(71+) 무수정 통과가 "공개 시그니처 불변" 의 증거.

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat(web): 휴대폰 인증 훅을 코어+용도별 래퍼(가입·번호변경·재설정)로 범용화"
```

---

### Task 8: [FE] 전화번호 변경 다이얼로그 + 설정 연결

**Files:**
- Create: `frontend/apps/web/app/me/settings/_components/PhoneChangeDialog.tsx`
- Modify: `frontend/apps/web/app/me/settings/_pages/SettingsPage.tsx`(전화번호 행 + 다이얼로그 마운트)
- Test: `frontend/apps/web/test/me/settings/phone-change-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 5 의 `@/app/_components/PhoneVerificationField`, Task 7 의 `usePhoneChangeVerification`, Task 6 의 `useChangePhoneMutation`, 기존 `Dialog`/`useToast`/`ApiError`.
- Produces: `<PhoneChangeDialog open onClose />`.

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/test/me/settings/phone-change-dialog.test.tsx` — 하네스는 `account-dialogs.test.tsx` 와 동일(MSW, 실제 ApiClient, in-memory storage, useAuthStore 세션 세팅, vi.mock next/navigation). 핵심 3케이스:
```tsx
it('새 번호를 인증하면 [번호 변경하기]가 활성화되고 성공 시 토스트와 함께 닫힌다', async () => {
  // MSW: POST */users/me/phone-verifications → 201 SESSION, GET 상태조회 → VERIFIED,
  //      PATCH */users/me/phone → { ok:true, data:null } — body 의 verificationToken 캡처.
  // fireEvent 로 번호 입력 → [인증 시작] → [문자를 보냈어요] → 폴링 VERIFIED(fake timers) →
  // [번호 변경하기] 클릭 → 캡처 바디가 세션 토큰과 일치 + addToast 호출 + onClose 호출 단언.
});

it('세션이 만료(403)면 인증 스텝으로 되돌리고 안내를 보여준다', async () => {
  // PATCH 가 403 { code:'PHONE_NOT_VERIFIED' } → 에러 문구 노출 + 인증 UI(인증 시작)로 복귀 단언.
});

it('닫았다 다시 열면 이전 인증 상태가 남지 않는다', async () => {
  // 인증 진행 → onClose → open 재마운트 시 idle(휴대폰 번호 입력) 단언.
});
```
(폴링은 signup `SignupFormPanel.test.tsx` 의 pollCount 클로저 + `vi.advanceTimersByTimeAsync(0)`→`(3000)` 패턴, userEvent 는 fake timers 와 함께 쓰지 말고 fireEvent — 기존 전례 유지.)

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run phone-change-dialog`
Expected: FAIL — 컴포넌트 미존재.

- [ ] **Step 3: 구현**

`PhoneChangeDialog.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useChangePhoneMutation } from '@duing/hooks';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { PhoneVerificationField } from '@/app/_components/PhoneVerificationField';
import { usePhoneChangeVerification } from '@/app/_lib/use-phone-verification';

type Props = { open: boolean; onClose: () => void };

export function PhoneChangeDialog({ open, onClose }: Props) {
  const { addToast } = useToast();
  const changePhoneMutation = useChangePhoneMutation();

  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verification = usePhoneChangeVerification(newPhone);

  // 다시 열 때 이전 인증 상태·입력이 남지 않도록 초기화한다.
  useEffect(() => {
    if (open) {
      setNewPhone('');
      setError(null);
      verification.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleChangePhone() {
    if (!verification.verificationToken) return;
    setError(null);
    changePhoneMutation.mutate(
      { verificationToken: verification.verificationToken },
      {
        onSuccess: () => {
          addToast('전화번호가 변경되었어요.');
          onClose();
        },
        onError: (mutationError) => {
          if (mutationError instanceof ApiError && mutationError.code === 'PHONE_NOT_VERIFIED') {
            // 완료 창(10분) 초과 등 — 인증 스텝으로 되돌려 재인증을 유도한다.
            verification.reset();
            setError('인증이 만료됐어요. 새 번호 인증을 다시 진행해주세요.');
            return;
          }
          setError(
            mutationError instanceof ApiError
              ? mutationError.message
              : '변경에 실패했어요. 잠시 후 다시 시도해 주세요.',
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>전화번호 변경</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          새 번호로 문자 인증을 완료하면 변경돼요. 인증 문자 1건이 필요해요.
        </DialogDescription>

        <div className="flex flex-col gap-4">
          <PhoneVerificationField
            phone={newPhone}
            onPhoneChange={setNewPhone}
            status={verification.status}
            code={verification.code}
            moNumber={verification.moNumber}
            qrCode={verification.qrCode}
            remainingSeconds={verification.remainingSeconds}
            resendCooldownSeconds={verification.resendCooldownSeconds}
            issuing={verification.issuing}
            canIssue={verification.canIssue}
            errorMessage={verification.errorMessage}
            stalled={verification.stalled}
            onIssue={verification.issue}
            onSent={verification.markSent}
            onReset={verification.reset}
            onRecheck={verification.recheck}
          />

          {error && <p className="text-[12.5px] text-coral">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={changePhoneMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleChangePhone}
              disabled={!verification.verified || changePhoneMutation.isPending}
              className="btn btn-primary btn-sm"
            >
              {changePhoneMutation.isPending ? '변경 중…' : '번호 변경하기'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`SettingsPage.tsx` — 상태 `const [phoneOpen, setPhoneOpen] = useState(false);` 추가, 전화번호 행을 이름 행과 동일한 action 패턴으로:
```tsx
<SettingsRow
  label="전화번호"
  value={user?.phone ?? '—'}
  action={
    <button type="button" onClick={() => setPhoneOpen(true)} className="btn btn-ghost btn-sm">
      변경
    </button>
  }
/>
```
(이름 행의 실제 버튼 클래스·구조를 파일에서 확인해 동일하게 맞춘다.) 다이얼로그 마운트를 기존 다이얼로그들 옆에 추가:
```tsx
<PhoneChangeDialog open={phoneOpen} onClose={() => setPhoneOpen(false)} />
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run phone-change-dialog account-dialogs && pnpm typecheck`
Expected: 그린.

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat(web): 설정에 재인증 기반 전화번호 변경 다이얼로그 추가"
```

---

### Task 9: [FE] `/forgot-password` 페이지 + 미들웨어 + 로그인 링크

**Files:**
- Create: `frontend/apps/web/app/(auth)/forgot-password/page.tsx`, `frontend/apps/web/app/(auth)/forgot-password/_components/ForgotPasswordPanel.tsx`
- Modify: `frontend/apps/web/middleware.ts`
- Modify: `frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx:190-201`
- Test: `frontend/apps/web/test/(auth)/forgot-password/ForgotPasswordPanel.test.tsx`

**Interfaces:**
- Consumes: Task 7 `usePasswordResetVerification`, Task 6 `useCompletePasswordResetMutation`, Task 5 `PhoneVerificationField`, `passwordSchema`(@duing/schemas), `useToast`, `ApiError`.
- Produces: 라우트 `/forgot-password`.

- [ ] **Step 1: 실패 테스트 작성**

`ForgotPasswordPanel.test.tsx` — 하네스는 `SignupFormPanel.test.tsx` 와 동일(MSW·fireEvent·fake timers·mockRouterReplace). 케이스 4개:
```tsx
it('학번을 입력해 인증을 시작하면 마스킹된 등록 번호를 안내한다', async () => {
  // POST */auth/password-resets → 202 {...SESSION, maskedPhone:'010-****-5678'} →
  // '010-****-5678' 텍스트 + 인증 UI(코드) 노출 단언.
});

it('인증이 완료되면 새 비밀번호 입력 폼이 나타난다', async () => {
  // 시작 → 문자를 보냈어요 → 폴링 VERIFIED → '새 비밀번호' 입력 필드 + [비밀번호 재설정] 버튼 노출.
});

it('새 비밀번호 재설정에 성공하면 로그인으로 이동한다', async () => {
  // complete 204 목킹(바디 캡처) → 비번/확인 입력 → 제출 → 캡처 바디 {verificationToken, newPassword}
  // 일치 + mockRouterReplace '/login' 호출 단언.
});

it('완료가 403 이면 인증 단계로 되돌아간다', async () => {
  // complete 403 PHONE_NOT_VERIFIED → 학번 입력 스텝(인증 시작 버튼) 복귀 + 에러 문구 단언.
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run ForgotPasswordPanel`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: 구현**

`page.tsx` — login/page.tsx 의 구조를 따르는 서버 컴포넌트. 좌측 `<aside>` 는 login 의 다크 스플릿 패널 마크업을 간소화 복제(로고 + "JOIN DUING" 대신 "RESET PASSWORD" + 한 줄 카피), 우측 `<ForgotPasswordPanel />`(Suspense 불필요 — 검색파라미터 미사용):
```tsx
import { ForgotPasswordPanel } from './_components/ForgotPasswordPanel';

export const metadata = { title: '비밀번호 재설정' };

export default function ForgotPasswordPage() {
  return (
    <div className="duing flex min-h-dvh">
      {/* 좌측 장식 패널 — login/page.tsx 의 aside 구조를 따르되 카피만 재설정 문맥으로. 구현 시
          login/page.tsx 를 열어 브랜드 마크·클래스를 그대로 복제한다(마크업 드리프트 방지). */}
      <aside className="relative hidden overflow-hidden lg:flex lg:w-[420px] lg:shrink-0 lg:flex-col xl:w-[480px] bg-ink-deep">
        {/* 로고 블록: login 과 동일 복제 */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide16 text-sage-soft">RESET PASSWORD</p>
          <h2 className="text-3xl font-bold leading-snug" style={{ color: '#fff' }}>
            문자 인증으로<br />비밀번호를 다시 설정해요
          </h2>
        </div>
      </aside>
      <ForgotPasswordPanel />
    </div>
  );
}
```

`ForgotPasswordPanel.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@duing/api';
import { useCompletePasswordResetMutation } from '@duing/hooks';
import { passwordSchema } from '@duing/schemas';
import { PhoneVerificationField } from '@/app/_components/PhoneVerificationField';
import { usePasswordResetVerification } from '@/app/_lib/use-phone-verification';
import { useToast } from '@/app/_components/toast/ToastProvider';

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3.5 py-3 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50';

export function ForgotPasswordPanel() {
  const router = useRouter();
  const { addToast } = useToast();
  const completeMutation = useCompletePasswordResetMutation();

  const [studentId, setStudentId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verification = usePasswordResetVerification(studentId);

  async function handleComplete(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    if (!passwordSchema.safeParse(newPassword).success) {
      setError('새 비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상이어야 해요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않아요.');
      return;
    }
    if (!verification.verificationToken) return;
    setError(null);
    try {
      await completeMutation.mutateAsync({
        verificationToken: verification.verificationToken,
        newPassword,
      });
      addToast('비밀번호가 재설정되었어요. 새 비밀번호로 로그인해 주세요.');
      router.replace('/login');
    } catch (completeError) {
      if (completeError instanceof ApiError && completeError.code === 'PHONE_NOT_VERIFIED') {
        // 완료 창(10분) 초과 등 — 인증 스텝으로 복귀시켜 재인증을 유도한다 (spec §5.1).
        verification.reset();
        setNewPassword('');
        setConfirmPassword('');
        setError('인증이 만료됐어요. 처음부터 다시 진행해주세요.');
        return;
      }
      setError(
        completeError instanceof ApiError
          ? completeError.message
          : '재설정에 실패했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-cream">
      <nav className="flex shrink-0 items-center justify-between px-8 pt-6">
        <Link
          href="/login"
          className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal"
        >
          ← 로그인으로
        </Link>
      </nav>

      <main className="flex flex-1 justify-center px-8 py-10">
        <div className="w-full max-w-[520px]">
          <h1 className="mb-2 text-[1.75rem] font-bold leading-tight tracking-tightx text-ink-deep">
            비밀번호를 잊으셨나요?
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-charcoal-2">
            가입 시 인증한 <strong className="text-ink-deep">등록된 번호</strong>로 문자 인증하면 새 비밀번호를
            설정할 수 있어요.
          </p>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
            >
              {error}
            </div>
          )}

          {verification.status === 'idle' ? (
            <div>
              <label htmlFor="reset-student-id" className="mb-1.5 block text-sm font-medium text-charcoal">
                학번
              </label>
              <div className="flex gap-2">
                <input
                  id="reset-student-id"
                  required
                  pattern="\d{8}"
                  inputMode="numeric"
                  maxLength={8}
                  value={studentId}
                  onChange={(changeEvent) =>
                    setStudentId(changeEvent.target.value.replace(/\D/g, '').slice(0, 8))
                  }
                  placeholder="8자리 숫자"
                  className={inputCls}
                />
                <button
                  type="button"
                  disabled={!verification.canIssue}
                  onClick={() => verification.issue(true)}
                  className="btn btn-primary shrink-0 whitespace-nowrap disabled:opacity-50"
                >
                  {verification.issuing ? '확인 중…' : '인증 시작'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-charcoal-3">
                등록된 번호로만 인증할 수 있어요 · 번호가 기억나지 않으면 총동아리연합회에 문의해주세요
              </p>
              {verification.errorMessage && (
                <p className="mt-2 text-xs text-coral" aria-live="polite">
                  {verification.errorMessage}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {verification.maskedPhone && !verification.verified && (
                <p className="rounded-md border border-line bg-paper px-3.5 py-2.5 text-sm text-charcoal-2">
                  등록된 번호 <strong className="text-ink">{verification.maskedPhone}</strong> 로 아래 코드를
                  문자 전송해주세요.
                </p>
              )}

              <PhoneVerificationField
                phone={verification.maskedPhone ?? ''}
                onPhoneChange={() => undefined}
                status={verification.status}
                code={verification.code}
                moNumber={verification.moNumber}
                qrCode={verification.qrCode}
                remainingSeconds={verification.remainingSeconds}
                resendCooldownSeconds={verification.resendCooldownSeconds}
                issuing={verification.issuing}
                canIssue={verification.canIssue}
                errorMessage={verification.errorMessage}
                stalled={verification.stalled}
                onIssue={verification.issue}
                onSent={verification.markSent}
                onReset={verification.reset}
                onRecheck={verification.recheck}
              />

              {verification.verified && (
                <form className="space-y-4" onSubmit={handleComplete}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-charcoal">
                        새 비밀번호
                      </label>
                      <input
                        id="reset-password"
                        required
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(changeEvent) => setNewPassword(changeEvent.target.value)}
                        placeholder="••••••••"
                        className={inputCls}
                      />
                      <p className="mt-1.5 text-xs text-charcoal-3">영문/숫자/특수문자 중 2종, 8~20자</p>
                    </div>
                    <div>
                      <label
                        htmlFor="reset-password-confirm"
                        className="mb-1.5 block text-sm font-medium text-charcoal"
                      >
                        새 비밀번호 확인
                      </label>
                      <input
                        id="reset-password-confirm"
                        required
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(changeEvent) => setConfirmPassword(changeEvent.target.value)}
                        placeholder="••••••••"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={completeMutation.isPending}
                    className="btn btn-primary btn-big w-full disabled:opacity-50"
                  >
                    {completeMutation.isPending ? '재설정 중…' : '비밀번호 재설정'}
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-sm text-charcoal-2">
            비밀번호가 기억나셨나요?{' '}
            <Link
              href="/login"
              className="font-medium text-charcoal underline underline-offset-2 transition-colors hover:text-ink"
            >
              로그인
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
```

`middleware.ts` — 인증 사용자 리다이렉트 조건과 matcher 에 추가:
```ts
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/forgot-password")) {
```
```ts
  matcher: [
    "/login",
    "/signup",
    "/forgot-password",
    "/apply/:path*",
    "/me/:path*",
    "/manage/:path*",
    "/admin/:path*",
  ],
```

`LoginFormPanel.tsx` — 기존 `<a href="/forgot-password">` 를 파일 내 다른 링크들과 동일하게 `next/link` 로:
```tsx
<Link
  href="/forgot-password"
  className="text-xs text-charcoal-2 underline underline-offset-2 transition-colors hover:text-charcoal"
>
  비밀번호를 잊으셨나요?
</Link>
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run ForgotPasswordPanel LoginFormPanel && pnpm typecheck && pnpm lint`
Expected: 그린.

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat(web): 문자 인증 기반 /forgot-password 비밀번호 재설정 페이지 추가"
```

---

### Task 10: 전체 검증

**Files:** 없음(검증 전용).

- [ ] **Step 1: BE·FE 전체 그린**

```bash
cd backend && ./gradlew test          # BUILD SUCCESSFUL, 전체 스위트
cd ../frontend && pnpm typecheck && pnpm lint && pnpm --filter @duing/web exec vitest run && pnpm --filter @duing/hooks test && pnpm --filter @duing/schemas test
```
Expected: 전부 그린 — 신규 경고 0(기존 무관 경고 3건만).

- [ ] **Step 2: 시각 QA(로컬)**

백엔드 로컬 기동(MO stub 또는 octomo) + 프론트 `:3000` — ① 설정 → 전화번호 [변경] → 새 번호 인증 → 변경 → 행 갱신 확인, ② 로그아웃 → 로그인의 "비밀번호를 잊으셨나요?" → 학번 → 마스킹 번호 확인 → 인증 → 새 비번 → 재로그인, ③ 로그인 상태에서 `/forgot-password` 접근 시 `/me` 리다이렉트. QA 후 dev 서버 종료.

- [ ] **Step 3: 정리**

```bash
git status --short   # 클린
git log --oneline develop..HEAD   # Task 1~9 커밋 확인
```

---

## Self-Review

**1. Spec coverage** — §7.5(PATCH phone·updateProfile 은 PR2 에서 이미 phone 제거·소급 인증 허용) → Task 1·2. §7.6/§10.2(시작 202+masked/미존재 400/complete 204/tokenVersion bump/등록 번호로만) → Task 3·4·9. §7.1 PHONE_CHANGE 발급(본인 JWT·타인 409) → Task 1(전용 엔드포인트로 이탈, Global Constraints 에 근거 명시). §7.8 에러 코드 → Task 1~4. §5.1 완료 창 10분 → 기존 `VerificationPurpose.completionValidity()` 재사용 + 만료 테스트(Task 2·4). §11 학번당 3회 → Task 3. §10.1 다이얼로그 플로우 → Task 8. §14 FE 구조(훅 재사용·신규 훅 명명) → Task 6·7. 갭 없음. 스키마 변경 없음(V79 에 target_user_id 존재 확인됨).
**2. Placeholder scan** — 테스트 하네스 헬퍼(signupAndLogin 등)는 기존 테스트 파일의 실제 헬퍼 재사용을 명시(File Structure 공통 주의)했고, 로직·단언은 완전 코드로 제공. TBD/TODO 없음.
**3. Type consistency** — `IssuePhoneVerificationCommand(phone, purpose, includeQr, targetUserId)` 를 Task 1 정의 → Task 3 사용 일치. `upsert(phone, token, purpose, targetUserId, now)` Task 1 정의 → 전 호출부 갱신. FE `usePasswordResetVerification` 반환 `maskedPhone` ← Task 6 `PasswordResetSession.maskedPhone` 일치. `useStartPhoneChangeVerificationMutation`/`useChangePhoneMutation`/`useRequestPasswordResetMutation`/`useCompletePasswordResetMutation` 명칭이 Task 6 정의 = Task 7·8·9 사용 일치. `PhoneVerificationField` 16프롭 시그니처 무변경(Task 8·9 는 기존 프롭만 전달).
