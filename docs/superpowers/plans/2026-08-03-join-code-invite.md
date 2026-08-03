# 가입 코드 기반 회원 초대 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 폼 합격자를 가입 코드 → 가입 요청 → 운영진 승인 흐름으로 ClubMember 에 등록한다.

**Architecture:** 신규 `domain/joincode` 패키지(엔티티 2개: ClubJoinCode·ClubJoinRequest). ClubMember 생성은 지원 승인 경로에서 추출한 공통 서비스를 재사용한다. 승인 시 코드 행 비관적 잠금으로 인원을 원자 차감하고, 벌크는 기존 self-proxy 건별 트랜잭션 패턴을 따른다. FE 는 운영진 콘솔(회원 초대 + 가입 요청)과 학생 `/join/[code]` 페이지.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / TestContainers·RestAssured — Next.js 15 / React Query / ky 클라이언트

**스펙:** `docs/join-code-invite-spec.md` (본 계획의 SoT)

## Global Constraints

- 사용자 대면 메시지·`@DisplayName`·커밋 메시지는 모두 한국어. 커밋은 Conventional Commits(`feat(backend): …`), **Co-Authored-By/🤖 Generated 라인 금지**
- **구현 에이전트는 push·PR 생성 금지** — 커밋까지만. PR 은 사용자 지시 후
- BE: `api/` 인터페이스 없이 Controller 금지, DTO 는 record, 서비스는 `{Domain}Service` 인터페이스 + `General…` 구현, 권한 검증은 서비스 레이어(`ClubAuthService`), Flyway 는 새 파일만, 물리 DELETE 금지
- BE 테스트: TestContainers(Docker 필요) 통합 테스트 기본, 컨트롤러는 RestAssured, 픽스처는 `common/fixture/` static 메서드, **새 테이블은 `IntegrationTestBase` TRUNCATE 목록에 자식→부모 순으로 추가**, 날짜는 상대값만(미래 절대날짜 하드코딩 금지)
- BE 예외: `{Domain}Exception extends ApplicationException`(HttpStatus 직접 보유) + static 내부 클래스, GlobalExceptionHandler 가 자동 매핑
- FE: 새 엔드포인트는 ① `packages/types` → ② `packages/api/src/client.ts`(타입 선언부+구현부 두 곳) → ③ `packages/hooks`(+ `index.ts` barrel export) 순. 확인 모달·토스트 규약(실패 시 모달 유지), 로딩은 `components/loading` 공용 체계, 페이지 상단 `pt-page-top` 토큰
- 빌드/테스트 실행 cwd: 백엔드는 `backend/`, 프론트는 `frontend/`
- 리뷰 디시플린: 각 태스크 완료 시 spec+quality 리뷰 디스패치, 이 기능은 권한·상태전이·동시성을 포함하므로 적대적 리뷰 대상

---

## PR-1 `refactor(backend)` — ClubMember 생성 공통 서비스 추출

브랜치: `refactor/club-member-enrollment`. 동작 변화 없음(기존 테스트가 가드). 신규는 generation 파라미터뿐.

### Task 1: ClubMember 팩토리에 generation 지원

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/entity/ClubMember.java`
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberEnrollmentServiceTest.java` (Task 2 에서 생성 — 이 태스크는 컴파일 대상만)

**Interfaces:**
- Produces: `ClubMember.of(Club club, User user, ClubMemberRole role, Integer generation)` — 기존 `of(club, user, role)` 은 `of(club, user, role, null)` 위임으로 유지

- [ ] **Step 1: 빌더에 generation 추가 + 오버로드 팩토리**

```java
// @Builder private 생성자에 Integer generation 파라미터 추가 후:
public static ClubMember of(Club club, User user, ClubMemberRole role) {
    return of(club, user, role, null);
}

public static ClubMember of(Club club, User user, ClubMemberRole role, Integer generation) {
    return ClubMember.builder()
            .club(club)
            .user(user)
            .role(role)
            .generation(generation)
            .build();
}
```

기존 `asLeader`/`asMember` 는 수정하지 않는다.

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL (출력에서 직접 확인 — `| tail` 로 exit code 가리지 말 것)

### Task 2: ClubMemberEnrollmentService 추출 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberEnrollmentService.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberEnrollmentService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` (L364-393 블록 위임, L517-540 헬퍼·`CLUB_MEMBER_UNIQUE_CONSTRAINT` 상수 제거 — `POSTGRES_UNIQUE_VIOLATION_SQL_STATE` 는 application 중복 판정에도 쓰이므로 유지)
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberEnrollmentServiceTest.java`

**Interfaces:**
- Produces:

```java
public interface ClubMemberEnrollmentService {
    /**
     * 호출측 트랜잭션 안에서(Propagation.MANDATORY) upgrade-or-insert 를 수행한다.
     * - 활성 멤버십 없음 → 신규 insert (generation 반영), 동시 삽입 23505 는 멱등 처리
     * - 활성 멤버십 있음 → 상위 역할로만 승급 (기존 generation 은 건드리지 않음)
     */
    void enroll(Club club, User user, ClubMemberRole grantedRole, Integer generation);
}
```

- [ ] **Step 1: 실패하는 통합 테스트 작성** (`@Import(TestcontainersConfiguration.class)` + `@SpringBootTest` + `extends IntegrationTestBase`, 픽스처는 `LeaderSuccessionConcurrencyTest` 의 saveUser/saveActiveClub 헬퍼 스타일)

```java
@Test
@DisplayName("멤버십이 없는 사용자를 등록하면 generation 이 함께 저장된다")
void enrollNewMemberWithGeneration() {
    // saveUser·saveActiveClub 헬퍼로 club, user 준비 후
    transactionTemplate.executeWithoutResult(txStatus ->
            clubMemberEnrollmentService.enroll(club, student, ClubMemberRole.MEMBER, 26));
    ClubMember saved = clubMemberRepository.findByClubIdAndUserId(club.getId(), student.getId()).orElseThrow();
    assertThat(saved.getGeneration()).isEqualTo(26);
    assertThat(saved.getRole()).isEqualTo(ClubMemberRole.MEMBER);
}

@Test
@DisplayName("이미 상위 역할인 멤버를 등록해도 강등되지 않고 기존 generation 이 유지된다")
void enrollExistingOfficerKeepsRoleAndGeneration() { /* OFFICER+gen 25 선등록 → enroll(MEMBER, 26) → 여전히 OFFICER, gen 25 */ }

@Test
@DisplayName("탈퇴한 멤버를 다시 등록하면 새 멤버십 행이 생성된다")
void enrollAfterWithdrawalInsertsNewRow() { /* 멤버 저장 → delete(soft) → enroll → 활성 행 존재 */ }
```

`Propagation.MANDATORY` 이므로 테스트는 `TransactionTemplate` 으로 감싼다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests ClubMemberEnrollmentServiceTest`
Expected: FAIL (클래스 미존재 컴파일 에러)

