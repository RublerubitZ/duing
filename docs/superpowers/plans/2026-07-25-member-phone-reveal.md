# 멤버 원본 연락처 조회 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회장이 상세 패널에서 명시적으로 요청했을 때만 회원의 원본 전화번호를 조회·복사할 수 있게 하고, 그 조회를 감사 로그로 남긴다.

**Architecture:** 원본 번호 전용 조회 엔드포인트(`GET /clubs/{clubId}/members/{memberId}/phone`)를 추가한다. 기존 목록·내보내기 API 는 그대로 마스킹만 제공한다. 백엔드는 순수 읽기를 유지하고 감사는 구조화 로그로만 남긴다. 프론트는 React Query 뮤테이션으로 조회해 캐시에 원본이 남지 않게 하고, 노출 상태는 컴포넌트 로컬에 둔다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers · Next.js 15 / React 19 / TanStack Query / Vitest + Testing Library

Spec: `docs/superpowers/specs/2026-07-25-member-phone-reveal-design.md`
브랜치: `feat/member-phone-reveal` (develop 기반, docs 커밋 `34ce75c4`)

## Global Constraints

- 원본 전화번호는 **이 엔드포인트로만** 내려간다. `GET /clubs/{clubId}/members` 와 `…/members/export` 응답 형태는 변경 금지.
- 권한은 **LEADER 전용**. `clubAuthService.requireLeader(requesterId, clubId)` 를 그대로 사용한다(회장 검증 + 비-ACTIVE 동아리 차단 포함).
- 조회 서비스는 **DB 쓰기를 하지 않는다**. `@Transactional(readOnly = true)` 유지.
- 감사 로그 형식(자구 그대로): `member phone view: clubId={}, actorUserId={}, targetMemberId={}, targetUserId={}, action=PHONE_VIEW`
- **번호 값은 로그에 넣지 않는다.**
- 응답에 `Cache-Control: no-store` 를 실는다.
- 404 는 "그 동아리에 없는 멤버" 를 뜻하며 미존재/타 동아리를 구분하지 않는다.
- 프론트는 **마스킹 문자열을 클립보드에 넣는 경로를 만들지 않는다.** 복사는 조회로 받은 원본만.
- 조회 성공 시 [번호 보기] 버튼은 사라지고 [복사]만 남는다. 조회 중에는 [번호 보기]가 `disabled`.
- 번호 보기 버튼은 **상세 패널에만** 둔다. `MemberTable`(표·모바일 카드)은 변경 금지.
- 커밋 메시지는 Conventional Commits + 한국어 본문. `Co-Authored-By` / `🤖 Generated` 라인 금지.
- 구현자는 push·PR 생성·브랜치 생성을 하지 않는다. 로컬 커밋만.

---

### Task 1: 원본 연락처 조회 API (백엔드)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MemberPhoneResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java` (export 메서드 아래에 선언 추가)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java` (exportMembers 구현 아래)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java` (인터페이스에 메서드 추가)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberQueryService.java` (getMembersForExport 아래)
- Test: `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberPhoneControllerTest.java`

