# 동아리 멤버 목록 CSV 다운로드 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 회장(LEADER)이 `멤버 관리` 페이지에서 소속 멤버 명단을 CSV로 다운로드한다 (전화번호 포함 옵션).

**Architecture:** B안 — 백엔드는 회장 전용 export 엔드포인트로 JSON(`includePhone` 으로 전화번호 조건부 제공)을 내려주고, 프론트가 CSV 문자열을 생성해 다운로드한다. 감사는 구조화 로그만.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA · QueryDSL / RestAssured · Next.js 15 / React 19 / TanStack Query / Vitest · Testing Library / shadcn Popover

**참조 스펙:** `docs/superpowers/specs/2026-06-15-club-members-csv-export-design.md`

---

## PR 1 — 백엔드 export API (`develop` 분기)

> 브랜치: `feat/{이슈번호}-club-members-export-api`. 작업 디렉터리: `backend/`.

### 파일 구조 (PR 1)

- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberExportQuery.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberExportResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java` (인터페이스에 메서드 추가)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberQueryService.java` (구현 + `@Slf4j` 로그)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java` (export 시그니처)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java` (export 구현)
- Create(test): `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberExportControllerTest.java`

---

### Task A1: export DTO 2종 추가

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberExportQuery.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberExportResponse.java`

- [ ] **Step 1: `ClubMemberExportQuery` 작성** (`includePhone=false` 면 phone 을 null 로 매핑)

```java
package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record ClubMemberExportQuery(
        Long memberId,
        String name,
        String studentId,
        String major,
        String phone,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberExportQuery from(ClubMember clubMember, boolean includePhone) {
        return new ClubMemberExportQuery(
                clubMember.getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getUser().getMajor(),
                includePhone ? clubMember.getUser().getPhone() : null,
                clubMember.getRole(),
                clubMember.getCreatedAt()
        );
    }
}
```

- [ ] **Step 2: `ClubMemberExportResponse` 작성**

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import java.time.LocalDateTime;

public record ClubMemberExportResponse(
        Long memberId,
        String name,
        String studentId,
        String major,
        String phone,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberExportResponse from(ClubMemberExportQuery query) {
        return new ClubMemberExportResponse(
                query.memberId(), query.name(), query.studentId(), query.major(),
                query.phone(), query.role(), query.joinedAt()
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 커밋**

```bash
cd backend && git add src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberExportQuery.java src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberExportResponse.java
git commit -m "feat(backend): 멤버 export 조회/응답 DTO 추가"
```

---

### Task A2: export 통합 테스트 작성 (실패 확인)

**Files:**
- Create(test): `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberExportControllerTest.java`

- [ ] **Step 1: 통합 테스트 작성** (`ClubMemberControllerTest` 셋업을 재사용해 새 클래스로)

```java
package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubMemberExportControllerTest extends IntegrationTestBase {

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
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("운영진리더");
        officerUser = saveUser("운영진오피서");
        memberUser = saveUser("일반회원");
        strangerUser = saveUser("비멤버");
        club = saveActiveClub("두잉멤버export");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("회장이 export 를 호출하면 200 과 역할 정렬된 멤버 목록을 반환한다")
    void leaderExportsOrderedList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data", hasSize(3))
                    .body("data.role", contains("LEADER", "OFFICER", "MEMBER"))
                    .body("data.name", contains("운영진리더", "운영진오피서", "일반회원"));
    }

    @Test
    @DisplayName("includePhone 기본값(false)이면 phone 이 전부 null 로 내려온다")
    void phoneOmittedByDefault() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.phone", everyItem(nullValue()));
    }

    @Test
    @DisplayName("includePhone=true 면 phone 값이 포함된다")
    void phoneIncludedWhenRequested() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .queryParam("includePhone", true)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data[0].phone", notNullValue());
    }

    @Test
    @DisplayName("운영진이 export 를 호출하면 403 을 받는다 — 명단 다운로드는 회장 전용")
    void officerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("일반 멤버가 export 를 호출하면 403 을 받는다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버가 export 를 호출하면 403 을 받는다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 export 를 호출하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                "010-1234-5678",
                java.time.LocalDateTime.now()
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

- [ ] **Step 2: 실패 확인** (엔드포인트 미구현 → 404/컴파일 에러)

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.controller.ClubMemberExportControllerTest"`
Expected: FAIL (엔드포인트 없음 — 404 또는 컴파일 에러)

- [ ] **Step 3: 커밋**

```bash
cd backend && git add src/test/java/com/duing/domain/clubmember/controller/ClubMemberExportControllerTest.java
git commit -m "test(backend): 멤버 export API 통합 테스트 추가"
```

---

### Task A3: export 서비스·엔드포인트 구현 (테스트 통과)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberQueryService.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java`

- [ ] **Step 1: 서비스 인터페이스에 메서드 추가**

`ClubMemberQueryService.java` — import 추가 및 메서드 선언:

```java
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
```

```java
    List<ClubMemberExportQuery> getMembersForExport(Long clubId, Long requesterId, boolean includePhone);
```

- [ ] **Step 2: 구현체 작성** (`@Slf4j` + requireLeader + 구조화 로그)

`GeneralClubMemberQueryService.java` — 클래스에 `@Slf4j` 추가, import 추가, 메서드 구현:

```java
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import lombok.extern.slf4j.Slf4j;
```

클래스 어노테이션에 `@Slf4j` 추가:

```java
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMemberQueryService implements ClubMemberQueryService {
```

메서드 추가:

```java
    @Override
    public List<ClubMemberExportQuery> getMembersForExport(Long clubId, Long requesterId, boolean includePhone) {
        clubAuthService.requireLeader(requesterId, clubId);
        List<ClubMemberExportQuery> rows = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(clubMember -> ClubMemberExportQuery.from(clubMember, includePhone))
                .toList();
        log.info("club member export: clubId={}, actorId={}, includePhone={}, count={}",
                clubId, requesterId, includePhone, rows.size());
        return rows;
    }
```

- [ ] **Step 3: API 인터페이스에 export 시그니처 추가**

`ClubMemberApi.java` — import 추가:

```java
import com.duing.domain.clubmember.controller.dto.response.ClubMemberExportResponse;
import org.springframework.web.bind.annotation.RequestParam;
```

메서드 추가:

```java
    @Operation(summary = "멤버 명단 CSV용 export (LEADER)",
            description = "회장 전용. includePhone=true 면 전화번호 포함(기본 false). CSV 생성은 프론트.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members/export")
    ResponseEntity<ApiResponse<List<ClubMemberExportResponse>>> exportMembers(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "false") boolean includePhone,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

- [ ] **Step 4: 컨트롤러 구현**

`ClubMemberController.java` — import 추가:

```java
import com.duing.domain.clubmember.controller.dto.response.ClubMemberExportResponse;
import org.springframework.web.bind.annotation.RequestParam;
```

메서드 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<List<ClubMemberExportResponse>>> exportMembers(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "false") boolean includePhone,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ClubMemberExportResponse> members = clubMemberQueryService
                .getMembersForExport(clubId, currentUser.id(), includePhone).stream()
                .map(ClubMemberExportResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(members));
    }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.controller.ClubMemberExportControllerTest"`
Expected: PASS (7개 테스트 통과)

- [ ] **Step 6: 커밋**

```bash
cd backend && git add src/main/java/com/duing/domain/clubmember/
git commit -m "feat(backend): 동아리 멤버 명단 export 조회 API (회장 전용, 전화번호 옵션)"
```

---

### Task A4: 구조화 로그 기록 검증 테스트

**Files:**
- Modify(test): `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberExportControllerTest.java`

- [ ] **Step 1: ListAppender 로그 캡처 테스트 추가**

`ClubMemberExportControllerTest` 에 import 추가:

```java
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.domain.clubmember.service.GeneralClubMemberQueryService;
import org.slf4j.LoggerFactory;
```

테스트 메서드 추가:

```java
    @Test
    @DisplayName("export 성공 시 누가·전화포함여부·건수를 구조화 로그로 남긴다 (전화번호 값은 미포함)")
    void exportWritesStructuredLog() {
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(GeneralClubMemberQueryService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);

        try {
            RestAssured
                    .given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                        .queryParam("includePhone", true)
                    .when()
                        .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                    .then()
                        .statusCode(HttpStatus.OK.value());

            assertThat(appender.list)
                    .anySatisfy(event -> {
                        String message = event.getFormattedMessage();
                        assertThat(message).contains("club member export");
                        assertThat(message).contains("includePhone=true");
                        assertThat(message).contains("count=3");
                        assertThat(message).doesNotContain("010-1234-5678");
                    });
        } finally {
            serviceLogger.detachAppender(appender);
        }
    }
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.controller.ClubMemberExportControllerTest"`
Expected: PASS (8개 테스트 통과)

- [ ] **Step 3: 전체 테스트 회귀 확인**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (기존 테스트 회귀 없음)

- [ ] **Step 4: 커밋**

```bash
cd backend && git add src/test/java/com/duing/domain/clubmember/controller/ClubMemberExportControllerTest.java
git commit -m "test(backend): export 구조화 로그 기록 검증 추가"
```

> **PR 1 종료:** self-check 후 PR 생성. 본문은 🚀 작업 내용 / 🤔 고민 / 💬 리뷰 중점. **자동 머지 금지** — 사용자 지시 후 머지. PR 2 는 PR 1 머지 후 착수.

---

## PR 2 — 프론트 CSV 다운로드 (`develop` 분기, PR 1 머지 후)

> 브랜치: `feat/{이슈번호}-club-members-csv-download`. 작업 디렉터리: `frontend/`.

### 파일 구조 (PR 2)

- Modify: `frontend/packages/types/src/clubmember.ts` (`ClubMemberExportRow` 타입)
- Modify: `frontend/packages/api/src/client.ts` (`membersExport` 메서드)
- Modify: `frontend/packages/hooks/src/clubs.ts` (`useClubMembersExportMutation`)
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_lib/membersCsv.ts`
- Create: `frontend/apps/web/app/_lib/downloadFile.ts`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberCsvDownloadPopover.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx` (헤더 배선)
- Create(test): `frontend/apps/web/test/manage/members-csv.test.ts`
- Create(test): `frontend/apps/web/test/manage/member-csv-download-popover.test.tsx`

명령은 `cd frontend` 기준. 테스트: `pnpm --filter @duing/web test`, 타입체크: `pnpm --filter @duing/web typecheck`.

---

### Task B1: `ClubMemberExportRow` 타입 추가

**Files:**
- Modify: `frontend/packages/types/src/clubmember.ts`

- [ ] **Step 1: 타입 추가** (파일 끝에)

```ts
export type ClubMemberExportRow = {
  memberId: number;
  name: string;
  studentId: string;
  major: string;
  phone: string | null;
  role: ClubMemberRole;
  joinedAt: string;
};
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && pnpm --filter @duing/types build`
Expected: 성공 (타입 export 됨)

- [ ] **Step 3: 커밋**

```bash
cd frontend && git add packages/types/src/clubmember.ts
git commit -m "feat(frontend): ClubMemberExportRow 타입 추가"
```

---

### Task B2: API 클라이언트 `membersExport` 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: import 에 타입 추가**

`client.ts` 의 `@duing/types` import 블록(약 line 57, `ClubMember,` 근처)에 추가:

```ts
  ClubMemberExportRow,
```

- [ ] **Step 2: `clubs` 인터페이스에 메서드 시그니처 추가** (`members(...)` 줄 다음, 약 line 202)

```ts
    membersExport(clubId: number, includePhone: boolean): Promise<ClubMemberExportRow[]>;
```

- [ ] **Step 3: `clubs` 구현에 메서드 추가** (`members:` 구현 다음, 약 line 530)

```ts
      membersExport: (clubId, includePhone) =>
        jsonOk<ClubMemberExportRow[]>(
          http.get(`clubs/${clubId}/members/export`, {
            searchParams: { includePhone: String(includePhone) },
          }),
        ),
```

- [ ] **Step 4: 타입체크**

Run: `cd frontend && pnpm --filter @duing/api typecheck`
Expected: 성공

- [ ] **Step 5: 커밋**

```bash
cd frontend && git add packages/api/src/client.ts
git commit -m "feat(frontend): 멤버 export API 클라이언트 메서드 추가"
```

---

### Task B3: `useClubMembersExportMutation` 훅 추가

**Files:**
- Modify: `frontend/packages/hooks/src/clubs.ts`

- [ ] **Step 1: import 에 타입 추가**

`clubs.ts` 상단 `@duing/types` import 블록에 추가:

```ts
  ClubMemberExportRow,
```

- [ ] **Step 2: 훅 추가** (파일 끝)

```ts
export function useClubMembersExportMutation(clubId: number) {
  const client = useApiClient();
  return useMutation({
    mutationFn: (includePhone: boolean): Promise<ClubMemberExportRow[]> =>
      client.clubs.membersExport(clubId, includePhone),
  });
}
```

- [ ] **Step 3: 타입체크**

Run: `cd frontend && pnpm --filter @duing/hooks typecheck`
Expected: 성공

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add packages/hooks/src/clubs.ts
git commit -m "feat(frontend): useClubMembersExportMutation 훅 추가"
```

---

### Task B4: CSV 빌더 (순수 함수) — TDD

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_lib/membersCsv.ts`
- Create(test): `frontend/apps/web/test/manage/members-csv.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import type { ClubMemberExportRow } from '@duing/types';
import {
  buildMembersCsv,
  buildMembersCsvFilename,
} from '../../app/manage/clubs/[clubId]/members/_lib/membersCsv';

const rows: ClubMemberExportRow[] = [
  { memberId: 1, name: '홍길동', studentId: '20240001', major: '컴퓨터정보공학부', phone: '010-1111-2222', role: 'LEADER', joinedAt: '2026-03-01T09:00:00' },
  { memberId: 2, name: '김,따옴표"군', studentId: '20240002', major: '경영학과', phone: null, role: 'MEMBER', joinedAt: '2026-03-02T09:00:00' },
];

describe('buildMembersCsv', () => {
  it('전화번호 미포함 시 헤더는 이름·학번·학과·역할·가입일 이고 BOM 으로 시작한다', () => {
    const csv = buildMembersCsv(rows, false);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header] = csv.slice(1).split('\r\n');
    expect(header).toBe('이름,학번,학과,역할,가입일');
  });

  it('역할을 한글 라벨로 변환하고 가입일을 YYYY-MM-DD 로 자른다', () => {
    const csv = buildMembersCsv(rows, false);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('홍길동,20240001,컴퓨터정보공학부,회장,2026-03-01');
  });

  it('콤마·따옴표가 포함된 값을 RFC4180 으로 이스케이프한다', () => {
    const csv = buildMembersCsv(rows, false);
    const line = csv.slice(1).split('\r\n')[2];
    expect(line).toBe('"김,따옴표""군",20240002,경영학과,일반멤버,2026-03-02');
  });

  it('전화번호 포함 시 학과 다음에 휴대전화 컬럼이 추가되고 null 은 빈 문자열로 출력한다', () => {
    const csv = buildMembersCsv(rows, true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('이름,학번,학과,휴대전화,역할,가입일');
    expect(lines[1]).toBe('홍길동,20240001,컴퓨터정보공학부,010-1111-2222,회장,2026-03-01');
    expect(lines[2]).toBe('"김,따옴표""군",20240002,경영학과,,일반멤버,2026-03-02');
  });
});

describe('buildMembersCsvFilename', () => {
  it('{동아리명}_멤버목록_{yyyy-MM-dd}.csv 형식으로 만든다', () => {
    expect(buildMembersCsvFilename('AI동아리', new Date(2026, 5, 15))).toBe(
      'AI동아리_멤버목록_2026-06-15.csv',
    );
  });

  it('파일명 불가 문자를 _ 로 치환한다', () => {
    expect(buildMembersCsvFilename('A/B:동아리', new Date(2026, 5, 15))).toBe(
      'A_B_동아리_멤버목록_2026-06-15.csv',
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test members-csv`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현 작성**

`membersCsv.ts`:

```ts
import type { ClubMemberExportRow, ClubMemberRole } from '@duing/types';

const MEMBER_ROLE_LABEL: Record<ClubMemberRole, string> = {
  LEADER: '회장',
  OFFICER: '운영진',
  MEMBER: '일반멤버',
};

const BOM = '﻿';

function escapeCsvField(value: string): string {
  if (/["\r\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

export function buildMembersCsv(rows: ClubMemberExportRow[], includePhone: boolean): string {
  const header = includePhone
    ? ['이름', '학번', '학과', '휴대전화', '역할', '가입일']
    : ['이름', '학번', '학과', '역할', '가입일'];

  const lines = [serializeRow(header)];
  for (const row of rows) {
    const fields = includePhone
      ? [row.name, row.studentId, row.major, row.phone ?? '', MEMBER_ROLE_LABEL[row.role], row.joinedAt.slice(0, 10)]
      : [row.name, row.studentId, row.major, MEMBER_ROLE_LABEL[row.role], row.joinedAt.slice(0, 10)];
    lines.push(serializeRow(fields));
  }
  return BOM + lines.join('\r\n');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

export function buildMembersCsvFilename(clubName: string, today: Date): string {
  return `${sanitizeFilename(clubName)}_멤버목록_${formatDate(today)}.csv`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test members-csv`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd frontend && git add "apps/web/app/manage/clubs/[clubId]/members/_lib/membersCsv.ts" apps/web/test/manage/members-csv.test.ts
git commit -m "feat(frontend): 멤버 명단 CSV 빌더(BOM·RFC4180·역할 라벨) 추가"
```

---

### Task B5: 파일 다운로드 트리거 유틸

**Files:**
- Create: `frontend/apps/web/app/_lib/downloadFile.ts`

- [ ] **Step 1: 구현 작성**

```ts
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && pnpm --filter @duing/web typecheck`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
cd frontend && git add apps/web/app/_lib/downloadFile.ts
git commit -m "feat(frontend): 텍스트 파일 다운로드 트리거 유틸 추가"
```

---

### Task B6: 다운로드 팝오버 컴포넌트 — 테스트 포함

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberCsvDownloadPopover.tsx`
- Create(test): `frontend/apps/web/test/manage/member-csv-download-popover.test.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useState } from 'react';
import { useClubMembersExportMutation } from '@duing/hooks';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { downloadTextFile } from '@/app/_lib/downloadFile';
import { buildMembersCsv, buildMembersCsvFilename } from '../_lib/membersCsv';

