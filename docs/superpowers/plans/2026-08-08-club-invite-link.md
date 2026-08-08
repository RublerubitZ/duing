# 부원 초대 링크(동아리 가입 링크) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모집과 무관하게 운영진이 기존 부원을 초대하는 동아리 단위 가입 링크(24h/72h 절대 만료·1~150 인원·자동 승인 옵션)를 기존 club_join_code 구조 위에 분리 신설하고, maxUses 상한을 모집/초대 공통 150으로 통일한다.

**Architecture:** `club_join_code.recruitment_id` 를 nullable 로 완화해 NULL = 부원 초대 링크로 판별한다. 모집 링크 경로는 무변경이 원칙이며, 공유 수정은 스펙 §5의 4곳(findByCode LEFT JOIN·엔티티 분기·감사 null-safe 2곳)뿐이다. 신청/승인/차감/환급/감사 메커니즘은 전부 재사용하고, 자동 승인은 신청 트랜잭션 안에서 즉시 enroll+APPROVED 로 처리한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway(V107) / RestAssured+Testcontainers, Next.js 15 / React 19 / TanStack Query / react-qr-code(신규).

**Spec:** `docs/superpowers/specs/2026-08-08-club-invite-link-design.md` — 각 태스크의 정책 근거. 구현이 스펙과 어긋나면 스펙이 이긴다.

## Global Constraints

- 커밋: Conventional Commits + 한국어, `대상 — 변경점` 명사구. **Co-Authored-By/Generated 라인 절대 금지.**
- 구현 서브에이전트는 **push·PR 생성 금지** — 로컬 커밋까지만.
- Flyway 기존 파일 수정 절대 금지 — V107 신규 파일만. Expand-only(`MigrationExpandContractGuardTest` 통과 필수).
- 테스트에 하드코딩 미래 절대 날짜 금지 — 만료 경계는 `Clock`/상대 시각으로.
- `@DisplayName` 은 요구사항 문장으로. 테스트는 RestAssured + Fixture Monkey/`common/fixture` 패턴.
- 빌드/테스트 cwd: BE=`backend/`(`./gradlew test`), FE=`frontend/`(`pnpm test`). `| tail` 은 exit code 가림 — 출력에서 BUILD SUCCESSFUL 확인.
- FE: `any`/`as` 금지, `type` 사용, 서버 상태는 TanStack Query, `@duing/api` 경유.
- 사용자 대면 문구는 전부 한글. 링크 종류 표기: "가입 링크"(모집)/"부원 초대 링크"(초대).
- 브랜치: `feat/club-invite-link-be` (develop 분기) → `feat/club-invite-link-fe` (BE 브랜치에 스택).

---

## Task 1: V107 마이그레이션 + ClubJoinCode 엔티티 확장

**Files:**
- Create: `backend/src/main/resources/db/migration/V107__club_invite_join_code.sql`
- Modify: `backend/src/main/java/com/duing/domain/joincode/entity/ClubJoinCode.java`
- Test: `backend/src/test/java/com/duing/domain/joincode/entity/ClubJoinCodeTest.java` (확장)

**Interfaces:**
- Produces: `ClubJoinCode.issueClubInvite(Club, String code, Integer generation, int maxUses, LocalDateTime inviteExpiresAt, boolean autoApprove, Long createdById)`, `boolean isClubInvite()`, `Long getRecruitmentIdOrNull()`, `LocalDateTime getInviteExpiresAt()`, `boolean isAutoApprove()`. `isUsable(now)`/`getJoinExpiresAt()` 은 초대 링크 분기 포함.

- [ ] **Step 1: V107 작성**

```sql
-- 부원 초대 링크(스펙 2026-08-08): recruitment_id NULL = 동아리 단위 초대 링크.
-- 모집 링크의 정책·인덱스(V99)는 무변경. Expand-only — 구 이미지는 초대 링크 행을
-- findByCode INNER JOIN 에서 걸러 404 fail-closed 로 처리한다.
ALTER TABLE club_join_code ALTER COLUMN recruitment_id DROP NOT NULL;
ALTER TABLE club_join_code ADD COLUMN invite_expires_at TIMESTAMP;
ALTER TABLE club_join_code ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT false;

-- 링크 2종의 형태 불변식: 모집 링크 ⟺ 파생 만료(join_window_days), 초대 링크 ⟺ 절대 만료.
ALTER TABLE club_join_code ADD CONSTRAINT ck_club_join_code_link_shape
    CHECK ((recruitment_id IS NULL) = (invite_expires_at IS NOT NULL));

-- 동아리당 부원 초대 활성 링크 1개 (모집 링크의 uk_club_join_code_active_per_recruitment 와 배타 영역)
CREATE UNIQUE INDEX uk_club_join_code_active_invite_per_club
    ON club_join_code (club_id)
    WHERE recruitment_id IS NULL AND revoked_at IS NULL AND deleted_at IS NULL;

-- maxUses 상한 500→150 통일(스펙 §2.1). ADD CONSTRAINT 는 기존 행을 검증한다 —
-- dev 0건 실측, prod 는 릴리스 게이트에서 0건 확인 후 배포(강제 축소 UPDATE 금지).
ALTER TABLE club_join_code DROP CONSTRAINT club_join_code_max_uses_check;
ALTER TABLE club_join_code ADD CONSTRAINT club_join_code_max_uses_check CHECK (max_uses BETWEEN 1 AND 150);
```

- [ ] **Step 2: 실패 테스트 작성** — `ClubJoinCodeTest` 에 초대 링크 케이스 추가 (아직 팩토리가 없어 컴파일 실패가 곧 RED):