**Interfaces:**
- Consumes: `ClubAuthService.requireLeader(Long userId, Long clubId): ClubMember` (기존), `ClubMemberRepository.findById(Long): Optional<ClubMember>` (기존), `ClubMemberException.NotFound` (404), `PhoneMasker.mask(String)` (기존, 이 태스크에서는 사용하지 않음)
- Produces: `ClubMemberQueryService.getMemberPhone(Long clubId, Long memberId, Long requesterId): String` — 원본 번호 문자열. `MemberPhoneResponse(String phone)` — 응답 record. HTTP 계약: `GET /api/v1/clubs/{clubId}/members/{memberId}/phone` → 200 `{"ok":true,"data":{"phone":"010-1234-5678"},"message":null}`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberPhoneControllerTest.java` 를 새로 만든다. 픽스처 헬퍼는 같은 패키지의 `ClubMemberExportControllerTest` 와 동일한 방식(리플렉션으로 status 를 ACTIVE 로 세팅)을 쓴다.

```java
package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.GeneralClubMemberQueryService;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubMemberPhoneControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private User strangerUser;
    private Club club;
    private ClubMember memberMembership;
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("연락처리더");
        officerUser = saveUser("연락처임원");
        memberUser = saveUser("연락처부원");
        strangerUser = saveUser("연락처외부");
        club = saveActiveClub("연락처조회동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        memberMembership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("회장이 조회하면 마스킹되지 않은 원본 번호를 반환한다")
    void leaderGetsRawPhone() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.phone", equalTo(memberUser.getPhone()));
    }

    @Test
    @DisplayName("원본 번호 응답은 캐시되지 않도록 no-store 를 지정한다")
    void responseIsNotCacheable() {
        String cacheControl = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .extract().header(HttpHeaders.CACHE_CONTROL);

        assertThat(cacheControl).contains("no-store");
    }

    @Test
    @DisplayName("운영진은 원본 번호를 조회할 수 없다 — 연락처 원본은 회장 전용")
    void officerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("부원은 원본 번호를 조회할 수 없다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버는 원본 번호를 조회할 수 없다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리의 멤버 번호를 조회하면 404 — 존재 여부를 구분해 알려주지 않는다")
    void foreignMemberIsNotFound() throws Exception {
        Club otherClub = saveActiveClub("연락처타동아리");
        ClubMember foreignMembership =
                clubMemberRepository.save(ClubMember.asLeader(otherClub, strangerUser));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), foreignMembership.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("존재하지 않는 멤버를 조회하면 404")
    void unknownMemberIsNotFound() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone", club.getId(), 99_999_999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("비활동 동아리에서는 회장도 원본 번호를 조회할 수 없다")
    void nonActiveClubIsBlocked() throws Exception {
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.INACTIVE);
        clubRepository.save(club);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 조회하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    @Test
    @DisplayName("원본 조회 시 누가·누구를 봤는지 구조화 로그로 남긴다 (번호 값은 로그에 없다)")
    void phoneViewWritesStructuredLog() {
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(GeneralClubMemberQueryService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);

        try {
            RestAssured
                    .given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .when()
                        .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                                club.getId(), memberMembership.getId())
                    .then()
                        .statusCode(HttpStatus.OK.value());

            assertThat(appender.list)
                    .anySatisfy(event -> {
                        String message = event.getFormattedMessage();
                        assertThat(message).contains("member phone view");
                        assertThat(message).contains("action=PHONE_VIEW");
                        assertThat(message).contains("actorUserId=" + leaderUser.getId());
                        assertThat(message).contains("targetUserId=" + memberUser.getId());
                        assertThat(message).doesNotContain(memberUser.getPhone());
                    });
        } finally {
            serviceLogger.detachAppender(appender);
        }
    }

    @Test
    @DisplayName("멤버 목록 응답에는 여전히 원본 번호가 없다 — 원본은 전용 API 로만 나간다")
    void listStillMasksPhone() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.phoneMasked", org.hamcrest.Matchers.everyItem(
                            org.hamcrest.Matchers.not(org.hamcrest.Matchers.equalTo(memberUser.getPhone()))));
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed-" + unique,
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                String.format("010-%04d-%04d", unique % 10_000, (unique / 7) % 10_000)
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

**주의:** `saveUser` / `saveActiveClub` 의 시그니처(`User.create(...)` 인자 순서·개수, `Club.create(...)`)는 반드시 같은 패키지의 `ClubMemberExportControllerTest` 실코드를 열어 그대로 복사한다. 위 코드는 그 파일 기준으로 작성했으나, 어긋나면 실코드가 정답이다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && ./gradlew test --tests '*ClubMemberPhoneControllerTest*'`
Expected: FAIL — 엔드포인트가 없어 404 (또는 컴파일 에러 없이 전부 실패)

- [ ] **Step 3: 응답 DTO 추가**

`backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MemberPhoneResponse.java`

```java
package com.duing.domain.clubmember.controller.dto.response;

/** 회장이 명시적으로 조회한 회원의 원본 연락처. 목록·export 응답은 계속 마스킹만 제공한다. */
public record MemberPhoneResponse(String phone) {

    public static MemberPhoneResponse from(String phone) {
        return new MemberPhoneResponse(phone);
    }
}
```

- [ ] **Step 4: 서비스 인터페이스에 메서드 추가**

`ClubMemberQueryService.java` 의 `getMembersForExport` 선언 아래에 추가한다.

```java
    /**
     * 회원의 원본 연락처를 반환한다. LEADER 전용이며 조회 사실을 구조화 로그로 남긴다.
     * 목록·export 는 계속 마스킹만 제공하고, 원본은 이 경로로만 나간다.
     */
    String getMemberPhone(Long clubId, Long memberId, Long requesterId);