type MemberCsvDownloadPopoverProps = {
  clubId: number;
  clubName: string;
};

export function MemberCsvDownloadPopover({ clubId, clubName }: MemberCsvDownloadPopoverProps) {
  const [open, setOpen] = useState(false);
  const [includePhone, setIncludePhone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportMembers = useClubMembersExportMutation(clubId);

  async function handleDownload() {
    setError(null);
    try {
      const rows = await exportMembers.mutateAsync(includePhone);
      const csv = buildMembersCsv(rows, includePhone);
      downloadTextFile(buildMembersCsvFilename(clubName, new Date()), csv);
      setOpen(false);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '다운로드 실패');
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
        >
          멤버 명단 다운로드
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-4">
        <label className="flex items-start gap-2 text-sm text-charcoal">
          <input
            type="checkbox"
            checked={includePhone}
            onChange={(event) => setIncludePhone(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            전화번호 포함
            <span className="mt-0.5 block text-xs text-slate-400">
              전화번호를 포함하면 개인정보가 포함됩니다.
            </span>
          </span>
        </label>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={handleDownload}
          disabled={exportMembers.isPending}
          className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {exportMembers.isPending ? '내보내는 중…' : '다운로드'}
        </button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: 테스트 작성** (훅·다운로드 유틸 모킹)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClubMemberExportRow } from '@duing/types';

const mutateAsync = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubMembersExportMutation: () => ({ mutateAsync, isPending: false }),
}));

const downloadTextFile = vi.fn();
vi.mock('@/app/_lib/downloadFile', () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
}));

