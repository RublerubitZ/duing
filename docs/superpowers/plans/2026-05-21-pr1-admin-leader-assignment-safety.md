# PR 1 — 회장 강제 지정 동시성·예외 정합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 회장 강제 지정 API 의 동시성 결함(LEADER 2명 생성 가능)을 DB 부분 UNIQUE 인덱스 + 애플리케이션 LEADER 슬롯 락 + 무결성 위반 예외 변환의 3중 방어로 차단하고, 클럽 부재 시 도메인 의미에 맞는 `ClubException.ClubNotFoundException` 으로 정상화한다.

**Architecture:** PostgreSQL 부분 UNIQUE 인덱스(`WHERE role='LEADER' AND deleted_at IS NULL`)가 DB 레벨 마지막 방어선. Service 는 후보 행 + LEADER 슬롯 두 행에 PESSIMISTIC_WRITE 락을 걸고, 커밋 시 발생하는 `DataIntegrityViolationException` 은 catch 하여 기존 `AdminAssignLeaderAlreadyExists` 도메인 예외로 변환한다. 클럽 존재 검증은 Controller 에서 Service 로 이동.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA(Hibernate) + QueryDSL / Flyway / PostgreSQL / TestContainers + JUnit 5

**Related spec:** `docs/superpowers/specs/2026-05-21-admin-backend-fixes-design.md` §4 PR 1

---

## Pre-Requirements

- 작업 디렉터리: `/Users/ksy/Desktop/BASIC/Coding/Duing/backend`
- 베이스 브랜치: `develop` (현재 HEAD `07fdce6` 기준)
- 로컬 도커 데몬 실행 중 (TestContainers 필요)

---

## Scope Note (PR 분할 결정)

Spec 원안에는 `AdminLeaderSuccessionController.listMemberHistory` 의 클럽 존재 검증 이동도 PR1 에 포함되어 있었으나, 해당 메서드는 `historyRepository` 를 Controller 가 직접 호출하는 구조라 검증만 옮기려면 도중에 어색한 helper 가 필요하다. 동일 메서드 전체를 Service 로 위임하는 작업이 **PR 3-2** (`refactor/admin-leader-succession-layering`) 에서 이미 예정되어 있으므로, **PR1 에서는 `assignLeader` 만 처리**하고 `listMemberHistory` 의 검증 이동은 PR3-2 에서 함께 처리한다. Spec §4 PR1 항목을 이 결정에 맞춰 본 plan 의 Task 5 가 다룬다.

---

## File Structure

**Create:**
- `backend/src/main/resources/db/migration/V31__alter_club_member_unique_leader.sql` — 부분 UNIQUE 인덱스 추가
- `backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceConcurrencyTest.java` — 동시성 회귀 테스트 (non-transactional)

**Modify:**
- `backend/src/main/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentService.java` — LEADER 슬롯 락 + DataIntegrityViolation catch + 클럽 존재 검증
- `backend/src/main/java/com/duing/domain/clubmember/controller/AdminLeaderSuccessionController.java:86-96` — `assignLeader` 의 직접 클럽 존재 검증 제거
- `backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceTest.java` — 클럽 부재 케이스 추가

**Touch (verify only — do not modify):**
- `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java:48-52` — 기존 `findByClubIdAndRoleForUpdate` 그대로 재사용

---

### Task 1: 브랜치 생성 + 사전 무결성 검사

**Files:** (없음, 환경 셋업만)

- [ ] **Step 1: develop 최신화 후 작업 브랜치 분기**

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b fix/admin-leader-assignment-safety
```

- [ ] **Step 2: 운영 데이터에 중복 LEADER 가 없는지 사전 확인 (로컬 DB)**

Run:
```bash
docker compose -f backend/docker-compose.local.yml exec -T db \
  psql -U duing -d duing -c \
  "SELECT club_id, COUNT(*) AS leader_count
     FROM club_member
    WHERE role = 'LEADER' AND deleted_at IS NULL
    GROUP BY club_id HAVING COUNT(*) > 1;"