```

- [ ] **Step 5: 서비스 구현 추가**

`GeneralClubMemberQueryService.java` 의 `getMembersForExport` 메서드 아래에 추가한다. 클래스 레벨 `@Transactional(readOnly = true)` 를 그대로 쓰고 DB 쓰기를 하지 않는다.

```java
    @Override
    public String getMemberPhone(Long clubId, Long memberId, Long requesterId) {
        clubAuthService.requireLeader(requesterId, clubId);
        ClubMember target = clubMemberRepository.findById(memberId)
                .orElseThrow(ClubMemberException.NotFound::new);
        // 다른 동아리의 멤버 id 로 남의 번호를 긁는 경로를 막는다. 미존재와 구분하지 않아 존재 여부를 숨긴다.
        if (!target.getClub().getId().equals(clubId)) {
            throw new ClubMemberException.NotFound();
        }
        // 개인정보 원본 열람은 그 자체가 감사 대상 행위다. 번호 값은 절대 남기지 않는다.
        log.info("member phone view: clubId={}, actorUserId={}, targetMemberId={}, targetUserId={}, action=PHONE_VIEW",
                clubId, requesterId, memberId, target.getUser().getId());
        return target.getUser().getPhone();
    }
```

import 추가: `com.duing.domain.clubmember.entity.ClubMember`, `com.duing.domain.clubmember.exception.ClubMemberException` (이미 있으면 생략).

- [ ] **Step 6: API 인터페이스에 선언 추가**

`ClubMemberApi.java` 의 `exportMembers` 선언 아래에 추가한다. `@ApiResponses` 사용 전례는 `domain/user/api/UserApi.java` 에 있다.

```java
    @Operation(summary = "회원 원본 연락처 조회 (LEADER)",
            description = "회장 전용. 마스킹되지 않은 원본 번호를 반환하며, 조회 사실(조회자·대상·시각)을 감사 로그로 남긴다. "
                    + "응답은 캐시하지 않는다(no-store). 목록·export 는 계속 마스킹만 제공한다.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "원본 연락처"),
            @ApiResponse(responseCode = "403",
                    description = "회장이 아니거나, 동아리가 ACTIVE 가 아님", content = @Content),
            @ApiResponse(responseCode = "404",
                    description = "해당 동아리에 없는 멤버 — 존재하지 않는 memberId 와 타 동아리 memberId 를 구분하지 않는다(존재 은닉)",
                    content = @Content)
    })
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members/{memberId}/phone")
    ResponseEntity<ApiResponse<MemberPhoneResponse>> getMemberPhone(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

import 추가: `com.duing.domain.clubmember.controller.dto.response.MemberPhoneResponse`, `io.swagger.v3.oas.annotations.media.Content`, `io.swagger.v3.oas.annotations.responses.ApiResponse`.

**주의:** 이 파일의 `ApiResponse` 는 프로젝트 공통 응답 래퍼(`com.duing.global.response.ApiResponse`)와 Swagger 어노테이션(`io.swagger.v3.oas.annotations.responses.ApiResponse`)이 이름 충돌한다. `UserApi.java` 가 이 충돌을 어떻게 처리했는지 열어 보고 같은 방식을 따른다(FQCN 또는 import 별칭).

- [ ] **Step 7: 컨트롤러 구현 추가**

`ClubMemberController.java` 의 `exportMembers` 구현 아래에 추가한다.

```java
    @Override
    public ResponseEntity<ApiResponse<MemberPhoneResponse>> getMemberPhone(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        String phone = clubMemberQueryService.getMemberPhone(clubId, memberId, currentUser.id());
        // 개인정보 응답이 브라우저·중간 캐시에 남지 않게 한다(패널을 닫으면 사라지는 UX 와 정합).
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(MemberPhoneResponse.from(phone)));
    }
```

import 추가: `com.duing.domain.clubmember.controller.dto.response.MemberPhoneResponse`, `org.springframework.http.CacheControl`.

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests '*ClubMemberPhoneControllerTest*'`
Expected: BUILD SUCCESSFUL, 11개 테스트 통과

- [ ] **Step 9: 백엔드 전체 테스트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (출력에서 직접 확인 — `| tail` 로 exit code 를 가리지 말 것)

- [ ] **Step 10: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/clubmember backend/src/test/java/com/duing/domain/clubmember
git commit -m "feat(backend): 회원 원본 연락처 조회 API — 회장 전용·감사 로그·no-store

목록과 내보내기는 계속 마스킹만 제공하고, 원본은 회장이 명시적으로 요청한
이 경로로만 내려간다. 조회 사실은 구조화 로그로 남기되 번호 값은 남기지 않는다.
조회 서비스는 DB 쓰기 없이 순수 읽기를 유지한다."
```

---

### Task 2: 타입·API 클라이언트·훅 (프론트)

**Files:**
- Modify: `frontend/packages/types/src/clubmember.ts` (`ClubMemberExportRow` 선언 아래)
- Modify: `frontend/packages/api/src/client.ts` (인터페이스: `membersExport` 선언 아래 / 구현: `membersExport` 구현 아래)
- Modify: `frontend/packages/hooks/src/clubs.ts` (`useClubMembersExportMutation` 아래)
- Test: `frontend/packages/hooks/test/memberPhone.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 HTTP 계약 `GET /clubs/{clubId}/members/{memberId}/phone` → `{ phone: string }`
- Produces:
  - `type ClubMemberPhone = { phone: string }` (`@duing/types`)
  - `client.clubs.memberPhone(clubId: number, memberId: number): Promise<ClubMemberPhone>`
  - `useMemberPhoneMutation(clubId: number)` — `mutateAsync(memberId: number): Promise<ClubMemberPhone>`

- [ ] **Step 1: 실패하는 훅 테스트 작성**

`frontend/packages/hooks/test/memberPhone.test.tsx` 를 새로 만든다. 같은 디렉터리의 기존 훅 테스트(예: `memberGeneration.test.tsx`)의 wrapper·MSW 설정 방식을 그대로 따른다.

```tsx
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, useMemberPhoneMutation } from '../src';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientProvider>
  );
}

