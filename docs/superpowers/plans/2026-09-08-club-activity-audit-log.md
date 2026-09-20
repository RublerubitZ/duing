# 동아리 활동 이력 로그 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 상태 전이·폐쇄를 `club_audit_event` 에 남기고, 부원 초대 발급 detail 을 채우고, 총동연이 동아리별로 상태·가입 링크·부원 초대 이력을 보는 관리자 API + 화면을 만들고, 자동승인 초대 발급을 Slack 으로 알리며 기존 Slack 메시지 5종에 동아리명을 보강한다.

**Architecture:** 새 테이블 없음. 기존 append-only 감사 테이블에 타입 2종을 추가하고(V127), 회비 콘솔이 쓰는 범용 조회 술어를 개명해 재사용하는 관리자 조회 API 하나를 `clubaudit` 도메인에 연다. FE 는 관리자 동아리 상세 아래 "활동 이력" 페이지를 `member-history` 구조로 추가한다. Slack 은 기존 `OpsSlackListener` 에 이벤트 1종을 추가하고 동아리명은 리스너가 조회해 포매터에 넘긴다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / JUnit 5 + Testcontainers + RestAssured · Next.js 15 / React 19 / React Query / vitest + msw

**Spec:** `docs/superpowers/specs/2026-09-08-club-activity-audit-log-design.md`

## Global Constraints

- 커밋 메시지·PR 제목: Conventional Commits + 한국어, 제목은 `대상 — 변경점` 명사구. `Co-Authored-By`·`🤖 Generated` 라인 **절대 금지**.
- 백엔드 명령은 `backend/` 에서 `./gradlew`, 프론트 명령은 `frontend/` 에서 `pnpm`.
- FE 태스크 GREEN 기준 = `test` + `typecheck` + `lint` 셋 다 통과.
- 변수명은 역할이 드러나게(`dto`/`r`/`e`/`data`/`res` 금지). FE 는 `any`·`as` 단언·`interface` 금지(`type` 사용).
- 초대 **코드 값**은 detail·Slack 어디에도 싣지 않는다.
- `club_audit_event.reason` 은 500자, 두 사유 입력 모두 `@Size(max=500)` 이라 잘라내지 않는다.
- 시각: `inviteExpiresAt` 은 KST 벽시계(seoulClock) → `TimeMapper.seoulWallClockToInstant`. `created_at` 은 JVM 존 벽시계 → `TimeMapper.systemWallClockToInstant`.
- PR 은 BE 1건(현재 브랜치 `RublerubitZ/feat-invite-link-tracking`) + FE 1건(BE 브랜치에서 분기, 스택). 머지는 사용자 지시가 있을 때만.
- 파일은 모두 EOF newline 으로 끝낸다.

---

## 파일 구조

**BE 생성**
- `backend/src/main/resources/db/migration/V127__club_status_audit_event_types.sql` — CHECK 갱신
- `backend/src/main/java/com/duing/global/monitoring/event/ClubInviteAutoApproveIssuedEvent.java`
- `backend/src/main/java/com/duing/domain/clubaudit/service/AdminClubActivityQueryService.java` — 인터페이스
- `backend/src/main/java/com/duing/domain/clubaudit/service/GeneralAdminClubActivityQueryService.java`
- `backend/src/main/java/com/duing/domain/clubaudit/service/dto/query/AdminClubActivityEventRow.java`
- `backend/src/main/java/com/duing/domain/clubaudit/api/AdminClubActivityApi.java`
- `backend/src/main/java/com/duing/domain/clubaudit/controller/AdminClubActivityController.java`
- `backend/src/main/java/com/duing/domain/clubaudit/controller/dto/response/AdminClubActivityEventResponse.java`
- 테스트: `clubaudit/ClubAuditEventTypesCheckTest.java`(개명), `club/service/ClubStatusAuditInstrumentationTest.java`, `joincode/service/ClubInviteAuditDetailTest.java`, `clubaudit/controller/AdminClubActivityEventsTest.java`

**BE 수정**
- `domain/clubaudit/entity/ClubAuditEventType.java`, `ClubAuditEvent.java`
- `domain/club/service/GeneralClubService.java`(updateStatus), `GeneralClubClosureService.java`(close)
- `domain/joincode/service/GeneralJoinCodeService.java`(createClubInvite, recordJoinLinkEvent)
- `domain/clubaudit/repository/ClubAuditEventRepositoryCustom.java`, `ClubAuditEventRepositoryImpl.java`(개명)
- `domain/fee/service/GeneralAdminFeeAuditQueryService.java`, `GeneralAdminFeeAnomalyService.java`(개명 반영)
- `global/monitoring/OpsSlackListener.java`, `OpsSlackMessageFormatter.java`
- 테스트: `OpsSlackListenerTest`, `OpsSlackMessageFormatterTest`, `OpsSlackMonitoringIntegrationTest`

**FE 생성**
- `frontend/packages/types/src/adminClubActivity.ts`
- `frontend/packages/hooks/src/adminClubActivity.ts`
- `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/page.tsx`
- `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_pages/AdminClubActivityLogPage.tsx`
- `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_components/AdminClubActivityLogList.tsx`
- `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_lib/activityLabels.ts`
- 테스트: `packages/api/test/adminClubActivity.test.ts`, `packages/hooks/test/adminClubActivity.test.tsx`, `apps/web/test/admin/club-activity-labels.test.ts`

**FE 수정**
- `packages/types/src/index.ts`, `packages/api/src/domains/admin.ts`, `packages/hooks/src/adminQueryKeys.ts`, `packages/hooks/src/index.ts`
- `apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx`(링크 1개)

---

## PR 1 — 백엔드 (브랜치 `RublerubitZ/feat-invite-link-tracking`, 스펙 커밋 2건이 이미 올라가 있다)

### Task 1: 감사 타입 2종 + V127 + enum·DDL 정합 테스트 전 타입 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEventType.java`
- Create: `backend/src/main/resources/db/migration/V127__club_status_audit_event_types.sql`
- Rename+Modify: `backend/src/test/java/com/duing/domain/clubaudit/ClubAuditEventFeeTypesTest.java` → `ClubAuditEventTypesCheckTest.java`

**Interfaces:**
- Produces: `ClubAuditEventType.CLUB_STATUS_CHANGED`, `ClubAuditEventType.CLUB_CLOSED`

- [ ] **Step 1: 테스트를 전 타입 가드로 바꾼다**

`git mv backend/src/test/java/com/duing/domain/clubaudit/ClubAuditEventFeeTypesTest.java backend/src/test/java/com/duing/domain/clubaudit/ClubAuditEventTypesCheckTest.java` 후 내용을 다음으로 교체:

```java
package com.duing.domain.clubaudit;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * {@link ClubAuditEventType} 전 값과 {@code club_audit_event.event_type} CHECK 제약의 정합 가드.
 *
 * <p>enum 에만 값을 추가하고 마이그레이션의 CHECK 갱신을 빠뜨리면 계측 시점에 INSERT 가 터진다 —
 * 감사 기록은 변이와 같은 트랜잭션이라 변이째 실패하므로, 값 추가 즉시 여기서 잡는다.
 * 팩토리 종류는 무관하다(CHECK 정합만 본다) — 참조 컬럼이 전부 nullable 인 {@code feeAccount} 로 저장한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubAuditEventTypesCheckTest extends IntegrationTestBase {

    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("이벤트 타입 전부가 event_type CHECK 를 통과해 저장된다 — enum·DDL 정합 가드")
    void allEventTypesPassCheckConstraint() {
        User actor = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("감사대상"));

        for (ClubAuditEventType eventType : ClubAuditEventType.values()) {
            clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                    eventType, club.getId(), actor.getId(),
                    AuditDetailJson.of(Map.of("probe", eventType.name()))));
        }

        assertThat(clubAuditEventRepository.count()).isEqualTo(ClubAuditEventType.values().length);
    }
}
```

- [ ] **Step 2: enum 에 2종 추가**

`ClubAuditEventType.java` 에서 클래스 javadoc 의 `"가입 링크 6종과 총동연 조치 2종, 회비 15종(V105), 시설 설정 1종(V116)이 있다."` 를 `"가입 링크 6종과 총동연 조치 2종, 회비 15종(V105), 시설 설정 1종(V116), 동아리 상태 2종(V127)이 있다."` 로 바꾸고, `SECURED_TARGET_CHANGED;` 를 다음으로 교체:

```java
    /** 총동연이 시설 기본 확보 시간 대상 설정을 변경했다(V116) — detail 에 before/after 스냅샷이 남는다. */
    SECURED_TARGET_CHANGED,
    /**
     * 총동연이 동아리 상태를 전이했다(V127) — detail 에 {"from","to"} 가 남고, REJECTED 로의 전이에만
     * reason 에 거절 사유가 남는다(그 외 전이는 null). 엔티티의 rejection_reason 은 덮어써지므로 이력은 이 행이 맡는다.
     */
    CLUB_STATUS_CHANGED,
    /** 총동연이 동아리를 폐쇄했다(V127) — reason 에 정규화된 폐쇄 사유. 폐쇄와 같은 트랜잭션이라 폐쇄 없는 행은 없다. */
    CLUB_CLOSED;
```

- [ ] **Step 3: 테스트가 CHECK 위반으로 실패하는지 확인**

Run (backend/): `./gradlew test --tests 'com.duing.domain.clubaudit.ClubAuditEventTypesCheckTest'`
Expected: FAIL — `club_audit_event_event_type_check` 위반(DataIntegrityViolationException)

- [ ] **Step 4: V127 마이그레이션 작성**

`backend/src/main/resources/db/migration/V127__club_status_audit_event_types.sql`:

```sql
-- 동아리 상태 전이·폐쇄를 감사 이벤트로 남긴다(2026-09-08 활동 이력 스펙 §2.1).
-- CLUB_STATUS_CHANGED: detail {"from","to"}, REJECTED 전이에만 reason=거절 사유.
-- CLUB_CLOSED: reason=폐쇄 사유. 폐쇄 트랜잭션 안에서 기록된다.
-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신한다(V102 절차 주석, V104·V105·V116 선례).
ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check;
ALTER TABLE club_audit_event ADD CONSTRAINT club_audit_event_event_type_check CHECK (event_type IN (
    'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
    'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED',
    'RECRUITMENT_FORCE_CLOSED', 'APPLICATION_VIEWED',
    'FEE_POLICY_CREATED', 'FEE_POLICY_UPDATED', 'FEE_POLICY_DELETED',
    'FEE_BILL_ISSUED', 'FEE_BILL_CANCELLED',
    'FEE_PAYMENT_RECORDED', 'FEE_PAYMENT_VOIDED',
    'FEE_TX_MANUAL_MATCHED', 'FEE_TX_IGNORED', 'FEE_TX_UNMATCHED',
    'FEE_ACCOUNT_REGISTERED', 'FEE_ACCOUNT_UPDATED', 'FEE_ACCOUNT_DELETED',
    'FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED',
    'SECURED_TARGET_CHANGED',
    'CLUB_STATUS_CHANGED', 'CLUB_CLOSED'));
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `./gradlew test --tests 'com.duing.domain.clubaudit.ClubAuditEventTypesCheckTest'`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEventType.java backend/src/main/resources/db/migration/V127__club_status_audit_event_types.sql backend/src/test/java/com/duing/domain/clubaudit/
git commit -m "feat(backend): 감사 이벤트 타입 — CLUB_STATUS_CHANGED·CLUB_CLOSED 추가(V127)·전 타입 CHECK 정합 가드"
```

---

### Task 2: 동아리 상태 전이 감사 기록 (`updateStatus`)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEvent.java`(팩토리 2개 추가)
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java:279-297`
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubStatusAuditInstrumentationTest.java`

**Interfaces:**
- Produces: `ClubAuditEvent.clubStatusChanged(Long clubId, Long actorUserId, String reason, String detail)`, `ClubAuditEvent.clubClosed(Long clubId, Long actorUserId, String reason)` (후자는 Task 3 이 사용)

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/duing/domain/club/service/ClubStatusAuditInstrumentationTest.java`:

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 동아리 상태 전이·폐쇄가 club_audit_event 에 남는지 검증한다(활동 이력 스펙 §2.1).
 * detail 은 jsonb 라 공백·키 순서가 정규화되므로 문자열 비교 대신 {@code detail->>'키'} 로 읽는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubStatusAuditInstrumentationTest extends IntegrationTestBase {

    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("거절 뒤 재심사 대기로 되돌려도 첫 거절 사유는 감사 로그에 남고, 거절이 아닌 전이는 사유가 비어 있다")
    void statusTransitionsKeepRejectionReasonOnlyOnReject() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(ClubFixture.academic("상태감사동아리"));

        clubService.updateStatus(new UpdateClubStatusCommand(
                club.getId(), ClubStatus.REJECTED, "서류 미비", admin.getId()));
        clubService.updateStatus(new UpdateClubStatusCommand(
                club.getId(), ClubStatus.PENDING_APPROVAL, null, admin.getId()));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT rejection_reason FROM club WHERE id = ?", String.class, club.getId()))
                .as("엔티티의 최신값은 지워진다 — 이력은 감사 테이블이 맡는다")
                .isNull();

        List<Map<String, Object>> statusEvents = jdbcTemplate.queryForList(
                "SELECT reason, actor_user_id, detail->>'from' AS from_status, detail->>'to' AS to_status "
                        + "FROM club_audit_event WHERE club_id = ? AND event_type = 'CLUB_STATUS_CHANGED' ORDER BY id",
                club.getId());
        assertThat(statusEvents).hasSize(2);

        Map<String, Object> rejected = statusEvents.get(0);
        assertThat(rejected.get("reason")).isEqualTo("서류 미비");
        assertThat(rejected.get("from_status")).isEqualTo("PENDING_APPROVAL");
        assertThat(rejected.get("to_status")).isEqualTo("REJECTED");
        assertThat(((Number) rejected.get("actor_user_id")).longValue()).isEqualTo(admin.getId());

        Map<String, Object> reopened = statusEvents.get(1);
        assertThat(reopened.get("reason")).as("REJECTED 가 아닌 전이는 사유를 남기지 않는다").isNull();
        assertThat(reopened.get("from_status")).isEqualTo("REJECTED");
        assertThat(reopened.get("to_status")).isEqualTo("PENDING_APPROVAL");
    }

    @Test
    @DisplayName("동아리 폐쇄는 폐쇄 사유가 담긴 CLUB_CLOSED 감사 행을 남기고, 폐쇄된 동아리 id 를 가리킨다")
    void closureRecordsClubClosedWithReason() {
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("폐쇄감사동아리"));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        // 폐쇄는 비 ACTIVE 동아리에서만 시작된다(validateClosable).
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "활동 중단 장기화"));

        Map<String, Object> closedEvent = jdbcTemplate.queryForMap(
                "SELECT reason, actor_user_id FROM club_audit_event WHERE club_id = ? AND event_type = 'CLUB_CLOSED'",
                club.getId());
        assertThat(closedEvent.get("reason")).isEqualTo("활동 중단 장기화");
        assertThat(((Number) closedEvent.get("actor_user_id")).longValue()).isEqualTo(admin.getId());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM club WHERE id = ?", Boolean.class, club.getId()))
                .as("soft-delete 된 뒤에도 club 행이 남아 감사 FK 가 성립한다")
                .isTrue();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.club.service.ClubStatusAuditInstrumentationTest'`
Expected: FAIL — 첫 테스트 `hasSize(2)` 가 0건, 둘째 테스트 `queryForMap` 이 `EmptyResultDataAccessException`

- [ ] **Step 3: 팩토리 2개 추가**

`ClubAuditEvent.java` 의 `securedTargetChanged` 메서드 뒤에 추가:

```java
    /** 총동연 동아리 상태 전이 — detail 에 from/to, REJECTED 로의 전이에만 reason 에 거절 사유가 남는다. */
    public static ClubAuditEvent clubStatusChanged(Long clubId, Long actorUserId, String reason, String detail) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(ClubAuditEventType.CLUB_STATUS_CHANGED)
                .actorUserId(actorUserId)
                .reason(reason)
                .detail(detail)
                .build();
    }

    /** 총동연 동아리 폐쇄 — reason 에 정규화된 폐쇄 사유. 폐쇄 트랜잭션 안에서 기록돼 폐쇄가 롤백되면 함께 사라진다. */
    public static ClubAuditEvent clubClosed(Long clubId, Long actorUserId, String reason) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(ClubAuditEventType.CLUB_CLOSED)
                .actorUserId(actorUserId)
                .reason(reason)
                .build();
    }
```

- [ ] **Step 4: `updateStatus` 에 기록 추가**

`GeneralClubService.updateStatus` 에서 `club.changeStatus(...)` 호출 직후, `eventPublisher.publishEvent(new ClubStatusChangedEvent(...))` 앞에 삽입(필요 import `ClubAuditEvent`·`ClubAuditEventRepository`·`AuditDetailJson`·`Map` 은 이미 있다):

```java
        ClubStatus nextStatus = updateClubStatusCommand.status();
        // 상태 전이 감사 — 엔티티의 rejection_reason 은 다음 전이에서 덮어써지므로 이력은 이 행이 맡는다.
        // 거절 사유는 REJECTED 로의 전이에만 싣고, 그 외 전이는 null 이다(스펙 §2.1).
        clubAuditEventRepository.save(ClubAuditEvent.clubStatusChanged(
                club.getId(),
                updateClubStatusCommand.actorUserId(),
                nextStatus == ClubStatus.REJECTED ? updateClubStatusCommand.rejectionReason() : null,
                AuditDetailJson.of(Map.of("from", previousStatus.name(), "to", nextStatus.name()))));
```

- [ ] **Step 5: 첫 테스트만 통과 확인**

Run: `./gradlew test --tests 'com.duing.domain.club.service.ClubStatusAuditInstrumentationTest.statusTransitionsKeepRejectionReasonOnlyOnReject'`
Expected: PASS (폐쇄 테스트는 Task 3 에서)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEvent.java backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java backend/src/test/java/com/duing/domain/club/service/ClubStatusAuditInstrumentationTest.java
git commit -m "feat(backend): 동아리 상태 전이 감사 — CLUB_STATUS_CHANGED 기록·REJECTED 전이만 거절 사유 보존"
```

---

### Task 3: 동아리 폐쇄 감사 기록 (`close`)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java`
- Test: `ClubStatusAuditInstrumentationTest.closureRecordsClubClosedWithReason`(Task 2 에서 작성)

**Interfaces:**
- Consumes: `ClubAuditEvent.clubClosed(...)`(Task 2)

- [ ] **Step 1: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.club.service.ClubStatusAuditInstrumentationTest.closureRecordsClubClosedWithReason'`
Expected: FAIL — `EmptyResultDataAccessException`

- [ ] **Step 2: 의존성 주입 + 기록 삽입**

`GeneralClubClosureService.java` import 추가(알파벳 순):
```java
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
```
필드 추가(`private final ClubRepository clubRepository;` 바로 아래):
```java
    private final ClubAuditEventRepository clubAuditEventRepository;
```
`close()` 의 `club.validateClosable();` 바로 다음 줄에 삽입:
```java
        // 폐쇄 감사 — 폐쇄와 같은 트랜잭션이라 아래 어느 단계가 실패해도 함께 롤백된다(폐쇄 없는 CLUB_CLOSED 행은 없다).
        // flush()/clear() 앞이라 영속성 컨텍스트가 살아 있고, soft-delete 여도 club 행은 남아 FK 가 성립한다(스펙 §2.1).
        clubAuditEventRepository.save(ClubAuditEvent.clubClosed(clubId, actorAdminUserId, reason));
```

- [ ] **Step 3: 테스트 통과 + 기존 폐쇄·상태 테스트 무회귀 확인**

Run: `./gradlew test --tests 'com.duing.domain.club.service.ClubStatusAuditInstrumentationTest' --tests 'com.duing.domain.club.controller.AdminClubClosureControllerTest' --tests 'com.duing.domain.recruitment.controller.AdminRecruitmentForceCloseTest' --tests 'com.duing.domain.fee.controller.AdminFeeAuditClubsTest' --tests 'com.duing.domain.fee.controller.AdminFeeAuditDetailTest' --tests 'com.duing.global.monitoring.OpsSlackMonitoringIntegrationTest'`
Expected: 전부 PASS (기존 테스트는 이벤트 타입으로 필터하거나 회비 타입만 세므로 새 행에 영향받지 않는다. 깨지면 그 테스트가 전체 건수를 세는 것이니 타입 필터로 고친다)

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java
git commit -m "feat(backend): 동아리 폐쇄 감사 — CLUB_CLOSED 기록(폐쇄 사유·동일 트랜잭션)"
```

---

### Task 4: 부원 초대 발급 이벤트 detail

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEvent.java`(`joinLink` 6인자 오버로드)
- Modify: `backend/src/main/java/com/duing/domain/joincode/service/GeneralJoinCodeService.java`(createClubInvite 끝부분, recordJoinLinkEvent 오버로드)
- Create: `backend/src/test/java/com/duing/domain/joincode/service/ClubInviteAuditDetailTest.java`