```

Expected: `(0 rows)`. 만약 1행 이상 나오면 마이그레이션 추가 전 데이터 보정이 필요 — 이 plan 을 중단하고 사용자에게 보고한다.

> Note: docker-compose 파일/유저명은 실제 환경에 맞춰 조정. compose 가 없다면 `./gradlew flywayMigrate` 가 도는 로컬 PG 에 직접 `psql` 로 접속한다.

---

### Task 2: Flyway V31 — 부분 UNIQUE 인덱스 추가

**Files:**
- Create: `backend/src/main/resources/db/migration/V31__alter_club_member_unique_leader.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

Create `backend/src/main/resources/db/migration/V31__alter_club_member_unique_leader.sql`:
```sql
-- 동아리당 LEADER 는 최대 1명 (soft-delete 호환). 어드민 강제 지정 동시성 결함의 DB 레벨 방어선.
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_member_leader_active
    ON club_member (club_id)
    WHERE role = 'LEADER' AND deleted_at IS NULL;
```

- [ ] **Step 2: 테스트로 마이그레이션 통과 검증**

Run: `./gradlew test --tests '*Migration*' --info` (마이그레이션 전용 테스트가 없으면 다음 단계로 — TestContainers 가 모든 마이그레이션을 실행하므로 어차피 다음 step 에서 검증된다)

만약 위 명령이 매칭 테스트 없음으로 빠르게 종료하면:
Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V31__alter_club_member_unique_leader.sql
git commit -m "feat(backend): add unique partial index on club_member leader role"
```

---

### Task 3: 실패하는 단위 테스트 추가 — "클럽이 없으면 ClubNotFoundException"

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceTest.java`

- [ ] **Step 1: 신규 테스트 메서드 추가**

기존 파일의 마지막 테스트(`rejectsWhenCandidateNotMember`) 다음에 아래를 삽입:

```java
    @Test
    @DisplayName("존재하지 않는 동아리에 강제 지정하면 ClubNotFoundException 이 발생한다")
    void rejectsWhenClubMissing() {
        User admin = saveUser(UserRole.ADMIN);
        User candidate = saveUser(UserRole.STUDENT);
        long missingClubId = 9_999_999L;

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.assign(
                new AssignLeaderByAdminCommand(
                        missingClubId, candidate.getId(), admin.getId(), "테스트")))
                .isInstanceOf(com.duing.domain.club.exception.ClubException.ClubNotFoundException.class);
    }
```

파일 상단 import 에 다음 두 줄을 추가 (이미 있으면 생략):
```java
import com.duing.domain.club.exception.ClubException;
```

(`assertThatThrownBy` 는 기존에 static import 되어 있으므로 그것을 사용해도 됨 — 위 코드는 fully qualified 로 작성했지만, 기존 패턴과 일관성을 위해 static import 형태로 고쳐도 동일하게 동작.)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `./gradlew test --tests 'GeneralAdminLeaderAssignmentServiceTest.rejectsWhenClubMissing'`

Expected: FAIL — `AdminAssignTargetNotMember` 가 던져짐 (현재 Service 는 클럽 존재를 검사하지 않고 바로 멤버 조회 → 후보 없음으로 404).

---