describe('useMemberPhoneMutation', () => {
  it('memberId 로 원본 연락처를 조회한다', async () => {
    server.use(
      http.get('*/clubs/7/members/3/phone', () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );

    const { result } = renderHook(() => useMemberPhoneMutation(7), { wrapper });
    const phone = await result.current.mutateAsync(3);

    expect(phone).toEqual({ phone: '010-1234-5678' });
  });

  it('403 이면 에러로 끝난다 — 원본을 표시하면 안 되는 경우', async () => {
    server.use(
      http.get('*/clubs/7/members/3/phone', () =>
        HttpResponse.json(
          { ok: false, message: '해당 동아리의 회장만 가능한 작업입니다.', data: null },
          { status: 403 },
        ),
      ),
    );

    const { result } = renderHook(() => useMemberPhoneMutation(7), { wrapper });

    await expect(result.current.mutateAsync(3)).rejects.toThrow();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && pnpm --filter @duing/hooks test -- --run test/memberPhone.test.tsx`
Expected: FAIL — `useMemberPhoneMutation` 이 export 되지 않음

- [ ] **Step 3: 타입 추가**

`frontend/packages/types/src/clubmember.ts` 의 `ClubMemberExportRow` 선언 아래에 추가한다.

```ts
/**
 * 회장이 명시적으로 조회한 원본 연락처. 목록(ClubMember)은 phoneMasked 만 제공하며,
 * 원본은 전용 API 응답으로만 존재한다.
 */
export type ClubMemberPhone = {
  phone: string;
};
```

`packages/types/src/index.ts` 가 `export * from './clubmember'` 형태면 추가 작업이 없다. 개별 재export 라면 `ClubMemberPhone` 을 추가한다(파일을 열어 확인).

- [ ] **Step 4: API 클라이언트 메서드 추가**

`frontend/packages/api/src/client.ts` 의 인터페이스에서 `membersExport` 선언 아래:

```ts
    // 원본 연락처. 회장 전용이며 호출 자체가 백엔드 감사 로그로 남는다 — 화면에 필요할 때만 부른다.
    memberPhone(clubId: number, memberId: number): Promise<ClubMemberPhone>;
```

같은 파일 구현부에서 `membersExport` 구현 아래:

```ts
      memberPhone: (clubId, memberId) =>
        jsonOk<ClubMemberPhone>(http.get(`clubs/${clubId}/members/${memberId}/phone`)),
```

`ClubMemberPhone` 을 `@duing/types` import 목록에 추가한다.

- [ ] **Step 5: 훅 추가**

`frontend/packages/hooks/src/clubs.ts` 의 `useClubMembersExportMutation` 아래:

```ts
/**
 * 회원 원본 연락처 조회. 쿼리가 아니라 뮤테이션인 이유는 캐시를 남기지 않기 위해서다 —
 * 캐시에 원본이 남으면 패널을 다시 열었을 때 감사 로그 없이 번호가 되살아나고,
 * "패널을 닫으면 다시 마스킹" 정책이 무너진다.
 */
export function useMemberPhoneMutation(clubId: number) {
  const client = useApiClient();
  return useMutation({
    mutationFn: (memberId: number): Promise<ClubMemberPhone> =>
      client.clubs.memberPhone(clubId, memberId),
  });
}
```

`ClubMemberPhone` 을 이 파일의 `@duing/types` import 에 추가하고, `packages/hooks/src/index.ts` 에 `useMemberPhoneMutation` 을 재export 한다(같은 파일의 `useClubMembersExportMutation` 이 어떻게 export 되는지 보고 동일하게).

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/hooks test -- --run test/memberPhone.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: 커밋**

```bash
git add frontend/packages
git commit -m "feat(frontend): 원본 연락처 조회 타입·클라이언트·훅

캐시에 원본이 남으면 재열람이 감사 로그 없이 이뤄지므로 쿼리가 아닌 뮤테이션으로 둔다."
```

---

### Task 3: 상세 패널 번호 보기·복사 UX

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberDetailPanel.tsx` (`BasicInfoSection` 과 `ContactValue`)
- Test: `frontend/apps/web/test/manage/members/member-detail-panel.test.tsx` (기존 "연락처 표시" describe 확장)

**Interfaces:**
- Consumes: `useMemberPhoneMutation(clubId)` (Task 2), `ClubMember.phoneMasked: string | null`, `ButtonSpinner` (`@/components/loading/Spinner`, 기존 import)
- Produces: 없음(내부 컴포넌트)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/members/member-detail-panel.test.tsx` 의 기존 `describe('MemberDetailPanel — 연락처 표시', …)` 블록을 아래로 교체한다. 이 파일 상단에는 이미 `server`(MSW), `renderPanel`, `member()` 헬퍼가 있으니 그대로 쓴다. `CLUB_ID`·`MEMBER_ID` 상수도 기존 것을 쓴다.

```tsx
describe('MemberDetailPanel — 연락처 표시', () => {
  it('마스킹된 번호를 그대로 보여준다', () => {
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });
    expect(screen.getByText('010-****-5678')).toBeInTheDocument();
  });

  it('연락처가 없으면 "—" 이고 번호 보기 버튼도 없다', () => {
    renderPanel({ member: member({ phoneMasked: null }) });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '번호 보기' })).not.toBeInTheDocument();
  });

  it('회장이 아니면 번호 보기 버튼이 없다', () => {
    renderPanel({ viewerRole: 'OFFICER', member: member({ phoneMasked: '010-****-5678' }) });
    expect(screen.queryByRole('button', { name: '번호 보기' })).not.toBeInTheDocument();
  });

  it('조회 전에는 복사 버튼이 없다 — 마스킹 값이 복사되는 경로를 만들지 않는다', () => {
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });
    expect(screen.getByRole('button', { name: '번호 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연락처 복사' })).not.toBeInTheDocument();
  });

  it('번호 보기 성공 시 원본을 표시하고 번호 보기 버튼은 사라진다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));

    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.queryByText('010-****-5678')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '번호 보기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연락처 복사' })).toBeInTheDocument();
  });

  it('복사는 마스킹이 아니라 조회한 원본을 클립보드에 넣는다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));
    await userEvent.click(await screen.findByRole('button', { name: '연락처 복사' }));

    expect(writeText).toHaveBeenCalledWith('010-1234-5678');
    expect(writeText).not.toHaveBeenCalledWith('010-****-5678');
  });

  it('조회에 실패하면 마스킹을 유지하고 복사 버튼도 내주지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json(
          { ok: false, message: '해당 동아리의 회장만 가능한 작업입니다.', data: null },
          { status: 403 },
        ),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));

    expect(await screen.findByText('해당 동아리의 회장만 가능한 작업입니다.')).toBeInTheDocument();
    expect(screen.getByText('010-****-5678')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연락처 복사' })).not.toBeInTheDocument();
  });

  it('다른 회원으로 전환하면 노출이 초기화된다 — 앞 사람 번호가 남지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    const { rerender } = renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));
    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ApiClientProvider client={apiClient}>
          <MemberDetailPanel
            member={member({ memberId: MEMBER_ID + 1, name: '김철수', phoneMasked: '010-****-9999' })}
            clubId={CLUB_ID}
            useGeneration
            viewerRole="LEADER"
            viewerUserId={999}
            open
            onClose={() => {}}
            onTransferLeader={() => {}}
          />
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('010-****-9999')).toBeInTheDocument();
    expect(screen.queryByText('010-1234-5678')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '번호 보기' })).toBeInTheDocument();
  });

  it('조회 중에는 번호 보기 버튼이 비활성이다 — 연타로 중복 조회·감사 로그가 생기지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } });
      }),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    const revealButton = screen.getByRole('button', { name: '번호 보기' });
    await userEvent.click(revealButton);

    expect(revealButton).toBeDisabled();
    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/manage/members/member-detail-panel.test.tsx`
Expected: FAIL — "번호 보기" 버튼이 존재하지 않음

- [ ] **Step 3: ContactValue 교체**

`MemberDetailPanel.tsx` 의 `ContactValue` 를 아래로 교체하고, `BasicInfoSection` 의 호출부를 함께 고친다.

`BasicInfoSection` 시그니처와 호출부:

```tsx
function BasicInfoSection({
  member,
  clubId,
  useGeneration,
  isLeaderViewer,
}: {
  member: ClubMember;
  clubId: number;
  useGeneration: boolean;
  isLeaderViewer: boolean;
}) {
```

그 안의 연락처 필드:

```tsx
        <Field label="연락처">
          <ContactValue member={member} clubId={clubId} canReveal={isLeaderViewer} />
        </Field>
```

`PanelBody` 안의 호출부(`<BasicInfoSection member={member} useGeneration={useGeneration} />`)를 다음으로 바꾼다. `isLeaderViewer` 는 이미 같은 함수 안에서 계산돼 있다.

```tsx
        <BasicInfoSection
          member={member}
          clubId={clubId}
          useGeneration={useGeneration}
          isLeaderViewer={isLeaderViewer}
        />
```

`ContactValue` 본문:

```tsx
/**
 * 기본은 마스킹. 회장이 [번호 보기]를 누른 경우에만 원본을 조회해 표시하고, 그때만 복사를 연다.
 * 클립보드에 들어가는 값은 조회한 원본뿐이다 — 마스킹 문자열을 복사하는 경로는 만들지 않는다.
 * 노출 상태는 이 컴포넌트 로컬이라 패널을 닫거나 다른 회원으로 넘어가면(PanelBody 재마운트) 사라진다.
 */
function ContactValue({
  member,
  clubId,
  canReveal,
}: {
  member: ClubMember;
  clubId: number;
  canReveal: boolean;
}) {
  const revealPhone = useMemberPhoneMutation(clubId);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    };
  }, []);

  if (!member.phoneMasked) return <span className="text-charcoal-3">{EMPTY}</span>;

  async function reveal() {
    setError(null);
    try {
      const result = await revealPhone.mutateAsync(member.memberId);
      setRevealed(result.phone);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : '연락처를 불러오지 못했어요');
    }
  }

  async function copy() {
    if (revealed === null) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사에 실패했어요');
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-2">
        <span className="font-mono">{revealed ?? member.phoneMasked}</span>
        {revealed === null && canReveal && (
          <button
            type="button"
            onClick={reveal}
            disabled={revealPhone.isPending}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink disabled:opacity-60"
          >
            {revealPhone.isPending && <ButtonSpinner />}번호 보기
          </button>
        )}
        {revealed !== null && (
          <button
            type="button"
            onClick={copy}
            aria-label="연락처 복사"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink"
          >
            {copied ? '복사됨' : '복사'}
          </button>
        )}
      </span>
      {error && <span className="text-xs text-coral">{error}</span>}
    </span>
  );
}
```

import 추가: `useRef` (`react`), `useMemberPhoneMutation` (`@duing/hooks`). `useState`·`useEffect`·`ButtonSpinner` 는 이 파일에 이미 있다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/manage/members/member-detail-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: 목록·모바일 카드 무변경 확인**

Run: `cd frontend && git diff --name-only && pnpm --filter @duing/web test -- --run test/manage/members`
Expected: 변경 파일 목록에 `MemberTable.tsx` 가 없고, members 스위트 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add "frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberDetailPanel.tsx" frontend/apps/web/test/manage/members/member-detail-panel.test.tsx
git commit -m "feat(frontend): 상세 패널 번호 보기·복사 — 원본 조회 후에만 복사 노출

기본은 마스킹이고 회장이 명시적으로 눌렀을 때만 원본을 조회한다. 조회에 성공하면
번호 보기 버튼은 사라지고 복사만 남아 중복 조회와 불필요한 감사 로그를 막는다.
클립보드에는 조회한 원본만 들어간다."
```