**Interfaces:**
- Produces: `ClubAuditEvent.joinLink(ClubAuditEventType, Long clubId, Long recruitmentId, Long joinCodeId, Long actorUserId, String detail)`; detail JSON 키 `linkType`(`"CLUB_INVITE"`), `autoApprove`(boolean), `maxUses`(int), `expiresAt`(ISO-8601 Instant 문자열)

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/duing/domain/joincode/service/ClubInviteAuditDetailTest.java`:

```java
package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.service.dto.command.CreateClubInviteCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** 부원 초대 발급 감사 detail(활동 이력 스펙 §2.2). 코드 값은 어디에도 남지 않아야 한다. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubInviteAuditDetailTest extends IntegrationTestBase {

    @Autowired JoinCodeService joinCodeService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("초대 발급은 자동승인·정원·만료(KST→절대시각)를 detail 에 남기고, 재발급 시 구 링크 폐기 행은 detail 이 비어 있다")
    void inviteIssueRecordsDetailSnapshotWithoutCode() {
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("초대감사동아리"));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        JoinCodeQuery firstInvite = joinCodeService.createClubInvite(
                new CreateClubInviteCodeCommand(club.getId(), leader.getId(), 30, 72, true, 13));
        JoinCodeQuery secondInvite = joinCodeService.createClubInvite(
                new CreateClubInviteCodeCommand(club.getId(), leader.getId(), 10, 24, false, 13));

        List<Map<String, Object>> auditRows = jdbcTemplate.queryForList(
                "SELECT event_type, join_code_id, detail::text AS detail_text, "
                        + "detail->>'linkType' AS link_type, detail->>'autoApprove' AS auto_approve, "
                        + "detail->>'maxUses' AS max_uses, detail->>'expiresAt' AS expires_at "
                        + "FROM club_audit_event WHERE club_id = ? ORDER BY id",
                club.getId());
        assertThat(auditRows).extracting(row -> row.get("event_type"))
                .containsExactly("JOIN_LINK_CREATED", "JOIN_LINK_REVOKED", "JOIN_LINK_REGENERATED");

        ClubJoinCode storedFirst = clubJoinCodeRepository.findById(firstInvite.joinCodeId()).orElseThrow();
        Map<String, Object> created = auditRows.get(0);
        assertThat(((Number) created.get("join_code_id")).longValue()).isEqualTo(firstInvite.joinCodeId());
        assertThat(created.get("link_type")).isEqualTo("CLUB_INVITE");
        assertThat(created.get("auto_approve")).isEqualTo("true");
        assertThat(created.get("max_uses")).isEqualTo("30");
        // detail 은 메모리 값(나노초 가능)으로 만들고 DB 컬럼(timestamp)은 마이크로초로 절단되므로 같은 해상도로 맞춰 비교한다.
        assertThat(Instant.parse((String) created.get("expires_at")).truncatedTo(ChronoUnit.MICROS))
                .as("만료는 seoulClock 벽시계라 KST 환산이어야 한다")
                .isEqualTo(TimeMapper.seoulWallClockToInstant(storedFirst.getInviteExpiresAt()));
        assertThat((String) created.get("detail_text"))
                .doesNotContain(firstInvite.code(), secondInvite.code());

        assertThat(auditRows.get(1).get("detail_text")).as("폐기 행은 detail 을 갖지 않는다").isNull();

        Map<String, Object> regenerated = auditRows.get(2);
        assertThat(regenerated.get("auto_approve")).isEqualTo("false");
        assertThat(regenerated.get("max_uses")).isEqualTo("10");
        assertThat((String) regenerated.get("detail_text")).doesNotContain(secondInvite.code());
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.joincode.service.ClubInviteAuditDetailTest'`
Expected: FAIL — `link_type` 가 null

- [ ] **Step 3: `joinLink` 오버로드**

`ClubAuditEvent.java` 의 기존 `joinLink` 5인자 메서드를 다음 둘로 교체:

```java
    /** 가입 링크 생성·재생성·폐기 이벤트. */
    public static ClubAuditEvent joinLink(ClubAuditEventType eventType, Long clubId,
                                          Long recruitmentId, Long joinCodeId, Long actorUserId) {
        return joinLink(eventType, clubId, recruitmentId, joinCodeId, actorUserId, null);
    }

    /** 가입 링크 이벤트 + 발급 스냅샷 — 부원 초대 발급이 자동승인·정원·만료를 detail 에 남긴다(코드 값 금지). */
    public static ClubAuditEvent joinLink(ClubAuditEventType eventType, Long clubId,
                                          Long recruitmentId, Long joinCodeId, Long actorUserId, String detail) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(eventType)
                .actorUserId(actorUserId)
                .recruitmentId(recruitmentId)
                .joinCodeId(joinCodeId)
                .detail(detail)
                .build();
    }
```

- [ ] **Step 4: 서비스에 detail 기록**

`GeneralJoinCodeService.java` import 추가:
```java
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.joincode.entity.JoinCodeLinkType;
import com.duing.global.time.TimeMapper;
import java.util.Map;
```
`createClubInvite` 의 마지막 `recordJoinLinkEvent(...)` 호출(주석 "이 트랜잭션이 실제로 갈아끼웠을 때만 REGENERATED" 아래)을 다음으로 교체:
```java
        recordJoinLinkEvent(replacedCode.isPresent()
                        ? ClubAuditEventType.JOIN_LINK_REGENERATED
                        : ClubAuditEventType.JOIN_LINK_CREATED,
                createCommand.clubId(), null, issued.getId(), createCommand.requesterId(),
                AuditDetailJson.of(clubInviteDetail(issued)));
```
기존 `private void recordJoinLinkEvent(...)` 를 다음 둘로 교체하고 헬퍼를 추가:
```java
    /**
     * 감사 이벤트를 본 트랜잭션에 함께 기록한다 — 기록 실패는 삼키지 않는다.
     * 남지 않은 이력은 없는 이력이고, 그 상태로 커밋된 운영 행위는 나중에 설명할 수 없다.
     */
    private void recordJoinLinkEvent(ClubAuditEventType eventType, Long clubId, Long recruitmentId,
                                     Long joinCodeId, Long actorUserId) {
        recordJoinLinkEvent(eventType, clubId, recruitmentId, joinCodeId, actorUserId, null);
    }

    private void recordJoinLinkEvent(ClubAuditEventType eventType, Long clubId, Long recruitmentId,
                                     Long joinCodeId, Long actorUserId, String detail) {
        clubAuditEventRepository.save(ClubAuditEvent.joinLink(
                eventType, clubId, recruitmentId, joinCodeId, actorUserId, detail));
    }

    /**
     * 초대 발급 스냅샷(활동 이력 스펙 §2.2). 코드 값은 가입 자격 그 자체라 절대 싣지 않는다.
     * 만료는 seoulClock 벽시계라 응답 경계(JoinCodeResponse)와 같은 KST 환산으로 절대시각을 남긴다.
     */
    private static Map<String, Object> clubInviteDetail(ClubJoinCode issued) {
        return Map.of(
                "linkType", JoinCodeLinkType.CLUB_INVITE.name(),
                "autoApprove", issued.isAutoApprove(),
                "maxUses", issued.getMaxUses(),
                "expiresAt", TimeMapper.seoulWallClockToInstant(issued.getInviteExpiresAt()).toString());
    }
```

- [ ] **Step 5: 통과 + 기존 초대 테스트 무회귀**

Run: `./gradlew test --tests 'com.duing.domain.joincode.service.ClubInviteAuditDetailTest' --tests 'com.duing.domain.joincode.controller.ClubInviteJoinCodeControllerTest' --tests 'com.duing.domain.joincode.service.ClubInviteConcurrencyTest'`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEvent.java backend/src/main/java/com/duing/domain/joincode/service/GeneralJoinCodeService.java backend/src/test/java/com/duing/domain/joincode/service/ClubInviteAuditDetailTest.java
git commit -m "feat(backend): 부원 초대 발급 감사 — detail 에 자동승인·정원·만료 스냅샷(코드 값 제외)"
```

---

### Task 5: 자동승인 초대 발급 Slack 신호

**Files:**
- Create: `backend/src/main/java/com/duing/global/monitoring/event/ClubInviteAutoApproveIssuedEvent.java`
- Modify: `backend/src/main/java/com/duing/domain/joincode/service/GeneralJoinCodeService.java`(발행)
- Modify: `backend/src/main/java/com/duing/global/monitoring/OpsSlackMessageFormatter.java`, `OpsSlackListener.java`
- Modify: `backend/src/test/java/com/duing/global/monitoring/OpsSlackMessageFormatterTest.java`, `OpsSlackMonitoringIntegrationTest.java`

**Interfaces:**
- Produces: `record ClubInviteAutoApproveIssuedEvent(Long clubId, String clubName, Long joinCodeId, int maxUses, LocalDateTime expiresAtKst, Long actorUserId)`; 메시지 이벤트명 `CLUB_INVITE_AUTO_APPROVE_ISSUED`

- [ ] **Step 1: 포매터 단위 테스트 추가(실패)**

`OpsSlackMessageFormatterTest.java` import 추가 `import com.duing.global.monitoring.event.ClubInviteAutoApproveIssuedEvent;`, 테스트 추가:

```java
    @Test
    @DisplayName("자동승인 초대 발급 메시지는 동아리·id·정원·KST 만료·발급자만 싣고 코드 값은 싣지 않는다")
    void clubInviteAutoApproveIssuedMessage() {
        String message = formatter.clubInviteAutoApproveIssued(new ClubInviteAutoApproveIssuedEvent(
                7L, "두잉개발회", 55L, 30, LocalDateTime.of(2026, 9, 11, 14, 0), 3L));

        assertThat(message).contains("⚠️ 자동승인 부원 초대 링크 발급", "이벤트: CLUB_INVITE_AUTO_APPROVE_ISSUED",
                "동아리: 두잉개발회", "ClubId: 7", "JoinCodeId: 55", "정원: 30",
                "만료: 2026-09-11 14:00 KST", "발급자 UserId: 3");
        // 이벤트 record 에 코드 값 필드가 없어 포매터가 실을 수 없다 — 실제 코드 미포함은 E2E(Step 5)가 발급된 코드로 검증한다.
    }
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `./gradlew test --tests 'com.duing.global.monitoring.OpsSlackMessageFormatterTest'`
Expected: FAIL — `ClubInviteAutoApproveIssuedEvent` 심볼 없음

- [ ] **Step 3: 이벤트 record + 포매터 + 리스너**

`backend/src/main/java/com/duing/global/monitoring/event/ClubInviteAutoApproveIssuedEvent.java`:
```java
package com.duing.global.monitoring.event;

import java.time.LocalDateTime;

/**
 * 운영진이 자동승인 부원 초대 링크를 발급했다 — 승인 없이 부원이 되는 경로라 총동연 채널에 신호를 남긴다.
 * 승인제 초대는 발행하지 않는다. 코드 값은 싣지 않는다. {@code expiresAtKst} 는 seoulClock 벽시계 그대로다.
 */
public record ClubInviteAutoApproveIssuedEvent(
        Long clubId, String clubName, Long joinCodeId, int maxUses, LocalDateTime expiresAtKst, Long actorUserId) {
}
```

`OpsSlackMessageFormatter.java` import 추가 `import com.duing.global.monitoring.event.ClubInviteAutoApproveIssuedEvent;`, `clubClosed` 메서드 뒤에 추가:
```java
    /** 초대 코드 값은 가입 자격 그 자체라 싣지 않는다. 만료는 seoulClock 벽시계라 환산 없이 KST 로 찍는다. */
    public String clubInviteAutoApproveIssued(ClubInviteAutoApproveIssuedEvent event) {
        return compose("⚠️ 자동승인 부원 초대 링크 발급", "CLUB_INVITE_AUTO_APPROVE_ISSUED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("JoinCodeId", event.joinCodeId()), field("정원", event.maxUses()),
                        field("만료", KST_MINUTE.format(event.expiresAtKst()) + " KST"),
                        field("발급자 UserId", event.actorUserId())));
    }
```

`OpsSlackListener.java` import 추가 `import com.duing.global.monitoring.event.ClubInviteAutoApproveIssuedEvent;`, `onClubClosed` 뒤에 추가:
```java
    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubInviteAutoApproveIssued(ClubInviteAutoApproveIssuedEvent event) {
        notify("CLUB_INVITE_AUTO_APPROVE_ISSUED", () -> formatter.clubInviteAutoApproveIssued(event));
    }
```

- [ ] **Step 4: 포매터 테스트 통과 확인**

Run: `./gradlew test --tests 'com.duing.global.monitoring.OpsSlackMessageFormatterTest'`
Expected: PASS

- [ ] **Step 5: E2E 테스트 추가(실패)**

`OpsSlackMonitoringIntegrationTest.java` import 추가:
```java
import com.duing.domain.joincode.service.JoinCodeService;
import com.duing.domain.joincode.service.dto.command.CreateClubInviteCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
```
필드 추가(`@Autowired FeeAccountService feeAccountService;` 아래): `@Autowired JoinCodeService joinCodeService;`
테스트 추가:
```java
    @Test
    @DisplayName("자동승인 부원 초대 발급만 CLUB_INVITE_AUTO_APPROVE_ISSUED 메시지를 내고, 승인제 초대는 내지 않으며 코드 값은 싣지 않는다")
    void autoApproveInviteNotifiesOnly() throws InterruptedException {
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("초대알림동아리"));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        joinCodeService.createClubInvite(
                new CreateClubInviteCodeCommand(club.getId(), leader.getId(), 20, 24, false, 13));
        drainMonitoringExecutor();
        verify(slackNotifier, after(QUIET_WAIT_MS).never()).send(anyString());

        JoinCodeQuery autoApproveInvite = joinCodeService.createClubInvite(
                new CreateClubInviteCodeCommand(club.getId(), leader.getId(), 30, 72, true, 13));
        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(messageCaptor.capture());
        assertThat(messageCaptor.getValue())
                .contains("이벤트: CLUB_INVITE_AUTO_APPROVE_ISSUED", "동아리: 초대알림동아리",
                        "ClubId: " + club.getId(), "JoinCodeId: " + autoApproveInvite.joinCodeId(),
                        "정원: 30", "발급자 UserId: " + leader.getId())
                .doesNotContain(autoApproveInvite.code());
    }
```

Run: `./gradlew test --tests 'com.duing.global.monitoring.OpsSlackMonitoringIntegrationTest.autoApproveInviteNotifiesOnly'`
Expected: FAIL — `verify(slackNotifier, timeout(...)).send(...)` 미호출

- [ ] **Step 6: 서비스에서 발행**

`GeneralJoinCodeService.java` import 추가:
```java
import com.duing.global.monitoring.event.ClubInviteAutoApproveIssuedEvent;
import org.springframework.context.ApplicationEventPublisher;
```
필드 추가(`private final Clock clock;` 아래):
```java
    // 운영 Slack 알림용 이벤트 발행 — 커밋 후(AFTER_COMMIT) 비동기로 소비된다(global/monitoring).
    private final ApplicationEventPublisher eventPublisher;
```
`createClubInvite` 에서 Task 4 의 `recordJoinLinkEvent(... AuditDetailJson.of(clubInviteDetail(issued)));` 다음, `return JoinCodeQuery.from(issued, 0, 0);` 앞에 삽입:
```java
        if (issued.isAutoApprove()) {
            // 운영 Slack 신호 — 자동승인 초대는 승인 없이 부원이 되는 경로다. 승인제 초대는 보내지 않는다(스펙 §2.5).
            eventPublisher.publishEvent(new ClubInviteAutoApproveIssuedEvent(
                    club.getId(), club.getName(), issued.getId(), issued.getMaxUses(),
                    issued.getInviteExpiresAt(), createCommand.requesterId()));
        }
```

- [ ] **Step 7: 통과 확인**

Run: `./gradlew test --tests 'com.duing.global.monitoring.OpsSlackMonitoringIntegrationTest' --tests 'com.duing.domain.joincode.service.ClubInviteAuditDetailTest'`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/duing/global/monitoring/ backend/src/main/java/com/duing/domain/joincode/service/GeneralJoinCodeService.java backend/src/test/java/com/duing/global/monitoring/
git commit -m "feat(backend): 운영 Slack — 자동승인 부원 초대 발급 신호(CLUB_INVITE_AUTO_APPROVE_ISSUED)"
```

---

### Task 6: Slack 메시지 동아리명 보강 (회비 계좌·시설 예약 4종)

**Files:**
- Modify: `backend/src/main/java/com/duing/global/monitoring/OpsSlackListener.java`, `OpsSlackMessageFormatter.java`
- Modify: `backend/src/test/java/com/duing/global/monitoring/OpsSlackListenerTest.java`, `OpsSlackMessageFormatterTest.java`

**Interfaces:**
- Produces: 포매터 시그니처 `feeAccountCreated(FeeAccountCreatedEvent, String clubName)`, `facilityBookingSubmitted(FacilityBookingSubmittedEvent, String clubName)`, `facilityBookingRejected(FacilityBookingRejectedEvent, String clubName)`, `facilityBookingCancelled(FacilityBookingCancelledEvent, String clubName)`, `facilityBookingConflict(FacilityBookingConflictEvent, String clubName)`; 리스너 생성자 `OpsSlackListener(OpsSlackMessageFormatter, SlackNotifier, ClubRepository)`

- [ ] **Step 1: 포매터 테스트 갱신(실패)**

`OpsSlackMessageFormatterTest.java` 의 `feeAccountCreatedMessage` 를 교체:
```java
    @Test
    @DisplayName("회비 계좌 등록 메시지는 동아리명·은행 코드·id 만 싣고, 동아리명이 없으면 그 줄을 뺀다")
    void feeAccountCreatedMessage() {
        String message = formatter.feeAccountCreated(new FeeAccountCreatedEvent(7L, 21L, Bank.KB, 5L), "두잉개발회");
        assertThat(message).contains("🏦 회비 계좌 등록", "이벤트: FEE_ACCOUNT_CREATED", "동아리: 두잉개발회",
                "ClubId: 7", "계좌Id: 21", "은행: KB", "등록자 UserId: 5");

        String withoutName = formatter.feeAccountCreated(new FeeAccountCreatedEvent(7L, 21L, Bank.KB, 5L), null);
        assertThat(withoutName).contains("ClubId: 7").doesNotContain("동아리:");
    }
```
`facilityBookingMessagesExcludeFreeText` 의 네 호출에 둘째 인자 `"두잉개발회"` 를 넣고, 첫 단정에 `"동아리: 두잉개발회"` 를 추가:
```java
        assertThat(formatter.facilityBookingSubmitted(new FacilityBookingSubmittedEvent(90L, 7L), "두잉개발회"))
                .contains("🏟️ 시설 예약 신청", "이벤트: FACILITY_BOOKING_SUBMITTED", "동아리: 두잉개발회",
                        "BookingId: 90", "ClubId: 7");

        String rejected = formatter.facilityBookingRejected(
                new FacilityBookingRejectedEvent(90L, 7L, 399L, "신청자 홍길동 서류 미비"), "두잉개발회");
        assertThat(rejected).contains("🏟️ 시설 예약 거절", "이벤트: FACILITY_BOOKING_REJECTED", "동아리: 두잉개발회",
                        "BookingId: 90", "ClubId: 7")
                .doesNotContain("홍길동", "서류 미비");

        String cancelled = formatter.facilityBookingCancelled(
                new FacilityBookingCancelledEvent(90L, 7L, 400L, "학생 홍길동 010-1234-5678 요청"), "두잉개발회");
        assertThat(cancelled).contains("🏟️ 시설 예약 취소(관리자)", "이벤트: FACILITY_BOOKING_CANCELLED",
                        "동아리: 두잉개발회", "BookingId: 90")
                .doesNotContain("홍길동", "010-1234-5678");

        String conflict = formatter.facilityBookingConflict(
                new FacilityBookingConflictEvent(90L, 7L, 401L, "타 동아리 김철수 중복"), "두잉개발회");
        assertThat(conflict).contains("⚠️ 시설 예약 충돌", "이벤트: FACILITY_BOOKING_CONFLICT",
                        "동아리: 두잉개발회", "BookingId: 90")
                .doesNotContain("김철수");
```

- [ ] **Step 2: 리스너 테스트 갱신(실패)**

`OpsSlackListenerTest.java` import 추가:
```java
import static org.mockito.ArgumentMatchers.eq;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.domain.fee.entity.Bank;
import java.util.Optional;
```
필드 교체:
```java
    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final OpsSlackListener listener = new OpsSlackListener(formatter, slackNotifier, clubRepository);
```
`swallowsFormatterFailure` 의 `when(formatter.facilityBookingSubmitted(any()))` 를 `when(formatter.facilityBookingSubmitted(any(), any()))` 로 바꾼다. 테스트 2개 추가:
```java
    @Test
    @DisplayName("동아리 id 만 있는 이벤트는 동아리명을 조회해 포매터에 넘긴다")
    void resolvesClubNameForEventsWithoutIt() {
        Club club = Club.create("두잉개발회", ClubCategory.ACADEMIC, "분과", "설명", null);
        when(clubRepository.findById(7L)).thenReturn(Optional.of(club));
        FeeAccountCreatedEvent event = new FeeAccountCreatedEvent(7L, 21L, Bank.KB, 5L);
        when(formatter.feeAccountCreated(event, "두잉개발회")).thenReturn("formatted");

        listener.onFeeAccountCreated(event);

        verify(slackNotifier).send("formatted");
    }

    @Test
    @DisplayName("동아리명 조회가 예외를 던져도 전파하지 않고 전송도 하지 않는다")
    void swallowsClubLookupFailure() {
        when(clubRepository.findById(any())).thenThrow(new IllegalStateException("db down"));

        assertThatCode(() -> listener.onFacilityBookingSubmitted(new FacilityBookingSubmittedEvent(1L, 2L)))
                .doesNotThrowAnyException();
        verify(slackNotifier, never()).send(anyString());
    }
```

Run: `./gradlew compileTestJava`
Expected: FAIL — 생성자·메서드 시그니처 불일치

- [ ] **Step 3: 포매터·리스너 구현**

`OpsSlackMessageFormatter.java` — 다섯 메서드를 교체(`field("동아리", clubName)` 을 첫 줄에):
```java
    /** 동아리명은 이벤트에 없어 리스너가 조회해 넘긴다 — 폐쇄된 동아리면 null 이고 그 줄은 빠진다. */
    public String feeAccountCreated(FeeAccountCreatedEvent event, String clubName) {
        return compose("🏦 회비 계좌 등록", "FEE_ACCOUNT_CREATED",
                Arrays.asList(field("동아리", clubName), field("ClubId", event.clubId()),
                        field("계좌Id", event.feeAccountId()),
                        field("은행", event.bank() == null ? null : event.bank().name()),
                        field("등록자 UserId", event.actorUserId())));
    }

    public String facilityBookingSubmitted(FacilityBookingSubmittedEvent event, String clubName) {
        return compose("🏟️ 시설 예약 신청", "FACILITY_BOOKING_SUBMITTED",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /** reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingRejected(FacilityBookingRejectedEvent event, String clubName) {
        return compose("🏟️ 시설 예약 거절", "FACILITY_BOOKING_REJECTED",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /** 관리자 취소만 이벤트가 있다(동아리 측 취소는 이벤트 미발행). reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingCancelled(FacilityBookingCancelledEvent event, String clubName) {
        return compose("🏟️ 시설 예약 취소(관리자)", "FACILITY_BOOKING_CANCELLED",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /** detail(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingConflict(FacilityBookingConflictEvent event, String clubName) {
        return compose("⚠️ 시설 예약 충돌", "FACILITY_BOOKING_CONFLICT",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }
```
클래스 javadoc 의 "이벤트 record 의 명시 필드만 줄로 조립한다" 문장 뒤에 한 줄 추가: `동아리명은 리스너가 id 로 조회해 넘기는 유일한 외부 값이다(이미 다른 이벤트가 싣는 필드).`

`OpsSlackListener.java` import 추가:
```java
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
```
필드 추가: `private final ClubRepository clubRepository;`
다섯 리스너 메서드의 람다를 `formatter.feeAccountCreated(event, clubNameOf(event.clubId()))` 식으로 바꾸고(시설 4종 동일), `notify` 앞에 헬퍼 추가:
```java
    /**
     * 동아리명은 회비·시설 이벤트 record 에 없어 조회한다(record 는 인앱 알림 리스너도 구독해 필드 불변).
     * 폐쇄(soft-delete)된 동아리는 @SQLRestriction 으로 빈 결과 → null → 포매터가 줄을 뺀다.
     * Supplier 안에서 불리므로 조회 실패도 notify 의 try/catch 가 흡수한다.
     */
    private String clubNameOf(Long clubId) {
        return clubRepository.findById(clubId).map(Club::getName).orElse(null);
    }
```

- [ ] **Step 4: 통과 확인**

Run: `./gradlew test --tests 'com.duing.global.monitoring.*'`
Expected: PASS (통합 테스트의 회비 계좌·시설 메시지 단정은 `contains` 라 줄 추가에 영향 없음)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/global/monitoring/ backend/src/test/java/com/duing/global/monitoring/
git commit -m "feat(backend): 운영 Slack — 회비 계좌·시설 예약 메시지에 동아리명 보강(리스너 조회)"
```

---

### Task 7: 관리자 동아리 활동 이력 조회 API

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/repository/ClubAuditEventRepositoryCustom.java`, `ClubAuditEventRepositoryImpl.java`(`searchFeeEvents` → `searchEvents`)
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralAdminFeeAuditQueryService.java:225`, `GeneralAdminFeeAnomalyService.java:287,317`(호출 개명)
- Create: `backend/src/main/java/com/duing/domain/clubaudit/service/dto/query/AdminClubActivityEventRow.java`
- Create: `backend/src/main/java/com/duing/domain/clubaudit/service/AdminClubActivityQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/clubaudit/service/GeneralAdminClubActivityQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/clubaudit/controller/dto/response/AdminClubActivityEventResponse.java`
- Create: `backend/src/main/java/com/duing/domain/clubaudit/api/AdminClubActivityApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubaudit/controller/AdminClubActivityController.java`
- Create: `backend/src/test/java/com/duing/domain/clubaudit/controller/AdminClubActivityEventsTest.java`

**Interfaces:**
- Produces: `GET /api/v1/admin/clubs/{clubId}/activity-events?types=&page=&size=` → `ApiResponse<PageResponse<AdminClubActivityEventResponse>>`; 응답 필드 `eventId, eventType, actorUserId, actorName, createdAt(Instant), reason, recruitmentId, joinCodeId, detail(JSON 원문)`. FE Task 9 가 이 형태를 미러한다.

- [ ] **Step 1: 개명(리팩터, 동작 불변)**

`ClubAuditEventRepositoryCustom.java`·`ClubAuditEventRepositoryImpl.java` 의 `searchFeeEvents` 를 `searchEvents` 로, javadoc 첫 줄을 `동아리 감사 타임라인 조회 — 회비 감사 콘솔(스펙 §7.8)과 활동 이력 콘솔이 함께 쓰는 범용 술어다.` 로. 호출 3곳(`GeneralAdminFeeAuditQueryService.getAuditLogs`, `GeneralAdminFeeAnomalyService.detectPolicyAmountChanges` 와 계좌 변경 카운트) 을 `searchEvents` 로.

Run: `./gradlew compileJava && ./gradlew test --tests 'com.duing.domain.fee.controller.AdminFeeAuditLogTest' --tests 'com.duing.domain.fee.service.*Anomaly*'`
Expected: PASS

Commit:
```bash
git add backend/src/main/java/com/duing/domain/clubaudit/repository/ backend/src/main/java/com/duing/domain/fee/service/
git commit -m "refactor(backend): 감사 타임라인 조회 — searchFeeEvents → searchEvents 개명(비회비 호출자 대비)"
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/clubaudit/controller/AdminClubActivityEventsTest.java`:

```java
package com.duing.domain.clubaudit.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * 총동연 동아리 활동 이력 조회(활동 이력 스펙 §2.3). 이벤트는 계측 팩토리로 직접 시드한다 —
 * 계측이 남기는지는 각 계측 테스트 소관이고, 여기서 볼 것은 허용 5종만 잘라 내려주느냐다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubActivityEventsTest extends IntegrationTestBase {

    private static final String EVENTS_PATH = "/api/v1/admin/clubs/{clubId}/activity-events";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private String adminToken;
    private String studentToken;
    private Long clubId;
    private Long adminId;
    private Long statusEventId;
    private Long inviteCreatedEventId;
    private Long recruitmentLinkRevokedEventId;
    private Long closedEventId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = userRepository.save(UserFixture.admin());
        User student = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        adminId = admin.getId();

        Club club = clubRepository.save(ClubFixture.academic("활동이력동아리"));
        Club otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        clubId = club.getId();
        User leader = userRepository.save(UserFixture.withName("이운영"));
        User withdrawnLeader = userRepository.save(UserFixture.withName("탈퇴운영진"));

        statusEventId = save(ClubAuditEvent.clubStatusChanged(clubId, adminId, "서류 미비",
                AuditDetailJson.of(Map.of("from", "PENDING_APPROVAL", "to", "REJECTED"))));
        inviteCreatedEventId = save(ClubAuditEvent.joinLink(ClubAuditEventType.JOIN_LINK_CREATED, clubId,
                null, null, leader.getId(), AuditDetailJson.of(Map.of(
                        "linkType", "CLUB_INVITE", "autoApprove", true, "maxUses", 30,
                        "expiresAt", "2026-09-11T05:00:00Z"))));
        recruitmentLinkRevokedEventId = save(ClubAuditEvent.joinLink(ClubAuditEventType.JOIN_LINK_REVOKED, clubId,
                null, null, withdrawnLeader.getId()));
        userRepository.delete(withdrawnLeader);
        closedEventId = save(ClubAuditEvent.clubClosed(clubId, adminId, "활동 중단 장기화"));

        // 허용 밖 종류(회비·가입 요청)와 다른 동아리의 허용 종류 — 어느 것도 응답에 섞이면 안 된다.
        save(ClubAuditEvent.feeAccount(ClubAuditEventType.FEE_ACCOUNT_REGISTERED, clubId, leader.getId(), null));
        save(ClubAuditEvent.joinRequest(ClubAuditEventType.JOIN_REQUEST_CREATED, clubId, null, null, null, leader.getId()));
        save(ClubAuditEvent.clubClosed(otherClub.getId(), adminId, "다른 동아리"));
    }

    @Test
    @DisplayName("학생 토큰은 403 이다")
    void studentIsForbidden() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(EVENTS_PATH, clubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("types 미지정이면 허용 5종만 최신순으로, 행위자 이름·사유·detail 원문을 붙여 내려주고 탈퇴자는 이름만 비운다")
    void listsAllowedTypesLatestFirst() {
        JsonPath response = search();

        assertThat(response.getList("data.content.eventId", Long.class))
                .containsExactly(closedEventId, recruitmentLinkRevokedEventId, inviteCreatedEventId, statusEventId);
        assertThat(response.getLong("data.totalElements")).isEqualTo(4L);

        assertThat(response.getString(path(statusEventId) + ".eventType")).isEqualTo("CLUB_STATUS_CHANGED");
        assertThat(response.getString(path(statusEventId) + ".reason")).isEqualTo("서류 미비");
        assertThat(response.getString(path(statusEventId) + ".detail.from")).isEqualTo("PENDING_APPROVAL");
        assertThat(response.getString(path(statusEventId) + ".detail.to")).isEqualTo("REJECTED");
        assertThat(response.getLong(path(statusEventId) + ".actorUserId")).isEqualTo(adminId);
        assertThat(response.getString(path(statusEventId) + ".createdAt")).isNotNull();

        assertThat(response.getString(path(inviteCreatedEventId) + ".actorName")).isEqualTo("이운영");
        assertThat(response.getBoolean(path(inviteCreatedEventId) + ".detail.autoApprove")).isTrue();
        assertThat(response.getInt(path(inviteCreatedEventId) + ".detail.maxUses")).isEqualTo(30);
        assertThat(response.getString(path(inviteCreatedEventId) + ".recruitmentId")).isNull();

        assertThat(response.getString(path(recruitmentLinkRevokedEventId) + ".actorName"))
                .as("탈퇴한 행위자는 이름만 비운다").isNull();
        assertThat(response.getString(path(recruitmentLinkRevokedEventId) + ".detail")).isNull();

        assertThat(response.getString(path(closedEventId) + ".reason")).isEqualTo("활동 중단 장기화");
    }

    @Test
    @DisplayName("types 는 허용 집합과 교집합만 조회하고, 전부 허용 밖이면 빈 결과다")
    void typesIntersectWithAllowedSet() {
        JsonPath mixed = search("types", "CLUB_CLOSED", "types", "FEE_POLICY_CREATED");
        assertThat(mixed.getList("data.content.eventId", Long.class)).containsExactly(closedEventId);

        JsonPath statusOnly = search("types", "CLUB_STATUS_CHANGED", "types", "CLUB_CLOSED");
        assertThat(statusOnly.getList("data.content.eventId", Long.class))
                .containsExactly(closedEventId, statusEventId);

        JsonPath outsideOnly = search("types", "FEE_POLICY_CREATED", "types", "JOIN_REQUEST_CREATED");
        assertThat(outsideOnly.getList("data.content")).isEmpty();
        assertThat(outsideOnly.getLong("data.totalElements")).isZero();
    }

    @Test
    @DisplayName("폐쇄(soft-delete)된 동아리도 이력은 조회된다 — 존재 검사를 하지 않는다")
    void closedClubHistoryStaysReadable() {
        clubRepository.delete(clubRepository.findById(clubId).orElseThrow());

        JsonPath response = search();

        assertThat(response.getLong("data.totalElements")).isEqualTo(4L);
    }

    private JsonPath search(String... queryParams) {
        var request = RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(EVENTS_PATH, clubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private static String path(Long eventId) {
        return "data.content.find { it.eventId == " + eventId + " }";
    }

    private Long save(ClubAuditEvent event) {
        return clubAuditEventRepository.save(event).getId();
    }
}
```

Run: `./gradlew test --tests 'com.duing.domain.clubaudit.controller.AdminClubActivityEventsTest'`
Expected: FAIL — 404(경로 없음) 또는 403

- [ ] **Step 3: 조회 행·서비스**

`backend/src/main/java/com/duing/domain/clubaudit/service/dto/query/AdminClubActivityEventRow.java`:
```java
package com.duing.domain.clubaudit.service.dto.query;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import java.time.LocalDateTime;

/**
 * 활동 이력 행(활동 이력 스펙 §2.3). {@code actorName} 은 조회 시점 조인이라 탈퇴 회원이면 null,
 * {@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계) 원본 — 절대시각 환산은 응답 경계가 한다.
 * {@code recruitmentId} 가 null 인 가입 링크 이벤트가 부원 초대다. {@code detail} 은 JSONB 원문 그대로다.
 */
public record AdminClubActivityEventRow(
        Long eventId,
        ClubAuditEventType eventType,
        Long actorUserId,
        String actorName,
        LocalDateTime createdAt,
        String reason,
        Long recruitmentId,
        Long joinCodeId,
        String detail
) {
}
```

`backend/src/main/java/com/duing/domain/clubaudit/service/AdminClubActivityQueryService.java`:
```java
package com.duing.domain.clubaudit.service;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.service.dto.query.AdminClubActivityEventRow;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface AdminClubActivityQueryService {

    /**
     * 동아리 활동 이력(상태 전이·폐쇄·가입 링크 3종) 최신순.
     * {@code types} 미지정 → 허용 5종 전체, 지정 → 허용 집합과 교집합, 전부 허용 밖 → 빈 페이지.
     */
    Page<AdminClubActivityEventRow> getActivityEvents(Long clubId, List<ClubAuditEventType> types, Pageable pageable);
}
```

`backend/src/main/java/com/duing/domain/clubaudit/service/GeneralAdminClubActivityQueryService.java`:
```java
package com.duing.domain.clubaudit.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.service.dto.query.AdminClubActivityEventRow;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 동아리 활동 이력 조회(활동 이력 스펙 §2.3). 권한은 컨트롤러의 {@code @PreAuthorize} 가 담당한다.
 * 동아리 존재 검사는 하지 않는다 — 폐쇄(soft-delete)된 동아리의 이력도 읽혀야 한다. 열람 감사도 남기지 않는다(개인정보 없음).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminClubActivityQueryService implements AdminClubActivityQueryService {

    /** 이 콘솔이 싣는 종류 — 회비는 회비 콘솔, 가입 요청 3종은 학생 행위자라 싣지 않는다(요구 5). */
    static final Set<ClubAuditEventType> ACTIVITY_EVENT_TYPES = Set.of(
            ClubAuditEventType.CLUB_STATUS_CHANGED,
            ClubAuditEventType.CLUB_CLOSED,
            ClubAuditEventType.JOIN_LINK_CREATED,
            ClubAuditEventType.JOIN_LINK_REGENERATED,
            ClubAuditEventType.JOIN_LINK_REVOKED);

    private final ClubAuditEventRepository clubAuditEventRepository;
    private final UserRepository userRepository;

    @Override
    public Page<AdminClubActivityEventRow> getActivityEvents(Long clubId, List<ClubAuditEventType> types,
                                                             Pageable pageable) {
        // 기간 필터는 두지 않는다(스펙 §2.3) — 술어는 null 경계를 무조건으로 처리한다.
        Page<ClubAuditEvent> events = clubAuditEventRepository.searchEvents(
                clubId, activityTypesOf(types), null, null, pageable);
        Map<Long, String> actorNames = actorNamesOf(events.getContent());
        return events.map(event -> toRow(event, actorNames));
    }

    /**
     * 미지정 → 허용 5종 전체, 지정 → 허용 집합과 교집합. 전부 허용 밖이면 빈 목록이 되고
     * 리포지토리가 빈 페이지를 돌려준다 — "미지정" 과 "전부 허용 밖" 을 구분하는 것이 핵심이다.
     */
    private static Collection<ClubAuditEventType> activityTypesOf(List<ClubAuditEventType> requestedTypes) {
        if (requestedTypes == null || requestedTypes.isEmpty()) {
            return ACTIVITY_EVENT_TYPES;
        }
        return requestedTypes.stream().filter(ACTIVITY_EVENT_TYPES::contains).distinct().toList();
    }

    /** actor 이름은 한 번에 모아 해석한다(N+1 방지). 탈퇴(soft delete) 회원은 조회되지 않아 이름이 비어 나간다. */
    private Map<Long, String> actorNamesOf(List<ClubAuditEvent> events) {
        return userRepository.findAllById(
                        events.stream().map(ClubAuditEvent::getActorUserId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    private static AdminClubActivityEventRow toRow(ClubAuditEvent event, Map<Long, String> actorNames) {
        return new AdminClubActivityEventRow(
                event.getId(),
                event.getEventType(),
                event.getActorUserId(),
                actorNames.get(event.getActorUserId()),
                event.getCreatedAt(),
                event.getReason(),
                event.getRecruitmentId(),
                event.getJoinCodeId(),
                event.getDetail());
    }
}
```

- [ ] **Step 4: 응답·API 인터페이스·컨트롤러**

`backend/src/main/java/com/duing/domain/clubaudit/controller/dto/response/AdminClubActivityEventResponse.java`:
```java
package com.duing.domain.clubaudit.controller.dto.response;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.service.dto.query.AdminClubActivityEventRow;
import com.duing.global.time.TimeMapper;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.Instant;

/**
 * 활동 이력 행. {@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계)라 system 존으로 환산한다(/TIMEZONE.md).
 * {@code detail} 은 이벤트 종류마다 키가 다른 스냅샷이라 저장된 JSONB 원문을 그대로 통과시킨다({@link JsonRawValue}).
 * {@code recruitmentId} 가 null 인 가입 링크 이벤트가 부원 초대 링크다.
 */
public record AdminClubActivityEventResponse(
        Long eventId,
        ClubAuditEventType eventType,
        Long actorUserId,
        String actorName,
        Instant createdAt,
        String reason,
        Long recruitmentId,
        Long joinCodeId,
        @JsonRawValue String detail
) {
    public static AdminClubActivityEventResponse from(AdminClubActivityEventRow row) {
        return new AdminClubActivityEventResponse(
                row.eventId(),
                row.eventType(),
                row.actorUserId(),
                row.actorName(),
                TimeMapper.systemWallClockToInstant(row.createdAt()),
                row.reason(),
                row.recruitmentId(),
                row.joinCodeId(),
                row.detail());
    }
}
```

`backend/src/main/java/com/duing/domain/clubaudit/api/AdminClubActivityApi.java`:
```java
package com.duing.domain.clubaudit.api;

import com.duing.domain.clubaudit.controller.dto.response.AdminClubActivityEventResponse;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 활동 이력(총동연)",
        description = "총동연 전용 동아리 활동 이력 — 상태 전이·폐쇄·가입 링크(모집 링크·부원 초대) 생성/재발급/폐기.")
@SecurityRequirement(name = "BearerAuth")
public interface AdminClubActivityApi {

    @Operation(summary = "동아리 활동 이력 (ADMIN)",
            description = "동아리의 상태 전이·폐쇄·가입 링크 이벤트를 최신순으로 반환한다. "
                    + "types 미지정이면 허용 5종(CLUB_STATUS_CHANGED, CLUB_CLOSED, JOIN_LINK_CREATED, "
                    + "JOIN_LINK_REGENERATED, JOIN_LINK_REVOKED) 전체, 지정하면 허용 집합과의 교집합만이며 "
                    + "전부 허용 밖이면 빈 결과다(회비·가입 요청 종류는 실리지 않는다). "
                    + "recruitmentId 가 null 인 가입 링크 이벤트가 부원 초대 링크다. actorName 은 탈퇴 회원이면 비어 나오고, "
                    + "detail 은 이벤트 종류마다 키가 다른 스냅샷 원본(JSON)이라 없을 수도 있다. "
                    + "폐쇄된 동아리의 이력도 조회된다. 이력은 계측 배포 시점 이후의 변경만 기록된다.")
    @GetMapping("/admin/clubs/{clubId}/activity-events")
    ResponseEntity<ApiResponse<PageResponse<AdminClubActivityEventResponse>>> searchActivityEvents(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "이벤트 종류(복수). 생략 시 허용 5종 전체")
            @RequestParam(required = false) List<ClubAuditEventType> types,
            @Parameter(description = "페이지(0부터)·크기. 정렬은 최신순 고정")
            Pageable pageable
    );
}
```

`backend/src/main/java/com/duing/domain/clubaudit/controller/AdminClubActivityController.java`:
```java
package com.duing.domain.clubaudit.controller;

import com.duing.domain.clubaudit.api.AdminClubActivityApi;
import com.duing.domain.clubaudit.controller.dto.response.AdminClubActivityEventResponse;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.service.AdminClubActivityQueryService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubActivityController implements AdminClubActivityApi {

    private final AdminClubActivityQueryService adminClubActivityQueryService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminClubActivityEventResponse>>> searchActivityEvents(
            @PathVariable Long clubId,
            @RequestParam(required = false) List<ClubAuditEventType> types,
            Pageable pageable
    ) {
        Page<AdminClubActivityEventResponse> page = adminClubActivityQueryService
                .getActivityEvents(clubId, types, pageable)
                .map(AdminClubActivityEventResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
}
```

- [ ] **Step 5: 통과 확인**

Run: `./gradlew test --tests 'com.duing.domain.clubaudit.controller.AdminClubActivityEventsTest'`
Expected: PASS. (403 테스트가 401 로 나오면 기존 관리자 API 테스트(`AdminFeeAuditLogTest`)의 학생 토큰 처리를 확인해 같은 코드로 맞춘다 — URL 레이어 백스톱이 있으면 403 이다.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubaudit/ backend/src/test/java/com/duing/domain/clubaudit/
git commit -m "feat(backend): 관리자 동아리 활동 이력 조회 API — 상태·폐쇄·가입 링크 5종, types 교집합·빈 결과 규칙"
```

---

### Task 8: 백엔드 전체 검증 + PR 생성

**Files:** 없음(검증·PR)

- [ ] **Step 1: 전체 테스트**

Run (backend/): `./gradlew test`
Expected: BUILD SUCCESSFUL. `joinCodes` 계열 플래키 1건이 전체 스위트에서만 간헐 실패할 수 있다(메모리) — 그 테스트만 단독 재실행해 통과하면 진행.

- [ ] **Step 2: Self-check 7항목**

1. 빌드·테스트 SUCCESS 2. 스펙 §2.1·2.2·2.3·2.5·2.6 ↔ Task 1~7 일치, 요청 외 변경 없음 3. FE 영향: 새 API 만 추가, 기존 응답 불변 4. 각 Task 리뷰 완료 5. 플랜 체크박스 실행 후 재확인 6. 커밋 메시지에 attribution 없음(`git log --format=%B origin/develop..HEAD | grep -i "co-authored\|generated"` 가 빈 출력) 7. 새 파일 EOF newline(`git diff origin/develop..HEAD --check`).

- [ ] **Step 3: push + PR (머지 금지)**

```bash
git push -u origin RublerubitZ/feat-invite-link-tracking
gh pr create --base develop --title "feat(backend): 동아리 활동 이력 — 상태 전이·폐쇄 감사 기록(V127)·초대 detail·관리자 조회 API·자동승인 초대 Slack·Slack 동아리명 보강" --body-file /private/tmp/claude-501/-Users-ksy-orca-workspaces-Duing-rorqual/e08d8cf7-c55e-4e9c-b0e9-97876f147966/scratchpad/pr-backend.md
```
`pr-backend.md` 는 PR 템플릿(🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항)을 자연스러운 문장으로 채운다. 파일·클래스명 나열 금지. 리뷰 중점: V127 롤백 = 제약만 되돌림, 감사 행은 변이와 같은 트랜잭션, 초대 만료 KST 환산, types 교집합·빈 결과 규칙, Slack 동아리명 조회가 리스너 try/catch 안에 있음.

---

## PR 2 — 프론트엔드 (브랜치 `RublerubitZ/feat-invite-link-tracking-fe`, base = BE 브랜치)

```bash
git checkout -b RublerubitZ/feat-invite-link-tracking-fe
```

### Task 9: 타입 + API 클라이언트

**Files:**
- Create: `frontend/packages/types/src/adminClubActivity.ts`
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/api/src/domains/admin.ts`(import·인터페이스 `clubActivity`·구현)
- Create: `frontend/packages/api/test/adminClubActivity.test.ts`

**Interfaces:**
- Produces: `AdminClubActivityEventType`, `AdminClubActivityEvent`, `AdminClubActivityEventsParams`, `ADMIN_CLUB_ACTIVITY_EVENT_TYPES`; `client.admin.clubActivity.events(clubId: number, params: AdminClubActivityEventsParams): Promise<PageResponse<AdminClubActivityEvent>>`

- [ ] **Step 1: 실패하는 API 테스트**

`frontend/packages/api/test/adminClubActivity.test.ts`:
```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('관리자 동아리 활동 이력 API 클라이언트', () => {
  it('types 배열을 같은 키 반복으로 직렬화해 activity-events 를 GET 한다', async () => {
    let hitUrl: URL | null = null;
    server.use(
      http.get(`${BASE_URL}/admin/clubs/:clubId/activity-events`, ({ request }) => {
        hitUrl = new URL(request.url);
        return HttpResponse.json({
          ok: true,
          message: null,
          data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false },
        });
      }),
    );

    await createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' }).admin.clubActivity.events(7, {
      types: ['CLUB_STATUS_CHANGED', 'CLUB_CLOSED'],
      page: 1,
      size: 20,
    });

    expect(hitUrl).not.toBeNull();
    expect(hitUrl?.pathname).toBe('/api/v1/admin/clubs/7/activity-events');
    expect(hitUrl?.searchParams.getAll('types')).toEqual(['CLUB_STATUS_CHANGED', 'CLUB_CLOSED']);
    expect(hitUrl?.searchParams.get('page')).toBe('1');
  });
});
```
`PageResponse` 의 정확한 필드는 `packages/types/src/api.ts:12` 를 열어 맞춘다(위 응답 객체의 키가 다르면 그 타입에 맞게 고친다).

Run (frontend/): `pnpm --filter @duing/api test -- --run adminClubActivity`
Expected: FAIL — `clubActivity` 가 undefined

- [ ] **Step 2: 타입**

`frontend/packages/types/src/adminClubActivity.ts`:
```ts
/**
 * 관리자 동아리 활동 이력(AdminClubActivityEventResponse 미러).
 * 서버 허용 5종만 실린다 — 회비·가입 요청 종류는 이 API 로 오지 않는다.
 */
export const ADMIN_CLUB_ACTIVITY_EVENT_TYPES = [
  'CLUB_STATUS_CHANGED',
  'CLUB_CLOSED',
  'JOIN_LINK_CREATED',
  'JOIN_LINK_REGENERATED',
  'JOIN_LINK_REVOKED',
] as const;

export type AdminClubActivityEventType = (typeof ADMIN_CLUB_ACTIVITY_EVENT_TYPES)[number];

/**
 * detail 은 이벤트 종류마다 키가 다른 스냅샷 원문이다 — 상태 전이는 {from,to}, 부원 초대 발급은
 * {linkType,autoApprove,maxUses,expiresAt}. 계측 전 행·폐기·모집 링크는 null 이므로 키를 가정하지 말고 있는 것만 읽는다.
 * recruitmentId 가 null 인 가입 링크 이벤트가 부원 초대 링크다.
 */
export type AdminClubActivityEvent = {
  eventId: number;
  eventType: AdminClubActivityEventType;
  actorUserId: number;
  /** 탈퇴 회원이면 null. */
  actorName: string | null;
  createdAt: string;
  reason: string | null;
  recruitmentId: number | null;
  joinCodeId: number | null;
  detail: Record<string, unknown> | null;
};

export type AdminClubActivityEventsParams = {
  /** 복수 지정 가능. 생략하면 허용 5종 전체. */
  types?: AdminClubActivityEventType[];
  page?: number;
  size?: number;
};
```
`frontend/packages/types/src/index.ts` 의 `export * from './adminFee';` 아래에 `export * from './adminClubActivity';` 추가.

- [ ] **Step 3: API 클라이언트**

`frontend/packages/api/src/domains/admin.ts`:
- 상단 `import type { ... } from '@duing/types'` 목록에 `AdminClubActivityEvent, AdminClubActivityEventsParams` 추가.
- 인터페이스의 `leaderSuccession: { ... };` 블록 다음에:
```ts
  clubActivity: {
    events(clubId: number, params: AdminClubActivityEventsParams): Promise<PageResponse<AdminClubActivityEvent>>;
  };
```
- 구현의 `leaderSuccession: { ... },` 블록(`memberHistory` 가 있는 곳) 다음에:
```ts
    clubActivity: {
      // 배열 파라미터는 cleanParams 가 같은 키 반복(types=A&types=B)으로 직렬화해 Spring List<T> 와 맞는다.
      events: (clubId, params) =>
        jsonOk<PageResponse<AdminClubActivityEvent>>(
          http.get(`admin/clubs/${clubId}/activity-events`, { searchParams: cleanParams(params) }),
        ),
    },
```

- [ ] **Step 4: 통과 + 타입체크**

Run: `pnpm --filter @duing/api test -- --run adminClubActivity && pnpm --filter @duing/types typecheck && pnpm --filter @duing/api typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/types frontend/packages/api
git commit -m "feat(frontend): 동아리 활동 이력 — 타입·API 클라이언트(activity-events)"
```

---

### Task 10: React Query 훅

**Files:**
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts`
- Create: `frontend/packages/hooks/src/adminClubActivity.ts`
- Modify: `frontend/packages/hooks/src/index.ts`
- Create: `frontend/packages/hooks/test/adminClubActivity.test.tsx`

**Interfaces:**
- Consumes: `client.admin.clubActivity.events`(Task 9)
- Produces: `useAdminClubActivityEventsQuery(clubId: number, params: AdminClubActivityEventsParams)`, `adminQueryKeys.clubActivityEvents(clubId, params)`

- [ ] **Step 1: 실패하는 훅 테스트**

`frontend/packages/hooks/test/adminClubActivity.test.tsx`:
```tsx
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useAdminClubActivityEventsQuery } from '../src/adminClubActivity';
import { adminQueryKeys } from '../src/adminQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

const server = setupServer(
  http.get('*/admin/clubs/7/activity-events', ({ request }) => {
    const requestedTypes = new URL(request.url).searchParams.getAll('types');
    return HttpResponse.json({
      ok: true,
      message: null,
      data: {
        content: [
          {
            eventId: 11,
            eventType: requestedTypes[0] ?? 'CLUB_CLOSED',
            actorUserId: 3,
            actorName: '총동연',
            createdAt: '2026-09-08T03:00:00Z',
            reason: '활동 중단 장기화',
            recruitmentId: null,
            joinCodeId: null,
            detail: null,
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
      },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminClubActivityEventsQuery', () => {
  it('동아리 id 와 types 를 서버에 전달하고 페이지를 돌려준다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useAdminClubActivityEventsQuery(7, { types: ['CLUB_STATUS_CHANGED'], page: 0, size: 20 }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content[0]?.eventType).toBe('CLUB_STATUS_CHANGED');
    expect(result.current.data?.totalElements).toBe(1);
  });

  it('쿼리키는 동아리 id 와 파라미터를 포함한다', () => {
    expect(adminQueryKeys.clubActivityEvents(7, { page: 0 })).toEqual([
      'admin',
      'club-activity-events',
      7,
      { page: 0 },
    ]);
  });
});
```
(`PageResponse` 응답 키는 Task 9 에서 확인한 실제 타입에 맞춘다.)

Run: `pnpm --filter @duing/hooks test -- --run adminClubActivity`
Expected: FAIL — 모듈 없음

- [ ] **Step 2: 쿼리키·훅·export**

`adminQueryKeys.ts` 상단 import 목록에 `AdminClubActivityEventsParams` 추가, `clubMemberHistory` 항목 아래에:
```ts
  clubActivityEvents: (clubId: number, params: AdminClubActivityEventsParams) =>
    ['admin', 'club-activity-events', clubId, params] as const,
```

`frontend/packages/hooks/src/adminClubActivity.ts`:
```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminClubActivityEventsParams } from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

/** 관리자 동아리 활동 이력. 칩·페이지 전환 중 이전 목록을 유지한다(회비 감사 로그 선례). */
export function useAdminClubActivityEventsQuery(clubId: number, params: AdminClubActivityEventsParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.clubActivityEvents(clubId, params),
    queryFn: () => client.admin.clubActivity.events(clubId, params),
    placeholderData: keepPreviousData,
  });
}
```
`frontend/packages/hooks/src/index.ts` 의 `} from './leaderSuccession';` 다음에:
```ts
export { useAdminClubActivityEventsQuery } from './adminClubActivity';
```

- [ ] **Step 3: 통과 + 타입체크**

Run: `pnpm --filter @duing/hooks test -- --run adminClubActivity && pnpm --filter @duing/hooks typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/hooks
git commit -m "feat(frontend): 동아리 활동 이력 — React Query 훅·쿼리키"
```

---

### Task 11: 라벨·요약 유틸

**Files:**
- Create: `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_lib/activityLabels.ts`
- Create: `frontend/apps/web/test/admin/club-activity-labels.test.ts`

**Interfaces:**
- Consumes: `AdminClubActivityEvent`(Task 9), `STATUS_LABEL`(`app/admin/clubs/_lib/clubStatus.ts`), `formatDateTimeKst`(`@duing/hooks/datetime`)
- Produces: `activityEventLabel(event): string`, `activityDetailSummary(event): string`, `activityActorLabel(event): string`

- [ ] **Step 1: 실패하는 테스트**

`frontend/apps/web/test/admin/club-activity-labels.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AdminClubActivityEvent } from '@duing/types';
import {
  activityActorLabel,
  activityDetailSummary,
  activityEventLabel,
} from '@/app/admin/clubs/[clubId]/activity-log/_lib/activityLabels';

function eventOf(overrides: Partial<AdminClubActivityEvent>): AdminClubActivityEvent {
  return {
    eventId: 1,
    eventType: 'CLUB_CLOSED',
    actorUserId: 3,
    actorName: '총동연',
    createdAt: '2026-09-08T03:00:00Z',
    reason: null,
    recruitmentId: null,
    joinCodeId: null,
    detail: null,
    ...overrides,
  };
}

describe('activityEventLabel', () => {
  it('상태 변경은 from→to 를 한글 상태명으로 표기한다', () => {
    expect(
      activityEventLabel(
        eventOf({ eventType: 'CLUB_STATUS_CHANGED', detail: { from: 'PENDING_APPROVAL', to: 'REJECTED' } }),
      ),
    ).toBe('상태 변경 · 승인 대기 → 거절');
  });
  it('상태 detail 이 없거나 모르는 값이면 "알 수 없음" 으로 방어한다', () => {
    expect(activityEventLabel(eventOf({ eventType: 'CLUB_STATUS_CHANGED', detail: null }))).toBe(
      '상태 변경 · 알 수 없음 → 알 수 없음',
    );
  });
  it('폐쇄는 "동아리 폐쇄"', () => {
    expect(activityEventLabel(eventOf({ eventType: 'CLUB_CLOSED' }))).toBe('동아리 폐쇄');
  });
  it('가입 링크 이벤트는 recruitmentId 유무로 부원 초대/모집 가입 링크를 가른다', () => {
    expect(activityEventLabel(eventOf({ eventType: 'JOIN_LINK_CREATED', recruitmentId: null }))).toBe(
      '부원 초대 링크 발급',
    );
    expect(activityEventLabel(eventOf({ eventType: 'JOIN_LINK_REGENERATED', recruitmentId: 5 }))).toBe(
      '모집 가입 링크 재발급',
    );
    expect(activityEventLabel(eventOf({ eventType: 'JOIN_LINK_REVOKED', recruitmentId: 5 }))).toBe(
      '모집 가입 링크 폐기',
    );
  });
});

describe('activityDetailSummary', () => {
  it('자동승인 초대 발급은 자동승인·정원·KST 만료를 요약한다', () => {
    expect(
      activityDetailSummary(
        eventOf({
          eventType: 'JOIN_LINK_CREATED',
          detail: { linkType: 'CLUB_INVITE', autoApprove: true, maxUses: 30, expiresAt: '2026-09-11T05:00:00Z' },
        }),
      ),
    ).toBe('자동승인 · 정원 30 · 만료 2026.09.11 14:00');
  });
  it('승인제 초대는 "승인제" 로 표기한다', () => {
    expect(
      activityDetailSummary(
        eventOf({ eventType: 'JOIN_LINK_REGENERATED', detail: { autoApprove: false, maxUses: 10 } }),
      ),
    ).toBe('승인제 · 정원 10');
  });
  it('detail 이 없거나 링크 발급이 아니면 빈 문자열', () => {
    expect(activityDetailSummary(eventOf({ eventType: 'JOIN_LINK_CREATED', detail: null }))).toBe('');
    expect(activityDetailSummary(eventOf({ eventType: 'JOIN_LINK_REVOKED', detail: { autoApprove: true } }))).toBe('');
    expect(activityDetailSummary(eventOf({ eventType: 'CLUB_STATUS_CHANGED', detail: { from: 'ACTIVE' } }))).toBe('');
  });
});

describe('activityActorLabel', () => {
  it('이름이 있으면 이름, 없으면 "탈퇴한 회원"', () => {
    expect(activityActorLabel(eventOf({ actorName: '이운영' }))).toBe('이운영');
    expect(activityActorLabel(eventOf({ actorName: null }))).toBe('탈퇴한 회원');
  });
});
```

Run: `pnpm --filter @duing/web test -- --run club-activity-labels`
Expected: FAIL — 모듈 없음

- [ ] **Step 2: 구현**

`frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_lib/activityLabels.ts`:
```ts
import type { AdminClubActivityEvent, ClubStatus } from '@duing/types';
import { formatDateTimeKst } from '@duing/hooks/datetime';

import { STATUS_LABEL } from '../../../_lib/clubStatus';

const CLUB_STATUSES: ReadonlyArray<ClubStatus> = ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED'];

function isClubStatus(value: unknown): value is ClubStatus {
  return typeof value === 'string' && CLUB_STATUSES.some((status) => status === value);
}

/** detail 은 서버가 형태를 규정하지 않는 원문이라 모르는 값은 그대로 보이지 않고 방어 문구로 바꾼다. */
function statusLabelOf(value: unknown): string {
  return isClubStatus(value) ? STATUS_LABEL[value] : '알 수 없음';
}

/** 가입 링크와 부원 초대는 같은 이벤트다 — 모집 귀속(recruitmentId) 유무로만 갈린다. */
function linkKindLabel(event: AdminClubActivityEvent): string {
  return event.recruitmentId === null ? '부원 초대 링크' : '모집 가입 링크';
}

export function activityEventLabel(event: AdminClubActivityEvent): string {
  switch (event.eventType) {
    case 'CLUB_STATUS_CHANGED':
      return `상태 변경 · ${statusLabelOf(event.detail?.from)} → ${statusLabelOf(event.detail?.to)}`;
    case 'CLUB_CLOSED':
      return '동아리 폐쇄';
    case 'JOIN_LINK_CREATED':
      return `${linkKindLabel(event)} 발급`;
    case 'JOIN_LINK_REGENERATED':
      return `${linkKindLabel(event)} 재발급`;
    case 'JOIN_LINK_REVOKED':
      return `${linkKindLabel(event)} 폐기`;
  }
}

/**
 * 부원 초대 발급 detail 요약("자동승인 · 정원 30 · 만료 2026.09.11 14:00").
 * detail 이 없으면(계측 전 행·폐기·모집 링크) 빈 문자열 — 호출 측이 줄 자체를 그리지 않는다.
 */
export function activityDetailSummary(event: AdminClubActivityEvent): string {
  if (event.eventType !== 'JOIN_LINK_CREATED' && event.eventType !== 'JOIN_LINK_REGENERATED') return '';
  const detail = event.detail;
  if (detail === null) return '';
  const parts: string[] = [];
  if (typeof detail.autoApprove === 'boolean') parts.push(detail.autoApprove ? '자동승인' : '승인제');
  if (typeof detail.maxUses === 'number') parts.push(`정원 ${detail.maxUses}`);
  if (typeof detail.expiresAt === 'string') parts.push(`만료 ${formatDateTimeKst(detail.expiresAt)}`);
  return parts.join(' · ');
}

/** 행위자는 운영진·총동연이다. 탈퇴하면 이름만 비고 id 는 남는다. */
export function activityActorLabel(event: AdminClubActivityEvent): string {
  return event.actorName ?? '탈퇴한 회원';
}
```

- [ ] **Step 3: 통과 + 타입체크 + 린트**

Run: `pnpm --filter @duing/web test -- --run club-activity-labels && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: PASS. `switch` 가 모든 union 을 다뤄 반환 누락 경고가 없어야 한다(누락 경고가 나면 `default` 없이 union 이 5종인지 타입을 확인).
typecheck 가 `.next/types/routes.d.ts` 부재로 실패하면(typedRoutes, 새 워크트리) 먼저 한 번 빌드한다 — CI 와 같은 더미 env:
`NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes pnpm --filter @duing/web build`

- [ ] **Step 4: Commit**

```bash
git add "frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_lib" frontend/apps/web/test/admin/club-activity-labels.test.ts
git commit -m "feat(frontend): 동아리 활동 이력 — 이벤트 라벨·초대 detail 요약 유틸"
```

---

### Task 12: 활동 이력 페이지 + 상세 링크

**Files:**
- Create: `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_components/AdminClubActivityLogList.tsx`
- Create: `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_pages/AdminClubActivityLogPage.tsx`
- Create: `frontend/apps/web/app/admin/clubs/[clubId]/activity-log/page.tsx`
- Modify: `frontend/apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx:130-135`

**Interfaces:**
- Consumes: `useAdminClubActivityEventsQuery`(Task 10), `activityEventLabel`·`activityDetailSummary`·`activityActorLabel`(Task 11), `FeeFilterChips`(`app/admin/fees/_components/FeeFilterChips.tsx`, 제네릭 칩), `ConsoleCard`·`EmptyState`·`ErrorState`(`app/admin/_components`), `ListRowsSkeleton`(`components/loading/Skeleton`), `Pagination`(`components/Pagination`)

- [ ] **Step 1: 리스트 컴포넌트**

`frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_components/AdminClubActivityLogList.tsx`:
```tsx
'use client';

import { useState } from 'react';

import { useAdminClubActivityEventsQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminClubActivityEventType } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '@/app/admin/_components/ConsoleCard';
import { EmptyState } from '@/app/admin/_components/EmptyState';
import { ErrorState } from '@/app/admin/_components/ErrorState';
import { FeeFilterChips } from '@/app/admin/fees/_components/FeeFilterChips';
import { activityActorLabel, activityDetailSummary, activityEventLabel } from '../_lib/activityLabels';

const PAGE_SIZE = 20;

type ActivityGroup = 'STATUS' | 'LINK';

/** 유형그룹 → 서버 types. 부원 초대와 모집 링크는 같은 이벤트라 행 라벨로 갈린다(칩으로는 가르지 않는다). */
const GROUP_TYPES: Record<ActivityGroup, AdminClubActivityEventType[]> = {
  STATUS: ['CLUB_STATUS_CHANGED', 'CLUB_CLOSED'],
  LINK: ['JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED'],
};

const GROUP_OPTIONS: { label: string; value?: ActivityGroup }[] = [
  { label: '전체', value: undefined },
  { label: '상태', value: 'STATUS' },
  { label: '가입 링크', value: 'LINK' },
];

/**
 * 동아리 활동 이력 목록. 표가 아니라 행 나열이다 — 사유·detail 요약 길이가 제각각이라 열에 가두면 잘린다(회비 감사 로그 선례).
 * 재발급은 같은 트랜잭션의 "폐기" 행과 함께 두 행으로 보인다(기록 구조 그대로).
 */
export function AdminClubActivityLogList({ clubId }: { clubId: number }) {
  const [group, setGroup] = useState<ActivityGroup | undefined>(undefined);
  const [page, setPage] = useState(0);

  const eventsQuery = useAdminClubActivityEventsQuery(clubId, {
    // 모듈 상수를 그대로 넘겨 배열 참조가 렌더마다 바뀌지 않게 한다(React Query 키 안정).
    types: group === undefined ? undefined : GROUP_TYPES[group],
    page,
    size: PAGE_SIZE,
  });

  const events = eventsQuery.data?.content ?? [];

  return (
    <div className="flex flex-col gap-3">
      <FeeFilterChips
        ariaLabel="이벤트 유형 필터"
        options={GROUP_OPTIONS}
        value={group}
        onChange={(next) => {
          setGroup(next);
          setPage(0);
        }}
      />

      {eventsQuery.isLoading && (
        <ListRowsSkeleton rows={6} rowClassName="h-14 rounded-md" label="활동 이력 조회 중" />
      )}

      {eventsQuery.isError && (
        <ConsoleCard>
          <ErrorState message="활동 이력을 불러오지 못했어요." onRetry={() => void eventsQuery.refetch()} />
        </ConsoleCard>
      )}

      {eventsQuery.isSuccess && (
        <div
          aria-busy={eventsQuery.isPlaceholderData}
          className={eventsQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
        >
          {events.length === 0 ? (
            <ConsoleCard>
              <EmptyState
                icon="🗒️"
                title="기록된 활동이 없습니다"
                body={'선택한 유형에 기록된 활동이 없어요.\n활동 이력은 계측 배포 이후의 변경부터 기록됩니다.'}
              />
            </ConsoleCard>
          ) : (
            <ConsoleCard>
              <ul aria-label="동아리 활동 이력">
                {events.map((event) => {
                  const note = [activityDetailSummary(event), event.reason ? `사유: ${event.reason}` : '']
                    .filter((part) => part !== '')
                    .join(' · ');
                  return (
                    <li key={event.eventId} className="border-t border-line px-4 py-3 first:border-t-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                        <time
                          dateTime={event.createdAt}
                          className="whitespace-nowrap tabular-nums text-charcoal-3"
                        >
                          {formatDateTimeKst(event.createdAt)}
                        </time>
                        <span className="pill-outline inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                          {activityEventLabel(event)}
                        </span>
                        <span className="text-charcoal">{activityActorLabel(event)}</span>
                      </div>
                      {note !== '' && (
                        <p className="mt-1 text-[12.5px] leading-snug text-charcoal-2">{note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Pagination
                page={page}
                totalPages={eventsQuery.data?.totalPages ?? 0}
                onChange={setPage}
                ariaLabel="활동 이력 페이지"
                totalElements={eventsQuery.data?.totalElements}
                pageSize={PAGE_SIZE}
                className="py-3"
              />
            </ConsoleCard>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 페이지 + 라우트**

`frontend/apps/web/app/admin/clubs/[clubId]/activity-log/_pages/AdminClubActivityLogPage.tsx`:
```tsx
'use client';

import Link from 'next/link';

import { AdminClubActivityLogList } from '../_components/AdminClubActivityLogList';

type Props = {
  clubId: number;
};

/** 총동연 동아리 활동 이력(상태 전이·폐쇄·가입 링크·부원 초대). 권한 변경 이력 페이지와 같은 골격이다. */
export function AdminClubActivityLogPage({ clubId }: Props) {
  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href={`/admin/clubs/${clubId}`} className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 동아리 상세
        </Link>
        <h1 className="text-[22px] font-bold text-ink">동아리 활동 이력</h1>
        <span className="text-[13px] text-charcoal-3">(동아리 ID: {clubId})</span>
      </header>

      <AdminClubActivityLogList clubId={clubId} />
    </main>
  );
}
```
`typedRoutes` 가 켜져 있어 `href` 가 템플릿 문자열을 거부하면 `member-history` 페이지의 `href="/admin/clubs"` 처럼 정적 경로로 두거나 상세 페이지가 쓰는 `toRoute` 헬퍼(`app/admin/_components/AdminNavContent.tsx`)와 같은 방식을 따른다.

`frontend/apps/web/app/admin/clubs/[clubId]/activity-log/page.tsx`:
```tsx
import { AdminClubActivityLogPage } from './_pages/AdminClubActivityLogPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <AdminClubActivityLogPage clubId={Number(clubId)} />;
}
```

- [ ] **Step 3: 상세 페이지 링크**

`AdminClubDetailPage.tsx` 의 기존 블록
```tsx
            <Link
              href={`/admin/clubs/${clubId}/member-history`}
              className="ml-auto text-[13px] text-indigo-600 hover:underline"
            >
              권한 변경 이력 →
            </Link>