### Task 4: Service 구현 — 클럽 존재 검증 + LEADER 슬롯 락 + DataIntegrityViolation catch

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentService.java`

- [ ] **Step 1: Service 본문 교체**

전체 내용을 다음으로 교체:

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminLeaderAssignmentService implements AdminLeaderAssignmentService {

    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRecorder historyRecorder;

    @Override
    @Transactional
    public void assign(AssignLeaderByAdminCommand command) {
        if (!clubRepository.existsById(command.clubId())) {
            throw new ClubException.ClubNotFoundException();
        }

        ClubMember candidate = clubMemberRepository
                .findByClubIdAndUserIdForUpdate(command.clubId(), command.newLeaderUserId())
                .orElseThrow(ClubMemberException.AdminAssignTargetNotMember::new);

        clubMemberRepository
                .findByClubIdAndRoleForUpdate(command.clubId(), ClubMemberRole.LEADER)
                .ifPresent(existing -> {
                    throw new ClubMemberException.AdminAssignLeaderAlreadyExists();
                });

        ClubMemberRole previousRole = candidate.getRole();
        try {
            candidate.changeRole(ClubMemberRole.LEADER);
            clubMemberRepository.flush();
        } catch (DataIntegrityViolationException race) {
            throw new ClubMemberException.AdminAssignLeaderAlreadyExists();
        }

        historyRecorder.record(
                command.clubId(), candidate.getUser().getId(), command.actorAdminId(),
                ClubMemberEventType.ADMIN_LEADER_ASSIGNED,
                previousRole, ClubMemberRole.LEADER, command.reason());
    }
}
```

변경 포인트:
1. `ClubRepository` 의존성 추가 → 클럽 존재 검증
2. `existsByClubIdAndRole(...)` → `findByClubIdAndRoleForUpdate(...)` 로 교체. 행이 있으면 LEADER 슬롯 행에 PESSIMISTIC_WRITE 락 + 즉시 도메인 예외. 행이 없을 땐 락이 없으므로 다음 단계의 DB UNIQUE 가 방어
3. `clubMemberRepository.flush()` 명시 → 락 해제 전에 INSERT/UPDATE 가 DB 까지 도달, UNIQUE 위반이 트랜잭션 안에서 잡힘
4. `DataIntegrityViolationException` catch → `AdminAssignLeaderAlreadyExists`

- [ ] **Step 2: Task 3 의 테스트가 통과하는지 확인**

Run: `./gradlew test --tests 'GeneralAdminLeaderAssignmentServiceTest.rejectsWhenClubMissing'`

Expected: PASS

- [ ] **Step 3: 기존 테스트가 회귀 없이 통과하는지 확인**

Run: `./gradlew test --tests 'GeneralAdminLeaderAssignmentServiceTest'`

Expected: 4건 모두 PASS (assignSucceeds / rejectsWhenLeaderExists / rejectsWhenCandidateNotMember / rejectsWhenClubMissing)

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentService.java \
        backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceTest.java
git commit -m "fix(backend): lock leader slot and validate club existence in admin leader assignment"
```

---

### Task 5: Controller — assignLeader 의 직접 클럽 검증 제거

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/controller/AdminLeaderSuccessionController.java`

- [ ] **Step 1: assignLeader 메서드의 중복 검증 제거**