---

### Task 4: 전체 검증 + 실브라우저 QA

**Files:** 없음(검증 전용)

- [ ] **Step 1: 정적 검증 4종**

각각 exit code 를 직접 확인한다. `| tail` 로 종료 코드를 가리지 않는다.

```bash
cd frontend && pnpm --filter @duing/web test -- --run
cd frontend && pnpm --filter @duing/hooks test -- --run
cd frontend && pnpm --filter @duing/web typecheck
cd frontend && pnpm --filter @duing/web lint
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 AUTH_HINT_SECRET=ci-dummy pnpm --filter @duing/web build
cd backend && ./gradlew test
```

Expected: 전부 exit 0. lint 는 기존 경고만(신규 경고 0).

- [ ] **Step 2: 로컬 서버 기동**

백엔드는 `cd backend && ./gradlew bootRun`, 프론트는 `cd frontend && pnpm dev` 로 띄운다. 로그는 파일로 리다이렉트한다(파이프로 띄우면 서버가 죽는다). 프론트는 :3000 을 확인하고, 이미 점유돼 있으면 부모→워커→포트 순으로 정리한 뒤 다시 띄운다.

- [ ] **Step 3: 회장 계정 QA**

QA 전용 동아리·계정을 dev DB 에 시드하고(끝나면 전량 삭제), 회장으로 로그인해 확인한다.