```
을 다음으로 교체(두 링크를 오른쪽에 나란히):
```tsx
            <div className="ml-auto flex items-center gap-3">
              <Link
                href={`/admin/clubs/${clubId}/activity-log`}
                className="text-[13px] text-indigo-600 hover:underline"
              >
                활동 이력 →
              </Link>
              <Link
                href={`/admin/clubs/${clubId}/member-history`}
                className="text-[13px] text-indigo-600 hover:underline"
              >
                권한 변경 이력 →
              </Link>
            </div>
```

- [ ] **Step 4: 빌드(라우트 타입 생성) + GREEN 3종**

새 라우트 `activity-log` 의 `href` 타입은 빌드가 만든다(typedRoutes, CI 도 build → typecheck 순). 먼저 빌드:
`NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes pnpm --filter @duing/web build`
Run (frontend/): `pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint && pnpm --filter @duing/web test -- --run`
Expected: 전부 PASS

- [ ] **Step 5: 브라우저 확인(로컬 BE 필요)**

`pnpm dev`(:3000) + 로컬 백엔드에서 관리자 로그인 → `/admin/clubs/{id}` 의 "활동 이력 →" → 목록·칩 전환·빈 상태·페이지네이션이 그려지는지 확인. 로컬 BE 가 없으면 이 단계는 건너뛰고 PR 본문에 "로컬 BE 미가동으로 화면 QA 미수행" 을 명시한다. 끝나면 dev 서버를 내린다.

- [ ] **Step 6: Commit**

```bash
git add "frontend/apps/web/app/admin/clubs/[clubId]"
git commit -m "feat(frontend): 관리자 동아리 활동 이력 페이지 — 상태·가입 링크·부원 초대 로그, 상세 링크"
```

---

### Task 13: 프론트 PR 생성 (스택, 머지 금지)

- [ ] **Step 1: Self-check 7항목**(Task 8 과 동일 기준. FE 는 `pnpm typecheck && pnpm lint && pnpm test` 루트 실행으로 전 패키지 GREEN 확인)

- [ ] **Step 2: push + PR**

```bash
git push -u origin RublerubitZ/feat-invite-link-tracking-fe
gh pr create --base RublerubitZ/feat-invite-link-tracking --title "feat(frontend): 관리자 동아리 활동 이력 페이지 — 상태·가입 링크·부원 초대 로그" --body-file /private/tmp/claude-501/-Users-ksy-orca-workspaces-Duing-rorqual/e08d8cf7-c55e-4e9c-b0e9-97876f147966/scratchpad/pr-frontend.md
```
본문에 "BE PR 머지 후 base 를 develop 으로 전환" 을 적는다. base 브랜치를 삭제하면 이 PR 이 자동 닫히므로(메모리), BE 머지 시 브랜치 삭제 전에 base 를 바꾼다.

---

## Self-Review

**Spec coverage**
- §2.1 기록(타입 2종·V127·팩토리·updateStatus·close·정합 테스트) → Task 1·2·3 ✓
- §2.2 초대 detail(KST 환산·정수 maxUses·코드 제외·오버로드) → Task 4 ✓
- §2.3 API(경로·types 규칙·기간 없음·존재 검사 없음·개명 3곳·응답 형태·패키지 위치) → Task 7 ✓
- §2.4 화면(라우트·구조·칩 3개·행 라벨·detail 요약·상세 링크·API 클라이언트 단계) → Task 9~12 ✓
- §2.5 Slack 자동승인(record·조건 발행·포매터·리스너·주입) → Task 5 ✓
- §2.6 Slack 동아리명(리스너 조회·포매터 5종·테스트 갱신) → Task 6 ✓
- §5 테스트 항목 전부 대응 ✓ · §6 PR 2건 → Task 8·13 ✓

**Placeholder scan**: 코드 블록 전부 실제 내용. Task 6 Step 1 의 "(이하 cancelled·conflict 도 같은 방식으로…)" 는 두 호출에 둘째 인자 `"두잉개발회"` 를 추가하는 기계적 변경으로 코드 형태를 앞 두 호출이 보여준다.

**Type consistency**: `ClubAuditEvent.clubStatusChanged(Long, Long, String, String)`·`clubClosed(Long, Long, String)`·`joinLink(…, String detail)` 이 Task 2·3·4·7 에서 동일. `ClubInviteAutoApproveIssuedEvent(Long, String, Long, int, LocalDateTime, Long)` 이 Task 5 의 record·발행·테스트에서 동일. 포매터 5종 `(Event, String clubName)` 이 Task 6 의 구현·테스트·리스너에서 동일. FE `AdminClubActivityEvent` 필드가 BE 응답(Task 7)과 1:1. `adminQueryKeys.clubActivityEvents`·`client.admin.clubActivity.events`·`useAdminClubActivityEventsQuery` 이름이 Task 9~12 에서 동일.