```java
@Nested
class 부원_초대_링크 {
    private final LocalDateTime issuedAt = LocalDateTime.of(2026, 1, 1, 12, 0);

    // 기존 파일에는 club 필드가 없고 club() 헬퍼 메서드만 있다(ClubJoinCodeTest.java:117-119) — 그대로 재사용.
    private ClubJoinCode inviteCode(LocalDateTime inviteExpiresAt) {
        return ClubJoinCode.issueClubInvite(club(), "ABC234", null, 40, inviteExpiresAt, false, 1L);
    }

    @Test
    @DisplayName("부원 초대 링크는 만료 시각 전까지 사용 가능하고 만료 시각이 지나면 사용 불가다")
    void inviteExpiryBoundary() {
        ClubJoinCode joinCode = inviteCode(issuedAt.plusHours(24));
        assertThat(joinCode.isUsable(issuedAt.plusHours(24))).isTrue();          // 경계 포함
        assertThat(joinCode.isUsable(issuedAt.plusHours(24).plusSeconds(1))).isFalse();
    }

    @Test
    @DisplayName("부원 초대 링크의 가입 가능 기한은 모집이 아닌 절대 만료 시각에서 나온다")
    void joinExpiresAtIsInviteExpiresAt() {
        assertThat(inviteCode(issuedAt.plusHours(72)).getJoinExpiresAt())
                .isEqualTo(issuedAt.plusHours(72));
    }

    @Test
    @DisplayName("폐기된 부원 초대 링크는 만료 전이라도 사용 불가다")
    void revokedInviteIsUnusable() {
        ClubJoinCode joinCode = inviteCode(issuedAt.plusHours(24));
        joinCode.revoke(issuedAt.plusHours(1), 1L);
        assertThat(joinCode.isUsable(issuedAt.plusHours(2))).isFalse();
    }

    @Test
    @DisplayName("인원이 소진된 부원 초대 링크는 만료 전이라도 사용 불가다")
    void exhaustedInviteIsUnusable() {
        ClubJoinCode joinCode = ClubJoinCode.issueClubInvite(club(), "ABC234", null, 1,
                issuedAt.plusHours(24), false, 1L);
        assertThat(joinCode.tryConsume()).isTrue();
        assertThat(joinCode.isUsable(issuedAt.plusHours(2))).isFalse();
    }

    @Test
    @DisplayName("부원 초대 링크는 귀속 모집이 없고 recruitment id 는 null 로 조회된다")
    void inviteHasNoRecruitment() {
        ClubJoinCode joinCode = inviteCode(issuedAt.plusHours(24));
        assertThat(joinCode.isClubInvite()).isTrue();
        assertThat(joinCode.getRecruitmentIdOrNull()).isNull();
    }
}
```

기존 모집 링크 케이스에도 `getRecruitmentIdOrNull()` 이 모집 id 를 반환하는 단언 1개 추가.

- [ ] **Step 3: 실패 확인** — `cd backend && ./gradlew test --tests ClubJoinCodeTest` → 컴파일 실패(RED).

- [ ] **Step 4: 엔티티 구현**

```java
/** 코드가 귀속된 외부 폼(EXTERNAL) 모집. null 이면 부원 초대 링크(동아리 단위, V107). */
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "recruitment_id")
private Recruitment recruitment;

/** 부원 초대 링크의 절대 만료 시각(V107, seoulClock 벽시계). 모집 링크는 null — ck_club_join_code_link_shape. */
@Column(name = "invite_expires_at")
private LocalDateTime inviteExpiresAt;

/** 부원 초대 링크의 자동 승인 여부(V107). true 면 신청 즉시 승인·가입된다. 생성 후 변경 불가. */
@Column(name = "auto_approve", nullable = false)
private boolean autoApprove;
```

- 빌더/기존 `issue()` 는 무변경(모집 링크 경로 보존). private 빌더에 `inviteExpiresAt`/`autoApprove` 를 추가하고 `issue()` 는 null/false 를 넘긴다.
- 신규 팩토리(joinWindowDays 는 NOT NULL 컬럼이라 미사용 값 0 을 채운다 — 주석 명시):

```java
/** 부원 초대 링크 발급 — 모집 무귀속·절대 만료(스펙 §3). joinWindowDays 는 초대 링크에서 미사용(0 고정). */
public static ClubJoinCode issueClubInvite(Club club, String code, Integer generation,
                                           int maxUses, LocalDateTime inviteExpiresAt,
                                           boolean autoApprove, Long createdById) { ... }

public boolean isClubInvite() { return recruitment == null; }

/** 감사 이벤트 기록용 — 초대 링크는 recruitment 가 없어 null 을 기록한다(V102 컬럼 nullable). */
public Long getRecruitmentIdOrNull() { return recruitment == null ? null : recruitment.getId(); }
```

- `isUsable(now)`: `isRevoked() || isExhausted()` 공통 검사 직후 `if (isClubInvite()) { return !now.isAfter(inviteExpiresAt); }` — **모집 상태 무참조**. 이하 기존 분기 무변경.
- `getJoinExpiresAt()`: 첫 줄에 `if (isClubInvite()) { return inviteExpiresAt; }`.
- 클래스 javadoc 에 링크 2종 판별 규칙 1문단 추가.

- [ ] **Step 5: 통과 확인** — `./gradlew test --tests ClubJoinCodeTest --tests MigrationExpandContractGuardTest --tests RowLevelSecurityMigrationTest` → PASS. (RLS 는 V97 에서 이미 활성 — 신규 테이블이 아니므로 추가 조치 없음 확인.)

- [ ] **Step 6: DB CHECK 거부 테스트** — `ClubJoinCodeRepositoryTest` 에 추가. 엔티티 팩토리는 잘못된 형태를 만들 수 없으므로 CHECK 자체는 `JdbcTemplate` 네이티브 INSERT 로 검증한다(V107 이 실제로 적용됐는지의 증명 — 스펙 §9).

⚠️ **픽스처 전제(리뷰 B2)**: 기존 `ClubJoinCodeRepositoryTest` 에는 공용 셋업이 **없다**(인라인 `saveJoinCode()` 뿐) — `@BeforeEach` 로 club/recruitment 저장 픽스처와 `@Autowired JdbcTemplate` 주입을 신설한다(JdbcTemplate 주입 전례: `JoinCodeCreateConcurrencyTest.java:54`). 코드 문자열은 고정값 금지(파일 자체 규약 `ClubJoinCodeRepositoryTest.java:62` — 전역 unique 충돌) — 시퀀스 기반 헬퍼로 생성한다.