1. 상세 패널에 마스킹 번호와 **[번호 보기]** 가 보인다.
2. 누르면 원본으로 바뀌고 **[번호 보기]가 사라지며 [복사]만 남는다**.
3. [복사] 후 클립보드에 **원본**이 들어 있다(마스킹 아님).
4. 패널을 닫았다 다시 열면 **다시 마스킹** 상태다.
5. 다른 회원으로 전환하면 노출이 초기화된다.
6. 백엔드 로그에 `member phone view: … action=PHONE_VIEW` 가 남고 **번호 값은 없다**.
7. 목록 표·모바일 카드에는 번호 보기 버튼이 없다.

- [ ] **Step 4: 임원 계정 QA**

임원으로 로그인해 상세 패널에 **[번호 보기]가 없고** 마스킹만 보이는지 확인한다. 브라우저 콘솔에서 직접 엔드포인트를 호출하면 403 인지도 확인한다.

- [ ] **Step 5: QA 데이터 원복 · 서버 종료**

시드한 동아리·계정·부수 레코드를 전부 삭제하고 잔여 0 을 쿼리로 확인한다. dev 서버와 백엔드를 종료하고 :3000·:8080 이 비었는지 확인한다.

- [ ] **Step 6: 커밋 없음**

문제가 있으면 해당 Task 로 돌아간다.

---

## 후속 (이 계획 범위 밖)

- P2 전용 감사 테이블 `personal_data_audit` 도입 시 조회 서비스와 분리된 쓰기 경로 + IP·User-Agent·requestId
- Permission 기반 권한 분리(`CONTACT_VIEW`, `MEMBER_EXPORT`)를 CSV 정책과 묶어 검토
- `packages/api/src/generated/schema.d.ts` 재생성(`pnpm gen:api`, 백엔드 기동 필요)