import { MemberCsvDownloadPopover } from '../../app/manage/clubs/[clubId]/members/_components/MemberCsvDownloadPopover';

const rows: ClubMemberExportRow[] = [
  { memberId: 1, name: '홍길동', studentId: '20240001', major: '컴퓨터정보공학부', phone: null, role: 'LEADER', joinedAt: '2026-03-01T09:00:00' },
];

describe('MemberCsvDownloadPopover', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    downloadTextFile.mockReset();
    mutateAsync.mockResolvedValue(rows);
  });

  it('다운로드 클릭 시 includePhone=false 로 export 후 CSV 파일을 내려받는다', async () => {
    const user = userEvent.setup();
    render(<MemberCsvDownloadPopover clubId={1} clubName="AI동아리" />);

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith(false);
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadTextFile.mock.calls[0];
    expect(filename).toContain('AI동아리_멤버목록_');
    expect(filename).toMatch(/\.csv$/);
    expect(content).toContain('이름,학번,학과,역할,가입일');
  });

  it('전화번호 포함 체크 후 다운로드하면 includePhone=true 로 export 한다', async () => {
    const user = userEvent.setup();
    render(<MemberCsvDownloadPopover clubId={1} clubName="AI동아리" />);

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith(true);
    const [, content] = downloadTextFile.mock.calls[0];
    expect(content).toContain('이름,학번,학과,휴대전화,역할,가입일');
  });
});
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test member-csv-download-popover`
Expected: PASS

> Radix Popover 가 jsdom 에서 트리거 클릭 후 콘텐츠를 포털로 렌더한다. `findByRole` 로 비동기 대기 처리됨. 만약 포인터 이벤트 이슈로 콘텐츠가 안 열리면 `<Popover open>` 제어 모드로 렌더하도록 테스트를 조정한다.

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add "apps/web/app/manage/clubs/[clubId]/members/_components/MemberCsvDownloadPopover.tsx" apps/web/test/manage/member-csv-download-popover.test.tsx
git commit -m "feat(frontend): 멤버 명단 다운로드 팝오버 컴포넌트 추가"
```