- [ ] **Step 3: 구현 — GeneralApplicationService L375-392 블록을 그대로 이식**

```java
@Service
@RequiredArgsConstructor
public class GeneralClubMemberEnrollmentService implements ClubMemberEnrollmentService {

    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";
    private static final String CLUB_MEMBER_UNIQUE_CONSTRAINT = "uk_club_member_club_user_active";

    private final ClubMemberRepository clubMemberRepository;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void enroll(Club club, User user, ClubMemberRole grantedRole, Integer generation) {
        clubMemberRepository.findByClubIdAndUserId(club.getId(), user.getId())
                .ifPresentOrElse(
                        existingMembership -> {
                            if (shouldUpgrade(existingMembership.getRole(), grantedRole)) {
                                existingMembership.changeRole(grantedRole);
                            }
                        },
                        () -> {
                            try {
                                clubMemberRepository.save(ClubMember.of(club, user, grantedRole, generation));
                                clubMemberRepository.flush();
                            } catch (DataIntegrityViolationException racedInsertion) {
                                if (!isClubMemberDuplicateMembership(racedInsertion)) {
                                    throw racedInsertion;
                                }
                                // 다른 트랜잭션이 먼저 (club, user) 멤버십을 등록한 경우로 간주, 멱등 처리.
                            }
                        });
    }
    // shouldUpgrade / isClubMemberDuplicateMembership 를 GeneralApplicationService 에서 그대로 이동 (javadoc 포함)
}
```

- [ ] **Step 4: GeneralApplicationService 위임 전환**

`updateStatus` 의 ACCEPTED 분기 본문을 다음으로 교체 (기존 주석 블록 L364-370 은 enrollment 서비스 javadoc 으로 이동):

```java
if (updateApplicationStatusCommand.status() == ApplicationStatus.ACCEPTED) {
    clubMemberEnrollmentService.enroll(
            application.getRecruitment().getClub(),
            application.getUser(),
            application.getRecruitment().getTargetRole().toClubMemberRole(),
            null);
}
```

- [ ] **Step 5: 신규 + 기존 회귀 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests ClubMemberEnrollmentServiceTest --tests '*Application*'`
Expected: PASS (지원 승인 경로 기존 테스트 전부 초록)

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `cd backend && ./gradlew test` → BUILD SUCCESSFUL 확인 후

```bash
git add backend/src
git commit -m "refactor(backend): 지원 승인의 ClubMember 생성 로직 공통 서비스 추출 — generation 파라미터 지원"
```

---

## PR-2 `feat(backend)` — 가입 코드 관리 API (운영진)

브랜치: `feat/join-code-manage-api` (PR-1 머지 후 develop 분기)

### Task 3: 마이그레이션 + 엔티티 + 코드 생성기

**Files:**
- Create: `backend/src/main/resources/db/migration/V97__create_club_join_code.sql` (**작성 시점 develop 최신 버전 확인 후 번호 조정**)
- Create: `backend/src/main/java/com/duing/domain/joincode/entity/ClubJoinCode.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/repository/ClubJoinCodeRepository.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/service/JoinCodeGenerator.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE 목록에 `club_join_code` 추가 — `club_member` 근처, 자식→부모 순)
- Test: `backend/src/test/java/com/duing/domain/joincode/entity/ClubJoinCodeTest.java`

**Interfaces:**
- Produces: `ClubJoinCode.issue(Club, Recruitment, String code, Integer generation, int maxUses, LocalDateTime expiresAt)`(recruitment LAZY 연관 — 귀속 EXTERNAL 모집), `revoke(now)`, `isUsable(now)`(미폐기·미만료·미소진 **+ 귀속 모집 status == OPEN** — 모집 마감 시 파생적으로 사용 불가, 마감 경로별 폐기 훅 불필요), `tryConsume()`, `JoinCodeGenerator.generate() → String`(6자), Repository: `Optional<ClubJoinCode> findByClubIdAndRevokedAtIsNull(Long clubId)`, `Optional<ClubJoinCode> findByCode(String code)`, `boolean existsByCode(String code)`, `@Lock(PESSIMISTIC_WRITE) Optional<ClubJoinCode> findWithLockById(Long id)`

- [ ] **Step 1: 마이그레이션 작성** (컬럼 타입·NOW() 스타일은 V93·V96 등 최신 마이그레이션과 동일하게 맞춘다)

```sql
-- 가입 코드: 동아리당 활성(미폐기) 1개. 폐기·만료 행도 감사 이력으로 보존한다.
-- 코드 행은 soft-delete 하지 않는다(폐기=revoked_at) — code 전역 unique 와 existsByCode 가 이 전제에 의존.
CREATE TABLE club_join_code (
    id             BIGSERIAL PRIMARY KEY,
    club_id        BIGINT       NOT NULL REFERENCES club (id),
    recruitment_id BIGINT       NOT NULL REFERENCES recruitment (id),  -- 귀속 EXTERNAL 모집 (테이블명은 기존 마이그레이션에서 확인)
    code           VARCHAR(6)   NOT NULL,
    generation INTEGER,
    max_uses   INTEGER      NOT NULL CHECK (max_uses BETWEEN 1 AND 500),
    used_count INTEGER      NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    expires_at TIMESTAMP    NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX uk_club_join_code_code ON club_join_code (code);
-- 동아리당 활성 코드 1개 (동시 재생성 race 도 DB 레벨 차단)
CREATE UNIQUE INDEX uk_club_join_code_active_per_club
    ON club_join_code (club_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;

-- 누락 시 RowLevelSecurityMigrationTest 가 BUILD FAILED (V94 말미 주석·V92 전례)
ALTER TABLE club_join_code ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: 엔티티 단위 판정 테스트 작성** (통합 컨텍스트 불필요 — 순수 단위)

```java
@Test
@DisplayName("만료·폐기·소진·모집 마감 중 하나라도 해당하면 사용할 수 없는 코드다")
void unusableWhenExpiredRevokedExhaustedOrRecruitmentClosed() { /* isUsable(now) 각 케이스 false(모집 CLOSED 포함), 정상 케이스 true */ }

@Test
@DisplayName("잔여 인원이 남아 있을 때만 사용 인원 차감에 성공한다")
void tryConsumeRespectsMaxUses() { /* maxUses=1: 첫 tryConsume()=true, 둘째=false */ }
```

- [ ] **Step 3: 엔티티 구현** — ClubMember 와 동일 어노테이션 세트(`@SQLDelete`/`@SQLRestriction`, `@Builder` private 생성자, LAZY club). 핵심 메서드:

```java
public void revoke(LocalDateTime now) { this.revokedAt = now; }
public boolean isRevoked() { return revokedAt != null; }
public boolean isExpired(LocalDateTime now) { return now.isAfter(expiresAt); }
public boolean isExhausted() { return usedCount >= maxUses; }
/** 모집 마감(CLOSED)은 파생적으로 사용 불가 — 마감 경로(수동·자동)마다 폐기 훅을 심지 않는다(스펙 4.1). */
public boolean isUsable(LocalDateTime now) {
    return !isRevoked() && !isExpired(now) && !isExhausted()
            && recruitment.getStatus() == RecruitmentStatus.OPEN;
}

