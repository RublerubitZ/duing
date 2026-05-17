# BE-4: 멤버 변경 4종 (role / remove / leave / transfer-leader) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER 가 자기 동아리의 멤버 역할 변경·강퇴·회장 인계를 할 수 있고, 모든 멤버가 자기 멤버십에서 탈퇴할 수 있는 4개 엔드포인트를 추가한다.

**Architecture:** BE-3 의 `ClubMemberApi`/`ClubMemberController` 에 핸들러 4개 추가. 신규 `ClubMemberCommandService` 인터페이스 + `GeneralClubMemberCommandService` 구현체. 권한 가드는 `ClubAuthService.requireLeader` / `requireMember` 재사용. 회장 인계는 단일 `@Transactional` 안에서 `findByIdForUpdate(PESSIMISTIC_WRITE)` 로 두 행을 잠그고 원자적으로 역할 교환. 도메인 예외는 `ClubMemberException` 의 inner class 로 5개 추가 (스펙 §5 매핑).

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA(Hibernate 6, `@Lock`) / PostgreSQL(TestContainers) / RestAssured

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.4–§3.7, §4 권한 매트릭스, §5 예외 매핑

---

## File Map

**Create**
- `backend/src/main/java/com/duing/domain/clubmember/controller/dto/request/UpdateMemberRoleRequest.java` — `{role: OFFICER|MEMBER}` + `toCommand(clubId, memberId, requesterId)`
- `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/TransferLeaderResponse.java` — `{formerLeader: ClubMemberResponse, newLeader: ClubMemberResponse}` + `of(...)`
- `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/UpdateMemberRoleCommand.java`
- `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/RemoveMemberCommand.java`
- `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/LeaveClubCommand.java`
- `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/TransferLeaderCommand.java`
- `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/TransferLeaderQuery.java` — `{formerLeader: ClubMemberQuery, newLeader: ClubMemberQuery}`
- `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberCommandService.java` — 인터페이스
- `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java` — 구현
- `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberCommandServiceTest.java` — 통합 (트랜잭션 행동·예외 케이스)
- `backend/src/test/java/com/duing/domain/clubmember/service/TransferLeaderConcurrencyTest.java` — 동시 인계 잠금 검증 (별도 클래스, `@SpringBootTest` 비-`@Transactional`)
- `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberMutationControllerTest.java` — RestAssured (4 엔드포인트 권한·검증·성공)

**Modify**
- `backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java` — 5개 inner class 추가
  - `CannotChangeOwnRole` (409, `CANNOT_CHANGE_OWN_ROLE`)
  - `CannotModifyLeader` (409, `CANNOT_MODIFY_LEADER`)
  - `CannotRemoveSelf` (409, `CANNOT_REMOVE_SELF`)
  - `LeaderCannotLeave` (409, `LEADER_CANNOT_LEAVE`)
  - `TransferTargetInvalid` (400, `TRANSFER_TARGET_INVALID`)
  - (`NotFound` — 본 PR에서 새로 추가. 기존 `NotAMember` 와 의미 분리: 멤버십 행 자체가 없을 때 404.)
- `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java` — `findByIdForUpdate(Long id)` 추가 (`@Lock(LockModeType.PESSIMISTIC_WRITE)` + `@Query("SELECT cm FROM ClubMember cm WHERE cm.id = :id")`)
- `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java` — 4 엔드포인트 시그니처 추가 (PATCH role / DELETE member / DELETE me / POST transfer-leader)
- `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java` — 4 핸들러 구현 + `ClubMemberCommandService` 의존성 추가
- `backend/src/main/java/com/duing/global/config/SecurityConfig.java` — BE-3 에서 추가한 `/clubs/*/members` GET 가드 옆에 PATCH/DELETE/POST `/clubs/*/members/**` 도 명시적으로 `authenticated()` 추가
  - 실제로는 `anyRequest().authenticated()` 가 받아주지만, 명시적 규칙으로 의도 드러내기 (+ 회귀 안전)

**없음**
- 신규 마이그레이션 (V7 그대로)
- 신규 권한 가드 (기존 `ClubAuthService` 재사용)

---

## Task 1: 브랜치 생성

- [ ] **Step 1: develop 동기화 + 분기**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/be-4-club-members-mutate
```

---

## Task 2: 도메인 예외 5종 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java`

- [ ] **Step 1: inner class 추가**

기존 클래스 안의 `NotAMember` 아래에 추가:

```java
    public static final class NotFound extends ClubMemberException {
        public NotFound() {
            super("동아리 멤버를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class CannotChangeOwnRole extends ClubMemberException {
        public CannotChangeOwnRole() {
            super("본인의 역할은 변경할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class CannotRemoveSelf extends ClubMemberException {
        public CannotRemoveSelf() {
            super("본인을 강퇴할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class CannotModifyLeader extends ClubMemberException {
        public CannotModifyLeader() {
            super("회장의 역할은 변경하거나 강퇴할 수 없습니다. 회장 인계를 이용하세요.",
                    HttpStatus.CONFLICT);
        }
    }

    public static final class LeaderCannotLeave extends ClubMemberException {
        public LeaderCannotLeave() {
            super("회장은 회장 인계 후에 탈퇴할 수 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class TransferTargetInvalid extends ClubMemberException {
        public TransferTargetInvalid() {
            super("회장 인계 대상은 같은 동아리의 OFFICER 또는 MEMBER 여야 합니다.",
                    HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java
git commit -m "feat(backend): 멤버 변경 도메인 예외 6종 추가"
```

---

## Task 3: Command/Request/Response/Query DTO 추가

**Files:**
- Create: 6개 DTO record (위 File Map 참조)

- [ ] **Step 1: Command 4종**

`UpdateMemberRoleCommand.java`:
```java
package com.duing.domain.clubmember.service.dto.command;

import com.duing.domain.clubmember.entity.ClubMemberRole;

public record UpdateMemberRoleCommand(
        Long clubId,
        Long memberId,
        Long requesterId,
        ClubMemberRole role
) {}
```

`RemoveMemberCommand.java`:
```java
package com.duing.domain.clubmember.service.dto.command;

public record RemoveMemberCommand(
        Long clubId,
        Long memberId,
        Long requesterId
) {}
```

`LeaveClubCommand.java`:
```java
package com.duing.domain.clubmember.service.dto.command;

public record LeaveClubCommand(
        Long clubId,
        Long requesterId
) {}
```

`TransferLeaderCommand.java`:
```java
package com.duing.domain.clubmember.service.dto.command;

public record TransferLeaderCommand(
        Long clubId,
        Long memberId,
        Long requesterId
) {}
```

- [ ] **Step 2: Query 추가**

`TransferLeaderQuery.java`:
```java
package com.duing.domain.clubmember.service.dto.query;

public record TransferLeaderQuery(
        ClubMemberQuery formerLeader,
        ClubMemberQuery newLeader
) {}
```

- [ ] **Step 3: Request/Response**

`UpdateMemberRoleRequest.java`:
```java
package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateMemberRoleRequest(
        @NotNull(message = "role 은 필수입니다.")
        ClubMemberRole role
) {
    public UpdateMemberRoleCommand toCommand(Long clubId, Long memberId, Long requesterId) {
        return new UpdateMemberRoleCommand(clubId, memberId, requesterId, role);
    }
}
```

`TransferLeaderResponse.java`:
```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;

public record TransferLeaderResponse(
        ClubMemberResponse formerLeader,
        ClubMemberResponse newLeader
) {
    public static TransferLeaderResponse from(TransferLeaderQuery query) {
        return new TransferLeaderResponse(
                ClubMemberResponse.from(query.formerLeader()),
                ClubMemberResponse.from(query.newLeader())
        );
    }
}
```

- [ ] **Step 4: 컴파일 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/service/dto/command/ \
        backend/src/main/java/com/duing/domain/clubmember/service/dto/query/TransferLeaderQuery.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/dto/request/UpdateMemberRoleRequest.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/TransferLeaderResponse.java
git commit -m "feat(backend): 멤버 변경 Command/Request/Response DTO 추가"
```

---

## Task 4: Repository — findByIdForUpdate 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`

- [ ] **Step 1: import + 메서드 추가**

```java
import jakarta.persistence.LockModeType;
...
import org.springframework.data.jpa.repository.Lock;
```

기존 메서드들 아래에 추가:

```java
    /**
     * 회장 인계 등 동시성이 중요한 변경에서 행 잠금 후 조회한다 (PESSIMISTIC_WRITE).
     * @SQLRestriction(deleted_at IS NULL) 가 JPQL 에 자동 적용된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cm FROM ClubMember cm WHERE cm.id = :id")
    Optional<ClubMember> findByIdForUpdate(@Param("id") Long id);
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java
git commit -m "feat(backend): ClubMemberRepository 행 잠금 조회(findByIdForUpdate) 추가"
```