---

### Task B7: 페이지 헤더 배선 (LEADER 전용)

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx`

- [ ] **Step 1: import 추가** (상단 import 블록)

```tsx
import { MemberCsvDownloadPopover } from './_components/MemberCsvDownloadPopover';
```

- [ ] **Step 2: 헤더에 버튼 배선**

`page.tsx` 의 `<header>` 안, 기존 OFFICER 전용 "회장 승계 요청" 블록과 나란히 LEADER 분기 추가. 우측 영역을 묶기 위해 버튼 묶음을 `flex` 컨테이너로 감싼다:

기존:
```tsx
        {managedClub.myRole === 'OFFICER' && (
          <button
            type="button"
            onClick={() => setSuccessionOpen(true)}
            className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
          >
            회장 승계 요청
          </button>
        )}
```

변경:
```tsx
        <div className="flex shrink-0 items-center gap-2">
          {managedClub.myRole === 'LEADER' && (
            <MemberCsvDownloadPopover clubId={currentClubId} clubName={managedClub.clubName} />
          )}
          {managedClub.myRole === 'OFFICER' && (
            <button
              type="button"
              onClick={() => setSuccessionOpen(true)}
              className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
            >
              회장 승계 요청
            </button>
          )}
        </div>
```

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web test`
Expected: 타입체크 성공, 전체 테스트 PASS