⚠️ **트랜잭션 전제(리뷰 B1)**: 클래스 레벨 `@Transactional` 에서 PostgreSQL 은 첫 제약 위반 후 트랜잭션을 abort 하므로, **위반 INSERT 는 테스트 메서드당 1회** — 아래처럼 3개 테스트로 분리한다(한 메서드에 2회 넣으면 두 번째가 "current transaction is aborted"로 떨어져 단언이 깨진다).

```java
@Test
@DisplayName("최대 인원이 150을 초과하는 가입 링크 행은 DB 가 거부한다")
void maxUsesCheckRejectsOver150() {
    assertThatThrownBy(() -> jdbcTemplate.update(
            "INSERT INTO club_join_code (club_id, recruitment_id, code, max_uses, used_count, join_window_days) "
                    + "VALUES (?, ?, ?, 151, 0, 7)", clubId, recruitmentId, nextCode()))
            .hasMessageContaining("club_join_code_max_uses_check");
}

@Test
@DisplayName("모집이 없는데 절대 만료도 없는 가입 링크 행은 DB 가 거부한다")
void linkShapeCheckRejectsInviteWithoutExpiry() {
    assertThatThrownBy(() -> jdbcTemplate.update(
            "INSERT INTO club_join_code (club_id, code, max_uses, used_count, join_window_days) "
                    + "VALUES (?, ?, 40, 0, 0)", clubId, nextCode()))
            .hasMessageContaining("ck_club_join_code_link_shape");
}

@Test
@DisplayName("모집에 귀속됐는데 절대 만료를 가진 가입 링크 행은 DB 가 거부한다")
void linkShapeCheckRejectsRecruitmentWithExpiry() {
    assertThatThrownBy(() -> jdbcTemplate.update(
            "INSERT INTO club_join_code (club_id, recruitment_id, code, max_uses, used_count, join_window_days, invite_expires_at) "
                    + "VALUES (?, ?, ?, 40, 0, 7, NOW())", clubId, recruitmentId, nextCode()))
            .hasMessageContaining("ck_club_join_code_link_shape");
}
```

(예외 타입은 Spring 변환에 따라 `DataIntegrityViolationException` — 메시지의 제약 이름 포함 단언이 핵심.)

- [ ] **Step 7: Commit** — `feat(backend): 부원 초대 링크 도메인 기반 — V107 마이그레이션·엔티티 분기`

---

## Task 2: 공유 경로 수정 — findByCode LEFT JOIN·감사 null-safe·stale 주석

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/joincode/repository/ClubJoinCodeRepository.java:62-66`
- Modify: `backend/src/main/java/com/duing/domain/joincode/service/GeneralJoinRequestService.java:149-152,197-202`
- Modify: `backend/src/main/java/com/duing/domain/joincode/entity/JoinRequestStatus.java:6`, `backend/src/main/java/com/duing/domain/joincode/api/JoinCodeApi.java:32`
- Test: `backend/src/test/java/com/duing/domain/joincode/repository/ClubJoinCodeRepositoryTest.java` (확장)

**Interfaces:**
- Consumes: Task 1 의 `issueClubInvite`/`getRecruitmentIdOrNull`.
- Produces: `findByCode` 가 초대 링크 행을 반환(모집 링크의 죽은 부모 fail-closed 유지).

- [ ] **Step 1: 실패 테스트** — 리포지토리 테스트에 추가:

```java
@Test
@DisplayName("부원 초대 링크는 귀속 모집이 없어도 코드로 조회된다")
void findByCodeReturnsClubInvite() {
    clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
            club, "AB2345", null, 40, LocalDateTime.now().plusHours(24), false, leaderId));
    assertThat(clubJoinCodeRepository.findByCode("AB2345")).isPresent();
}

@Test
@DisplayName("모집이 삭제된 가입 링크는 코드로 조회되지 않는다")
void findByCodeExcludesDeadRecruitment() {
    // fail-closed(#869) 회귀 가드 — LEFT JOIN 전환 후에도 죽은 모집의 링크는 404 로 떨어져야 한다.
    clubJoinCodeRepository.save(ClubJoinCode.issue(club, recruitment, "AB2346", null, 40, 7, leaderId));
    recruitmentRepository.delete(recruitment);   // @SQLDelete soft delete
    recruitmentRepository.flush();
    assertThat(clubJoinCodeRepository.findByCode("AB2346")).isEmpty();
}

@Test
@DisplayName("동아리가 삭제된 부원 초대 링크는 코드로 조회되지 않는다")
void findByCodeExcludesDeadClubInvite() {
    clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
            club, "AB2347", null, 40, LocalDateTime.now().plusHours(24), false, leaderId));
    clubRepository.delete(club);   // @SQLDelete soft delete
    clubRepository.flush();
    assertThat(clubJoinCodeRepository.findByCode("AB2347")).isEmpty();
}
```

(club/recruitment/leaderId 픽스처는 **Task 1 Step 6 에서 신설한 `@BeforeEach` 셋업**을 사용한다 — 기존 파일에는 공용 픽스처가 없다(리뷰 B2). 코드 문자열도 같은 시퀀스 헬퍼(`nextCode()`)로 생성 — 위 `"AB2345"` 류 고정값은 예시일 뿐 실제로는 헬퍼 호출로 대체. soft-delete 호출 방식은 기존 테스트 전례를 따른다.)

- [ ] **Step 2: 실패 확인** — 초대 링크 조회 케이스가 FAIL(INNER JOIN 이 NULL 행 제외).

- [ ] **Step 3: 구현**

```java
@Query("SELECT joinCode FROM ClubJoinCode joinCode "
        + "JOIN joinCode.club club LEFT JOIN joinCode.recruitment recruitment "
        + "WHERE joinCode.code = :code "
        + "AND club.deletedAt IS NULL "
        + "AND (joinCode.recruitment IS NULL OR recruitment.deletedAt IS NULL)")