`AdminLeaderSuccessionController.java:86-96` 의 `assignLeader` 메서드를 아래로 교체:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> assignLeader(
            Long clubId, AssignAdminLeaderRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        leaderAssignmentService.assign(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
```

(이전의 `clubRepository.findById(clubId).isEmpty() → throw ClubMemberException.NotFound` 두 줄이 삭제된다.)

> 주의: `listMemberHistory` 의 동일한 검증은 PR3-2 에서 다룬다. 본 PR 에서는 건드리지 않는다. `clubRepository`, `clubMemberRepository`, `historyRepository`, `userRepository` 의존성도 PR3-2 에서 제거되므로 본 PR 에서는 그대로 둔다.

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: acceptance 테스트가 통과하는지 확인**

Run: `./gradlew test --tests 'LeaderSuccessionAcceptanceTest'`
Expected: 모두 PASS (기존 acceptance 케이스에서 회귀 없음 — 클럽 부재 시 응답 메시지는 바뀌지만 HTTP 404 자체는 동일, 다만 acceptance 가 메시지 문자열까지 검증한다면 그 케이스만 수정 필요)

> 만약 메시지 문자열을 검증하는 acceptance 가 있어 실패한다면, 해당 테스트의 기대 메시지를 `"동아리를 찾을 수 없습니다."` 로 갱신한다. 메시지가 `ClubException.ClubNotFoundException` 의 상수이므로 정확히 일치한다.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/controller/AdminLeaderSuccessionController.java
git commit -m "refactor(backend): remove duplicate club existence check in assignLeader controller"
```

만약 Step 3 에서 메시지 검증 acceptance 도 같이 수정했다면 그 파일도 함께 staged.

---

### Task 6: 동시성 회귀 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceConcurrencyTest.java`

- [ ] **Step 1: 동시성 테스트 작성**

Create the file with:

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DirtiesContext
class GeneralAdminLeaderAssignmentServiceConcurrencyTest {

    @Autowired AdminLeaderAssignmentService service;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 어드민이 동일 동아리에 동시에 강제 지정해도 LEADER 는 한 명만 생성되고 다른 요청은 예외로 거절된다")
    void concurrentAssignmentsResultInExactlyOneLeader() throws Exception {
        User admin = userRepository.save(newUser(UserRole.ADMIN));
        User candidateA = userRepository.save(newUser(UserRole.STUDENT));
        User candidateB = userRepository.save(newUser(UserRole.STUDENT));
        Club club = clubRepository.save(Club.create(
                "C" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.of(club, candidateA, ClubMemberRole.MEMBER));
        clubMemberRepository.save(ClubMember.of(club, candidateB, ClubMemberRole.MEMBER));

        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger rejections = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);

        Runnable assignA = () -> attempt(start, successes, rejections,
                new AssignLeaderByAdminCommand(club.getId(), candidateA.getId(), admin.getId(), "동시-A"));
        Runnable assignB = () -> attempt(start, successes, rejections,
                new AssignLeaderByAdminCommand(club.getId(), candidateB.getId(), admin.getId(), "동시-B"));

        pool.submit(assignA);
        pool.submit(assignB);
        start.countDown();
        pool.shutdown();
        boolean finished = pool.awaitTermination(15, TimeUnit.SECONDS);
        assertThat(finished).as("동시성 테스트가 시간 내에 완료").isTrue();

        assertThat(successes.get()).isEqualTo(1);
        assertThat(rejections.get()).isEqualTo(1);

        long leaderCount = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(club.getId()).stream()
                .filter(member -> member.getRole() == ClubMemberRole.LEADER)
                .count();
        assertThat(leaderCount).isEqualTo(1);
    }

    private void attempt(CountDownLatch start, AtomicInteger successes, AtomicInteger rejections,
                         AssignLeaderByAdminCommand command) {
        try {
            start.await();
            service.assign(command);
            successes.incrementAndGet();
        } catch (ClubMemberException.AdminAssignLeaderAlreadyExists expected) {
            rejections.incrementAndGet();
        } catch (org.springframework.dao.DataIntegrityViolationException race) {
            // PG 가 즉시 던지는 무결성 위반도 동일하게 거절로 카운트 (Service 경로 외)
            rejections.incrementAndGet();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private User newUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now());
    }
}
```

> 주의: 이 테스트는 **`@Transactional` 이 없다** — 각 스레드가 자체 트랜잭션을 가져야 동시성이 재현되기 때문. 그 대신 `@DirtiesContext` 로 컨텍스트를 격리.

- [ ] **Step 2: 테스트 실행**

Run: `./gradlew test --tests 'GeneralAdminLeaderAssignmentServiceConcurrencyTest'`

Expected: PASS — successes=1, rejections=1, leader count=1.

> 만약 두 건 다 성공한다면 (테스트 실패) Service 의 `flush()` 누락이나 마이그레이션 미적용 가능성. Task 2/4 의 변경분을 다시 확인.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceConcurrencyTest.java
git commit -m "test(backend): add concurrency regression for admin leader assignment"
```

---

### Task 7: 전체 회귀 + PR 작성

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `./gradlew test`
Expected: BUILD SUCCESSFUL — 전체 그린

> 실패 시: 메시지 검증 acceptance 가 영향을 받았다면 Task 5 의 Step 3 노트대로 기대 메시지 갱신.

- [ ] **Step 2: spec self-check 7개 항목 점검**

다음을 차례로 확인:
1. 브랜치명 `fix/admin-leader-assignment-safety` — `{type}/{설명}` 규칙 ✓
2. 커밋 메시지 4건 모두 Conventional Commits, Claude 어트리뷰션 없음 — `git log --format='%s' develop..HEAD` 로 확인
3. PR 본문 초안 작성 (다음 step)
4. DDD 위반 없음 — Repository 는 Service 에서만 주입, Service 의 `@Transactional` 명시
5. Out of Scope 위반 없음 — `listMemberHistory`, 다른 어드민 컨트롤러 미수정
6. 시크릿/하드코딩 없음 — 마이그레이션 SQL 도 상수만
7. `./gradlew test` 통과 (Step 1)

- [ ] **Step 3: 푸시 및 PR 생성**

```bash
git push -u origin fix/admin-leader-assignment-safety
gh pr create --base develop --title "fix(backend): 어드민 회장 강제 지정 동시성·예외 정합 수정" --body "$(cat <<'EOF'
## 🚀 작업 내용

어드민이 LEADER 부재 동아리에 회장을 강제 지정하는 API 의 동시성 결함을 3중 방어로 차단했다. 두 어드민이 동시에 같은 동아리에 다른 후보를 지정하면 두 요청 모두 "LEADER 부재" 확인을 통과해 LEADER 가 두 명 생성될 수 있던 문제를 막는다. 동시에 클럽 부재 시 던지던 `ClubMemberException.NotFound` 가 도메인 의미를 흐리던 것을 `ClubException.ClubNotFoundException` 으로 정상화했다.

## 🤔 고민했던 내용

DB 부분 UNIQUE 인덱스만으로도 정확성은 보장되지만, 거절을 무결성 위반 예외로만 받게 되면 호출자가 받는 응답이 일관되지 않을 수 있어 애플리케이션 레벨에서 LEADER 슬롯 행에도 PESSIMISTIC_WRITE 락을 걸고 도메인 예외로 통일했다. 그래도 행이 비어 있는 시점의 동시 진입은 DB 가 마지막에 잡기 때문에 `flush()` 후 `DataIntegrityViolationException` 도 같은 도메인 예외로 변환한다.

`listMemberHistory` 에도 동일한 의미 오류가 있지만, 해당 메서드 전체를 Service 로 위임하는 작업이 후속 PR 에서 예정되어 있어 본 PR 에서는 `assignLeader` 만 처리했다.

## 💬 리뷰 중점사항

- 부분 UNIQUE 인덱스의 조건절(`WHERE role = 'LEADER' AND deleted_at IS NULL`) 이 soft delete 와 충돌하지 않는지
- 동시성 테스트의 가정(`flush()` 위치, `@Transactional` 부재) 이 의도대로 두 트랜잭션을 분리시키는지
- 메시지 검증 acceptance 가 있다면 기대 문자열이 정확히 반영됐는지
EOF
)"
```

- [ ] **Step 4: PR URL 확인 및 사용자에게 보고**

Expected: `https://github.com/<org>/duing/pull/<n>` 형식의 URL 출력. 이를 사용자에게 보고하고 다음 PR(2) 진행 여부를 묻는다.

---

## Self-Review Notes

- **Spec coverage:** Spec §4 PR1 의 5개 항목 중 4개 직접 처리 (마이그레이션 / DataIntegrityViolation catch / 클럽 검증 이동 — `assign` 한정 / 동시성 테스트). `listMemberHistory` 검증 이동은 Scope Note 에 명시한 대로 PR3-2 로 이관 — 본 plan 본문에 추적 명시.
- **Placeholder scan:** 없음. 모든 코드 블록은 실제 컴파일 가능한 형태로 기재.
- **Type consistency:** `ClubException.ClubNotFoundException`, `ClubMemberException.AdminAssignLeaderAlreadyExists`, `AssignLeaderByAdminCommand` 의 시그니처가 코드베이스 실 정의와 일치 (Task 1 의 사전 조사에서 확인됨).