/** 잠금 하에서 호출한다(findWithLockById). 잔여가 없으면 false. */
public boolean tryConsume() {
    if (isExhausted()) {
        return false;
    }
    this.usedCount++;
    return true;
}
```

- [ ] **Step 4: 코드 생성기** — Crockford Base32(혼동 문자 I/L/O/U 제외), `PhoneVerificationCodeDeriver` 와 같은 문자셋

```java
@Component
public class JoinCodeGenerator {
    private static final char[] CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final int CODE_LENGTH = 6;
    private final SecureRandom secureRandom = new SecureRandom();

    public String generate() {
        StringBuilder codeBuilder = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            codeBuilder.append(CROCKFORD_ALPHABET[secureRandom.nextInt(CROCKFORD_ALPHABET.length)]);
        }
        return codeBuilder.toString();
    }
}
```

- [ ] **Step 5: 테스트 통과 확인 + 커밋**

Run: `cd backend && ./gradlew test --tests ClubJoinCodeTest`
Expected: PASS

```bash
git add backend/src
git commit -m "feat(backend): 가입 코드 엔티티·마이그레이션 — 동아리당 활성 1개 partial unique"
```

### Task 4: 코드 생성/조회/폐기 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/joincode/api/ClubJoinCodeApi.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/ClubJoinCodeController.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/dto/request/CreateJoinCodeRequest.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/dto/response/JoinCodeResponse.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/service/JoinCodeService.java` + `GeneralJoinCodeService.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/service/dto/command/CreateJoinCodeCommand.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/service/dto/query/JoinCodeQuery.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/exception/JoinCodeException.java`
- Modify: `SecurityConfig` — **`GET /api/v1/clubs/*/join-codes/**`·`GET /api/v1/clubs/*/join-requests/**` authenticated 매처를 `GET /api/v1/clubs/**` permitAll(L106) 앞에 추가** (members L100·facility-bookings L103-105 전례 — 누락 시 전화번호 포함 조회가 비로그인 통과)
- Modify: `TIMEZONE.md` — 신규 응답 필드 대응표 행 추가 (expiresAt: seoulClock 기록 → `seoulWallClockToInstant`)
- Test: `backend/src/test/java/com/duing/domain/joincode/controller/ClubJoinCodeControllerTest.java` (RestAssured), `backend/src/test/java/com/duing/domain/joincode/service/JoinCodeCreateConcurrencyTest.java`

**Interfaces:**
- Consumes: Task 3 전체
- Produces: REST — `POST /api/v1/clubs/{clubId}/join-codes`(201), `GET /api/v1/clubs/{clubId}/join-codes/active`(200, 활성 없으면 data null — FE `jsonOkNullable` 규약 정합), `DELETE /api/v1/clubs/{clubId}/join-codes/{joinCodeId}`(204, 이미 폐기면 no-op 멱등·revoked_at 미변경). `JoinCodeResponse(Long joinCodeId, String code, Integer generation, int maxUses, int usedCount, Instant expiresAt, boolean recruitmentOpen)`(콘솔의 "모집 마감으로 사용 불가" 표시용) — **TIMEZONE.md 신규 API 절대 규칙: LocalDateTime JSON 금지, `TimeMapper.seoulWallClockToInstant`(expiresAt 은 seoulClock 기록)**. 서비스 — `JoinCodeQuery create(CreateJoinCodeCommand)`, `Optional<JoinCodeQuery> findActive(Long clubId, Long requesterId)`, `void revoke(Long clubId, Long joinCodeId, Long requesterId)`
- 예외: `JoinCodeException.JoinCodeNotFoundException`(404, "유효하지 않은 가입 코드입니다."), `ConcurrentJoinCodeOperationException`(409), `ExternalRecruitmentRequiredException`(409, "진행 중인 외부 폼 모집이 있을 때만 가입 코드를 생성할 수 있습니다.")

- [ ] **Step 1: RestAssured 실패 테스트 작성** — 시나리오: OPEN EXTERNAL 모집 보유 리더 생성 201(응답 code 6자·만료≈now+30일·expiresAt 은 `…Z` Instant 직렬화·recruitmentOpen=true) / **INTERNAL 모집만 있으면 409 / EXTERNAL+CLOSED 만 있으면 409** / 재생성 시 이전 코드 폐기되고 새 코드만 활성 / `expiresInDays=15` 400 / `maxUses=501` 400 / 일반 멤버 생성 403 / 타 동아리 운영진 403 / **비로그인 생성·active 조회·폐기 401** (Security 매처 가드) / active 없음 200 data null / 폐기 후 active 200 data null / 이미 폐기된 코드 재폐기 204(revoked_at 미변경) / 타 동아리 코드 폐기 시도 404

- [ ] **Step 2: 실패 확인** — Run: `cd backend && ./gradlew test --tests ClubJoinCodeControllerTest` → FAIL

- [ ] **Step 3: Request/Command 검증 구현**

```java
public record CreateJoinCodeRequest(
        @NotNull(message = "최대 사용 인원은 필수 입력값입니다.")
        @Min(value = 1, message = "최대 사용 인원은 1명 이상이어야 합니다.")
        @Max(value = 500, message = "최대 사용 인원은 500명 이하여야 합니다.")
        Integer maxUses,
        @NotNull(message = "만료 기간은 필수 입력값입니다.")
        Integer expiresInDays,
        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer generation
) { }
```

`CreateJoinCodeCommand` compact constructor 에서 `expiresInDays` 가 7/30/90 이 아니면 `InvalidRequestException`(기존 400 예외 패턴 — CreateRecruitmentCommand 전례) 발생.

- [ ] **Step 4: 서비스 구현** — 핵심(재생성 원자성):