Optional<ClubJoinCode> findByCode(@Param("code") String code);
```

javadoc 에 "초대 링크는 모집이 없으므로 LEFT JOIN — 모집 링크의 죽은 모집 fail-closed(#869)는 조건절이 유지" 1줄 추가. `GeneralJoinRequestService` 감사 기록 2곳의 `joinCode.getRecruitment().getId()`/`joinRequest.getJoinCode().getRecruitment().getId()` → `…getRecruitmentIdOrNull()`. stale 주석 2곳을 실제 동작("신청 시점 원자 차감·거절 시 환급")으로 정정 — Swagger 노출 문구(`JoinCodeApi.java:32`) 포함.

- [ ] **Step 4: 통과 + 회귀** — `./gradlew test --tests '*joincode*'` 전체 PASS (기존 스위트 무수정 통과 = 모집 링크 회귀 없음).

- [ ] **Step 5: Commit** — `fix(backend): 가입 링크 공유 경로 초대 링크 대응 — 코드 조회 LEFT JOIN·감사 기록 null-safe·차감 시점 문구 정정`

---

## Task 3: maxUses 상한 150 통일 (BE)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/joincode/controller/dto/request/CreateJoinCodeRequest.java:10-11` (`@Max(500)`→`@Max(150)` + 한국어 메시지·Swagger 설명 동기)
- Test: `backend/src/test/java/com/duing/domain/joincode/controller/ClubJoinCodeControllerTest.java` (확장)

- [ ] **Step 1: 실패 테스트** — "최대 인원이 150을 초과하면 가입 링크를 발급할 수 없다"(151→400) / "최대 인원 150은 발급된다"(150→201). 기존 500 경계 테스트가 있으면 150 기준으로 수정.
- [ ] **Step 2: 실패 확인** — 151 케이스가 201 로 통과해버려 FAIL.
- [ ] **Step 3: 구현** — `@Max(value = 150, message = "최대 사용 인원은 150명 이하여야 합니다.")` (기존 문구 "최대 사용 인원은 500명…"의 톤 그대로 숫자만 교체 — `CreateJoinCodeRequest.java:11`). 150 초과 픽스처는 실측상 `ClubJoinCodeControllerTest:254` 의 501 경계 1건뿐 — 150/151 로 조정 (V107 CHECK 가 INSERT 자체를 거부하므로 남기면 무관 테스트가 깨진다).
- [ ] **Step 4: 통과 확인** — `./gradlew test --tests ClubJoinCodeControllerTest` PASS.
- [ ] **Step 5: Commit** — `feat(backend): 가입 링크 최대 인원 상한 통일 — 500→150 (모집·초대 공통)`

---

## Task 4: 클럽 스코프 초대 링크 API — 발급/활성 조회/폐기

**Files:**
- Create: `backend/src/main/java/com/duing/domain/joincode/api/ClubInviteJoinCodeApi.java`, `controller/ClubInviteJoinCodeController.java`, `controller/dto/request/CreateClubInviteCodeRequest.java`, `service/dto/command/CreateClubInviteCodeCommand.java`
- Modify: `service/JoinCodeService.java`, `service/GeneralJoinCodeService.java`(**`ClubRepository`·`ClubException` 신규 주입/임포트** — 현재 미주입), `repository/ClubJoinCodeRepository.java`, `service/dto/query/JoinCodeQuery.java`, `controller/dto/response/JoinCodeResponse.java`, `exception/JoinCodeException.java`(신규 400 예외 1개), `backend/src/main/java/com/duing/global/config/SecurityConfig.java`(기존 join-codes 매처 블록 `:106-109` 내부에 추가 — **신규 GET 매처는 `clubs/**` GET permitAll(`:110`)보다 앞이어야 한다**. 기존 블록 위치가 이미 그 앞이라 블록 안에 넣으면 자연 충족)
- Create: `backend/src/main/java/com/duing/domain/joincode/entity/JoinCodeLinkType.java`
- Test: `backend/src/test/java/com/duing/domain/joincode/controller/ClubInviteJoinCodeControllerTest.java` (신규)

**Interfaces:**
- Consumes: Task 1 팩토리/판별 메서드.
- Produces:
  - `POST /api/v1/clubs/{clubId}/join-codes` 201 / `GET .../join-codes/active` 200(data null 가능) / `DELETE .../join-codes/{joinCodeId}` 204 멱등
  - `JoinCodeService`: `JoinCodeQuery createClubInvite(CreateClubInviteCodeCommand)`, `Optional<JoinCodeQuery> findActiveClubInvite(Long clubId, Long requesterId)`, `void revokeClubInvite(Long clubId, Long joinCodeId, Long requesterId)`
  - `CreateClubInviteCodeCommand(Long clubId, Long requesterId, Integer maxUses, Integer expiresInHours, Boolean autoApprove, Integer generation)` — compact constructor 에서 `expiresInHours ∈ {24, 72}`(null→24 기본) 검증, 위반 시 신규 400 `InvalidInviteExpiresInHoursException` (`InvalidJoinWindowDaysException` 전례 미러)
  - `JoinCodeQuery`/`JoinCodeResponse` 확장 필드: `JoinCodeLinkType linkType`("RECRUITMENT"|"CLUB_INVITE"), `inviteExpiresAt`(응답은 `TimeMapper.seoulWallClockToInstant` 변환, 모집 링크 null), `autoApprove`
  - Repository: `Optional<ClubJoinCode> findByClubIdAndRecruitmentIsNullAndRevokedAtIsNull(Long clubId)`

- [ ] **Step 1: 실패 테스트** — `ClubInviteJoinCodeControllerTest` (기존 `ClubJoinCodeControllerTest` 의 셋업·헬퍼 패턴 미러):
  - 모집이 하나도 없는 동아리에서 발급 성공(201, linkType=CLUB_INVITE·autoApprove/만료 시각 응답 확인)
  - OPEN 모집이 있어도 무관하게 발급 성공(모집 링크와 독립 — 양쪽 활성 공존 확인)
  - expiresInHours 미지정 → 24시간 만료 / 72 지정 → 72시간 / 48 등 그 외 값 → 400
  - maxUses 151 → 400·150 → 201
  - 활성 링크 존재 시 재발급 → 구 링크 폐기 + 신규 발급, 감사에 `JOIN_LINK_REGENERATED`+`JOIN_LINK_REVOKED` 쌍(recruitment_id null)
  - 최초 발급 감사 `JOIN_LINK_CREATED`(recruitment_id null, actor=요청 운영진)
  - 활성 조회: 없으면 200+data null / 있으면 usedCount·totalRequestCount·pendingCount 포함
  - 폐기: 204 멱등(재호출 시 감사 이벤트 추가 없음) / **모집 링크 id 를 이 경로로 폐기 시도 → 404** / 타 동아리 링크 id → 404
  - 권한: 일반 회원 403·타 동아리 운영진 403(requireManager)·비로그인 401 (3 엔드포인트 전부)