- [ ] **Step 4: lint**

Run: `cd frontend && pnpm --filter @duing/web lint`
Expected: 에러 없음

- [ ] **Step 5: 시각 QA** (선택)

Run: `cd frontend && pnpm --filter @duing/web dev` (:3000) → `/manage/clubs/{회장인 클럽}/members` 에서 버튼·팝오버·다운로드 확인 후 dev 서버 종료

- [ ] **Step 6: 커밋**

```bash
cd frontend && git add "apps/web/app/manage/clubs/[clubId]/members/page.tsx"
git commit -m "feat(frontend): 멤버 관리 헤더에 명단 다운로드 버튼 배선 (회장 전용)"
```

> **PR 2 종료:** self-check 후 PR 생성. **자동 머지 금지.**

---

## Self-Review 결과 (작성자 체크)

- **스펙 커버리지:** 권한(requireLeader, LEADER 전용 버튼) ✓ / API·includePhone ✓ / phone null 처리 ✓ / 구조화 로그(값 미기록) ✓ / 정렬 ✓ / CSV BOM·RFC4180·CRLF·역할 라벨 ✓ / 헤더 컬럼 토글 ✓ / 파일명 ✓ / 팝오버 옵션 ✓ / Out of Scope(XLSX·POI·감사 테이블·Content-Disposition) 미포함 ✓
- **플레이스홀더:** 없음 — 모든 코드·명령 구체화.
- **타입 일관성:** `ClubMemberExportQuery`/`ClubMemberExportResponse`/`ClubMemberExportRow` 필드(memberId·name·studentId·major·phone·role·joinedAt) 백엔드/프론트 일치, `getMembersForExport(clubId, requesterId, includePhone)` 시그니처 인터페이스/구현/컨트롤러 일치, `membersExport(clubId, includePhone)` 클라이언트/훅 일치, `buildMembersCsv(rows, includePhone)`·`buildMembersCsvFilename(clubName, today)`·`downloadTextFile(filename, content)` 호출부 일치.