---

## Task 5: Service 인터페이스 + 구현 + 통합 테스트

**Files:**
- Create: `ClubMemberCommandService.java` + `GeneralClubMemberCommandService.java` + `ClubMemberCommandServiceTest.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberCommandServiceTest.java`:

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubMemberCommandServiceTest {

    @Autowired ClubMemberCommandService clubMemberCommandService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 3.4 PATCH role ────────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 MEMBER 를 OFFICER 로 승급하면 역할이 변경된다")
    void promoteMemberToOfficer() throws Exception {
        User leader = saveUser("리더1");
        User memberUser = saveUser("일반1");
        Club club = saveActiveClub("두잉변경1");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), leader.getId(), ClubMemberRole.OFFICER));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("LEADER 가 OFFICER 를 MEMBER 로 강등할 수 있다")
    void demoteOfficerToMember() throws Exception {
        User leader = saveUser("리더2");
        User officerUser = saveUser("운영2");
        Club club = saveActiveClub("두잉변경2");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(
                ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));

        clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), leader.getId(), ClubMemberRole.MEMBER));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("같은 역할로 PATCH 하면 멱등하게 성공한다")
    void sameRoleIsIdempotent() throws Exception {
        User leader = saveUser("리더3");
        User memberUser = saveUser("일반3");
        Club club = saveActiveClub("두잉변경3");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), leader.getId(), ClubMemberRole.MEMBER));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("본인의 역할은 변경할 수 없다 (CannotChangeOwnRole)")
    void cannotChangeOwnRole() throws Exception {
        User leader = saveUser("리더4");
        Club club = saveActiveClub("두잉변경4");
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), leaderMembership.getId(), leader.getId(), ClubMemberRole.OFFICER)))
                .isInstanceOf(ClubMemberException.CannotChangeOwnRole.class);
    }

    @Test
    @DisplayName("대상이 LEADER 면 강등할 수 없다 (CannotModifyLeader)")
    void cannotModifyLeader() throws Exception {
        User leaderA = saveUser("리더5A");
        User leaderB = saveUser("리더5B");
        Club clubA = saveActiveClub("두잉변경5A");
        Club clubB = saveActiveClub("두잉변경5B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leaderA));
        ClubMember bsLeaderMembership = clubMemberRepository.save(ClubMember.asLeader(clubB, leaderB));
        // A 의 LEADER 인 leaderA 가 다른 clubB 의 LEADER 행을 변경 시도 — 권한도 없지만
        // 본 테스트는 권한 통과 후의 LEADER 보호 로직 검증을 위해 leaderB 가 자기 clubB 의
        // 다른 행을 변경하는 시나리오로 다시 구성한다. (수정)
        // → 더 명확한 케이스: clubA 의 LEADER 가 자기 동아리에서 또 다른 LEADER 행을 만들 일은
        // 없지만, 본 테스트는 "LEADER 인 행은 일반 PATCH 로 변경 불가" 만 확인하면 되므로
        // 비정상 상태(LEADER 2명)를 생성해 검증한다.
        ClubMember secondLeader = clubMemberRepository.save(
                ClubMember.of(clubA, saveUser("리더5C"), ClubMemberRole.LEADER));

        assertThatThrownBy(() -> clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                clubA.getId(), secondLeader.getId(), leaderA.getId(), ClubMemberRole.OFFICER)))
                .isInstanceOf(ClubMemberException.CannotModifyLeader.class);
    }

    @Test
    @DisplayName("OFFICER 가 PATCH 를 시도하면 AccessDenied 가 발생한다")
    void officerCannotChangeRole() throws Exception {
        User leader = saveUser("리더6");
        User officer = saveUser("운영6");
        User memberUser = saveUser("일반6");
        Club club = saveActiveClub("두잉변경6");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), officer.getId(), ClubMemberRole.OFFICER)))
                .isInstanceOf(AccessDeniedException.class);
    }

    // ── 3.5 DELETE member ─────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 MEMBER 를 강퇴하면 soft-delete 된다")
    void removeMember() throws Exception {
        User leader = saveUser("리더7");
        User memberUser = saveUser("일반7");
        Club club = saveActiveClub("두잉변경7");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), membership.getId(), leader.getId()));

        assertThat(clubMemberRepository.findById(membership.getId())).isEmpty();
    }

    @Test
    @DisplayName("LEADER 본인을 강퇴할 수 없다 (CannotRemoveSelf)")
    void cannotRemoveSelf() throws Exception {
        User leader = saveUser("리더8");
        Club club = saveActiveClub("두잉변경8");
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), leaderMembership.getId(), leader.getId())))
                .isInstanceOf(ClubMemberException.CannotRemoveSelf.class);
    }

    @Test
    @DisplayName("LEADER 를 강퇴할 수 없다 (CannotModifyLeader)")
    void cannotRemoveLeader() throws Exception {
        User leaderA = saveUser("리더9");
        Club club = saveActiveClub("두잉변경9");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderA));
        ClubMember secondLeader = clubMemberRepository.save(
                ClubMember.of(club, saveUser("리더9B"), ClubMemberRole.LEADER));

        assertThatThrownBy(() -> clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), secondLeader.getId(), leaderA.getId())))
                .isInstanceOf(ClubMemberException.CannotModifyLeader.class);
    }

    @Test
    @DisplayName("강퇴된 사용자는 같은 동아리에 다시 가입할 수 있다")
    void canRejoinAfterRemove() throws Exception {
        User leader = saveUser("리더10");
        User memberUser = saveUser("일반10");
        Club club = saveActiveClub("두잉변경10");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember first = clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), first.getId(), leader.getId()));

        ClubMember second = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThat(second.getId()).isNotEqualTo(first.getId());
    }

    // ── 3.6 DELETE me ─────────────────────────────────────────────────────

    @Test
    @DisplayName("MEMBER 가 본인 탈퇴하면 멤버십이 soft-delete 된다")
    void memberLeaves() throws Exception {
        User memberUser = saveUser("일반11");
        Club club = saveActiveClub("두잉변경11");
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.leave(new LeaveClubCommand(club.getId(), memberUser.getId()));

        assertThat(clubMemberRepository.findById(membership.getId())).isEmpty();
    }

    @Test
    @DisplayName("LEADER 본인 탈퇴는 LeaderCannotLeave 로 거부된다")
    void leaderCannotLeave() throws Exception {
        User leader = saveUser("리더12");
        Club club = saveActiveClub("두잉변경12");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberCommandService.leave(
                new LeaveClubCommand(club.getId(), leader.getId())))
                .isInstanceOf(ClubMemberException.LeaderCannotLeave.class);
    }

    @Test
    @DisplayName("비멤버가 leave 호출하면 NotFound 가 발생한다")
    void nonMemberLeaveReturnsNotFound() throws Exception {
        User stranger = saveUser("외부12");
        Club club = saveActiveClub("두잉변경12b");

        assertThatThrownBy(() -> clubMemberCommandService.leave(
                new LeaveClubCommand(club.getId(), stranger.getId())))
                .isInstanceOf(ClubMemberException.NotFound.class);
    }

    // ── 3.7 POST transfer-leader ──────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 OFFICER 에게 인계하면 두 행의 역할이 한 트랜잭션에서 교환된다")
    void transferLeaderToOfficer() throws Exception {
        User leader = saveUser("리더13");
        User officer = saveUser("운영13");
        Club club = saveActiveClub("두잉변경13");
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember officerMembership = clubMemberRepository.save(
                ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        TransferLeaderQuery result = clubMemberCommandService.transferLeader(
                new TransferLeaderCommand(club.getId(), officerMembership.getId(), leader.getId()));

        assertThat(clubMemberRepository.findById(leaderMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.OFFICER);
        assertThat(clubMemberRepository.findById(officerMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.LEADER);
        assertThat(result.formerLeader().role()).isEqualTo(ClubMemberRole.OFFICER);
        assertThat(result.newLeader().role()).isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("LEADER 가 MEMBER 에게도 인계할 수 있다")
    void transferLeaderToMember() throws Exception {
        User leader = saveUser("리더14");
        User memberUser = saveUser("일반14");
        Club club = saveActiveClub("두잉변경14");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.transferLeader(new TransferLeaderCommand(
                club.getId(), membership.getId(), leader.getId()));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("다른 동아리의 멤버를 대상으로 인계하면 TransferTargetInvalid")
    void transferToForeignClubMember() throws Exception {
        User leader = saveUser("리더15");
        Club clubA = saveActiveClub("두잉변경15A");
        Club clubB = saveActiveClub("두잉변경15B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        ClubMember inB = clubMemberRepository.save(
                ClubMember.of(clubB, saveUser("외부15"), ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> clubMemberCommandService.transferLeader(
                new TransferLeaderCommand(clubA.getId(), inB.getId(), leader.getId())))
                .isInstanceOf(ClubMemberException.TransferTargetInvalid.class);
    }

    // ── fixtures ──────────────────────────────────────────────────────────

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
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

- [ ] **Step 2: 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.ClubMemberCommandServiceTest"
```

Expected: 컴파일 실패 (`ClubMemberCommandService` 미정의).

- [ ] **Step 3: 인터페이스**

`backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberCommandService.java`:

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;

public interface ClubMemberCommandService {

    void updateRole(UpdateMemberRoleCommand command);

    void removeMember(RemoveMemberCommand command);

    void leave(LeaveClubCommand command);

    TransferLeaderQuery transferLeader(TransferLeaderCommand command);
}
```

- [ ] **Step 4: 구현**

`backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java`:

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMemberCommandService implements ClubMemberCommandService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public void updateRole(UpdateMemberRoleCommand command) {
        clubAuthService.requireLeader(command.requesterId(), command.clubId());

        if (command.role() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.TransferTargetInvalid();
        }

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());

        if (target.getUser().getId().equals(command.requesterId())) {
            throw new ClubMemberException.CannotChangeOwnRole();
        }
        if (target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.CannotModifyLeader();
        }

        target.changeRole(command.role());
    }

    @Override
    @Transactional
    public void removeMember(RemoveMemberCommand command) {
        clubAuthService.requireLeader(command.requesterId(), command.clubId());

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());

        if (target.getUser().getId().equals(command.requesterId())) {
            throw new ClubMemberException.CannotRemoveSelf();
        }
        if (target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.CannotModifyLeader();
        }

        clubMemberRepository.delete(target);
    }

    @Override
    @Transactional
    public void leave(LeaveClubCommand command) {
        ClubMember membership = clubMemberRepository
                .findByClubIdAndUserId(command.clubId(), command.requesterId())
                .orElseThrow(ClubMemberException.NotFound::new);

        if (membership.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.LeaderCannotLeave();
        }

        clubMemberRepository.delete(membership);
    }

    @Override
    @Transactional
    public TransferLeaderQuery transferLeader(TransferLeaderCommand command) {
        ClubMember requesterMembership = clubAuthService.requireLeader(
                command.requesterId(), command.clubId());

        // 동시 인계 경합을 막기 위해 두 행 모두 PESSIMISTIC_WRITE 로 잠근다.
        ClubMember currentLeader = clubMemberRepository.findByIdForUpdate(requesterMembership.getId())
                .orElseThrow(ClubMemberException.NotFound::new);
        ClubMember target = clubMemberRepository.findByIdForUpdate(command.memberId())
                .orElseThrow(ClubMemberException.NotFound::new);

        if (!target.getClub().getId().equals(command.clubId())
                || target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.TransferTargetInvalid();
        }

        currentLeader.changeRole(ClubMemberRole.OFFICER);
        target.changeRole(ClubMemberRole.LEADER);

        return new TransferLeaderQuery(
                ClubMemberQuery.from(currentLeader),
                ClubMemberQuery.from(target)
        );
    }

    private ClubMember findMembershipInClub(Long memberId, Long clubId) {
        ClubMember membership = clubMemberRepository.findById(memberId)
                .orElseThrow(ClubMemberException.NotFound::new);
        if (!membership.getClub().getId().equals(clubId)) {
            throw new ClubMemberException.NotFound();
        }
        return membership;
    }
}
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.ClubMemberCommandServiceTest"
git add backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberCommandService.java \
        backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java \
        backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberCommandServiceTest.java
git commit -m "feat(backend): 멤버 변경 Service (role/remove/leave/transfer-leader) 추가"
```

---

## Task 6: 회장 인계 동시성 테스트 (별도 클래스)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubmember/service/TransferLeaderConcurrencyTest.java`

`@Transactional` 자동 롤백 환경에서는 PESSIMISTIC_WRITE 동시성을 재현할 수 없으므로 본 테스트는 비-Transactional 로 `CountDownLatch` + `ExecutorService` 를 써서 두 스레드가 같은 LEADER 권한으로 서로 다른 대상에 인계하는 경합을 만든다.

- [ ] **Step 1: 작성**

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TransferLeaderConcurrencyTest {

    @Autowired ClubMemberCommandService clubMemberCommandService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
        // 본 테스트는 비-@Transactional 이라 직접 정리.
        clubMemberRepository.deleteAllInBatch();
        clubRepository.deleteAllInBatch();
        userRepository.deleteAllInBatch();
    }

    @Test
    @DisplayName("동일 LEADER 가 두 스레드에서 서로 다른 대상에 동시 인계해도 LEADER 는 정확히 1명만 남는다")
    void concurrentTransfersResultInSingleLeader() throws Exception {
        User leader = saveUser("리더CC");
        User candidateA = saveUser("후보A");
        User candidateB = saveUser("후보B");
        Club club = saveActiveClub("두잉동시인계");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember a = clubMemberRepository.save(ClubMember.of(club, candidateA, ClubMemberRole.OFFICER));
        ClubMember b = clubMemberRepository.save(ClubMember.of(club, candidateB, ClubMemberRole.OFFICER));

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger success = new AtomicInteger();
        AtomicInteger failure = new AtomicInteger();
        executor = Executors.newFixedThreadPool(2);

        Runnable task1 = () -> awaitAndTransfer(start, done, success, failure,
                new TransferLeaderCommand(club.getId(), a.getId(), leader.getId()));
        Runnable task2 = () -> awaitAndTransfer(start, done, success, failure,
                new TransferLeaderCommand(club.getId(), b.getId(), leader.getId()));

        executor.submit(task1);
        executor.submit(task2);
        start.countDown();
        assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();

        long leaderCount = clubMemberRepository.findAll().stream()
                .filter(membership -> membership.getClub().getId().equals(club.getId()))
                .filter(membership -> membership.getRole() == ClubMemberRole.LEADER)
                .count();
        assertThat(leaderCount).isEqualTo(1L);
        // 둘 다 성공하거나(첫 인계 후 두번째도 새 LEADER 권한 없는 호출자라 거부) 하나만 성공.
        // 본 테스트의 핵심 불변식은 "LEADER 가 정확히 1명". 성공/실패 분포는 환경에 따라 다를 수 있으므로 단언하지 않는다.
        assertThat(success.get() + failure.get()).isEqualTo(2);
    }

    private void awaitAndTransfer(CountDownLatch start, CountDownLatch done,
                                  AtomicInteger success, AtomicInteger failure,
                                  TransferLeaderCommand command) {
        try {
            start.await();
            clubMemberCommandService.transferLeader(command);
            success.incrementAndGet();
        } catch (Exception e) {
            failure.incrementAndGet();
        } finally {
            done.countDown();
        }
    }

    private User saveUser(String name) {
        long unique = System.nanoTime();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + System.nanoTime();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 실행 + 커밋**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.TransferLeaderConcurrencyTest"
git add backend/src/test/java/com/duing/domain/clubmember/service/TransferLeaderConcurrencyTest.java
git commit -m "test(backend): 회장 인계 동시성(PESSIMISTIC_WRITE) 검증 테스트 추가"
```

---

## Task 7: API/Controller 핸들러 4개 + SecurityConfig

**Files:**
- Modify: `ClubMemberApi.java`, `ClubMemberController.java`, `SecurityConfig.java`

- [ ] **Step 1: ClubMemberApi 확장**

기존 GET 시그니처 아래에 추가 (imports 도 함께):

```java
import com.duing.domain.clubmember.controller.dto.request.UpdateMemberRoleRequest;
import com.duing.domain.clubmember.controller.dto.response.TransferLeaderResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
```

```java
    @Operation(summary = "멤버 역할 변경 (LEADER)",
            description = "OFFICER ↔ MEMBER 만 가능. LEADER 변경은 회장 인계 사용.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/members/{memberId}/role")
    ResponseEntity<Void> updateMemberRole(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateMemberRoleRequest updateMemberRoleRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "멤버 강퇴 (LEADER)")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/members/{memberId}")
    ResponseEntity<Void> removeMember(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "본인 탈퇴 (모든 멤버, LEADER 거부)")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/members/me")
    ResponseEntity<Void> leaveClub(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회장 인계 (LEADER)",
            description = "단일 트랜잭션 + PESSIMISTIC_WRITE 로 두 멤버의 역할을 교환한다.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/members/{memberId}/transfer-leader")
    ResponseEntity<ApiResponse<TransferLeaderResponse>> transferLeader(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

(주의: `/clubs/{clubId}/members/me` 의 `me` 가 PathVariable `memberId` 와 매칭되지 않도록 Spring 라우팅이 `me` 를 먼저 처리하게 메서드 선언 순서가 중요하다. Spring 의 RequestMappingHandlerMapping 은 보다 구체적인 패턴을 우선하므로 `members/me` 가 `members/{memberId}` 보다 우선 매치된다 — 별도 조치 불필요.)

- [ ] **Step 2: ClubMemberController 확장**

`ClubMemberCommandService` 주입 + 4개 핸들러:

```java
private final ClubMemberCommandService clubMemberCommandService;
```

```java
    @Override
    public ResponseEntity<Void> updateMemberRole(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @Valid @RequestBody UpdateMemberRoleRequest updateMemberRoleRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.updateRole(
                updateMemberRoleRequest.toCommand(clubId, memberId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> removeMember(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.removeMember(
                new RemoveMemberCommand(clubId, memberId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> leaveClub(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubMemberCommandService.leave(new LeaveClubCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<TransferLeaderResponse>> transferLeader(
            @PathVariable Long clubId,
            @PathVariable Long memberId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        TransferLeaderResponse response = TransferLeaderResponse.from(
                clubMemberCommandService.transferLeader(
                        new TransferLeaderCommand(clubId, memberId, currentUser.id())));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
```

imports 보강: `Valid`, `RequestBody`, `RemoveMemberCommand`, `LeaveClubCommand`, `TransferLeaderCommand`, `UpdateMemberRoleRequest`, `TransferLeaderResponse` 등.

- [ ] **Step 3: SecurityConfig 가드 추가**

기존 `/clubs/*/members` GET authenticated 라인 아래에 추가:

```java
                        // 멤버 변경 엔드포인트는 모두 인증 필요. (PATCH role / DELETE member / DELETE me / POST transfer-leader)
                        .requestMatchers("/api/v1/clubs/*/members/**").authenticated()
```

이 라인은 `/clubs/**` permitAll 보다 위에 배치한다 (first-match). 이미 `anyRequest().authenticated()` 가 매치하지만 명시적으로 두어 회귀 안전성을 높인다.

- [ ] **Step 4: 컴파일 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java \
        backend/src/main/java/com/duing/global/config/SecurityConfig.java
git commit -m "feat(backend): 멤버 변경 4종 API/Controller + SecurityConfig 가드 추가"
```

---

## Task 8: Controller 통합 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberMutationControllerTest.java`

- [ ] **Step 1: 작성**

```java
package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ClubMemberMutationControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private Club club;
    private ClubMember memberMembership;
    private ClubMember officerMembership;
    private String leaderToken;
    private String officerToken;
    private String memberToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("리더C");
        officerUser = saveUser("운영C");
        memberUser = saveUser("일반C");
        club = saveActiveClub("두잉멤버변경");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        officerMembership = clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        memberMembership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    // ── 3.4 PATCH role ───────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 MEMBER 를 OFFICER 로 승급하면 204 를 반환한다")
    void patchRoleAsLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("OFFICER 가 PATCH 를 시도하면 403 을 반환한다")
    void patchRoleAsOfficerForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("role 에 LEADER 를 보내면 400 을 반환한다")
    void patchRoleLeaderRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "LEADER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 3.5 DELETE member ────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 멤버를 강퇴하면 204 를 반환하고 멤버십이 사라진다")
    void removeMemberAsLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/{memberId}",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId())).isEmpty();
    }

    @Test
    @DisplayName("MEMBER 가 다른 멤버 강퇴를 시도하면 403 을 반환한다")
    void removeMemberAsMemberForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/{memberId}",
                            club.getId(), officerMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ── 3.6 DELETE me ────────────────────────────────────────────────────

    @Test
    @DisplayName("MEMBER 가 본인 탈퇴를 호출하면 204 를 반환한다")
    void leaveAsMember() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/me", club.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.findById(memberMembership.getId())).isEmpty();
    }

    @Test
    @DisplayName("LEADER 가 본인 탈퇴를 호출하면 409 를 반환한다")
    void leaveAsLeaderConflict() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/members/me", club.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value());
    }

    // ── 3.7 POST transfer-leader ────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 OFFICER 에게 회장을 인계하면 200 과 두 행의 새 역할을 반환한다")
    void transferLeader() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .post("/api/v1/clubs/{clubId}/members/{memberId}/transfer-leader",
                            club.getId(), officerMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.formerLeader.role", equalTo("OFFICER"))
                    .body("data.newLeader.role", equalTo("LEADER"));

        assertThat(clubMemberRepository.findById(officerMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("OFFICER 가 회장 인계를 시도하면 403 을 반환한다")
    void transferLeaderAsOfficerForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .post("/api/v1/clubs/{clubId}/members/{memberId}/transfer-leader",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 변경 호출하면 4xx 인증 오류를 반환한다")
    void anonymousRejected() {
        int status = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("role", "OFFICER"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/members/{memberId}/role",
                            club.getId(), memberMembership.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    // ── fixtures ────────────────────────────────────────────────────────

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
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

- [ ] **Step 2: 실행 + 커밋**

```bash
./gradlew test --tests "com.duing.domain.clubmember.controller.ClubMemberMutationControllerTest"
git add backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberMutationControllerTest.java
git commit -m "test(backend): 멤버 변경 4종 컨트롤러 통합 테스트 추가"
```

---

## Task 9: 전체 회귀 + 푸시 + PR

- [ ] **Step 1: 전체 테스트**

```bash
./gradlew test
```

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/be-4-club-members-mutate
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(backend): 동아리 멤버 변경 4종 API (role/remove/leave/transfer-leader)" --body "$(cat <<'EOF'
## 🚀 작업 내용
운영진의 멤버 관리에 필요한 4개 엔드포인트를 묶어 추가했다.
- PATCH `/api/v1/clubs/{clubId}/members/{memberId}/role` — OFFICER ↔ MEMBER 승강. LEADER 본인·LEADER 대상 변경은 거부, 같은 역할 멱등.
- DELETE `/api/v1/clubs/{clubId}/members/{memberId}` — 강퇴. 본인·LEADER 대상 거부. soft delete.
- DELETE `/api/v1/clubs/{clubId}/members/me` — 본인 탈퇴. LEADER 는 회장 인계 후에만 가능.
- POST `/api/v1/clubs/{clubId}/members/{memberId}/transfer-leader` — 단일 트랜잭션 + PESSIMISTIC_WRITE 로 두 멤버 역할 원자 교환.

스펙: `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.4–§3.7.

## 🤔 고민했던 내용
회장 인계의 동시성은 두 행 모두 `findByIdForUpdate` 로 잠그는 방식이 가장 단순하고 강력하다. JPQL 의 `@Lock(PESSIMISTIC_WRITE)` 는 `@SQLRestriction` 도 자동 적용되어 soft-delete 행은 자연 제외된다.

본인/대상 LEADER 보호 로직은 서비스 레이어에서 일관되게 도메인 예외(`CannotChangeOwnRole`, `CannotRemoveSelf`, `CannotModifyLeader`, `LeaderCannotLeave`) 로 표현해 컨트롤러 분기 없이 `GlobalExceptionHandler` 가 일괄 처리한다.

`PATCH role` 의 멱등성은 "대상이 이미 같은 역할일 때 200(204)" 으로 두어, 프론트가 토글식 UI 에서 중복 요청을 무해하게 만들 수 있다.

## 💬 리뷰 중점사항
- `findByIdForUpdate` 의 PESSIMISTIC_WRITE 와 단일 트랜잭션 경계의 정확성
- `LEADER` 보호 로직 (본인/대상 양쪽) 의 빠짐 없는 케이스 커버
- `members/me` 가 `members/{memberId}` 보다 Spring 라우팅에서 우선 매치되는지 (구체 경로 우선 규칙)
- 동시성 테스트가 LEADER 1명 불변식만 단언하고 성공/실패 분포는 단언하지 않는 의도
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] 스펙 §3.4–§3.7 의 모든 케이스가 서비스/컨트롤러 테스트로 커버.
- [ ] 권한 매트릭스 §4: LEADER 만 가능한 작업(PATCH/DELETE/transfer-leader) 에서 OFFICER 403 확인.
- [ ] 회장 인계 동시성: 별도 비-Transactional 테스트로 두 스레드 경합 → LEADER 1명 보장.
- [ ] 신규 마이그레이션 없음.
- [ ] 커밋 메시지 `feat(backend)/test(backend)` 형식.
- [ ] SecurityConfig 가드: `/clubs/*/members/**` authenticated 가 wildcard permitAll 보다 위에 위치.
- [ ] 6개 신규 예외 모두 `ClubMemberException` inner class, 한국어 메시지, HTTP 매핑 정확.

---

## Out of Scope

- 회장 인계 비밀번호 재확인 (Phase 5).
- 강퇴 이력 기반 재가입 차단 (Phase 5).
- 강퇴/탈퇴 시 진행 중 Application 자동 처리 (그대로 둠 — 스펙 §10).
- 프론트엔드 (FE-3).