```java
@Override
@Transactional
public JoinCodeQuery create(CreateJoinCodeCommand createCommand) {
    clubAuthService.requireManager(createCommand.requesterId(), createCommand.clubId());
    Club club = clubRepository.findById(createCommand.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);

    // 외부 폼 모집 한정(스펙 4.1): OPEN + EXTERNAL 모집이 있을 때만 생성, 복수면 최신 1건에 귀속
    Recruitment openExternalRecruitment = recruitmentRepository
            .findTopByClubIdAndStatusAndApplicationModeOrderByIdDesc(
                    createCommand.clubId(), RecruitmentStatus.OPEN, ApplicationMode.EXTERNAL)
            .orElseThrow(JoinCodeException.ExternalRecruitmentRequiredException::new);

    LocalDateTime now = LocalDateTime.now(clock);   // PhoneVerification 서비스와 같은 Clock 빈 주입

    // Hibernate 는 INSERT 를 UPDATE 보다 먼저 flush 하므로, 폐기를 먼저 flush 하지 않으면
    // 신규 INSERT 가 uk_club_join_code_active_per_club 에 걸린다.
    clubJoinCodeRepository.findByClubIdAndRevokedAtIsNull(createCommand.clubId())
            .ifPresent(activeCode -> {
                activeCode.revoke(now);
                clubJoinCodeRepository.flush();
            });

    try {
        ClubJoinCode issued = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, openExternalRecruitment, generateUniqueCode(), createCommand.generation(),
                createCommand.maxUses(), now.plusDays(createCommand.expiresInDays())));
        clubJoinCodeRepository.flush();
        return JoinCodeQuery.from(issued);
    } catch (DataIntegrityViolationException concurrentIssue) {
        // 동시 재생성: partial unique 충돌 → 409 로 변환해 재시도 유도
        throw new JoinCodeException.ConcurrentJoinCodeOperationException();
    }
}

private String generateUniqueCode() {
    for (int attempt = 0; attempt < 5; attempt++) {
        String candidate = joinCodeGenerator.generate();
        if (!clubJoinCodeRepository.existsByCode(candidate)) {
            return candidate;
        }
    }
    throw new IllegalStateException("가입 코드 생성이 반복 충돌했습니다.");
}
```

`revoke(clubId, joinCodeId, requesterId)` 는 requireManager 후 `findById` → **소속 club 불일치 시 404** (IDOR 차단: 존재 여부 열거 방지를 위해 403 이 아닌 404) → 이미 폐기면 no-op(멱등, 감사 시각 보존) → `revoke(now)`.

- [ ] **Step 5: 동시성 테스트** (`LeaderSuccessionConcurrencyTest` 패턴 — 2스레드 invokeAll, 예외를 반환값으로 수집)

```java
@Test
@DisplayName("두 운영진이 동시에 코드를 생성해도 활성 코드는 정확히 1개만 남는다")
void concurrentCreateLeavesSingleActiveCode() {
    // 같은 club 에 대해 2스레드 동시 create → 한쪽은 성공, 다른쪽은 성공 또는 409
    // 검증: findByClubIdAndRevokedAtIsNull 정확히 1건
}
```

- [ ] **Step 6: 전체 통과 + 커밋**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.joincode.*'` → PASS, 이후 `./gradlew test` 전체 확인

```bash
git add backend/src
git commit -m "feat(backend): 가입 코드 생성·조회·폐기 API — 재생성 원자성·운영진 권한 가드"
```

---

## PR-3 `feat(backend)` — 코드 확인·가입 요청 생성 API (학생)

브랜치: `feat/join-request-create-api` (PR-2 머지 후 분기)