- [ ] **Step 2: 실패 확인** — 컴파일 실패(RED).
- [ ] **Step 3: 구현** — `GeneralJoinCodeService` 에 (기존 `create` 패턴 미러, 모집 검증·모집 행 잠금 없음):

```java
@Override
@Transactional
public JoinCodeQuery createClubInvite(CreateClubInviteCodeCommand createCommand) {
    clubAuthService.requireManager(createCommand.requesterId(), createCommand.clubId());
    Club club = clubRepository.findById(createCommand.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);   // requireManager 통과라 사실상 도달 불가
    LocalDateTime now = LocalDateTime.now(clock);
    Optional<ClubJoinCode> activeCode = clubJoinCodeRepository
            .findByClubIdAndRecruitmentIsNullAndRevokedAtIsNull(createCommand.clubId());
    boolean replaced = false;
    if (activeCode.isPresent()) {
        // 수동 폐기와의 경쟁 방어(리뷰 M2): 무잠금 스냅샷으로 폐기하면 먼저 커밋된 폐기의
        // revoked_at/revoked_by 를 덮어쓰고 JOIN_LINK_REVOKED 를 중복 기록한다 — 모집 경로의
        // 모집 행 잠금에 해당하는 방어를 코드 행 잠금으로 대신하고, 미폐기일 때만 폐기한다.
        ClubJoinCode lockedCode = clubJoinCodeRepository.findWithLockById(activeCode.get().getId())
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        if (!lockedCode.isRevoked()) {
            lockedCode.revoke(now, createCommand.requesterId());
            clubJoinCodeRepository.flush();
            recordJoinLinkEvent(ClubAuditEventType.JOIN_LINK_REVOKED, createCommand.clubId(),
                    null, lockedCode.getId(), createCommand.requesterId());
            replaced = true;
        }
    }
    try {
        ClubJoinCode issued = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                club, generateUniqueCode(), createCommand.generation(), createCommand.maxUses(),
                now.plusHours(createCommand.expiresInHours()), createCommand.autoApprove(),
                createCommand.requesterId()));
        clubJoinCodeRepository.flush();
        // 이 트랜잭션이 실제로 갈아끼웠을 때만 REGENERATED — 경쟁 폐기로 이미 죽어 있었다면 최초 생성이다.
        recordJoinLinkEvent(replaced
                ? ClubAuditEventType.JOIN_LINK_REGENERATED : ClubAuditEventType.JOIN_LINK_CREATED,
                createCommand.clubId(), null, issued.getId(), createCommand.requesterId());
        return JoinCodeQuery.from(issued, 0, 0);
    } catch (DataIntegrityViolationException concurrentIssue) {
        // 동시 생성 경쟁: uk_club_join_code_active_invite_per_club 충돌 → 409 (모집 링크와 동일 규약).
        throw new JoinCodeException.ConcurrentJoinCodeOperationException();
    }
}
```

  - `findActiveClubInvite`: `requireManager` → repo 조회 → `JoinCodeQuery.from(activeCode, countByJoinCodeId, countByJoinCodeIdAndStatus(PENDING))` (기존 `findActive` 미러, `getOwnedRecruitment` 대조 없음).
  - `revokeClubInvite`: `requireManager` → `findById` → `joinCode.isClubInvite() && joinCode.getClub().getId().equals(clubId)` 아니면 404(열거 차단 — 모집 링크·타 동아리 모두) → 멱등 no-op → `revoke` + `JOIN_LINK_REVOKED`(recruitmentId null).
  - `JoinCodeQuery.from`/`JoinCodeResponse` 에 `linkType`(=`joinCode.isClubInvite() ? CLUB_INVITE : RECRUITMENT`)·`inviteExpiresAt`·`autoApprove` 추가 — 기존 모집 스코프 응답에도 함께 실린다(FE 하위호환: 추가 필드만).
  - `ClubInviteJoinCodeApi`(Swagger)·Controller 는 `ClubJoinCodeApi`/`ClubJoinCodeController` 미러(경로에서 recruitmentId 만 빠짐). `SecurityConfig` 의 기존 `clubs/*/recruitments/*/join-codes` 매처 블록 옆에 `clubs/*/join-codes` 3종을 동일 정책(인증 필수)으로 추가.
- [ ] **Step 4: 통과 확인** — `./gradlew test --tests ClubInviteJoinCodeControllerTest --tests ClubJoinCodeControllerTest` PASS.
- [ ] **Step 5: Commit** — `feat(backend): 부원 초대 링크 발급·조회·폐기 API — 동아리 스코프 3종·활성 1개·감사 기록`

---

## Task 5: 학생측 — check 응답 확장 + 자동 승인 플로우 + autoApproved 파생

**Files:**
- Modify: `service/GeneralJoinRequestService.java`(check·createRequest), `service/dto/query/JoinCodeCheckQuery.java`, `controller/dto/response/JoinCodeCheckResponse.java`, `service/dto/query/JoinRequestSummaryQuery.java`, `JoinRequestDetailQuery.java`, `controller/dto/response/JoinRequestSummaryResponse.java`, `JoinRequestDetailResponse.java`
- Test: `backend/src/test/java/com/duing/domain/joincode/controller/JoinCodeControllerTest.java`, `ClubJoinRequestControllerTest.java` (확장)