### Task 5: 가입 요청 엔티티 + 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V98__create_club_join_request.sql` (번호는 작성 시점 재확인)
- Create: `backend/src/main/java/com/duing/domain/joincode/entity/ClubJoinRequest.java`, `JoinRequestStatus.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/exception/JoinRequestException.java` (`AlreadyProcessedException`(409)·`JoinRequestNotFoundException`(404) 포함 — 나머지 내부 예외는 Task 6 에서 추가)
- Create: `backend/src/main/java/com/duing/domain/joincode/repository/ClubJoinRequestRepository.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE 에 `club_join_request` — `club_join_code` 앞)
- Test: `backend/src/test/java/com/duing/domain/joincode/entity/ClubJoinRequestTest.java`

**Interfaces:**
- Produces: `JoinRequestStatus { PENDING, APPROVED, REJECTED }`, `ClubJoinRequest.pending(Club, User, ClubJoinCode)`(코드의 generation 스냅샷), `approve(User reviewer, LocalDateTime now)`, `reject(User reviewer, LocalDateTime now)`, `rejectAutomatically(User reviewer, LocalDateTime now)`(reject_reason="이미 가입된 회원"), `isPending()`. Repository: `boolean existsByClubIdAndUserIdAndStatus(Long, Long, JoinRequestStatus)`, `Optional<ClubJoinRequest> findByIdAndClubId(Long, Long)`, `Optional<ClubJoinRequest> findTopByClubIdAndUserIdOrderByIdDesc(Long, Long)`, `List<ClubJoinRequest> findAllByClubIdAndStatusOrderByIdDesc(Long, JoinRequestStatus)`

- [ ] **Step 1: 마이그레이션**

```sql
-- 가입 요청: 승인 시 ClubMember 가 생성된다. APPROVED 행이 곧 코드 사용 감사 이력.
CREATE TABLE club_join_request (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT      NOT NULL REFERENCES club (id),
    user_id       BIGINT      NOT NULL REFERENCES users (id),
    join_code_id  BIGINT      NOT NULL REFERENCES club_join_code (id),
    generation    INTEGER,
    status        VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reject_reason VARCHAR(100),
    reviewed_by   BIGINT      REFERENCES users (id),
    reviewed_at   TIMESTAMP,
    version       BIGINT      NOT NULL DEFAULT 0,
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

-- 사용자당 동아리별 대기 요청 1개 (동시 중복 요청 DB 레벨 차단)
CREATE UNIQUE INDEX uk_club_join_request_pending
    ON club_join_request (club_id, user_id) WHERE status = 'PENDING' AND deleted_at IS NULL;
CREATE INDEX idx_club_join_request_club_status ON club_join_request (club_id, status);

-- 누락 시 RowLevelSecurityMigrationTest 가 BUILD FAILED
ALTER TABLE club_join_request ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: 엔티티 상태 전이 단위 테스트** — `@DisplayName("대기 중인 요청만 승인·거절할 수 있다")` (PENDING 아닌 상태에서 approve/reject 호출 시 도메인 예외 `JoinRequestException.AlreadyProcessedException`(409) — 이 태스크에서 생성), `@DisplayName("요청 생성 시 코드의 기수가 스냅샷으로 저장된다")`

- [ ] **Step 3: 구현 + 통과 확인** — `pending()` 팩토리에서 `this.generation = joinCode.getGeneration()` 스냅샷. approve/reject/rejectAutomatically 는 `reviewedBy`/`reviewedAt` 기록. **`@Version private Long version` 필드 필수** (동일 요청 동시 처리 시 이중 차감·거절 덮어쓰기 방지 — `Application.java`·`LeaderSuccessionRequest.java` 전례).

Run: `cd backend && ./gradlew test --tests ClubJoinRequestTest` → PASS

- [ ] **Step 4: 커밋** — `git commit -m "feat(backend): 가입 요청 엔티티 — PENDING partial unique·기수 스냅샷"`

### Task 6: 코드 확인 + 요청 생성 API (rate limit 포함)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/joincode/api/JoinCodeApi.java` (학생용)
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/JoinCodeController.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/dto/response/JoinCodeCheckResponse.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/service/JoinRequestService.java` + `GeneralJoinRequestService.java` (check·createRequest 부터, 승인은 PR-4)
- Create: `backend/src/main/java/com/duing/domain/joincode/service/JoinCodeRateLimiter.java`
- Modify: `backend/src/main/java/com/duing/domain/joincode/exception/JoinRequestException.java` (Task 5 에서 생성 — 내부 예외 추가)
- Modify: Spring Security 설정 — `GET /api/v1/join-codes/*` permitAll 추가 (`rg -n "permitAll" backend/src/main/java/com/duing/global` 로 화이트리스트 위치 확인, 기존 공개 GET 전례와 같은 자리)
- Test: `backend/src/test/java/com/duing/domain/joincode/controller/JoinCodeControllerTest.java`, `backend/src/test/java/com/duing/domain/joincode/service/JoinRequestCreateConcurrencyTest.java`

**Interfaces:**
- Consumes: Task 3·5, `ClubMemberRepository.findByClubIdAndUserId`
- Produces: REST — `GET /api/v1/join-codes/{code}`(200, 비로그인 허용 — 미존재 404), `POST /api/v1/join-codes/{code}/requests`(201, 인증 필수). `JoinCodeCheckResponse(Long clubId, String clubName, Integer generation, boolean usable, Boolean alreadyMember, String myRequestStatus)` — 비로그인이면 뒤 2개 null
- 예외: `JoinRequestException.AlreadyMemberException`(409, "이미 가입된 동아리입니다."), `DuplicatePendingRequestException`(409, "이미 가입 요청이 접수되어 있습니다."), `UnusableJoinCodeException`(409, "사용할 수 없는 가입 코드입니다."), `JoinCodeRateLimitedException`(429)
- Rate limit: 코드 확인 IP당 분30/시200 (MO 상태조회와 동일 수치), 요청 생성 IP당 분10/시60 (MO 발급과 동일 수치)

- [ ] **Step 1: RestAssured 실패 테스트 작성** — 시나리오: 비로그인 확인 200(clubName 포함, alreadyMember/myRequestStatus null) / 소문자 코드도 대문자 정규화되어 조회됨 / 미존재 코드 404 / 만료 코드 확인 200 usable=false / 로그인 확인 시 myRequestStatus 반영 / 요청 생성 201 후 재요청 409 / 활성 멤버 요청 409 / REJECTED 후 재요청 201 / 만료·폐기·소진 코드 요청 409 / **비 ACTIVE 동아리 코드: 확인 usable=false·요청 409** / **귀속 모집 CLOSED 전환 후: 확인 usable=false·요청 409** / 비로그인 요청 401

- [ ] **Step 2: 실패 확인** — Run: `cd backend && ./gradlew test --tests JoinCodeControllerTest` → FAIL

- [ ] **Step 3: JoinCodeRateLimiter 구현** — `PhoneVerificationRateLimiter` 의 `assertAndRecordWithin`(compute 콜백 키 단위 원자) 패턴 복제: 맵 2개(checkTimesByIp, requestTimesByIp) + 상수 4개 + public 메서드 2개 + 테스트용 `reset()`. 초과 시 `JoinCodeRateLimitedException`. clientIp 추출은 MO 컨트롤러가 쓰는 기존 방식 그대로.

- [ ] **Step 4: 서비스 구현**

```java
@Override
@Transactional
public void createRequest(CreateJoinRequestCommand createCommand) {
    joinCodeRateLimiter.assertAndRecordRequestCreation(createCommand.clientIp(), LocalDateTime.now(clock));
    ClubJoinCode joinCode = clubJoinCodeRepository.findByCode(normalizeCode(createCommand.rawCode()))
            .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
    LocalDateTime now = LocalDateTime.now(clock);
    // 비 ACTIVE 동아리는 코드 무효 취급 — 승인측 requireActiveClub 과 대칭 (처리 불가 PENDING 누적 방지)
    if (!joinCode.isUsable(now) || joinCode.getClub().getStatus() != ClubStatus.ACTIVE) {
        throw new JoinRequestException.UnusableJoinCodeException();
    }
    Long clubId = joinCode.getClub().getId();
    if (clubMemberRepository.findByClubIdAndUserId(clubId, createCommand.userId()).isPresent()) {
        throw new JoinRequestException.AlreadyMemberException();
    }
    if (clubJoinRequestRepository.existsByClubIdAndUserIdAndStatus(clubId, createCommand.userId(), JoinRequestStatus.PENDING)) {
        throw new JoinRequestException.DuplicatePendingRequestException();
    }
    User requester = userRepository.findById(createCommand.userId())
            .orElseThrow(UserException.UserNotFoundException::new);
    try {
        clubJoinRequestRepository.save(ClubJoinRequest.pending(joinCode.getClub(), requester, joinCode));
        clubJoinRequestRepository.flush();
    } catch (DataIntegrityViolationException racedDuplicate) {
        // 동시 중복 요청: uk_club_join_request_pending 충돌만 409 로 변환 (enrollment 서비스의 23505 판정 패턴)
        throw new JoinRequestException.DuplicatePendingRequestException();
    }
}

private String normalizeCode(String rawCode) {
    return rawCode.trim().toUpperCase(Locale.ROOT);
}
```

`check()` 는 readOnly 로 코드 조회 + `usable = joinCode.isUsable(now) && club.getStatus() == ClubStatus.ACTIVE` + (인증 시) `alreadyMember`·`findTopByClubIdAndUserIdOrderByIdDesc` 의 status. 공개 엔드포인트이므로 `@AuthenticationPrincipal UserPrincipal currentUser` null 허용 처리(`FederationFaqController` 전례).

- [ ] **Step 5: 동시 중복 요청 테스트** — `@DisplayName("같은 사용자가 동시에 두 번 요청해도 PENDING 요청은 1개만 생성된다")` (2스레드 invokeAll → PENDING 1건, 실패 스레드는 409 도메인 예외)

- [ ] **Step 6: 전체 통과 + 커밋**

Run: `cd backend && ./gradlew test` → BUILD SUCCESSFUL

```bash
git add backend/src
git commit -m "feat(backend): 가입 코드 확인·가입 요청 생성 API — rate limit·중복 요청 차단"
```

---

## PR-4 `feat(backend)` — 가입 요청 조회·승인/거절/일괄 승인 API (운영진)

브랜치: `feat/join-request-approve-api` (PR-3 머지 후 분기)

### Task 7: 요청 목록/상세 조회

**Files:**
- Create: `backend/src/main/java/com/duing/domain/joincode/api/ClubJoinRequestApi.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/ClubJoinRequestController.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/dto/response/JoinRequestSummaryResponse.java`, `JoinRequestDetailResponse.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/service/dto/query/JoinRequestSummaryQuery.java`, `JoinRequestDetailQuery.java`
- Modify: `GeneralJoinRequestService.java` (목록·상세 메서드 추가)
- Test: `backend/src/test/java/com/duing/domain/joincode/controller/ClubJoinRequestControllerTest.java`

**Interfaces:**
- Produces: `GET /api/v1/clubs/{clubId}/join-requests?status=PENDING`(기본 PENDING) — Summary: `(Long joinRequestId, String userName, String studentId, String major, String code, Integer generation, String status, Instant requestedAt)`. `GET /api/v1/clubs/{clubId}/join-requests/{joinRequestId}` — Detail: Summary + `String phone`, `String rejectReason`, `Instant reviewedAt` (**전화번호는 상세에만** — ApplicantDetailResponse 전례)
- 시각 변환(TIMEZONE.md 절대 규칙): `requestedAt`(BaseEntity created_at) → `TimeMapper.systemWallClockToInstant`, `reviewedAt`(seoulClock 기록) → `seoulWallClockToInstant` — writer 별 구분 필수, TIMEZONE.md 대응표 행 추가

- [ ] **Step 1: RestAssured 실패 테스트** — 운영진 목록 200(기본 PENDING 만)·status 필터 / 상세에 phone 포함, 목록엔 없음 / **비로그인 목록·상세 401** (Task 4 의 Security 매처 가드) / 일반 멤버 403 / 타 동아리 요청 상세 404
- [ ] **Step 2: 실패 확인 → 구현 → 통과** — 조회는 `findAllByClubIdAndStatusOrderByIdDesc` + user LAZY fetch join(QueryDSL 불필요, `@Query` JPQL 로 충분). 권한은 `clubAuthService.requireManager`, 상세는 `findByIdAndClubId` 로 소속 대조(불일치 404)
- [ ] **Step 3: 커밋** — `git commit -m "feat(backend): 가입 요청 목록·상세 조회 API — 전화번호는 상세 한정"`

### Task 8: 승인/거절 단건 + 일괄 승인

**Files:**
- Modify: `ClubJoinRequestApi.java`/`ClubJoinRequestController.java` (PATCH 단건, POST bulk-approve)
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/dto/request/DecideJoinRequestRequest.java`, `BulkApproveJoinRequestsRequest.java`
- Create: `backend/src/main/java/com/duing/domain/joincode/controller/dto/response/JoinRequestDecisionResponse.java`, `BulkApproveJoinRequestsResponse.java`
- Modify: `GeneralJoinRequestService.java`, `JoinRequestService.java`
- Test: `ClubJoinRequestControllerTest.java` 확장, `backend/src/test/java/com/duing/domain/joincode/service/JoinRequestApproveConcurrencyTest.java`

**Interfaces:**
- Consumes: `ClubMemberEnrollmentService.enroll(club, user, MEMBER, generationSnapshot)` (PR-1), `ClubJoinCodeRepository.findWithLockById`, `ClubJoinCode.tryConsume()`
- Produces: `PATCH /api/v1/clubs/{clubId}/join-requests/{joinRequestId}` body `{"status": "APPROVED"|"REJECTED"}` → **200** `{"result": "APPROVED"|"REJECTED"|"AUTO_REJECTED"}` (자동 거절 결과를 전달해야 하므로 204 규약 대신 200+body — Api `@Operation` 에 사유 명시), `POST /api/v1/clubs/{clubId}/join-requests/bulk-approve` body `{"joinRequestIds": [..]}` → 200 `{"approvedCount": n, "failures": [{"joinRequestId": id, "reason": "…"}]}`
- 예외: `JoinRequestException.AlreadyProcessedException`(409, "이미 처리된 요청입니다."), `JoinCodeException.InsufficientRemainingUsesException`(409, "잔여 사용 가능 인원이 부족합니다."), `JoinRequestException.ConcurrentDecisionException`(409, "동시에 처리된 요청입니다. 새로고침 후 다시 확인해 주세요.")

- [ ] **Step 1: 실패 테스트 작성** — 승인 200 APPROVED + ClubMember 생성(generation 스냅샷 반영) + used_count 증가 / 거절 200 REJECTED + 멤버 미생성·미차감 / 승인 전 다른 경로로 멤버가 된 요청 승인 → 200 AUTO_REJECTED + reject_reason="이미 가입된 회원" + 미차감 / 잔여 0 승인 → 409 / 이미 처리된 요청 → 409 / 코드 폐기 후에도 PENDING 승인 성공 / **귀속 모집 마감 후에도 PENDING 승인 성공**(스펙 4.1 — 승인은 코드 사용 가능 여부와 무관) / 탈퇴자 요청 승인 → 새 멤버십 행 / bulk: 3건 중 잔여 1 → approvedCount 1 + failures 2(사유 포함) / bulk 에 타 동아리 요청 ID 섞임 → 해당 건만 일반 실패 메시지(열거 차단)

- [ ] **Step 2: 실패 확인** — Run: `cd backend && ./gradlew test --tests ClubJoinRequestControllerTest` → FAIL

- [ ] **Step 3: 단건 승인/거절 구현**

```java
@Override
@Transactional
public JoinRequestDecisionQuery decide(DecideJoinRequestCommand decideCommand) {
    clubAuthService.requireManager(decideCommand.requesterId(), decideCommand.clubId());
    ClubJoinRequest joinRequest = clubJoinRequestRepository
            .findByIdAndClubId(decideCommand.joinRequestId(), decideCommand.clubId())
            .orElseThrow(JoinRequestException.JoinRequestNotFoundException::new);
    if (!joinRequest.isPending()) {
        throw new JoinRequestException.AlreadyProcessedException();
    }
    User reviewer = userRepository.findById(decideCommand.requesterId())
            .orElseThrow(UserException.UserNotFoundException::new);
    LocalDateTime now = LocalDateTime.now(clock);

    if (decideCommand.status() == JoinRequestStatus.REJECTED) {
        joinRequest.reject(reviewer, now);
        return JoinRequestDecisionQuery.rejected();
    }

    // 승인 시점에 이미 다른 경로로 활성 멤버가 된 경우: 자동 거절 (인원 미차감, PENDING 방치 금지)
    if (clubMemberRepository.findByClubIdAndUserId(decideCommand.clubId(), joinRequest.getUser().getId()).isPresent()) {
        joinRequest.rejectAutomatically(reviewer, now);
        return JoinRequestDecisionQuery.autoRejected();
    }

    // 코드 행 잠금 하에 원자 차감 — 동시 승인 초과 사용 차단. 만료·폐기 코드도 승인은 허용(스펙 4.3).
    ClubJoinCode joinCode = clubJoinCodeRepository.findWithLockById(joinRequest.getJoinCode().getId())
            .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
    if (!joinCode.tryConsume()) {
        throw new JoinCodeException.InsufficientRemainingUsesException();
    }
    clubMemberEnrollmentService.enroll(
            joinRequest.getClub(), joinRequest.getUser(), ClubMemberRole.MEMBER, joinRequest.getGeneration());
    joinRequest.approve(reviewer, now);
    return JoinRequestDecisionQuery.approved();
}
```

주의 1: 자동 거절은 예외를 던지면 롤백되므로 **정상 리턴 경로**여야 한다(컨트롤러가 200 + result 로 전달).

주의 2: `isPending()` 체크는 TOCTOU 이므로 `@Version`(Task 5)이 최후 방어선이다 — `decide()` 는 **모든 리턴 경로 공통으로 return 직전에** `clubJoinRequestRepository.flush()` 를 호출해 `ObjectOptimisticLockingFailureException` 을 트랜잭션 안에서 `ConcurrentDecisionException`(409) 으로 변환한다 (`GeneralApplicationService.updateStatus` L398-403 전례 — 변환하지 않으면 bulk 실패 사유에 일반 오류 메시지가 실린다).

- [ ] **Step 4: 일괄 승인 구현** — `bulkUpdateStatus` 전례 그대로: `@Transactional(propagation = Propagation.NOT_SUPPORTED)` + `ObjectProvider<JoinRequestService> selfProvider` self-proxy 건별 호출. `LinkedHashSet` 중복 제거. 요청 DTO 검증은 `BulkUpdateApplicationStatusRequest` 전례와 동일: `@NotEmpty` + `@Size(max = 500)` + `List<@NotNull Long> joinRequestIds`. 실패 분류: `AUTO_REJECTED` 리턴 → failures("이미 가입된 회원이라 자동 거절 처리되었습니다."), 도메인 예외 중 미존재·권한(`JoinRequestNotFoundException`·`AccessDeniedException`) → 일반 메시지 "처리할 수 없는 요청입니다."(열거 차단, `isExistenceOrAuthorizationFailure` 전례), 그 외 도메인 예외 → `getMessage()`, `RuntimeException` → "일시적 오류로 처리하지 못했습니다." + `log.warn`

- [ ] **Step 5: 동시성 테스트**

```java
@Test
@DisplayName("잔여 1명인 코드에 두 요청이 동시에 승인되어도 초과 사용이 발생하지 않는다")
void concurrentApproveNeverExceedsMaxUses() {
    // maxUses=1 코드 + PENDING 2건(서로 다른 학생) → 2스레드 동시 decide(APPROVED)
    // 검증: APPROVED 1건 + InsufficientRemainingUsesException 1건, used_count == 1, ClubMember 1명
}

@Test
@DisplayName("두 운영진이 같은 요청을 동시에 처리해도 차감과 상태 전이는 한 번만 반영된다")
void concurrentDecideOnSameRequestAppliesOnce() {
    // 같은 PENDING 1건 → 2스레드 동시 decide(한쪽 APPROVED, 한쪽 REJECTED)
    // 검증: 한쪽 성공 + 다른쪽 AlreadyProcessedException 또는 ConcurrentDecisionException,
    //       used_count 는 승인 성공 시에만 1 (거절 승자면 0), 최종 status 는 승자의 것
}
```

- [ ] **Step 6: 전체 통과 + 커밋**

Run: `cd backend && ./gradlew test` → BUILD SUCCESSFUL

```bash
git add backend/src
git commit -m "feat(backend): 가입 요청 승인·거절·일괄 승인 API — 원자 차감·자동 거절·건별 트랜잭션"
```

---

## PR-5 `feat(frontend)` — 운영진 회원 초대·가입 요청 콘솔

브랜치: `feat/join-code-console-ui` (PR-4 머지 후 분기)

### Task 9: 타입·클라이언트·훅

**Files:**
- Create: `frontend/packages/types/src/joinCode.ts` (+ `index.ts` export)
- Modify: `frontend/packages/api/src/client.ts` (타입 선언부 + 구현부 두 곳에 `joinCodes` 네임스페이스)
- Modify: `frontend/packages/hooks/src/clubQueryKeys.ts` (`joinCode: (clubId) => [...all, clubId, 'join-code']`, `joinRequests: (clubId, status) => [...all, clubId, 'join-requests', status]`)
- Create: `frontend/packages/hooks/src/joinCodes.ts` (+ `index.ts` barrel export)
- Test: `frontend/packages/hooks/test/joinCodes.test.tsx`

**Interfaces:**
- Produces (types): `JoinCodeSummary { joinCodeId; code; generation: number | null; maxUses; usedCount; expiresAt; recruitmentOpen: boolean }`, `JoinRequestSummary { joinRequestId; userName; studentId; major; code; generation: number | null; status: JoinRequestStatus; requestedAt }`, `JoinRequestDetail extends JoinRequestSummary { phone; rejectReason: string | null; reviewedAt: string | null }`, `JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'`, `JoinRequestDecisionResult = 'APPROVED' | 'REJECTED' | 'AUTO_REJECTED'`, `BulkApproveResult { approvedCount; failures: { joinRequestId; reason }[] }`
- Produces (client): `joinCodes.createForClub(clubId, payload)`, `getActiveForClub(clubId)`, `revokeForClub(clubId, joinCodeId)`, `listRequests(clubId, status)`, `getRequestDetail(clubId, joinRequestId)`, `decideRequest(clubId, joinRequestId, payload) → JoinRequestDecisionResult 포함 응답`, `bulkApproveRequests(clubId, payload)` — `jsonOk`/`jsonVoid` 헬퍼, 경로는 `clubs/${clubId}/join-codes` (prefixUrl 에 `/api/v1` 포함됨)
- Produces (hooks): `useActiveJoinCodeQuery(clubId)`(활성 없음은 200 + data null — client 는 `jsonOkNullable` 헬퍼 사용, 별도 404 처리 불필요), `useCreateJoinCodeMutation(clubId)`, `useRevokeJoinCodeMutation(clubId)`, `useJoinRequestsQuery(clubId, status)`, `useJoinRequestDetailQuery(clubId, joinRequestId)`, `useDecideJoinRequestMutation(clubId)`, `useBulkApproveJoinRequestsMutation(clubId)` — mutation onSuccess 에서 `joinCode`/`joinRequests`/`members(clubId)` 키 invalidate (`useUpdateMemberRoleMutation` 패턴)

- [ ] **Step 1: 훅 테스트 작성** (기존 `frontend/packages/hooks/test/` 스타일 — client mock) → **Step 2: 실패 확인** `cd frontend && pnpm --filter @duing/hooks test` → **Step 3: 구현** → **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** — `git commit -m "feat(frontend): 가입 코드·가입 요청 API 클라이언트와 훅 추가"`

### Task 10: 회원 초대 다이얼로그 + 가입 요청 페이지

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx` (헤더에 "회원 초대" 버튼 + "가입 요청" 링크(대기 수 배지))
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/InviteCodeDialog.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/requests/page.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/requests/_components/JoinRequestTable.tsx`, `JoinRequestDetailPanel.tsx`, `BulkApproveResultDialog.tsx`
- Test: `frontend/apps/web/test/manage/members-invite-code.test.tsx`, `frontend/apps/web/test/manage/join-requests-page.test.tsx`

**Interfaces:**
- Consumes: Task 9 훅 전부. ManageGuard 는 layout 공통이므로 **requests 페이지에 별도 권한 가드 코드 불필요**
- UI 규약: 확인 모달(폐기·재생성)은 기존 공용 확인 모달 컴포넌트 — 실패 시 모달 유지 + 모달 안 안내. 토스트 유틸 기존 것. 로딩은 `components/loading` 의 Skeleton/LoadingGate. 상세 패널은 `MemberDetailPanel` 구조 준용

- [ ] **Step 1: 테스트 작성** — InviteCodeDialog: 활성 코드 없으면 생성 폼(만료 7/30/90 select 기본 30·인원 필수·기수 선택), 활성 코드 있으면 코드·링크(`${origin}/join/{code}`) 복사 버튼·사용/최대·만료일·재생성(확인 모달)·폐기(확인 모달), `recruitmentOpen=false` 면 "모집 마감으로 사용 불가" 배지, 생성 409("진행 중인 외부 폼 모집…")는 에러 안내 노출. requests 페이지: PENDING 목록 렌더(이름·학번·학과·요청일·코드·기수), 행 선택 → 상세(전화번호 노출) → 승인/거절, 체크박스 → 일괄 승인 → 결과 다이얼로그(성공 수 + 실패 사유 목록), AUTO_REJECTED 토스트("이미 가입된 회원이라 자동 거절 처리되었습니다."). 훅은 `@duing/hooks` mock
- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm --filter web test -- --run test/manage/join-requests-page.test.tsx test/manage/members-invite-code.test.tsx` → FAIL
- [ ] **Step 3: 구현** — members/page.tsx 는 헤더 버튼 2개만 추가(기존 구조 불변). requests 페이지는 `_components` 분리, 필터 칩(대기/승인/거절, 기본 대기)
- [ ] **Step 4: 통과 확인 + lint** — `cd frontend && pnpm --filter web test -- --run` + `pnpm lint`
- [ ] **Step 5: 실브라우저 QA** — dev 서버 :3000(백엔드 CORS, 로그는 파일 리다이렉트)에서 생성→복사→재생성→폐기, 요청 승인/거절/일괄 흐름 확인 후 서버 종료
- [ ] **Step 6: 커밋** — `git commit -m "feat(frontend): 운영진 회원 초대 코드 관리와 가입 요청 승인 콘솔"`

---

## PR-6 `feat(frontend)` — `/join/[code]` 페이지 (학생)

브랜치: `feat/join-code-landing` (PR-5 머지 후 분기 — BE 의존은 PR-3 뿐이지만 훅 파일 충돌 방지)

### Task 11: 학생용 클라이언트·훅 + 페이지

**Files:**
- Modify: `frontend/packages/types/src/joinCode.ts` (`JoinCodeCheck { clubId; clubName; generation: number | null; usable; alreadyMember: boolean | null; myRequestStatus: JoinRequestStatus | null }`)
- Modify: `frontend/packages/api/src/client.ts` (`joinCodes.check(code)`, `joinCodes.createRequest(code)`)
- Modify: `frontend/packages/hooks/src/joinCodes.ts` (+ barrel) — `useJoinCodeCheckQuery(code)`(404 는 에러 상태 유지), `useCreateJoinRequestMutation(code)`(onSuccess 에서 check 키 invalidate)
- Create: `frontend/apps/web/app/join/[code]/page.tsx` (`'use client'` + `use(params)` — `apply/[recruitmentId]` 전례)
- Create: `frontend/apps/web/app/join/[code]/_components/JoinCodeLanding.tsx`
- Modify: `frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx` — **회원가입 링크(`href="/signup"`)에 현재 `next` 를 전파** (없으면 기존 그대로)
- Modify: `frontend/apps/web/app/(auth)/signup/_components/SignupFormPanel.tsx` — **가입 완료 시 `router.replace('/login?next=/me')` 하드코딩을 자신의 `next` searchParam(toLinkRoute 검증, 기본 `/me`) 유지로 변경** — 이게 없으면 신입생(계정 없음)이 회원가입 경로로 빠진 뒤 `/join/{code}` 로 영영 복귀하지 못한다
- Test: `frontend/apps/web/test/join/join-code-page.test.tsx`, 기존 `test/` 의 login/signup 테스트에 next 전파 케이스 추가

**Interfaces:**
- Consumes: `GET /api/v1/join-codes/{code}`(공개), `POST /api/v1/join-codes/{code}/requests`(인증). 로그인 유도는 **`next` 파라미터**: `toRoute(\`/login?next=${encodeURIComponent(\`/join/${code}\`)}\`)` — 로그인 복귀는 LoginFormPanel 기존 동작이지만, **회원가입 경유 복귀는 위 Modify 2건이 있어야 동작**한다
- 상태별 화면(스펙 6, **우선순위 순 분기**): ① alreadyMember → "이미 가입된 동아리입니다" + 동아리 페이지 링크 ② myRequestStatus=PENDING → "가입 요청 대기 중" ③ 그 외(이력 없음·REJECTED·**탈퇴 후 과거 APPROVED** — alreadyMember=false 이면 APPROVED 이력이 있어도 재요청 가능이어야 한다, 종결 화면 금지) → 유효 코드면 [가입 요청] 버튼(비로그인은 [로그인하고 가입 요청]) ④ 404 또는 usable=false → 단일 안내 "유효하지 않은 가입 코드입니다" (만료·폐기·소진·비 ACTIVE 사유 구분 없음)

- [ ] **Step 1: 테스트 작성** — 위 상태 분기 각 1케이스(탈퇴 후 APPROVED 이력의 재요청 버튼 포함) + 요청 성공 시 대기 중 전환·토스트, 요청 409 시 에러 토스트 + 로그인 화면 회원가입 링크 next 전파·가입 완료 후 next 유지
- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm --filter web test -- --run test/join/join-code-page.test.tsx` → FAIL
- [ ] **Step 3: 구현** — 인증 상태는 기존 auth store/훅 사용(로그인 페이지 전례). 비로그인에도 check 는 호출(공개 API)
- [ ] **Step 4: 통과 + lint + 실브라우저 QA** — 비로그인 → 로그인 복귀 → 요청 → 콘솔 승인 → APPROVED 표시까지 왕복 확인
- [ ] **Step 5: 커밋** — `git commit -m "feat(frontend): 가입 코드 랜딩 페이지 — 상태별 안내와 로그인 복귀"`

---

## Self-check (PR 직전 공통)

각 PR 생성 전: 스펙 대비 누락 확인 / `./gradlew test` 또는 `pnpm --filter web test -- --run` 전체 초록 / 마이그레이션 번호 develop 최신 대비 재확인 / IntegrationTestBase TRUNCATE 목록 / FE barrel export / 커밋 메시지 형식 / PR 본문(🚀/🤔/💬, 클래스명 나열 금지)