**Interfaces:**
- Consumes: Task 1 판별 메서드, Task 4 의 `JoinCodeLinkType`.
- Produces:
  - `JoinCodeCheckQuery/Response` + `linkType`, `autoApprove` (랜딩 문구 분기 근거 — FE Task 9 가 소비)
  - `JoinRequestSummaryQuery/Response`·Detail + `autoApproved: boolean` (= 요청이 귀속된 코드의 `autoApprove` — autoApprove 코드의 요청은 전부 자동 승인 경로라 파생이 정확, 스펙 §4)
  - `createRequest`: autoApprove 코드면 같은 트랜잭션에서 즉시 승인·가입

- [ ] **Step 1: 실패 테스트**
  - `JoinCodeControllerTest`: 초대 링크 check 응답(linkType=CLUB_INVITE·autoApprove) / 모집 링크 check 회귀(linkType=RECRUITMENT·autoApprove=false) / 초대 링크 만료·소진·폐기 후 신청 409 / 비 ACTIVE 동아리 차단 / **자동 승인 ON 신청 → 201 + club_member 에 MEMBER 생성 + 요청 APPROVED + 감사 JOIN_REQUEST_CREATED·APPROVED 2건(actor=학생, recruitment_id null)** / 자동 승인 ON + 이미 회원 → 409 / 자동 승인 OFF 신청 → PENDING + 감사 CREATED 1건 / 기수 지정 초대 링크로 자동 가입 시 club_member.generation 반영
  - `ClubJoinRequestControllerTest`: 자동 승인 OFF 초대 링크 요청을 기존 콘솔에서 승인 → MEMBER 등록(기존 플로우 회귀) / 목록·상세 응답에 autoApproved 필드
  - autoApproved 파생의 추가 쿼리 부담은 **없음 확정** — `JoinRequestSummaryQuery.java:30` 이 이미 `getJoinCode().getCode()` 로 프록시를 초기화한다(리뷰 실측, fetch join 불요).
- [ ] **Step 2: 실패 확인** — RED.
- [ ] **Step 3: 구현**
  - `check()`: `JoinCodeCheckQuery` 에 `linkType`/`autoApprove` 실어 반환(비로그인 분기 포함 양쪽).
  - `createRequest()` — 감사 CREATED 기록 직후:

```java
// 자동 승인(스펙 §4): 코드 행 잠금 구간 안이라 이미 회원 검사~enroll 이 직렬화된다 —
// 동시 중복 신청은 후행이 잠금 해제 후 AlreadyMemberException(409)으로 떨어진다.
// 최후 방어선은 uk_club_member_club_user_active + enrollment 서비스의 23505 멱등 처리.
if (joinCode.isAutoApprove()) {
    clubMemberEnrollmentService.enroll(joinCode.getClub(), requester,
            ClubMemberRole.MEMBER, createdRequest.getGeneration());
    createdRequest.approve(requester, LocalDateTime.now(clock));   // decidedBy = 신청자 본인
    clubAuditEventRepository.save(ClubAuditEvent.joinRequest(
            ClubAuditEventType.JOIN_REQUEST_APPROVED, clubId,
            joinCode.getRecruitmentIdOrNull(), joinCode.getId(), createdRequest.getId(),
            createCommand.userId()));
}
```

  (주의: `ClubJoinRequest.approve(User reviewer, LocalDateTime now)` 시그니처를 실제 파일에서 확인해 그대로 사용. PENDING partial unique 는 같은 트랜잭션 내 APPROVED 전이로 커밋 시점에 해제된다.)
  - Summary/Detail Query·Response 에 `autoApproved` 추가: `joinRequest.getJoinCode().isAutoApprove()` (목록 매핑이 이미 code 문자열로 joinCode 프록시를 초기화하므로 추가 쿼리 부담 없음 — 확인 후 필요 시 fetch join).
- [ ] **Step 4: 통과 + 회귀** — `./gradlew test --tests '*joincode*'` 전체 PASS.
- [ ] **Step 5: Commit** — `feat(backend): 부원 초대 링크 가입 플로우 — 자동 승인 옵션·링크 종류 응답·자동 승인 표시 필드`

---

## Task 6: 동아리 폐쇄 시 초대 링크 폐기 + 동시성 테스트

**Files:**
- Modify: `repository/ClubJoinCodeRepository.java`(벌크 2종), `service/JoinCodeService.java`+`GeneralJoinCodeService.java`(`revokeActiveOnClubClosure` 확장), 호출부 시그니처 영향 확인: `backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java:70`
- Test: `backend/src/test/java/com/duing/domain/club/controller/AdminClubClosureControllerTest.java`(확장), `backend/src/test/java/com/duing/domain/joincode/service/ClubInviteConcurrencyTest.java`(신규)

**Interfaces:**
- Produces: 폐쇄 시 초대 링크도 폐기·감사 기록. Repository: `revokeActiveClubInviteByClubId(clubId, revokedAt, revokedById)` / `findActiveClubInviteIdByClubId(clubId)` — 기존 `revokeActiveByRecruitmentId`/`findActiveIdsByRecruitmentId` 미러(벌크 UPDATE + id 선조회, `deletedAt IS NULL` 명시, `recruitment IS NULL` 조건).

- [ ] **Step 1: 실패 테스트**
  - 폐쇄 테스트: 활성 초대 링크가 있는 동아리 폐쇄 → 링크 revoked + `JOIN_LINK_REVOKED`(recruitment_id null, actor=관리자) / 폐기 0건이면 이벤트 미기록(기존 규약).
  - `ClubInviteConcurrencyTest` (기존 `JoinCodeCreateConcurrencyTest` 의 ExecutorService+latch 패턴 미러): 동시 초대 링크 생성 2건 → 활성 1개 + 한쪽 409 / 자동 승인 ON 잔여 1명에 동시 신청 2건 → MEMBER 1명·요청 APPROVED 1건·후행 409 / **수동 폐기 vs 재생성 경쟁 → 구 링크의 `JOIN_LINK_REVOKED` 감사 1건·최초 폐기자(revoked_by) 유지**(Task 4 의 잠금 재조회 방어 검증, 리뷰 M2).
- [ ] **Step 2: 실패 확인** — RED (폐쇄 경로가 recruitmentId 순회라 초대 링크 잔존).
- [ ] **Step 3: 구현** — `revokeActiveOnClubClosure` 의 기존 모집 순회 뒤에 클럽 단위 초대 링크 폐기 1블록 추가(id 선조회 → 벌크 UPDATE → 0건이면 미기록). 메서드 javadoc 의 "모집 삭제 경로와 같은 방식" 서술에 초대 링크 문장 추가.
- [ ] **Step 4: 통과 + 전체 회귀** — `cd backend && ./gradlew test` 전체 PASS (BUILD SUCCESSFUL 출력 확인).
- [ ] **Step 5: Commit** — `fix(backend): 동아리 폐쇄 시 부원 초대 링크 동반 폐기 — 동시성 검증 포함`

---

## Task 7: FE 인터페이스 계층 — types/client/hooks + maxUses 150 동기

**Files:**
- Modify: `frontend/packages/types/src/joinCode.ts`, `frontend/packages/api/src/client.ts`(타입 441-479·구현 1284-1314 블록), `frontend/packages/hooks/src/joinCodes.ts`, `frontend/packages/hooks/src/clubQueryKeys.ts`, `frontend/packages/hooks/src/index.ts`
- Test: `frontend/packages/hooks/test/joinCodes.test.tsx` (확장)

**Interfaces:**
- Consumes: Task 4/5 의 BE 계약.
- Produces (Task 8·9 가 소비):

```ts
// types — JoinCodeSummary 에 추가
linkType: 'RECRUITMENT' | 'CLUB_INVITE';
inviteExpiresAt: IsoInstantString | null;   // 초대 링크만 값 존재
autoApprove: boolean;
// JoinCodeCheck 에 추가: linkType / autoApprove
// JoinRequestSummary 에 추가: autoApproved: boolean  (Detail 은 Summary 확장이라 자동 포함)
export type CreateClubInviteCodePayload = {
  maxUses: number;               // 1~150 — BE 400 백스톱
  expiresInHours: 24 | 72;       // 프리셋 외 값은 타입 차원에서 봉쇄
  autoApprove: boolean;
  generation?: number;
};
// client.joinCodes 에 추가
createClubInvite(clubId: number, payload: CreateClubInviteCodePayload): Promise<JoinCodeSummary>;
getActiveClubInvite(clubId: number): Promise<JoinCodeSummary | null>;
revokeClubInvite(clubId: number, joinCodeId: number): Promise<void>;
// clubQueryKeys 에 추가 — joinCodesAll(clubId) 프리픽스 하위라 invalidateAfterDecision 에 자동 포함
clubInviteCode: (clubId: number) => ['clubs', clubId, 'join-code', 'club-invite'] as const,
// hooks 신규 3종 (기존 모집 스코프 훅 미러)
useClubInviteCodeQuery(clubId: number | undefined)
useCreateClubInviteCodeMutation(clubId: number)   // onSuccess: clubInviteCode 무효화
useRevokeClubInviteCodeMutation(clubId: number)
```

- [ ] **Step 1: 실패 테스트** — hooks 테스트에 3종 추가(기존 useActiveJoinCodeQuery 테스트 패턴 미러): 활성 없음 200+null / 생성 후 무효화 / 폐기 후 무효화. `invalidateAfterDecision` 이 club-invite 키를 덮는 회귀 단언 1개.
- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm --filter @duing/hooks test` RED.
- [ ] **Step 3: 구현** — 위 계약대로. client 구현은 기존 ky 패턴 미러(`clubs/${clubId}/join-codes` 3종). `JoinCodeSummary` 상단 doc 주석의 "링크는 모집에 귀속되며"·"절대 만료일은 없다" 서술을 링크 2종 체제로 정정(모집 링크 한정 서술로 — 초대 링크 도입으로 stale).
- [ ] **Step 4: 통과 확인** — `pnpm --filter @duing/hooks test` + `pnpm typecheck` PASS.
- [ ] **Step 5: Commit** — `feat(frontend): 부원 초대 링크 API 계층 — 타입·클라이언트·훅 3종`

---

## Task 8: 회원 관리 [+ 부원 초대] 다이얼로그 + QR

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/ClubInviteDialog.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx:163-193`(헤더 액션 — "회원 초대 진입점 제거" 주석 자리), `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/MemberEnrollmentSection.tsx`(CreateCodeForm maxUses 상한 500→150 만), `frontend/apps/web/package.json`(react-qr-code)
- Test: `frontend/apps/web/test/manage/members/club-invite-dialog.test.tsx` (신규), `members-page.test.tsx` (확장)

**Interfaces:**
- Consumes: Task 7 훅 3종·`CreateClubInviteCodePayload`.
- Produces: members 헤더 [부원 초대] 버튼 → `ClubInviteDialog` (Radix Dialog — `ExternalRecruitmentActions.tsx` 의 다이얼로그 패턴 미러).

- [ ] **Step 1: react-qr-code 설치** — `frontend/apps/web/package.json` 의 `name` 필드를 먼저 확인하고 `cd frontend && pnpm --filter <그 이름> add react-qr-code` (SVG 렌더·무의존성). 이후 스텝의 `--filter web` 도 같은 이름으로 읽는다.
- [ ] **Step 2: 실패 테스트** — 다이얼로그 테스트(기존 `member-enrollment-section.test.tsx` 의 렌더·모킹 패턴 미러):
  - 활성 링크 없음 → 생성 폼: 유효기간 라디오 "24시간"(기본 선택)/"72시간" · 최대 인원 입력(1~150, 151 입력 시 인라인 에러) · 기수 선택(선택) · 자동 승인 토글 기본 OFF
  - 자동 승인 토글 ON → 경고문 "승인 없이 바로 가입됩니다. 링크 유출에 주의하세요." 노출
  - 활성 링크 있음 → 상태 카드: 만료 일시(`formatDateTimeKst`) · 가입 현황(누적 신청 N / 최대 M · 승인 대기 P — 서버 수치 그대로, 합산 금지) · [링크 복사]·[QR 보기]·[재생성]·[폐기]
  - QR 토글 → `svg` 렌더(값 = `${origin}/join/${code}`)
  - 폐기 → 확인 모달(단일 확인 — 타이핑 2단계 아님, 스펙 §3) → mutation 호출
  - 만료·소진 링크 → "만료됨"/"인원 마감" 상태 표기 + 재생성 유도
- [ ] **Step 3: 실패 확인** — `pnpm --filter web test club-invite-dialog` RED.
- [ ] **Step 4: 구현** — `ClubInviteDialog` 는 `MemberEnrollmentPanel` 의 폼/카드/복사 버튼 구조를 미러하되 모집 결합 없이 작성. members 헤더의 기존 주석("회원 초대 진입점 … 제거했다") 자리에 [부원 초대] 버튼 복원 + 주석을 현행 사유("부원 초대 링크가 실기능으로 추가돼 진입점 복원, 스펙 2026-08-08")로 교체. 복사 실패 폴백·토스트는 기존 `CopyButton` 재사용. `.duing` 스코프 아래 고정 오버레이면 `bg-transparent` 확인(bg-cream 함정).
- [ ] **Step 5: 통과 확인** — `pnpm --filter web test` PASS + `pnpm build` (cwd `frontend/`).
- [ ] **Step 6: Commit** — `feat(frontend): 회원 관리 부원 초대 다이얼로그 — 발급 설정·QR·가입 현황`

---

## Task 9: 랜딩 분기 + 승인 콘솔 배지 + 실브라우저 QA

**Files:**
- Modify: `frontend/apps/web/app/join/[code]/_components/JoinCodeLanding.tsx`, `frontend/apps/web/app/manage/clubs/[clubId]/members/requests/_components/JoinRequestDetailPanel.tsx`(+ 목록 행 `JoinRequestTable.tsx`)
- Test: `frontend/apps/web/test/join/join-code-page.test.tsx`, `frontend/apps/web/test/manage/join-requests-page.test.tsx` (확장)

**Interfaces:**
- Consumes: Task 7 의 `JoinCodeCheck.linkType/autoApprove`, `JoinRequestSummary.autoApproved`.

- [ ] **Step 1: 실패 테스트**
  - 랜딩: `linkType === 'CLUB_INVITE'` → "합격" 문구 부재 + "{동아리명} 부원 초대" 톤 / autoApprove ON 신청 성공 → **재조회로 `alreadyMember=true` 가 된 상태에서도** "가입이 완료되었습니다" + 동아리 페이지 링크 렌더(“이미 가입된 동아리입니다” 문구 부재) / autoApprove OFF → 기존 "운영진 확인 후 등록" 안내 / `linkType === 'RECRUITMENT'` → 기존 합격 축하 문구 회귀 단언
  - 콘솔: `autoApproved: true` 요청 상세 → "자동 승인" 배지 노출, false → 부재
- [ ] **Step 2: 실패 확인** — RED.
- [ ] **Step 3: 구현** — ⚠️ 자동 승인 성공 화면은 기존 분기로는 못 만든다(리뷰 M1): 현재 신청 성공 화면은 mutation 이 아닌 **재조회된 서버 상태**가 렌더하며(`onSettled` 가 check 무효화 → `myRequestStatus==='PENDING'` 분기), 자동 승인 ON 은 재조회 결과가 `alreadyMember=true` 라 기존 98행 분기가 "이미 가입된 동아리입니다"를 렌더한다. 따라서 **`autoApprove && createJoinRequest.isSuccess` 완료 화면 분기를 alreadyMember 분기보다 앞에 신설**한다(이 분기 하나만 우선순위 추가 — 나머지 순서는 무변경). `requestJoin` 성공 토스트(`JoinCodeLanding.tsx:50` "승인되면 알려드릴게요")도 자동 승인 ON 이면 "가입이 완료되었습니다"로 분기. "즉시 등록 표현 금지" 규약은 자동 승인 ON 에는 미적용 — 실제로 등록됐으므로 완료 표현이 정확하다.
- [ ] **Step 4: 통과 확인** — `pnpm --filter web test` + `pnpm typecheck` + `pnpm build` PASS.
- [ ] **Step 5: 실브라우저 QA** (`reference_browser_qa_setup` 규약: :3000 강제·`.env.local` 복사, 로컬 백엔드 기동) — ① 모집 없는 동아리에서 초대 링크 발급→QR 표시→새 계정으로 `/join/{code}` 접속→자동 승인 OFF 신청→콘솔 승인→멤버 확인 ② 자동 승인 ON 재생성→신청 즉시 가입 확인 ③ 폐기 후 접속→무효 안내. 종료 시 dev 서버 정리(부모→워커→포트 순).
- [ ] **Step 6: Commit** — `feat(frontend): 부원 초대 랜딩·승인 콘솔 — 초대 톤 분기·자동 승인 표시`

---

## 최종 검증 · 배포 순서

- [ ] BE 전체: `cd backend && ./gradlew test` — joincode 기존 스위트 무수정 통과 = 모집 링크 회귀 없음의 증명.
- [ ] FE 전체: `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- [ ] 리뷰: 태스크별 duing-code-reviewer + 최종 whole-branch 리뷰. 이 작업은 권한/동시성/Migration/API contract 전부 해당 — **적대적 리뷰 필수** (codex 플러그인 고장 시 fable 적대적 대체 전례).
- [ ] PR: BE(`feat/club-invite-link-be`)→develop, FE(`feat/club-invite-link-fe`, BE 에 스택)→BE 머지 후 base 재지정. **PR 생성만, 자동 머지 금지.**
- [ ] **릴리스 게이트(배포 전 필수)**: prod DB `SELECT count(*) FROM club_join_code WHERE max_uses > 150` = 0 확인 (0 아니면 스펙 §2.1 예비 방침으로 전환·사용자 보고 — V107 이 기존 행 검증에 걸려 배포 실패가 되므로 게이트 없이 배포 금지). Supabase MCP 재인증 필요.
- [ ] 배포: BE(V107)+FE 같은 릴리스, 롤백은 roll-forward 원칙(레포 표준). 스모크: prod 에서 초대 링크 발급→랜딩 확인→폐기.
