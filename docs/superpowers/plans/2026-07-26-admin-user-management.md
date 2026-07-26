# 총동연 회원 관리 운영 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN) 콘솔의 회원 관리 화면에 회원 상세·계정 정지/해제·관리자 메모·감사 로그를 더해 조회 전용 화면을 운영 화면으로 바꾼다.

**Architecture:** `users`에 상태·마지막 로그인·관리자 메모 컬럼을 더하고 `admin_user_action_log`(append-only)를 신설한다. 정지는 기존 강제 로그아웃 경로(행잠금 → `bumpTokenVersion` → `revokeAll`)를 재사용하고 로그인·JWT 필터 두 지점에서 차단한다. 프론트는 기존 레포 스타일(테이블 + `ui/sheet.tsx` + `ui/dialog.tsx`)로 기능만 완성하고 비주얼 리디자인은 후속 PR로 뺀다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / JPA / RestAssured + TestContainers(Postgres) · Next.js 15 / React 19 / TanStack Query / Vitest

**설계 스펙:** `docs/superpowers/specs/2026-07-26-admin-user-management-design.md` — 결정 근거(D-1~D-15)와 Out of Scope는 스펙을 따른다.

## Global Constraints

- 브랜치: PR-1 `feat/admin-user-management-be-infra`(현재 브랜치, 스펙 커밋 완료) → PR-2 `feat/admin-user-management-be-api` → PR-3 `feat/admin-user-management-fe`. 각각 `develop`으로 PR.
- 커밋 메시지: Conventional Commits + 한국어 본문. `feat(backend):` / `feat(frontend):` / `test(backend):`. **`Co-Authored-By` 및 `🤖 Generated` 라인 금지.**
- **PR 생성·push는 사람이 지시할 때만 한다.** 각 PR 마지막 태스크까지 끝나면 멈추고 보고한다.
- 백엔드 빌드/테스트는 `backend/`에서, 프론트는 `frontend/`에서 실행한다(cwd 명시). 출력에서 `BUILD SUCCESSFUL`을 눈으로 확인한다 — `| tail` 은 exit code를 가린다.
- 모든 DTO는 Java `record`. Service는 `{Domain}Service` 인터페이스 + `General{Domain}Service` 구현체. Controller는 반드시 `api/` 인터페이스를 implements.
- Flyway 기존 마이그레이션 파일 수정 금지 — 새 파일 추가만.
- **새로 만드는 테이블에는 반드시 `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` 를 넣는다.** `RowLevelSecurityMigrationTest` 가 public 스키마 전 테이블을 검사하므로 누락하면 전체 빌드가 실패한다.
- 프론트: `any`/`as` 금지, 타입 선언은 `type`, 서버 상태는 TanStack Query.
- 사용자 대면 메시지는 전부 한글.
- 정지 사유 최대 200자 / 관리자 메모 최대 1000자 — 서버·클라이언트 양쪽 검증.
- 액션 enum 값: `ACCOUNT_SUSPENDED`, `ACCOUNT_UNSUSPENDED`, `FORCE_LOGOUT`, `ADMIN_NOTE_UPDATED`, `PHONE_VIEW`.

---

## File Structure

**PR-1 (백엔드 인프라)**

| 파일 | 책임 |
|---|---|
| `backend/src/main/resources/db/migration/V94__admin_user_management.sql` | 신규 컬럼 3개 + `admin_user_action_log` 테이블 |
| `backend/src/main/java/com/duing/domain/user/entity/UserStatus.java` | `ACTIVE` / `SUSPENDED` |
| `backend/src/main/java/com/duing/domain/user/entity/AdminUserAction.java` | 감사 액션 5종 |
| `backend/src/main/java/com/duing/domain/user/entity/AdminUserActionLog.java` | append-only 감사 로그 엔티티 (`BaseEntity` 미상속) |
| `backend/src/main/java/com/duing/domain/user/repository/AdminUserActionLogRepository.java` | 저장 + 대상별 최근 조회 |
| `backend/src/main/java/com/duing/domain/user/entity/User.java` | 상태·마지막 로그인·메모 필드와 전이 메서드 |
| `backend/src/main/java/com/duing/domain/user/exception/UserException.java` | `AccountSuspendedException` 외 3종 |
| `backend/src/main/java/com/duing/global/auth/JwtAuthenticationFilter.java` | 정지 계정 토큰 거부 |
| `backend/src/main/java/com/duing/domain/user/repository/UserRepository.java` | `q` optional + `status` 필터 검색 |
| `backend/src/test/java/com/duing/common/IntegrationTestBase.java` | TRUNCATE 목록에 새 테이블 추가 |
| `TIMEZONE.md` | 새 테이블을 2단계 전환 제외 대상으로 등록 |

**PR-2 (백엔드 기능 API)** — `AdminUserApi` / `AdminUserController`에 4개 엔드포인트를 더하고, 조회는 `AdminUserQueryService`, 쓰기는 `AdminUserCommandService`로 분리한다. **번호 조회가 감사 로그를 INSERT하므로 조회 서비스에 두면 안 된다**(클래스 레벨 `readOnly=true` 함정).

**PR-3 (프론트)** — `packages/types` → `packages/api` → `packages/hooks` → `apps/web/app/admin/users/`. Sheet·Dialog·상태 필터를 `_components/`에 추가한다.

---

# PR-1 — 스키마 · 상태 차단 · 목록 필터

### Task 1: 스키마와 엔티티

**Files:**
- Create: `backend/src/main/resources/db/migration/V94__admin_user_management.sql`
- Create: `backend/src/main/java/com/duing/domain/user/entity/UserStatus.java`
- Create: `backend/src/main/java/com/duing/domain/user/entity/AdminUserAction.java`
- Create: `backend/src/main/java/com/duing/domain/user/entity/AdminUserActionLog.java`
- Create: `backend/src/main/java/com/duing/domain/user/repository/AdminUserActionLogRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/user/entity/User.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java`
- Modify: `TIMEZONE.md`
- Test: `backend/src/test/java/com/duing/domain/user/entity/UserStatusTest.java`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `UserStatus.ACTIVE` / `UserStatus.SUSPENDED`
  - `User#getStatus(): UserStatus`, `User#isActive(): boolean`, `User#suspend(): void`, `User#unsuspend(): void`
  - `User#getLastLoginAt(): LocalDateTime`, `User#getAdminNote(): String`, `User#changeAdminNote(String): void`
  - `User#recordSuccessfulLogin(LocalDateTime now): void` — **기존 무인자 시그니처를 대체한다**
  - `AdminUserAction { ACCOUNT_SUSPENDED, ACCOUNT_UNSUSPENDED, FORCE_LOGOUT, ADMIN_NOTE_UPDATED, PHONE_VIEW }`
  - `AdminUserActionLog.of(Long actorUserId, Long targetUserId, AdminUserAction action, String reason): AdminUserActionLog`
  - `AdminUserActionLogRepository#save`, `#findRecentByTargetUserId(Long targetUserId, AdminUserAction excluded, Pageable pageable): List<AdminUserActionLog>`, `#findTopByTargetUserIdAndActionOrderByIdDesc(Long targetUserId, AdminUserAction action): Optional<AdminUserActionLog>` (파생 쿼리)

- [ ] **Step 1: 마이그레이션 파일 작성**

`backend/src/main/resources/db/migration/V94__admin_user_management.sql`:

```sql
-- 계정 상태: ACTIVE(정상) / SUSPENDED(이용 정지). 정지는 로그인·API 접근 차단이며 탈퇴(soft delete)와 별개다.
-- DEFAULT 'ACTIVE' 는 롤백 안전성 — 이 컬럼을 모르는 이전 버전이 붙어도 INSERT 가 깨지지 않는다(V90 전례).
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 마지막 로그인. 기존 회원은 백필하지 않는다(90일치 auth_event 외에 소스가 없음) — NULL = "기록 없음".
-- naive TIMESTAMP 유지: users 의 다른 시각 컬럼과 같은 규약이어야 하고, users 는 TIMEZONE.md 2단계에서
-- 통째로 timestamptz 로 전환된다. 여기만 앞서가면 로컬(KST)과 prod(UTC)가 다르게 틀린다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- 관리자 내부 메모. 사용자에게 절대 노출되지 않는다(ADMIN 전용 응답에만 포함).
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- 관리자 조치 감사 로그. append-only, 보존기간 없음(auth_event 와 달리 cleanup 잡 대상이 아니다).
-- 개인정보(번호·이름)와 메모 본문은 저장하지 않는다 — 사실 관계만 남기고 값은 users 조인으로 해석한다.
-- updated_at·deleted_at 을 두지 않는다: 수정·삭제가 없는 테이블에 그 컬럼이 있으면 거짓 신호가 된다
-- (phone_verification_events 전례). created_at 은 신규 테이블이라 처음부터 TIMESTAMPTZ 로 둔다.
-- action 에 CHECK 를 걸지 않는다 — 레포의 모든 enum 컬럼과 동일하게 @Enumerated(STRING) 으로 보장한다.
CREATE TABLE admin_user_action_log (
    id             BIGSERIAL PRIMARY KEY,
    actor_user_id  BIGINT      NOT NULL REFERENCES users (id),
    target_user_id BIGINT      NOT NULL REFERENCES users (id),
    action         VARCHAR(40) NOT NULL,
    reason         VARCHAR(500),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_user_action_log_target ON admin_user_action_log (target_user_id, id DESC);

-- 신규 테이블은 RLS 를 반드시 켠다 — RowLevelSecurityMigrationTest 가 public 스키마의 모든 테이블을
-- 검사하므로, 누락하면 이 마이그레이션과 무관해 보이는 테스트가 BUILD FAILED 로 터진다(V92 에서 실제로 겪었다).
ALTER TABLE admin_user_action_log ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: enum 2개 생성**

`UserStatus.java`:

```java
package com.duing.domain.user.entity;

/** 계정 상태. 정지(SUSPENDED)는 로그인·API 접근 차단이며 탈퇴(soft delete)와 별개다. */
public enum UserStatus {
    ACTIVE,
    SUSPENDED
}
```

`AdminUserAction.java`:

```java
package com.duing.domain.user.entity;

/**
 * 관리자 조치 감사 액션. PHONE_VIEW 는 기존 회장 번호 조회 서버 로그(action=PHONE_VIEW)와 같은 이름이다
 * — 두 경로를 하나의 키워드로 검색할 수 있게 용어를 통일한다.
 */
public enum AdminUserAction {
    ACCOUNT_SUSPENDED,
    ACCOUNT_UNSUSPENDED,
    FORCE_LOGOUT,
    ADMIN_NOTE_UPDATED,
    PHONE_VIEW
}
```

- [ ] **Step 3: 감사 로그 엔티티 생성**

`AdminUserActionLog.java` — `BaseEntity`를 상속하지 않는다(`PhoneVerificationEvent` 전례):

```java
package com.duing.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * 관리자 조치 감사 로그 — insert-only. 수정·삭제 메서드를 두지 않으므로 updated_at·deleted_at 컬럼도 두지 않는다
 * (phone_verification_events 전례). 개인정보(번호·이름)와 메모 본문은 저장하지 않는다 — 사실만 남기고
 * 값은 users 조인으로 해석한다. 작업자 이름을 스냅샷하지 않는 것도 같은 이유다.
 *
 * <p>createdAt 은 Instant + timestamptz — 신규 테이블이라 TIMEZONE.md 2단계 전환 대상이 아니고,
 * "신규 API 는 Event Time 을 Instant 로 응답한다"는 규칙을 변환 없이 만족한다(TimeMapper 를 태우지 않는다).
 */
@Getter
@Entity
@Table(name = "admin_user_action_log")
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AdminUserActionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_user_id", nullable = false)
    private Long actorUserId;

    @Column(name = "target_user_id", nullable = false)
    private Long targetUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private AdminUserAction action;

    @Column(length = 500)
    private String reason;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Builder(access = AccessLevel.PRIVATE)
    private AdminUserActionLog(Long actorUserId, Long targetUserId, AdminUserAction action, String reason) {
        this.actorUserId = actorUserId;
        this.targetUserId = targetUserId;
        this.action = action;
        this.reason = reason;
    }

    public static AdminUserActionLog of(Long actorUserId, Long targetUserId,
                                        AdminUserAction action, String reason) {
        return AdminUserActionLog.builder()
                .actorUserId(actorUserId)
                .targetUserId(targetUserId)
                .action(action)
                .reason(reason)
                .build();
    }
}
```

- [ ] **Step 4: 리포지토리 생성**

`AdminUserActionLogRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminUserActionLogRepository extends JpaRepository<AdminUserActionLog, Long> {

    /**
     * 회원 상세의 "최근 운영 기록". append-only 라 id 가 단조 증가하므로 created_at 이 아니라 id 로 정렬한다.
     * PHONE_VIEW(개인정보 열람)는 감사 대상이지 운영 조치가 아니라서 제외한다 — 섞으면 정지·해제가 묻힌다.
     */
    @Query("""
            SELECT log FROM AdminUserActionLog log
            WHERE log.targetUserId = :targetUserId AND log.action <> :excluded
            ORDER BY log.id DESC
            """)
    List<AdminUserActionLog> findRecentByTargetUserId(@Param("targetUserId") Long targetUserId,
                                                      @Param("excluded") AdminUserAction excluded,
                                                      Pageable pageable);

    /** 관리자 메모의 최종 수정 시각·작업자를 파생하기 위한 최신 1건. 기록이 없으면 empty(= 아직 저장한 적 없음). */
    Optional<AdminUserActionLog> findTopByTargetUserIdAndActionOrderByIdDesc(Long targetUserId,
                                                                            AdminUserAction action);
}
```

- [ ] **Step 5: 실패하는 엔티티 테스트 작성**

`backend/src/test/java/com/duing/domain/user/entity/UserStatusTest.java`:

```java
package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserStatusTest {

    private User newUser() {
        return User.create("2021118033", "김도윤", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학", "010-1234-5678",
                LocalDateTime.of(2024, 3, 4, 10, 0));
    }

    @Test
    @DisplayName("새로 만든 회원은 정상(ACTIVE) 상태이며 마지막 로그인 기록과 관리자 메모가 비어 있다")
    void newUserStartsActive() {
        User user = newUser();

        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(user.isActive()).isTrue();
        assertThat(user.getLastLoginAt()).isNull();
        assertThat(user.getAdminNote()).isNull();
    }

    @Test
    @DisplayName("계정을 정지하면 비활성 상태가 되고, 해제하면 다시 정상으로 돌아온다")
    void suspendAndUnsuspend() {
        User user = newUser();

        user.suspend();
        assertThat(user.getStatus()).isEqualTo(UserStatus.SUSPENDED);
        assertThat(user.isActive()).isFalse();

        user.unsuspend();
        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(user.isActive()).isTrue();
    }

    @Test
    @DisplayName("로그인 성공을 기록하면 실패 카운터가 초기화되고 마지막 로그인 시각이 갱신된다")
    void recordSuccessfulLoginStampsLastLoginAt() {
        User user = newUser();
        LocalDateTime loginAt = LocalDateTime.of(2026, 7, 26, 13, 5);

        user.recordSuccessfulLogin(loginAt);

        assertThat(user.getLastLoginAt()).isEqualTo(loginAt);
        assertThat(user.getFailedLoginAttempts()).isZero();
        assertThat(user.getLockedUntil()).isNull();
    }

    @Test
    @DisplayName("관리자 메모를 빈 문자열로 저장하면 메모가 비워진다")
    void changeAdminNoteAcceptsBlank() {
        User user = newUser();

        user.changeAdminNote("테스트 계정");
        assertThat(user.getAdminNote()).isEqualTo("테스트 계정");

        user.changeAdminNote("");
        assertThat(user.getAdminNote()).isEmpty();
    }
}
```

- [ ] **Step 6: 테스트 실패 확인**

`backend/`에서 실행:
```bash
./gradlew test --tests "com.duing.domain.user.entity.UserStatusTest"
```
Expected: FAIL — `cannot find symbol: method getStatus()` 등 컴파일 에러

- [ ] **Step 7: `User` 엔티티 확장**

`User.java`의 `tokenVersion` 필드 아래에 추가:

```java
    /** 계정 상태. 정지(SUSPENDED)면 로그인·JWT 인증이 모두 차단된다. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status = UserStatus.ACTIVE;

    /** 마지막 로그인 성공 시각. 기존 회원은 백필하지 않았으므로 null 은 "기록 없음"이다. */
    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /** 관리자 내부 메모 — 사용자에게 절대 노출하지 않는다(ADMIN 전용 응답에만 포함). */
    @Column(name = "admin_note", columnDefinition = "TEXT")
    private String adminNote;
```

기존 `recordSuccessfulLogin()`을 대체하고 상태 전이 메서드를 추가한다:

```java
    /** 로그인 성공 시 실패 카운터·잠금을 초기화하고 마지막 로그인 시각을 남긴다. */
    public void recordSuccessfulLogin(LocalDateTime now) {
        this.failedLoginAttempts = 0;
        this.lockedUntil = null;
        this.lastLoginAt = now;
    }

    public boolean isActive() {
        return this.status == UserStatus.ACTIVE;
    }

    /** 계정을 이용 정지 상태로 만든다. 세션 폐기·토큰 무효화는 호출 측(서비스)이 함께 조율한다. */
    public void suspend() {
        this.status = UserStatus.SUSPENDED;
    }

    /** 이용 정지를 해제한다. token_version 은 되돌리지 않는다 — 재로그인하면 그만이다. */
    public void unsuspend() {
        this.status = UserStatus.ACTIVE;
    }

    /** 관리자 메모를 교체한다. 빈 문자열은 그대로 저장한다(= 메모 비우기, 그 자체가 감사 대상 행위). */
    public void changeAdminNote(String note) {
        this.adminNote = note;
    }
```

- [ ] **Step 8: 기존 `recordSuccessfulLogin()` 호출부 수정**

`GeneralUserService.login()`에서 `user.recordSuccessfulLogin();` → `user.recordSuccessfulLogin(now);`
(`now`는 같은 메서드 상단의 `LocalDateTime now = LocalDateTime.now();`를 그대로 쓴다 — `created_at`(JPA auditing)과 같은 기준을 유지한다.)

다른 호출부가 있는지 확인:
```bash
cd backend && grep -rn "recordSuccessfulLogin" src/
```
Expected: `User.java`(정의)와 `GeneralUserService.java`(호출) 두 곳만

- [ ] **Step 9: 테스트 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.user.entity.UserStatusTest"
```
Expected: PASS (4 tests)

- [ ] **Step 10: 통합 테스트 TRUNCATE 목록에 새 테이블 추가**

`IntegrationTestBase.java`의 TRUNCATE 문자열에서 `"auth_refresh_token, " +` 바로 위에 추가:

```java
                "admin_user_action_log, " +
```

**빠뜨리면 감사 로그가 테스트 간에 누적되어 "로그 1건" 단언이 무작위로 깨진다.**

- [ ] **Step 11: `TIMEZONE.md`에 새 테이블 등록**

`TIMEZONE.md`의 2단계 마이그레이션 계획 섹션(`## 2단계: DB 마이그레이션 계획`)에 한 줄 추가:

```markdown
- **제외 대상**: `admin_user_action_log.created_at` — 신규 테이블이라 처음부터 `timestamptz` + 엔티티 `Instant`. 백필·변환 대상이 아니다.
```

- [ ] **Step 12: 전체 백엔드 테스트로 회귀 확인**

```bash
cd backend && ./gradlew test
```
Expected: 출력에 `BUILD SUCCESSFUL`. 실패하면 `recordSuccessfulLogin` 시그니처 변경의 여파일 가능성이 높으니 컴파일 에러부터 확인한다.

- [ ] **Step 13: 커밋**

```bash
git add backend/src/main/resources/db/migration/V94__admin_user_management.sql \
        backend/src/main/java/com/duing/domain/user/entity/UserStatus.java \
        backend/src/main/java/com/duing/domain/user/entity/AdminUserAction.java \
        backend/src/main/java/com/duing/domain/user/entity/AdminUserActionLog.java \
        backend/src/main/java/com/duing/domain/user/repository/AdminUserActionLogRepository.java \
        backend/src/main/java/com/duing/domain/user/entity/User.java \
        backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java \
        backend/src/test/java/com/duing/domain/user/entity/UserStatusTest.java \
        backend/src/test/java/com/duing/common/IntegrationTestBase.java \
        TIMEZONE.md
git commit -m "feat(backend): 회원 상태·마지막 로그인·관리자 메모 컬럼과 조치 감사 로그 테이블 추가

계정 정지를 담을 상태 컬럼과, 운영자가 판단 근거로 쓸 마지막 로그인·내부
메모를 회원 테이블에 더했다. 마지막 로그인은 기존 데이터를 백필할 소스가
없어 빈 값으로 두고 로그인 시점부터 채운다.

관리자 조치 이력은 인증 이벤트 로그와 성격이 달라(작업자 개념이 있고 보존
기간 제약도 없어야 한다) 별도 테이블로 두었다. 수정·삭제가 없는 테이블이라
갱신·삭제 컬럼은 만들지 않았고, 개인정보와 메모 본문은 담지 않는다."
```

---

### Task 2: 정지 계정 차단

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/exception/UserException.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java:login`
- Modify: `backend/src/main/java/com/duing/global/auth/JwtAuthenticationFilter.java:43-47`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AccountSuspensionAuthTest.java`

**Interfaces:**
- Consumes: `User#isActive()`, `User#suspend()` (Task 1)
- Produces: `UserException.AccountSuspendedException` — 403 + code `ACCOUNT_SUSPENDED`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/user/controller/AccountSuspensionAuthTest.java`:

```java
package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
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
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AccountSuspensionAuthTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Duing!2345";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("정지된 계정으로 로그인하면 403 과 정지 안내 코드가 반환된다")
    void suspendedAccountCannotLogin() {
        User user = saveUser();
        suspend(user);

        RestAssured.given()
                .contentType("application/json")
                .body("""
                        {"studentId":"%s","password":"%s"}
                        """.formatted(user.getStudentId(), RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then()
                .statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", org.hamcrest.Matchers.equalTo("ACCOUNT_SUSPENDED"));
    }

    @Test
    @DisplayName("비밀번호가 틀리면 정지 여부를 알려주지 않고 일반 인증 실패로 응답한다")
    void wrongPasswordDoesNotLeakSuspension() {
        User user = saveUser();
        suspend(user);

        RestAssured.given()
                .contentType("application/json")
                .body("""
                        {"studentId":"%s","password":"WrongPass!99"}
                        """.formatted(user.getStudentId()))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("정지 이전에 발급된 액세스 토큰은 보호 API 에서 401 로 거부된다")
    void existingTokenRejectedAfterSuspension() {
        User user = saveUser();
        String token = jwtTokenProvider.createToken(
                user.getId(), user.getRole().name(), user.getTokenVersion());

        suspend(user);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("정지를 해제하면 다시 로그인할 수 있고 마지막 로그인 시각이 기록된다")
    void unsuspendedAccountCanLoginAgain() {
        User user = saveUser();
        suspend(user);

        User target = userRepository.findById(user.getId()).orElseThrow();
        target.unsuspend();
        userRepository.saveAndFlush(target);

        RestAssured.given()
                .contentType("application/json")
                .body("""
                        {"studentId":"%s","password":"%s"}
                        """.formatted(user.getStudentId(), RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value());

        assertThat(userRepository.findById(user.getId()).orElseThrow().getLastLoginAt()).isNotNull();
    }

    private void suspend(User user) {
        User target = userRepository.findById(user.getId()).orElseThrow();
        target.suspend();
        userRepository.saveAndFlush(target);
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        return userRepository.saveAndFlush(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "정지대상",
                passwordEncoder.encode(RAW_PASSWORD),
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AccountSuspensionAuthTest"
```
Expected: FAIL — 정지 계정이 200으로 로그인되고 기존 토큰도 통과한다

- [ ] **Step 3: 예외 추가**

`UserException.java`에 추가(`AccountLockedException` 옆):

```java
    /** 관리자가 이용 정지한 계정. 잠금(AccountLocked, 자동 해제)과 달리 관리자 해제 전까지 풀리지 않는다. */
    public static class AccountSuspendedException extends UserException {

        private static final String MESSAGE = "정지된 계정입니다. 총동아리연합회로 문의해 주세요.";

        public AccountSuspendedException() {
            super(MESSAGE, HttpStatus.FORBIDDEN, "ACCOUNT_SUSPENDED");
        }
    }
```

- [ ] **Step 4: 로그인 차단 추가**

`GeneralUserService.login()`에서 비밀번호 검증 블록 **바로 뒤**, `user.recordSuccessfulLogin(now);` **앞**에 삽입:

```java
        // 정지 검사는 반드시 비밀번호 검증 뒤에 둔다 — 앞에 두면 학번만 아는 제3자가 로그인 시도만으로
        // "이 계정은 정지 상태"를 알아낼 수 있다(계정 열거 + 상태 노출).
        if (!user.isActive()) {
            throw new UserException.AccountSuspendedException();
        }
```

- [ ] **Step 5: JWT 필터 차단 추가**

`JwtAuthenticationFilter.java:43-47`의 `.filter(...)`를 교체:

```java
                userRepository.findById(claims.userId())
                        .filter(user -> user.getTokenVersion() == claims.tokenVersion() && user.isActive())
                        .ifPresentOrElse(
                                user -> authenticate(user, claims.sessionId()),
                                SecurityContextHolder::clearContext);
```

같은 블록 위 주석에 한 줄 덧붙인다: `// (c) 이용 정지(SUSPENDED) 계정은 유효한 토큰이라도 거부한다.`

**비밀번호 경로에는 아무것도 추가하지 않는다** (결정 D-15). 비밀번호 *변경*(`changePassword`)은 로그인 상태 전용이라 위 필터가 이미 막는다. 비밀번호 *재설정*(`resetPassword`, 비로그인 MO 인증 경로)에는 **정지 검사를 넣지 않는다** — 넣으면 인증 전 단계에서 계정 상태가 노출되어 D-11과 정면으로 모순된다(학번·번호를 아는 제3자가 재설정 시도만으로 정지 여부를 알아낸다). 재설정에 성공해도 로그인은 여전히 막히고, SMS 남용은 기존 rate limit이 이미 막는다.

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AccountSuspensionAuthTest"
```
Expected: PASS (4 tests)

- [ ] **Step 7: 인증 회귀 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.*"
```
Expected: 출력에 `BUILD SUCCESSFUL`

- [ ] **Step 8: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/exception/UserException.java \
        backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java \
        backend/src/main/java/com/duing/global/auth/JwtAuthenticationFilter.java \
        backend/src/test/java/com/duing/domain/user/controller/AccountSuspensionAuthTest.java
git commit -m "feat(backend): 이용 정지 계정의 로그인과 토큰 인증 차단

정지된 계정은 로그인 단계와 토큰 검증 단계 양쪽에서 막는다. 로그인 쪽은
비밀번호 검증을 통과한 뒤에 확인하는데, 앞에 두면 학번만 아는 제3자가
로그인 시도만으로 정지 여부를 알아낼 수 있기 때문이다.

정지 안내는 일반 인증 실패와 구분되는 별도 코드로 내려, 사용자가 문의할
곳을 알 수 있게 했다."
```

---

### Task 3: 목록 검색어 선택화 · 상태 필터

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/repository/UserRepository.java:51-57`
- Modify: `backend/src/main/java/com/duing/domain/user/service/UserService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java:328-339`
- Modify: `backend/src/main/java/com/duing/domain/user/service/dto/query/UserSearchResultQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/dto/response/AdminUserSearchResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AdminUserApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AdminUserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AdminUsersSearchControllerTest.java` (기존 파일에 추가)

**Interfaces:**
- Consumes: `UserStatus` (Task 1)
- Produces:
  - `UserService#searchForAdmin(String queryOrNull, UserStatus statusOrNull, Pageable pageable): Page<UserSearchResultQuery>`
  - `UserSearchResultQuery`에 `UserStatus status` 필드 추가(마지막 위치)
  - `AdminUserSearchResponse`에 `UserStatus status` 필드 추가(마지막 위치)

- [ ] **Step 1: 실패하는 테스트 추가**

`AdminUsersSearchControllerTest.java`에 테스트 3개를 추가한다(기존 테스트는 그대로 둔다).

먼저 기존 파일을 읽어 헬퍼를 확인한다:
```bash
cd backend && grep -n "private User saveUser\|private String tokenFor\|@Autowired" src/test/java/com/duing/domain/user/controller/AdminUsersSearchControllerTest.java
```
`saveUser(String name, UserRole role)`·`tokenFor(User)`·`@Autowired UserRepository userRepository` 가 없으면 `AdminForceLogoutControllerTest.java` 의 동일 헬퍼를 그대로 복제해 파일 하단에 추가한다(그 파일 121-137행).

```java
    @Test
    @DisplayName("검색어 없이 조회하면 전체 회원이 최근 가입순으로 반환된다")
    void searchWithoutQueryReturnsAllUsers() {
        saveUser("가나다", UserRole.STUDENT);
        saveUser("라마바", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", org.hamcrest.Matchers.greaterThanOrEqualTo(2));
    }

    @Test
    @DisplayName("status=SUSPENDED 로 조회하면 정지된 회원만 반환된다")
    void searchFiltersBySuspendedStatus() {
        saveUser("정상회원", UserRole.STUDENT);
        User suspended = saveUser("정지회원", UserRole.STUDENT);
        suspended.suspend();
        userRepository.saveAndFlush(suspended);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("status", "SUSPENDED")
                .when().get("/api/v1/admin/users")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", org.hamcrest.Matchers.equalTo(1))
                .body("data.content[0].name", org.hamcrest.Matchers.equalTo("정지회원"))
                .body("data.content[0].status", org.hamcrest.Matchers.equalTo("SUSPENDED"));
    }

    @Test
    @DisplayName("검색 결과 행에 계정 상태가 포함된다")
    void searchResultIncludesStatus() {
        User user = saveUser("상태확인", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("q", user.getStudentId())
                .when().get("/api/v1/admin/users")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content[0].status", org.hamcrest.Matchers.equalTo("ACTIVE"));
    }
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUsersSearchControllerTest"
```
Expected: FAIL — 검색어 없는 요청이 400, 응답에 `status` 필드 없음

- [ ] **Step 3: 리포지토리 쿼리 교체**

`UserRepository.java`의 `searchForAdmin`을 교체한다:

```java
    /**
     * ADMIN 사용자 검색. q 가 null 이면 검색 조건 없이 전체를 대상으로 하고, status 가 null 이면 상태를 가리지 않는다.
     * studentId 가 q 로 시작하거나, name 이 q 를 포함(대소문자 무시)할 때 매치.
     *
     * <p>정렬은 Pageable 이 담당하되 서비스가 항상 id DESC tie-breaker 를 덧붙인다 — 정렬 키가 같은 행들의
     * 페이지 경계가 흔들리면 페이지 간 행 중복·누락이 생긴다.
     */
    @Query("""
            SELECT u FROM User u
            WHERE (:q IS NULL
                   OR u.studentId LIKE CONCAT(:q, '%')
                   OR LOWER(u.name) LIKE LOWER(CONCAT('%', :q, '%')))
              AND (:status IS NULL OR u.status = :status)
            """)
    Page<User> searchForAdmin(@Param("q") String q,
                              @Param("status") UserStatus status,
                              Pageable pageable);
```

`import com.duing.domain.user.entity.UserStatus;`를 추가한다.

- [ ] **Step 4: 서비스 시그니처와 정렬 처리 변경**

`UserService.java`:

```java
    Page<UserSearchResultQuery> searchForAdmin(String queryOrNull, UserStatus statusOrNull, Pageable pageable);
```

`GeneralUserService.java`의 `searchForAdmin`을 교체:

```java
    private static final Sort DEFAULT_ADMIN_USER_SORT =
            Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));

    @Override
    public Page<UserSearchResultQuery> searchForAdmin(String queryOrNull, UserStatus statusOrNull,
                                                      Pageable pageable) {
        SortWhitelist.assertAllowed(pageable.getSort(), ALLOWED_ADMIN_USER_SORT);
        // 검색어는 선택이다 — 상태 필터만으로 목록을 훑는 경로(정지 회원 찾기)가 필요하다.
        String normalizedQuery = StringUtils.hasText(queryOrNull) ? queryOrNull.trim() : null;
        return userRepository.searchForAdmin(normalizedQuery, statusOrNull, withStableSort(pageable))
                .map(UserSearchResultQuery::from);
    }

    /**
     * 정렬이 지정되지 않으면 최근 가입순, 지정됐으면 그 뒤에 id DESC 를 덧붙인다.
     * tie-breaker 가 없으면 같은 createdAt 을 가진 행들의 순서가 매 쿼리마다 달라져 페이징이 새거나 겹친다.
     */
    private Pageable withStableSort(Pageable pageable) {
        Sort sort = pageable.getSort().isSorted()
                ? pageable.getSort().and(Sort.by(Sort.Order.desc("id")))
                : DEFAULT_ADMIN_USER_SORT;
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
    }
```

`InvalidSearchQueryException` 던지는 블록을 삭제하고, `import org.springframework.data.domain.PageRequest;`·`import org.springframework.data.domain.Sort;`·`import com.duing.domain.user.entity.UserStatus;`를 추가한다.

`UserException.InvalidSearchQueryException`은 **삭제하지 않는다** — 다른 도메인에서 쓰는지 먼저 확인:
```bash
cd backend && grep -rn "InvalidSearchQueryException" src/
```
호출부가 사라져 이 예외만 남으면 그대로 둔다(다른 검색 API가 재사용할 수 있고, 지우면 무관한 diff가 늘어난다).

- [ ] **Step 5: 쿼리·응답 DTO에 status 추가**

`UserSearchResultQuery.java` — 레코드 마지막 컴포넌트로 `UserStatus status`를 추가하고 `from`에 `user.getStatus()`를 더한다.

`AdminUserSearchResponse.java` — 마지막 컴포넌트로 추가:

```java
        @Schema(description = "계정 상태(원값). 프론트는 값이 없으면 뱃지를 렌더하지 않는다.", example = "ACTIVE")
        UserStatus status
```
`from`에 `searchResult.status()`를 더한다.

- [ ] **Step 6: API 인터페이스·컨트롤러 변경**

`AdminUserApi.java`의 `searchUsers` 시그니처:

```java
    @Operation(summary = "사용자 검색 (ADMIN)",
            description = "회원 관리 목록과 동아리장 후보 검색이 함께 쓴다. q 는 선택 — 생략하면 전체를 대상으로 하고, "
                    + "studentId 는 prefix 일치, name 은 contains(case-insensitive) 일치. "
                    + "status 를 생략하면 상태를 가리지 않는다(= 전체). 기본 정렬은 최근 가입순.")
    @GetMapping("/admin/users")
    ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @Parameter(description = "검색어 (학번 prefix 또는 이름 부분 일치). 생략 가능")
            @RequestParam(required = false) String q,
            @Parameter(description = "계정 상태 필터. 생략하면 전체", example = "SUSPENDED")
            @RequestParam(required = false) UserStatus status,
            @Parameter(hidden = true) Pageable pageable
    );
```

`AdminUserController.java`:

```java
    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UserStatus status,
            Pageable pageable
    ) {
        Page<AdminUserSearchResponse> page = userService.searchForAdmin(q, status, pageable)
                .map(AdminUserSearchResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUsersSearchControllerTest"
```
Expected: PASS

- [ ] **Step 8: 전체 테스트**

```bash
cd backend && ./gradlew test
```
Expected: 출력에 `BUILD SUCCESSFUL`

- [ ] **Step 9: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/ \
        backend/src/test/java/com/duing/domain/user/controller/AdminUsersSearchControllerTest.java
git commit -m "feat(backend): 회원 목록 검색어 선택화와 계정 상태 필터

정지시킨 회원을 다시 찾을 방법이 없었다. 검색어를 필수에서 선택으로 바꾸고
상태 필터를 더해, 검색어 없이도 정지 회원만 훑을 수 있게 했다.

검색어 없는 전체 조회가 열리면서 정렬이 문제가 됐다. 기존 쿼리에 정렬이
없어 페이지 간 행이 겹치거나 새기 때문에, 최근 가입순을 기본으로 두고 같은
시각에 가입한 행들을 위한 tie-breaker 를 항상 덧붙인다.

목록 행에도 상태를 함께 내려 화면이 뱃지를 그릴 수 있게 했다."
```

---

**PR-1 완료 지점.** 여기서 멈추고 사람에게 보고한다. push·PR 생성은 지시가 있을 때만.

---

# PR-2 — 상세 · 상태 변경 · 메모 · 번호 조회

> 브랜치: `feat/admin-user-management-be-api` (PR-1 브랜치에서 분기)

**서비스 분리 원칙:** 조회는 `AdminUserQueryService`(`@Transactional(readOnly = true)`), 쓰기는 `AdminUserCommandService`(`@Transactional`). **번호 조회는 감사 로그를 INSERT하므로 조회가 아니라 쓰기다 — Command 쪽에 둔다.** 조회 서비스에 넣으면 H2에서는 통과하고 실제 Postgres에서 500이 난다(이 레포에 전례가 있다).

---

### Task 4: 회원 상세 조회 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/AdminUserQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/GeneralAdminUserQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/query/AdminUserDetailQuery.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/UserClubMembershipQuery.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/query/AdminUserActionQuery.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/response/AdminUserDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AdminUserApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AdminUserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AdminUserDetailControllerTest.java`

**Interfaces:**
- Consumes: `User#getStatus/getLastLoginAt/getAdminNote`, `AdminUserActionLogRepository#findRecentByTargetUserId/#findTopByTargetUserIdAndActionOrderByIdDesc`, `AdminUserAction` (Task 1)
- Produces:
  - `AdminUserQueryService#getDetail(Long userId): AdminUserDetailQuery`
  - `UserClubMembershipQuery(Long clubId, String clubName, ClubMemberRole role, LocalDateTime joinedAt)` — **clubmember 도메인에 둔다.** user 도메인이 clubmember 를 의존하는 방향은 이미 존재하지만(`GeneralUserService`가 `ClubMemberRepository`를 주입받는다) 그 반대는 없다. 프로젝션을 user 쪽에 두면 clubmember 리포지토리가 user DTO 를 import 하는 역방향 의존이 새로 생긴다
  - `AdminUserActionQuery(AdminUserAction action, String actorName, String reason, Instant at)`
  - `ClubMemberRepository#findClubMembershipsByUserId(Long userId): List<UserClubMembershipQuery>`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/user/controller/AdminUserDetailControllerTest.java`:

```java
package com.duing.domain.user.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.hamcrest.Matchers;
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
class AdminUserDetailControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        adminToken = tokenFor(adminUser);
        studentToken = tokenFor(saveUser("일반학생", UserRole.STUDENT));
    }

    @Test
    @DisplayName("회원 상세에 가입 정보·마스킹된 휴대폰·인증 여부·계정 상태가 담긴다")
    void detailContainsAccountInfo() {
        User target = saveUser("김도윤", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.name", Matchers.equalTo("김도윤"))
                .body("data.status", Matchers.equalTo("ACTIVE"))
                .body("data.maskedPhone", Matchers.containsString("****"))
                .body("data.phoneVerified", Matchers.equalTo(false))
                .body("data.lastLoginAt", Matchers.nullValue())
                .body("data.adminNote", Matchers.nullValue())
                .body("data.adminNoteUpdatedAt", Matchers.nullValue())
                .body("data.adminNoteUpdatedBy", Matchers.nullValue());
    }

    @Test
    @DisplayName("회원이 가입한 동아리가 역할·가입일과 함께 반환된다")
    void detailContainsJoinedClubs() {
        User target = saveUser("이하늘", UserRole.STUDENT);
        Club club = clubRepository.save(Club.create("두잉코드", "소개", target.getId()));
        clubMemberRepository.save(ClubMember.asLeader(club, target));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", Matchers.equalTo(1))
                .body("data.clubs[0].clubName", Matchers.equalTo("두잉코드"))
                .body("data.clubs[0].role", Matchers.equalTo("LEADER"))
                .body("data.clubs[0].joinedAt", Matchers.notNullValue());
    }

    @Test
    @DisplayName("최근 운영 기록에 개인정보 열람(PHONE_VIEW)은 포함되지 않는다")
    void recentActionsExcludePhoneView() {
        User target = saveUser("정우진", UserRole.STUDENT);
        actionLogRepository.save(AdminUserActionLog.of(
                adminUser.getId(), target.getId(), AdminUserAction.PHONE_VIEW, null));
        actionLogRepository.save(AdminUserActionLog.of(
                adminUser.getId(), target.getId(), AdminUserAction.FORCE_LOGOUT, null));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.recentActions.size()", Matchers.equalTo(1))
                .body("data.recentActions[0].action", Matchers.equalTo("FORCE_LOGOUT"))
                .body("data.recentActions[0].actorName", Matchers.equalTo("총동연관리자"));
    }

    @Test
    @DisplayName("메모 수정 시각·작업자는 최신 메모 수정 로그에서 파생된다")
    void adminNoteMetadataDerivedFromLog() {
        User target = saveUser("한지우", UserRole.STUDENT);
        actionLogRepository.save(AdminUserActionLog.of(
                adminUser.getId(), target.getId(), AdminUserAction.ADMIN_NOTE_UPDATED, null));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.adminNoteUpdatedAt", Matchers.notNullValue())
                .body("data.adminNoteUpdatedBy", Matchers.equalTo("총동연관리자"));
    }

    @Test
    @DisplayName("STUDENT 가 회원 상세를 조회하면 403 을 반환한다")
    void studentGetsForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/users/{userId}", adminUser.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 회원을 조회하면 404 를 반환한다")
    void unknownUserReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.saveAndFlush(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name, "hashed", role, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}
```

> `Club.create(...)` 시그니처는 실제 코드에 맞춘다 — `cd backend && grep -n "public static Club create" -A 12 src/main/java/com/duing/domain/club/entity/Club.java` 로 확인하고, 기존 클럽 테스트(`src/test/java/com/duing/domain/club/`)의 픽스처 생성 방식을 그대로 따른다.

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserDetailControllerTest"
```
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 3: 가입 동아리 프로젝션 쿼리 추가**

`backend/src/main/java/com/duing/domain/clubmember/service/dto/query/UserClubMembershipQuery.java`:

```java
package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/** 회원 한 명이 가입한 동아리 한 건. 폐쇄된 동아리는 @SQLRestriction 으로 자동 제외된다. */
public record UserClubMembershipQuery(
        Long clubId,
        String clubName,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
}
```

`ClubMemberRepository.java`에 추가:

```java
    /**
     * 회원이 가입한 동아리 목록(총동연 회원 상세용). 기존 findClubIdsByUserId 는 id 만 반환해 재사용할 수 없다.
     * 가입일은 멤버십 행의 생성 시각이다.
     */
    @Query("""
            SELECT new com.duing.domain.clubmember.service.dto.query.UserClubMembershipQuery(
                       cm.club.id, cm.club.name, cm.role, cm.createdAt)
            FROM ClubMember cm
            WHERE cm.user.id = :userId
            ORDER BY cm.createdAt DESC
            """)
    List<UserClubMembershipQuery> findClubMembershipsByUserId(@Param("userId") Long userId);
```

`import com.duing.domain.clubmember.service.dto.query.UserClubMembershipQuery;`를 추가한다.

- [ ] **Step 4: 조회 쿼리 DTO 작성**

`AdminUserActionQuery.java`:

```java
package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.AdminUserAction;
import java.time.Instant;

/** 관리자 조치 이력 한 건. actorName 은 감사 로그에 스냅샷하지 않고 users 조인으로 해석한 값이다. */
public record AdminUserActionQuery(
        AdminUserAction action,
        String actorName,
        String reason,
        Instant at
) {
}
```

`AdminUserDetailQuery.java`:

```java
package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.clubmember.service.dto.query.UserClubMembershipQuery;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 총동연 회원 상세. 휴대폰은 마스킹된 값만 담는다 — 원본은 별도 엔드포인트에서 감사 로그와 함께 조회한다.
 * adminNoteUpdatedAt/By 는 users 컬럼이 아니라 최신 ADMIN_NOTE_UPDATED 감사 로그에서 파생한 값이다.
 */
public record AdminUserDetailQuery(
        Long id,
        String name,
        String studentId,
        Grade grade,
        College college,
        String major,
        UserRole role,
        String maskedPhone,
        boolean phoneVerified,
        LocalDateTime phoneVerifiedAt,
        UserStatus status,
        LocalDateTime createdAt,
        LocalDateTime lastLoginAt,
        String adminNote,
        Instant adminNoteUpdatedAt,
        String adminNoteUpdatedBy,
        List<UserClubMembershipQuery> clubs,
        List<AdminUserActionQuery> recentActions
) {
}
```

- [ ] **Step 5: 조회 서비스 작성**

`AdminUserQueryService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;

public interface AdminUserQueryService {

    /** 총동연 회원 상세. 탈퇴(soft-delete)한 회원은 조회되지 않아 404 로 수렴한다. */
    AdminUserDetailQuery getDetail(Long userId);
}
```

`GeneralAdminUserQueryService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.query.AdminUserActionQuery;
import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;
import com.duing.domain.user.support.PhoneMasker;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminUserQueryService implements AdminUserQueryService {

    /** 상세 패널에 나열할 조치 이력 상한. 그 이상은 이번 스코프에서 제공하지 않는다(페이지네이션 없음). */
    private static final int RECENT_ACTION_LIMIT = 20;

    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final AdminUserActionLogRepository adminUserActionLogRepository;

    @Override
    public AdminUserDetailQuery getDetail(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(UserException.UserNotFoundException::new);

        // 개인정보 열람은 감사 대상이지 운영 조치가 아니다 — 타임라인에 섞으면 정지·해제가 묻힌다.
        List<AdminUserActionLog> recentLogs = adminUserActionLogRepository.findRecentByTargetUserId(
                userId, AdminUserAction.PHONE_VIEW, PageRequest.of(0, RECENT_ACTION_LIMIT));
        Optional<AdminUserActionLog> latestNoteLog = adminUserActionLogRepository
                .findTopByTargetUserIdAndActionOrderByIdDesc(userId, AdminUserAction.ADMIN_NOTE_UPDATED);

        // 조치 이력의 작업자 이름과 메모 최종 수정자 이름을 한 번에 해석한다(작업자 이름은 로그에 스냅샷하지 않는다).
        Map<Long, String> actorNames = resolveActorNames(recentLogs, latestNoteLog);

        return new AdminUserDetailQuery(
                user.getId(),
                user.getName(),
                user.getStudentId(),
                user.getGrade(),
                user.getCollege(),
                user.getMajor(),
                user.getRole(),
                PhoneMasker.mask(user.getPhone()),
                user.getPhoneVerifiedAt() != null,
                user.getPhoneVerifiedAt(),
                user.getStatus(),
                user.getCreatedAt(),
                user.getLastLoginAt(),
                user.getAdminNote(),
                latestNoteLog.map(AdminUserActionLog::getCreatedAt).orElse(null),
                latestNoteLog.map(log -> actorNames.get(log.getActorUserId())).orElse(null),
                clubMemberRepository.findClubMembershipsByUserId(userId),
                recentLogs.stream()
                        .map(log -> new AdminUserActionQuery(
                                log.getAction(),
                                actorNames.get(log.getActorUserId()),
                                log.getReason(),
                                log.getCreatedAt()))
                        .toList()
        );
    }

    private Map<Long, String> resolveActorNames(List<AdminUserActionLog> recentLogs,
                                                Optional<AdminUserActionLog> latestNoteLog) {
        Set<Long> actorIds = java.util.stream.Stream.concat(
                        recentLogs.stream(), latestNoteLog.stream())
                .map(AdminUserActionLog::getActorUserId)
                .collect(Collectors.toSet());
        if (actorIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(actorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }
}
```

- [ ] **Step 6: 응답 DTO 작성**

`AdminUserDetailResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(description = "총동연 회원 상세 (ADMIN 전용)")
public record AdminUserDetailResponse(
        Long id,
        String name,
        String studentId,
        Grade grade,
        College college,
        String major,
        UserRole role,
        @Schema(description = "마스킹된 휴대폰. 원본은 /admin/users/{userId}/phone 으로 별도 조회한다.",
                example = "010-****-9983")
        String maskedPhone,
        @Schema(description = "MO 휴대폰 인증 완료 여부")
        boolean phoneVerified,
        Instant phoneVerifiedAt,
        UserStatus status,
        @Schema(description = "가입일") Instant createdAt,
        @Schema(description = "마지막 로그인. null 이면 기록 없음(백필하지 않았다).") Instant lastLoginAt,
        String adminNote,
        @Schema(description = "메모 최종 수정 시각. 저장 이력이 없으면 null") Instant adminNoteUpdatedAt,
        @Schema(description = "메모 최종 수정 작업자 이름. 저장 이력이 없으면 null") String adminNoteUpdatedBy,
        List<ClubItem> clubs,
        @Schema(description = "최근 관리자 조치 이력(개인정보 열람 제외, 최신순 최대 20건)")
        List<ActionItem> recentActions
) {

    @Schema(description = "가입 동아리 한 건")
    public record ClubItem(Long clubId, String clubName, ClubMemberRole role, Instant joinedAt) {
    }

    @Schema(description = "관리자 조치 이력 한 건")
    public record ActionItem(AdminUserAction action, String actorName, String reason, Instant at) {
    }

    public static AdminUserDetailResponse from(AdminUserDetailQuery detail) {
        return new AdminUserDetailResponse(
                detail.id(),
                detail.name(),
                detail.studentId(),
                detail.grade(),
                detail.college(),
                detail.major(),
                detail.role(),
                detail.maskedPhone(),
                detail.phoneVerified(),
                TimeMapper.systemWallClockToInstant(detail.phoneVerifiedAt()),
                detail.status(),
                TimeMapper.systemWallClockToInstant(detail.createdAt()),
                TimeMapper.systemWallClockToInstant(detail.lastLoginAt()),
                detail.adminNote(),
                // 감사 로그의 시각은 이미 Instant(timestamptz)다 — TimeMapper 를 태우면 이중 변환이 된다.
                detail.adminNoteUpdatedAt(),
                detail.adminNoteUpdatedBy(),
                detail.clubs().stream()
                        .map(club -> new ClubItem(club.clubId(), club.clubName(), club.role(),
                                TimeMapper.systemWallClockToInstant(club.joinedAt())))
                        .toList(),
                detail.recentActions().stream()
                        .map(action -> new ActionItem(action.action(), action.actorName(),
                                action.reason(), action.at()))
                        .toList()
        );
    }
}
```

- [ ] **Step 7: API 인터페이스·컨트롤러에 엔드포인트 추가**

`AdminUserApi.java`에 추가:

```java
    @Operation(summary = "회원 상세 조회 (ADMIN)",
            description = "기본 정보·가입 정보·휴대폰 인증 여부·가입 동아리·관리자 메모·최근 조치 이력을 한 번에 반환한다. "
                    + "휴대폰은 마스킹된 값만 담기며 원본은 별도 엔드포인트에서 감사 로그와 함께 조회한다. "
                    + "탈퇴한 회원은 404.")
    @GetMapping("/admin/users/{userId}")
    ResponseEntity<ApiResponse<AdminUserDetailResponse>> getUserDetail(
            @Parameter(description = "조회 대상 사용자 ID", required = true)
            @PathVariable Long userId
    );
```

`AdminUserController.java`에 필드 `private final AdminUserQueryService adminUserQueryService;`를 더하고:

```java
    @Override
    public ResponseEntity<ApiResponse<AdminUserDetailResponse>> getUserDetail(@PathVariable Long userId) {
        return ResponseEntity.ok(
                ApiResponse.success(AdminUserDetailResponse.from(adminUserQueryService.getDetail(userId))));
    }
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserDetailControllerTest"
```
Expected: PASS (6 tests)

- [ ] **Step 9: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/ \
        backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java \
        backend/src/test/java/com/duing/domain/user/controller/AdminUserDetailControllerTest.java
git commit -m "feat(backend): 총동연 회원 상세 조회

운영자가 한 회원을 판단하는 데 필요한 것들을 한 번의 요청으로 모았다.
가입 정보와 인증 여부, 가입한 동아리와 역할, 관리자 메모, 그리고 그 회원에게
지금까지 취한 조치 이력이 함께 온다.

메모의 최종 수정 시각과 작업자는 별도 컬럼을 두지 않고 감사 로그에서
파생한다. 같은 사실을 두 곳에 저장하면 한쪽만 갱신되는 순간 어긋난다.

개인정보 열람 기록은 조치 이력에서 빼둔다. 열람은 감사 대상이지 운영
조치가 아니고, 섞이면 정지나 해제 같은 실제 조치가 묻힌다."
```

---

### Task 5: 계정 상태 변경 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/AdminUserCommandService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/GeneralAdminUserCommandService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/command/ChangeUserStatusCommand.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/ChangeUserStatusRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/exception/UserException.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AdminUserApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AdminUserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AdminUserStatusControllerTest.java`

**Interfaces:**
- Consumes: `User#suspend/unsuspend/isActive/bumpTokenVersion`, `AdminUserActionLog.of`, `AdminUserAction`, `UserStatus` (Task 1) · `AuthSessionService#revokeAll(Long userId, SessionRevokeReason reason)` (기존)
- Produces:
  - `AdminUserCommandService#changeStatus(ChangeUserStatusCommand): void`
  - `ChangeUserStatusCommand(Long targetUserId, Long actorUserId, UserStatus status, String reason)`
  - `UserException.SelfSuspendNotAllowedException` (400, code `SELF_SUSPEND_NOT_ALLOWED`)
  - `UserException.AdminSuspendNotAllowedException` (400, code `ADMIN_SUSPEND_NOT_ALLOWED`)

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/user/controller/AdminUserStatusControllerTest.java` — Task 4 테스트의 `setUp`·`tokenFor`·`saveUser` 헬퍼를 그대로 복제해 쓰고(태스크를 순서 없이 읽을 수 있어야 한다), 아래 테스트를 담는다:

```java
    @Test
    @DisplayName("계정을 정지하면 204 가 반환되고 대상의 기존 토큰이 무효화되며 감사 로그가 1건 남는다")
    void suspendRevokesTokenAndWritesLog() {
        User target = saveUser("정지대상", UserRole.STUDENT);
        String targetToken = tokenFor(target);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"커뮤니티 신고 3건 누적"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + targetToken)
                .when().get("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        List<AdminUserActionLog> logs = actionLogRepository.findAll();
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getAction()).isEqualTo(AdminUserAction.ACCOUNT_SUSPENDED);
        assertThat(logs.get(0).getReason()).isEqualTo("커뮤니티 신고 3건 누적");
        assertThat(logs.get(0).getActorUserId()).isEqualTo(adminUser.getId());
    }

    @Test
    @DisplayName("이미 정지된 계정을 다시 정지하면 204 를 반환하되 감사 로그를 남기지 않는다")
    void repeatedSuspendIsNoOp() {
        User target = saveUser("중복정지", UserRole.STUDENT);
        suspendVia(target, "1차 사유");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"2차 사유"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(actionLogRepository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("정지를 해제하면 상태가 정상으로 돌아가고 해제 사유가 감사 로그에 남는다")
    void unsuspendWritesLog() {
        User target = saveUser("해제대상", UserRole.STUDENT);
        suspendVia(target, "정지 사유");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"ACTIVE","reason":"이의 제기 수용"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(userRepository.findById(target.getId()).orElseThrow().isActive()).isTrue();
        assertThat(actionLogRepository.findAll())
                .extracting(AdminUserActionLog::getAction)
                .containsExactly(AdminUserAction.ACCOUNT_SUSPENDED, AdminUserAction.ACCOUNT_UNSUSPENDED);
    }

    @Test
    @DisplayName("사유 없이 상태를 변경하면 400 을 반환한다")
    void blankReasonRejected() {
        User target = saveUser("사유누락", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"  "}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("사유가 200자를 넘으면 400 을 반환한다")
    void tooLongReasonRejected() {
        User target = saveUser("사유초과", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"status\":\"SUSPENDED\",\"reason\":\"%s\"}".formatted("가".repeat(201)))
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("관리자가 자기 자신을 정지하려 하면 400 을 반환한다")
    void selfSuspendRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"실수"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", adminUser.getId())
                .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", Matchers.equalTo("SELF_SUSPEND_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("다른 ADMIN 계정을 정지하려 하면 400 을 반환한다")
    void adminSuspendRejected() {
        User otherAdmin = saveUser("다른관리자", UserRole.ADMIN);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"status":"SUSPENDED","reason":"권한 회수"}
                        """)
                .when().patch("/api/v1/admin/users/{userId}/status", otherAdmin.getId())
                .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", Matchers.equalTo("ADMIN_SUSPEND_NOT_ALLOWED"));
    }

    private void suspendVia(User target, String reason) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"status\":\"SUSPENDED\",\"reason\":\"%s\"}".formatted(reason))
                .when().patch("/api/v1/admin/users/{userId}/status", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserStatusControllerTest"
```
Expected: FAIL — 405/404 (엔드포인트 없음)

- [ ] **Step 3: 예외 2종 추가**

`UserException.java`:

```java
    /** 관리자가 자기 계정을 정지하는 것을 막는다 — 자기 자신을 잠그는 사고 방지. */
    public static class SelfSuspendNotAllowedException extends UserException {

        private static final String MESSAGE = "자기 자신의 계정은 정지할 수 없습니다.";

        public SelfSuspendNotAllowedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "SELF_SUSPEND_NOT_ALLOWED");
        }
    }

    /** ADMIN 계정은 정지 대상이 아니다 — 관리자 전원이 잠기는 상황을 구조적으로 배제한다. */
    public static class AdminSuspendNotAllowedException extends UserException {

        private static final String MESSAGE = "관리자 계정은 정지할 수 없습니다.";

        public AdminSuspendNotAllowedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "ADMIN_SUSPEND_NOT_ALLOWED");
        }
    }
```

- [ ] **Step 4: Command DTO와 요청 DTO 작성**

`ChangeUserStatusCommand.java`:

```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.UserStatus;

/** 계정 상태 변경. reason 은 정지·해제 모두 필수다 — 나중에 "왜 풀었는지"가 더 문제가 된다. */
public record ChangeUserStatusCommand(
        Long targetUserId,
        Long actorUserId,
        UserStatus status,
        String reason
) {
}
```

`ChangeUserStatusRequest.java`:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "계정 상태 변경 요청")
public record ChangeUserStatusRequest(
        @Schema(description = "변경할 상태", example = "SUSPENDED")
        @NotNull(message = "변경할 상태는 필수입니다.")
        UserStatus status,

        @Schema(description = "정지·해제 사유(감사 로그에 기록된다)", example = "커뮤니티 신고 3건 누적")
        @NotBlank(message = "사유는 필수입니다.")
        @Size(max = 200, message = "사유는 200자 이하로 입력해주세요.")
        String reason
) {
    public ChangeUserStatusCommand toCommand(Long targetUserId, Long actorUserId) {
        return new ChangeUserStatusCommand(targetUserId, actorUserId, status, reason.trim());
    }
}
```

- [ ] **Step 5: 쓰기 서비스 작성**

`AdminUserCommandService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;

public interface AdminUserCommandService {

    /** 계정 상태를 변경한다. 현재 상태와 같으면 아무것도 하지 않고, 감사 로그도 남기지 않는다. */
    void changeStatus(ChangeUserStatusCommand changeStatusCommand);
}
```

`GeneralAdminUserCommandService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class GeneralAdminUserCommandService implements AdminUserCommandService {

    private final UserRepository userRepository;
    private final AdminUserActionLogRepository adminUserActionLogRepository;
    private final AuthSessionService authSessionService;

    @Override
    public void changeStatus(ChangeUserStatusCommand changeStatusCommand) {
        // 강제 로그아웃과 같은 순서 — token_version lost update 를 막기 위해 행을 잠그고 조회한다.
        User target = userRepository.findByIdForUpdate(changeStatusCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);

        if (changeStatusCommand.status() == UserStatus.SUSPENDED) {
            assertSuspendable(target, changeStatusCommand.actorUserId());
        }

        // 같은 상태로의 재요청은 무동작 — 버튼 연타가 감사 이력을 오염시키지 않게 한다.
        if (target.getStatus() == changeStatusCommand.status()) {
            return;
        }

        if (changeStatusCommand.status() == UserStatus.SUSPENDED) {
            target.suspend();
            // 정지는 즉시 집행이다 — 발급된 토큰을 무효화하고 모든 세션을 폐기한다.
            target.bumpTokenVersion();
            authSessionService.revokeAll(target.getId(), SessionRevokeReason.ADMIN_FORCE);
        } else {
            // 해제는 상태만 되돌린다 — token_version 은 되돌릴 수 없고, 재로그인하면 그만이다.
            target.unsuspend();
        }

        AdminUserAction action = changeStatusCommand.status() == UserStatus.SUSPENDED
                ? AdminUserAction.ACCOUNT_SUSPENDED
                : AdminUserAction.ACCOUNT_UNSUSPENDED;
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                changeStatusCommand.actorUserId(), target.getId(), action, changeStatusCommand.reason()));

        log.info("Admin account status change. actorId={}, targetUserId={}, action={}",
                changeStatusCommand.actorUserId(), target.getId(), action);
    }

    private void assertSuspendable(User target, Long actorUserId) {
        if (target.getId().equals(actorUserId)) {
            throw new UserException.SelfSuspendNotAllowedException();
        }
        if (target.getRole() == UserRole.ADMIN) {
            throw new UserException.AdminSuspendNotAllowedException();
        }
    }
}
```

- [ ] **Step 6: API 인터페이스·컨트롤러에 엔드포인트 추가**

`AdminUserApi.java`:

```java
    @Operation(summary = "계정 상태 변경 (ADMIN)",
            description = "ACTIVE ↔ SUSPENDED. 정지 시 대상의 모든 세션을 폐기하고 token_version 을 올려 "
                    + "발급된 액세스 토큰을 즉시 무효화한다. 사유는 정지·해제 모두 필수이며 감사 로그에 기록된다. "
                    + "현재 상태와 같으면 아무 동작도 하지 않고 204 를 반환한다(감사 로그도 남기지 않는다). "
                    + "자기 자신과 다른 ADMIN 계정은 정지할 수 없다.")
    @PatchMapping("/admin/users/{userId}/status")
    ResponseEntity<ApiResponse<Void>> changeUserStatus(
            @Parameter(description = "대상 사용자 ID", required = true) @PathVariable Long userId,
            @RequestBody @Valid ChangeUserStatusRequest changeUserStatusRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`AdminUserController.java`:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> changeUserStatus(
            @PathVariable Long userId,
            @RequestBody @Valid ChangeUserStatusRequest changeUserStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        adminUserCommandService.changeStatus(
                changeUserStatusRequest.toCommand(userId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserStatusControllerTest"
```
Expected: PASS (7 tests)

- [ ] **Step 8: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/ \
        backend/src/test/java/com/duing/domain/user/controller/AdminUserStatusControllerTest.java
git commit -m "feat(backend): 계정 정지·해제

정지는 즉시 집행이다. 상태를 바꾸는 것과 동시에 대상의 모든 세션을 폐기하고
발급된 토큰을 무효화한다. 강제 로그아웃과 같은 순서로 행을 잠가 동시 요청이
서로의 토큰 버전을 덮어쓰지 않게 했다.

해제는 상태만 되돌린다. 토큰 버전은 되돌릴 수 없고 되돌릴 이유도 없다.

사유는 정지와 해제 모두 필수로 받는다. 나중에 문제가 되는 쪽은 오히려 왜
풀어줬는지다. 같은 상태로 다시 요청이 오면 아무것도 하지 않고 이력도 남기지
않는다. 버튼을 연타했다는 사실이 조치 이력에 쌓일 이유가 없다.

관리자 자신과 다른 관리자 계정은 정지 대상에서 제외해, 관리자 전원이 잠기는
상황이 아예 생길 수 없게 했다."
```

---

### Task 6: 관리자 메모 저장 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/command/UpdateAdminNoteCommand.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/UpdateAdminNoteRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/AdminUserCommandService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralAdminUserCommandService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AdminUserApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AdminUserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AdminUserNoteControllerTest.java`

**Interfaces:**
- Consumes: `User#changeAdminNote`, `AdminUserActionLog.of`, `AdminUserAction.ADMIN_NOTE_UPDATED` (Task 1)
- Produces:
  - `AdminUserCommandService#updateAdminNote(UpdateAdminNoteCommand): void`
  - `UpdateAdminNoteCommand(Long targetUserId, Long actorUserId, String note)`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`AdminUserNoteControllerTest.java` — Task 4 테스트의 헬퍼를 복제해 쓰고:

```java
    @Test
    @DisplayName("관리자 메모를 저장하면 204 가 반환되고 상세 조회에서 다시 읽을 수 있다")
    void saveAndReadBackNote() {
        User target = saveUser("메모대상", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"note":"테스트 계정. 운영 확인 필요."}
                        """)
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .body("data.adminNote", Matchers.equalTo("테스트 계정. 운영 확인 필요."))
                .body("data.adminNoteUpdatedBy", Matchers.equalTo("총동연관리자"));
    }

    @Test
    @DisplayName("메모를 빈 문자열로 저장하면 메모가 비워지고 그 사실도 감사 로그에 남는다")
    void clearingNoteIsAudited() {
        User target = saveUser("메모삭제", UserRole.STUDENT);
        saveNote(target, "지울 메모");

        saveNote(target, "");

        assertThat(userRepository.findById(target.getId()).orElseThrow().getAdminNote()).isEmpty();
        assertThat(actionLogRepository.findAll())
                .hasSize(2)
                .allMatch(log -> log.getAction() == AdminUserAction.ADMIN_NOTE_UPDATED);
    }

    @Test
    @DisplayName("메모 감사 로그에는 메모 본문을 저장하지 않는다")
    void noteBodyNotCopiedIntoAuditLog() {
        User target = saveUser("본문미복제", UserRole.STUDENT);

        saveNote(target, "민감한 내부 메모");

        assertThat(actionLogRepository.findAll())
                .singleElement()
                .satisfies(log -> assertThat(log.getReason()).isNull());
    }

    @Test
    @DisplayName("메모가 1000자를 넘으면 400 을 반환한다")
    void tooLongNoteRejected() {
        User target = saveUser("메모초과", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"note\":\"%s\"}".formatted("가".repeat(1001)))
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("사용자 본인의 프로필 응답에는 관리자 메모가 담기지 않는다")
    void adminNoteNeverLeaksToUserFacingResponse() {
        User target = saveUser("유출확인", UserRole.STUDENT);
        saveNote(target, "내부 전용 메모");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(target))
                .when().get("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.adminNote", Matchers.nullValue())
                .body("data", Matchers.not(Matchers.hasKey("adminNote")));
    }

    private void saveNote(User target, String note) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"note\":\"%s\"}".formatted(note))
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserNoteControllerTest"
```
Expected: FAIL — 405/404

- [ ] **Step 3: Command·요청 DTO 작성**

`UpdateAdminNoteCommand.java`:

```java
package com.duing.domain.user.service.dto.command;

/** 관리자 메모 저장. 빈 문자열은 "메모 비우기"로 그대로 저장한다 — null 은 허용하지 않는다. */
public record UpdateAdminNoteCommand(
        Long targetUserId,
        Long actorUserId,
        String note
) {
}
```

`UpdateAdminNoteRequest.java`:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.UpdateAdminNoteCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "관리자 메모 저장 요청")
public record UpdateAdminNoteRequest(
        @Schema(description = "메모 본문. 비우려면 빈 문자열을 보낸다(null 불가).", example = "테스트 계정")
        @NotNull(message = "메모는 필수입니다. 비우려면 빈 문자열을 보내주세요.")
        @Size(max = 1000, message = "메모는 1000자 이하로 입력해주세요.")
        String note
) {
    public UpdateAdminNoteCommand toCommand(Long targetUserId, Long actorUserId) {
        return new UpdateAdminNoteCommand(targetUserId, actorUserId, note);
    }
}
```

- [ ] **Step 4: 서비스 메서드 추가**

`AdminUserCommandService.java`:

```java
    /** 관리자 메모를 저장한다. 빈 문자열로 비우는 것도 감사 대상 행위라 로그를 남긴다. */
    void updateAdminNote(UpdateAdminNoteCommand updateAdminNoteCommand);
```

`GeneralAdminUserCommandService.java`:

```java
    @Override
    public void updateAdminNote(UpdateAdminNoteCommand updateAdminNoteCommand) {
        User target = userRepository.findById(updateAdminNoteCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        target.changeAdminNote(updateAdminNoteCommand.note());

        // reason 은 null 로 둔다 — 메모 본문을 감사 로그에 복제하면 내부 메모가 두 테이블에 살면서
        // 보존·삭제 정책이 둘로 갈린다. 남기는 것은 "누가 언제 메모를 바꿨다"는 사실뿐이다.
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                updateAdminNoteCommand.actorUserId(), target.getId(),
                AdminUserAction.ADMIN_NOTE_UPDATED, null));
    }
```

- [ ] **Step 5: API 인터페이스·컨트롤러에 엔드포인트 추가**

`AdminUserApi.java`:

```java
    @Operation(summary = "관리자 메모 저장 (ADMIN)",
            description = "회원별 내부 메모를 저장한다. 사용자에게는 절대 노출되지 않는다. "
                    + "빈 문자열을 보내면 메모가 비워지며, 그 사실도 감사 로그에 기록된다. "
                    + "감사 로그에는 메모 본문을 저장하지 않는다.")
    @PutMapping("/admin/users/{userId}/admin-note")
    ResponseEntity<ApiResponse<Void>> updateAdminNote(
            @Parameter(description = "대상 사용자 ID", required = true) @PathVariable Long userId,
            @RequestBody @Valid UpdateAdminNoteRequest updateAdminNoteRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`AdminUserController.java`:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> updateAdminNote(
            @PathVariable Long userId,
            @RequestBody @Valid UpdateAdminNoteRequest updateAdminNoteRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        adminUserCommandService.updateAdminNote(
                updateAdminNoteRequest.toCommand(userId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserNoteControllerTest"
```
Expected: PASS (5 tests)

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/ \
        backend/src/test/java/com/duing/domain/user/controller/AdminUserNoteControllerTest.java
git commit -m "feat(backend): 관리자 메모 저장

회원별 내부 메모를 총동연만 읽고 쓸 수 있게 했다. 사용자 대면 응답에는
어떤 경로로도 담기지 않으며, 이를 테스트로 고정해뒀다.

메모를 비우는 것도 기록한다. 누가 메모를 지웠는지가 오히려 더 중요한
이력이다. 다만 감사 로그에 메모 본문은 넣지 않는다. 넣으면 내부 메모가 두
테이블에 살면서 보존과 삭제 정책이 둘로 갈린다."
```

---

### Task 7: 휴대폰 원본 조회 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/response/AdminUserPhoneResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/AdminUserCommandService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralAdminUserCommandService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AdminUserApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AdminUserController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AdminUserPhoneControllerTest.java`

**Interfaces:**
- Consumes: `AdminUserActionLog.of`, `AdminUserAction.PHONE_VIEW` (Task 1)
- Produces: `AdminUserCommandService#revealPhone(Long targetUserId, Long actorUserId): String`

> **⚠️ 이 엔드포인트는 GET 이지만 쓰기다.** 감사 로그를 INSERT하므로 `AdminUserQueryService`(클래스 레벨 `readOnly = true`)에 두면 안 된다 — H2에서는 통과하고 실제 Postgres에서 500이 난다. `AdminUserCommandService`에 둔다. 통합 테스트는 TestContainers(Postgres)로 반드시 실제 PG 경로를 탄다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`AdminUserPhoneControllerTest.java` — Task 4 헬퍼 복제 + 아래 테스트:

```java
    @Test
    @DisplayName("ADMIN 이 원본 번호를 조회하면 마스킹되지 않은 값이 반환되고 열람 기록이 남는다")
    void revealPhoneWritesAuditLog() {
        User target = saveUser("번호대상", UserRole.STUDENT);

        String phone = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .header(HttpHeaders.CACHE_CONTROL, Matchers.containsString("no-store"))
                .extract().path("data.phone");

        assertThat(phone).isEqualTo(target.getPhone()).doesNotContain("*");
        assertThat(actionLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getAction()).isEqualTo(AdminUserAction.PHONE_VIEW);
                    assertThat(log.getActorUserId()).isEqualTo(adminUser.getId());
                    assertThat(log.getTargetUserId()).isEqualTo(target.getId());
                    // 번호 값 자체는 어디에도 남기지 않는다.
                    assertThat(log.getReason()).isNull();
                });
    }

    @Test
    @DisplayName("원본 번호 열람은 회원 상세의 최근 운영 기록에 나타나지 않는다")
    void phoneViewHiddenFromOperationTimeline() {
        User target = saveUser("열람숨김", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                .then().statusCode(HttpStatus.OK.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then().body("data.recentActions.size()", Matchers.equalTo(0));
    }

    @Test
    @DisplayName("STUDENT 가 원본 번호를 조회하면 403 을 반환한다")
    void studentGetsForbidden() {
        User target = saveUser("권한확인", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/users/{userId}/phone", target.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 회원의 번호를 조회하면 404 를 반환한다")
    void unknownUserReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}/phone", 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserPhoneControllerTest"
```
Expected: FAIL — 404

- [ ] **Step 3: 응답 DTO 작성**

`AdminUserPhoneResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "원본 휴대폰 번호 (ADMIN 전용, 캐시 금지)")
public record AdminUserPhoneResponse(
        @Schema(description = "마스킹되지 않은 원본 번호", example = "010-2210-9983")
        String phone
) {
    public static AdminUserPhoneResponse from(String phone) {
        return new AdminUserPhoneResponse(phone);
    }
}
```

- [ ] **Step 4: 서비스 메서드 추가 (쓰기 서비스에)**

`AdminUserCommandService.java`:

```java
    /**
     * 원본 휴대폰 번호를 조회하고 열람 사실을 감사 로그에 남긴다.
     *
     * <p>GET 으로 노출되지만 감사 로그를 INSERT 하므로 조회가 아니라 쓰기다 — 조회 서비스의
     * readOnly 트랜잭션 안에 두면 실제 Postgres 에서 500 이 난다. 기록과 반환을 같은 트랜잭션에
     * 묶어, 기록이 실패하면 번호도 나가지 않게 한다("감사 없는 개인정보 열람" 방지).
     */
    String revealPhone(Long targetUserId, Long actorUserId);
```

`GeneralAdminUserCommandService.java`:

```java
    @Override
    public String revealPhone(Long targetUserId, Long actorUserId) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(UserException.UserNotFoundException::new);

        adminUserActionLogRepository.save(AdminUserActionLog.of(
                actorUserId, target.getId(), AdminUserAction.PHONE_VIEW, null));

        // 개인정보 원본 열람은 그 자체가 감사 대상 행위다. 번호 값은 절대 로그에 남기지 않는다
        // (회장 경로 GeneralClubMemberQueryService 와 같은 형식·같은 action 키워드).
        log.info("member phone view: actorUserId={}, targetUserId={}, action=PHONE_VIEW",
                actorUserId, target.getId());
        return target.getPhone();
    }
```

- [ ] **Step 5: API 인터페이스·컨트롤러에 엔드포인트 추가**

`AdminUserApi.java`:

```java
    @Operation(summary = "원본 휴대폰 번호 조회 (ADMIN)",
            description = "마스킹되지 않은 번호를 1건 반환한다. 열람 사실은 감사 로그에 기록되며, "
                    + "응답은 캐시하지 않는다(no-store). 목록·상세는 계속 마스킹만 제공한다.")
    @GetMapping("/admin/users/{userId}/phone")
    ResponseEntity<ApiResponse<AdminUserPhoneResponse>> getUserPhone(
            @Parameter(description = "대상 사용자 ID", required = true) @PathVariable Long userId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`AdminUserController.java`:

```java
    @Override
    public ResponseEntity<ApiResponse<AdminUserPhoneResponse>> getUserPhone(
            @PathVariable Long userId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        String phone = adminUserCommandService.revealPhone(userId, currentUser.id());
        // 개인정보 응답이 브라우저·중간 캐시에 남지 않게 한다(회장 번호 조회와 동일한 정책).
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(AdminUserPhoneResponse.from(phone)));
    }
```

- [ ] **Step 6: 테스트 통과 확인 — 실제 Postgres 경로**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminUserPhoneControllerTest"
```
Expected: PASS (4 tests). `cannot execute INSERT in a read-only transaction` 이 나오면 서비스 배치가 잘못된 것이다 — `AdminUserCommandService`에 있는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/ \
        backend/src/test/java/com/duing/domain/user/controller/AdminUserPhoneControllerTest.java
git commit -m "feat(backend): 총동연 원본 휴대폰 번호 조회

회장 전용 번호 조회는 동아리와 멤버십을 기준으로 권한을 확인하기 때문에,
소속이 없을 수도 있는 회원을 다루는 총동연 화면에서는 쓸 수 없었다.
엔드포인트만 별도로 두고 개인정보 조회 정책은 기존과 똑같이 유지한다.
마스킹은 같은 유틸을 쓰고, 응답은 캐시하지 않으며, 열람 사실은 같은 키워드로
서버 로그에 남긴다.

GET 이지만 감사 기록을 남기므로 조회가 아니라 쓰기로 다뤘다. 조회 트랜잭션에
두면 실제 운영 DB 에서만 실패하는 종류의 문제가 되기 때문에, 기록과 번호
반환을 한 트랜잭션에 묶었다. 기록이 실패하면 번호도 나가지 않는다."
```

---

### Task 8: 강제 로그아웃 감사 로그

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java:193-202`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AdminForceLogoutControllerTest.java` (기존 파일에 추가)

**Interfaces:**
- Consumes: `AdminUserActionLogRepository`, `AdminUserActionLog.of`, `AdminUserAction.FORCE_LOGOUT` (Task 1)
- Produces: 없음 (기존 동작에 기록만 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`AdminForceLogoutControllerTest.java`에 추가(`@Autowired AdminUserActionLogRepository actionLogRepository;` 필드도 함께):

```java
    @Test
    @DisplayName("강제 로그아웃하면 작업자와 대상이 담긴 감사 로그가 1건 남는다")
    void forceLogoutWritesAuditLog() {
        User target = saveUser("감사대상", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post("/api/v1/admin/users/{userId}/force-logout", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(actionLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getAction()).isEqualTo(AdminUserAction.FORCE_LOGOUT);
                    assertThat(log.getActorUserId()).isEqualTo(adminUser.getId());
                    assertThat(log.getTargetUserId()).isEqualTo(target.getId());
                    assertThat(log.getReason()).isNull();
                });
    }
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminForceLogoutControllerTest"
```
Expected: FAIL — 로그 0건

- [ ] **Step 3: 기록 추가**

`GeneralUserService.java`에 `private final AdminUserActionLogRepository adminUserActionLogRepository;` 필드를 추가하고, `forceLogout`의 `log.info(...)` 직전에:

```java
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                forceLogoutCommand.actorUserId(), user.getId(), AdminUserAction.FORCE_LOGOUT, null));
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.user.controller.AdminForceLogoutControllerTest"
```
Expected: PASS

- [ ] **Step 5: 전체 백엔드 테스트**

```bash
cd backend && ./gradlew test
```
Expected: 출력에 `BUILD SUCCESSFUL`

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java \
        backend/src/test/java/com/duing/domain/user/controller/AdminForceLogoutControllerTest.java
git commit -m "feat(backend): 강제 로그아웃 감사 로그 기록

지금까지 강제 로그아웃은 서버 로그에만 흔적이 남아 회원 화면에서 조회할 수
없었다. 다른 관리자 조치와 같은 이력에 담아, 이 회원에게 무엇을 했는지 한
자리에서 볼 수 있게 했다."
```

---

**PR-2 완료 지점.** 멈추고 보고한다.

---

# PR-3 — 프론트 기능 구현

> 브랜치: `feat/admin-user-management-fe` (PR-2 브랜치에서 분기)
> **비주얼 리디자인은 이 PR 범위가 아니다.** 기존 레포 스타일(테이블 마크업 + `Pagination` + `ui/sheet.tsx` + `ui/dialog.tsx`)로 기능만 완성한다. 목업의 `CAdmin`/`CKpis`/`CToolbar`/`CTable`/`CTag`/`CPaging`은 레포에 존재하지 않으며 만들지 않는다.

### Task 9: 타입 · API 클라이언트 · 훅

**Files:**
- Modify: `frontend/packages/types/src/admin.ts`
- Modify: `frontend/packages/api/src/client.ts` (타입 선언 `users:` 블록 552-555행, 구현 `users: {` 블록 1416-1425행)
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/admin.ts`
- Modify: `frontend/packages/hooks/src/index.ts`
- Test: `frontend/apps/web/test/admin/admin-user-search-gate.test.ts`

**Interfaces:**
- Consumes: 백엔드 4개 엔드포인트 (Task 3~7)
- Produces:
  - `UserStatus = 'ACTIVE' | 'SUSPENDED'`
  - `AdminUserActionType = 'ACCOUNT_SUSPENDED' | 'ACCOUNT_UNSUSPENDED' | 'FORCE_LOGOUT' | 'ADMIN_NOTE_UPDATED' | 'PHONE_VIEW'`
  - `AdminUserDetail`, `AdminUserClub`, `AdminUserActionLogEntry`
  - `AdminUserSearchParams`에 `q?: string`(선택으로 완화) + `status?: UserStatus`
  - `useAdminUserSearchQuery(params, options?: { allowEmptyQuery?: boolean })`
  - `useAdminUserDetailQuery(userId: number | undefined)`
  - `useAdminUserStatusMutation()` — `mutate({ userId, status, reason })`
  - `useAdminUserNoteMutation()` — `mutate({ userId, note })`
  - `useAdminUserPhoneMutation()` — `mutate(userId)` → `{ phone: string }`
  - `adminQueryKeys.usersDetail(userId)`

- [ ] **Step 1: 타입 추가**

`packages/types/src/admin.ts` — 기존 `AdminUserSearchResult` / `AdminUserSearchParams`를 교체하고 아래를 추가한다:

```ts
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type AdminUserActionType =
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_UNSUSPENDED'
  | 'FORCE_LOGOUT'
  | 'ADMIN_NOTE_UPDATED'
  | 'PHONE_VIEW';

export type AdminUserSearchResult = {
  id: number;
  studentId: string;
  name: string;
  role: UserRole;
  grade: Grade;
  college: College;
  major: string;
  /** 배포 전환기의 구 백엔드 응답에는 없을 수 있다 — 없으면 화면이 뱃지를 렌더하지 않는다. */
  status?: UserStatus;
};

export type AdminUserSearchParams = {
  /** 선택 — 생략하면 전체를 대상으로 한다(정지 회원만 훑는 경로). */
  q?: string;
  status?: UserStatus;
  page?: number;
  size?: number;
  sort?: string;
};

export type AdminUserClub = {
  clubId: number;
  clubName: string;
  role: ClubMemberRole;
  joinedAt: string;
};

export type AdminUserActionLogEntry = {
  action: AdminUserActionType;
  actorName: string | null;
  reason: string | null;
  at: string;
};

export type AdminUserDetail = {
  id: number;
  name: string;
  studentId: string;
  grade: Grade;
  college: College;
  major: string;
  role: UserRole;
  maskedPhone: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  status: UserStatus;
  createdAt: string;
  /** null 이면 "기록 없음" — 기존 회원은 백필하지 않았다. */
  lastLoginAt: string | null;
  adminNote: string | null;
  adminNoteUpdatedAt: string | null;
  adminNoteUpdatedBy: string | null;
  clubs: AdminUserClub[];
  /** 개인정보 열람(PHONE_VIEW)은 서버가 제외하고 내려준다. */
  recentActions: AdminUserActionLogEntry[];
};

export type AdminUserPhone = { phone: string };

export type ChangeUserStatusPayload = { status: UserStatus; reason: string };
export type UpdateAdminNotePayload = { note: string };
```

`ClubMemberRole`이 이 파일에 import 되어 있지 않으면 추가한다. 새 타입은 `packages/types/src/index.ts`의 배럴에도 내보낸다(파일 구조 확인 후 기존 방식에 맞춘다).

- [ ] **Step 2: API 클라이언트 확장**

`packages/api/src/client.ts` 타입 선언부 `users:` 블록(552-555행 부근):

```ts
    users: {
      search(params: AdminUserSearchParams): Promise<PageResponse<AdminUserSearchResult>>;
      detail(userId: number): Promise<AdminUserDetail>;
      changeStatus(userId: number, payload: ChangeUserStatusPayload): Promise<void>;
      updateNote(userId: number, payload: UpdateAdminNotePayload): Promise<void>;
      phone(userId: number): Promise<AdminUserPhone>;
      forceLogout(userId: number): Promise<void>;
    };
```

구현부 `users: {` 블록(1416행 부근) — 기존 `search`/`forceLogout`은 그대로 두고 사이에 추가:

```ts
        detail: (userId) => jsonOk<AdminUserDetail>(http.get(`admin/users/${userId}`)),
        changeStatus: (userId, payload) =>
          jsonVoid(http.patch(`admin/users/${userId}/status`, { json: payload })),
        updateNote: (userId, payload) =>
          jsonVoid(http.put(`admin/users/${userId}/admin-note`, { json: payload })),
        phone: (userId) => jsonOk<AdminUserPhone>(http.get(`admin/users/${userId}/phone`)),
```

`search`는 이미 `cleanParams(params)`를 쓰므로 `q`/`status`가 `undefined`면 자동으로 빠진다 — 수정하지 않는다.

- [ ] **Step 3: 쿼리 키 추가**

`packages/hooks/src/adminQueryKeys.ts`의 `usersSearch` 아래:

```ts
  usersDetail: (userId: number) => [...adminQueryKeys.usersAll, 'detail', userId] as const,
```

- [ ] **Step 4: 실패하는 훅 게이트 테스트 작성**

`frontend/apps/web/test/admin/admin-user-search-gate.test.ts` — 이 레포는 훅 자체를 모킹하지 않으므로, 게이트 판정 로직을 순수 함수로 노출해 검증한다. 먼저 `packages/hooks/src/admin.ts`에 export 할 함수를 테스트한다:

```ts
import { describe, expect, it } from 'vitest';

import { shouldRunAdminUserSearch } from '@duing/hooks';

describe('회원 검색 실행 게이트', () => {
  it('검색어가 있으면 실행한다', () => {
    expect(shouldRunAdminUserSearch('김도윤', undefined)).toBe(true);
  });

  it('검색어가 비어 있고 빈 검색을 허용하지 않으면 실행하지 않는다 — 동아리장 검색 콤보박스가 전체 회원을 쏟아내지 않게 한다', () => {
    expect(shouldRunAdminUserSearch('', undefined)).toBe(false);
    expect(shouldRunAdminUserSearch('   ', undefined)).toBe(false);
  });

  it('빈 검색을 명시적으로 허용하면 검색어가 없어도 실행한다 — 회원 관리 목록 전용', () => {
    expect(shouldRunAdminUserSearch('', { allowEmptyQuery: true })).toBe(true);
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

```bash
cd frontend && pnpm test -- --run admin-user-search-gate
```
Expected: FAIL — `shouldRunAdminUserSearch` is not exported

- [ ] **Step 6: 훅 구현**

`packages/hooks/src/admin.ts`의 `useAdminUserSearchQuery`를 교체하고 새 훅들을 추가한다:

```ts
export type AdminUserSearchOptions = { allowEmptyQuery?: boolean };

/**
 * 검색 실행 여부. 회원 관리 목록은 검색어 없이도 상태 필터만으로 조회해야 하지만,
 * 같은 훅을 쓰는 동아리장 검색 콤보박스는 열자마자 전체 회원을 드롭다운에 쏟아내면 안 된다.
 * 그래서 게이트를 상태 파라미터로 추론하지 않고 호출 측이 명시적으로 연다.
 */
export function shouldRunAdminUserSearch(
  query: string,
  options: AdminUserSearchOptions | undefined,
): boolean {
  return options?.allowEmptyQuery === true || query.trim().length > 0;
}

export function useAdminUserSearchQuery(
  params: AdminUserSearchParams,
  options?: AdminUserSearchOptions,
) {
  const client = useApiClient();
  const trimmedQuery = (params.q ?? '').trim();
  const normalizedParams = { ...params, q: trimmedQuery.length > 0 ? trimmedQuery : undefined };
  return useQuery({
    queryKey: adminQueryKeys.usersSearch(normalizedParams),
    queryFn: () => client.admin.users.search(normalizedParams),
    enabled: shouldRunAdminUserSearch(trimmedQuery, options),
  });
}

export function useAdminUserDetailQuery(userId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.usersDetail(userId ?? -1),
    queryFn: () => client.admin.users.detail(userId as number),
    enabled: userId !== undefined,
  });
}

/** 상태 변경 후 상세와 목록을 함께 무효화한다 — 요구사항의 "목록 즉시 갱신". */
export function useAdminUserStatusMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...payload }: { userId: number } & ChangeUserStatusPayload) =>
      client.admin.users.changeStatus(userId, payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersDetail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersAll });
    },
  });
}

/** 메모 저장은 상세만 무효화한다 — 목록에는 메모가 표시되지 않는다. */
export function useAdminUserNoteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, note }: { userId: number } & UpdateAdminNotePayload) =>
      client.admin.users.updateNote(userId, { note }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersDetail(variables.userId) });
    },
  });
}

/**
 * 원본 번호 조회. GET 이지만 useQuery 가 아니라 useMutation 을 쓴다 — 쿼리로 받으면 원본 번호가
 * React Query 캐시에 gcTime 동안 남아 패널을 닫아도 살아 있다(기존 useMemberPhoneMutation 과 같은 이유).
 */
export function useAdminUserPhoneMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (userId: number) => client.admin.users.phone(userId),
  });
}
```

기존 `useAdminForceLogoutMutation`의 `onSuccess`에 상세 무효화를 더한다 — 강제 로그아웃이 이제 조치 이력에 남기 때문이다:

```ts
    onSuccess: (_result, userId) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersDetail(userId) });
    },
```

`packages/hooks/src/index.ts`의 export 목록에 `shouldRunAdminUserSearch`, `useAdminUserDetailQuery`, `useAdminUserStatusMutation`, `useAdminUserNoteMutation`, `useAdminUserPhoneMutation`을 추가한다.

- [ ] **Step 7: 테스트 통과 + 타입 검사**

```bash
cd frontend && pnpm test -- --run admin-user-search-gate && pnpm typecheck
```
Expected: PASS + 타입 에러 없음. `AdminUsersPage`가 `q: string`을 넘기고 있어 타입이 깨지면 Task 10에서 고친다 — 이 단계에서는 `q`를 선택으로 바꾼 것이 기존 호출부와 호환되는지만 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add frontend/packages/
git commit -m "feat(frontend): 회원 관리 운영 API 타입·클라이언트·훅

회원 상세, 상태 변경, 관리자 메모, 원본 번호 조회를 붙였다.

검색 훅의 실행 게이트가 문제였다. 회원 관리 목록은 검색어 없이도 상태
필터만으로 조회해야 하는데, 같은 훅을 동아리장 검색 콤보박스도 쓰기 때문에
게이트를 그냥 풀면 콤보박스가 열리자마자 전체 회원을 드롭다운에 쏟아낸다.
호출하는 쪽이 빈 검색을 명시적으로 허용하도록 바꿨다.

원본 번호는 조회지만 뮤테이션으로 받는다. 쿼리로 받으면 서버가 캐시 금지
헤더를 보내도 번호가 클라이언트 캐시에 남아 패널을 닫아도 살아 있다."
```

---

### Task 10: 목록 — 상태 필터와 상태 뱃지

**Files:**
- Create: `frontend/apps/web/app/admin/users/_components/UserStatusBadge.tsx`
- Create: `frontend/apps/web/app/admin/users/_components/AdminUserStatusFilter.tsx`
- Modify: `frontend/apps/web/app/admin/users/_components/AdminUsersTable.tsx`
- Modify: `frontend/apps/web/app/admin/users/_pages/AdminUsersPage.tsx`
- Test: `frontend/apps/web/test/admin/admin-users-list.test.tsx`

**Interfaces:**
- Consumes: `useAdminUserSearchQuery(params, { allowEmptyQuery: true })`, `AdminUserSearchResult.status`, `UserStatus` (Task 9)
- Produces:
  - `UserStatusBadge({ status }: { status?: UserStatus })` — `status`가 없으면 `null` 반환
  - `AdminUserStatusFilter({ value, onChange }: { value?: UserStatus; onChange: (next?: UserStatus) => void })`
  - `AdminUsersTable`에 `onOpenDetail: (user: AdminUserSearchResult) => void` prop 추가

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/admin/admin-users-list.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UserStatusBadge } from '@/app/admin/users/_components/UserStatusBadge';
import { AdminUsersTable } from '@/app/admin/users/_components/AdminUsersTable';
import type { AdminUserSearchResult } from '@duing/types';

const baseUser: AdminUserSearchResult = {
  id: 1,
  studentId: '2021118033',
  name: '김도윤',
  role: 'STUDENT',
  grade: 'JUNIOR',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학',
  status: 'ACTIVE',
};

describe('회원 상태 뱃지', () => {
  it('정상 계정은 "정상"으로 표시한다', () => {
    render(<UserStatusBadge status="ACTIVE" />);
    expect(screen.getByText('정상')).toBeInTheDocument();
  });

  it('정지 계정은 "이용 정지"로 표시한다', () => {
    render(<UserStatusBadge status="SUSPENDED" />);
    expect(screen.getByText('이용 정지')).toBeInTheDocument();
  });

  it('상태 값이 없으면 아무것도 렌더하지 않는다 — 구 백엔드 응답에서 전원이 정지로 보이면 안 된다', () => {
    const { container } = render(<UserStatusBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('회원 목록 표', () => {
  it('행의 상세 버튼을 누르면 해당 회원으로 콜백이 호출된다', async () => {
    const onOpenDetail = vi.fn();
    render(
      <AdminUsersTable items={[baseUser]} onOpenDetail={onOpenDetail} onForceLogout={vi.fn()} />,
    );

    screen.getByRole('button', { name: '상세' }).click();
    expect(onOpenDetail).toHaveBeenCalledWith(baseUser);
  });

  it('휴대폰 번호는 목록에 노출하지 않는다', () => {
    render(
      <AdminUsersTable items={[baseUser]} onOpenDetail={vi.fn()} onForceLogout={vi.fn()} />,
    );
    expect(screen.queryByText(/010-/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd frontend && pnpm test -- --run admin-users-list
```
Expected: FAIL — `UserStatusBadge` 모듈 없음

- [ ] **Step 3: 상태 뱃지 컴포넌트 작성**

`frontend/apps/web/app/admin/users/_components/UserStatusBadge.tsx`:

```tsx
import type { UserStatus } from '@duing/types';

const STATUS_STYLE: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: { label: '정상', className: 'bg-sage/10 text-ink' },
  SUSPENDED: { label: '이용 정지', className: 'bg-coral/10 text-coral' },
};

/**
 * 계정 상태 뱃지. 알려진 값일 때만 렌더한다 — 배포 전환기에 status 가 없는 구 백엔드 응답이 오면
 * 뱃지를 생략한다. `status !== 'ACTIVE'` 로 분기하면 그 시기에 전원이 정지로 보인다.
 */
export function UserStatusBadge({ status }: { status?: UserStatus }) {
  const style = status ? STATUS_STYLE[status] : undefined;
  if (!style) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}
```

- [ ] **Step 4: 상태 필터 컴포넌트 작성**

`frontend/apps/web/app/admin/users/_components/AdminUserStatusFilter.tsx`:

```tsx
'use client';

import type { UserStatus } from '@duing/types';

const OPTIONS: { label: string; value?: UserStatus }[] = [
  { label: '전체', value: undefined },
  { label: '정상', value: 'ACTIVE' },
  { label: '이용 정지', value: 'SUSPENDED' },
];

type Props = {
  value?: UserStatus;
  onChange: (next?: UserStatus) => void;
};

export function AdminUserStatusFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="계정 상태 필터">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              selected
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-charcoal-2 hover:bg-graysoft'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: 목록 표에 상세 버튼·상태 컬럼 추가**

`AdminUsersTable.tsx`를 교체한다:

```tsx
'use client';

import type { AdminUserSearchResult, UserRole } from '@duing/types';

import { MemberIdentity } from '../../_components/MemberIdentity';
import { UserStatusBadge } from './UserStatusBadge';

const USER_ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: '학생',
  ADMIN: '관리자',
};

type Props = {
  items: AdminUserSearchResult[];
  onOpenDetail: (user: AdminUserSearchResult) => void;
  onForceLogout: (user: AdminUserSearchResult) => void;
};

export function AdminUsersTable({ items, onOpenDetail, onForceLogout }: Props) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-charcoal-3 text-[13px]">조회 결과가 없습니다</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>회원</Th>
            <Th>역할</Th>
            <Th>상태</Th>
            <Th>조치</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <tr
              key={user.id}
              className={`border-t border-line hover:bg-graysoft/50 ${
                user.status === 'SUSPENDED' ? 'bg-coral/[0.04]' : ''
              }`}
            >
              <Td>
                <MemberIdentity user={user} />
              </Td>
              {/* 배포 전환기의 미지 role 값도 빈 셀 대신 원문으로 노출한다(fail-open) */}
              <Td>{USER_ROLE_LABEL[user.role] ?? user.role}</Td>
              <Td>
                <UserStatusBadge status={user.status} />
              </Td>
              <Td>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(user)}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:bg-graysoft"
                  >
                    상세
                  </button>
                  <button
                    type="button"
                    onClick={() => onForceLogout(user)}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-coral transition-colors hover:bg-coral/5"
                  >
                    강제 로그아웃
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
```

- [ ] **Step 6: 페이지에 필터 연결 + 무검색 조회 허용**

`AdminUsersPage.tsx`에서:
- `const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>(undefined);` 추가
- `const [detailUserId, setDetailUserId] = useState<number | null>(null);` 추가 (Task 11에서 사용)
- 검색 호출을 교체:

```tsx
  const searchQuery = useAdminUserSearchQuery(
    { q: debouncedQuery, status: statusFilter, page, size: PAGE_SIZE },
    { allowEmptyQuery: true },
  );
```

- `hasQuery` 분기(검색어 없을 때 안내 문구만 띄우던 블록)를 제거하고 항상 표를 렌더한다. 상태 필터 변경 시 `setPage(0)`.
- 헤더 설명 문구를 바꾼다: `학번 또는 이름으로 회원을 찾고, 계정 상태 변경·강제 로그아웃 등 운영 조치를 처리합니다.`
- 검색 입력 옆에 `<AdminUserStatusFilter value={statusFilter} onChange={(next) => { setStatusFilter(next); setPage(0); }} />` 배치
- `<AdminUsersTable ... onOpenDetail={(user) => setDetailUserId(user.id)} />`

- [ ] **Step 7: 테스트 통과 + 린트·타입 검사**

```bash
cd frontend && pnpm test -- --run admin-users-list && pnpm typecheck && pnpm lint
```
Expected: PASS, 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/admin/users/ frontend/apps/web/test/admin/admin-users-list.test.tsx
git commit -m "feat(frontend): 회원 목록 상태 필터와 상태 뱃지

검색어를 입력해야만 목록이 보이던 화면을, 들어가자마자 최근 가입순으로
보이고 상태로 걸러볼 수 있게 바꿨다. 정지시킨 회원을 다시 찾을 방법이
없었던 문제가 여기서 풀린다.

상태 뱃지는 알려진 값일 때만 그린다. 배포 전환기에 상태를 모르는 응답이
오면 뱃지를 생략하는데, 반대로 짜면 그 시기에 회원 전원이 정지로 보인다.

휴대폰 번호는 목록에 넣지 않았다. 가장 많이 열리는 화면이라 노출 범위를
넓히지 않고, 이름과 학번으로 식별은 충분하다."
```

---

### Task 11: 회원 상세 Sheet

**Files:**
- Create: `frontend/apps/web/app/admin/users/_components/AdminUserDetailSheet.tsx`
- Create: `frontend/apps/web/app/admin/users/_lib/userActionLabels.ts`
- Modify: `frontend/apps/web/app/admin/users/_pages/AdminUsersPage.tsx`
- Test: `frontend/apps/web/test/admin/admin-user-detail-sheet.test.tsx`

**Interfaces:**
- Consumes: `useAdminUserDetailQuery`, `useAdminUserPhoneMutation`, `AdminUserDetail`, `UserStatusBadge` (Task 9, 10)
- Produces:
  - `ADMIN_USER_ACTION_LABEL: Record<AdminUserActionType, string>`
  - `AdminUserDetailSheet({ userId, onClose, onSuspend, onUnsuspend, onForceLogout })` — 정지·해제·강제 로그아웃은 `(detail: AdminUserDetail) => void` 콜백으로 페이지에 위임한다(Dialog는 Task 12). 메모 저장과 번호 조회는 Sheet 안에서 끝낸다
  - `AdminUserDetailSheetContent({ detail, revealedPhone, isRevealingPhone, isSavingNote, onRevealPhone, onSaveNote, onSuspend, onUnsuspend, onForceLogout, onClose })` — 데이터 패칭 없는 순수 표시 컴포넌트(테스트 대상)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/admin/admin-user-detail-sheet.test.tsx` — 이 레포는 TanStack Query 내부를 모킹하지 않으므로, 표시 로직을 순수 함수/프레젠테이션 컴포넌트로 분리해 검증한다. Sheet 본문을 `AdminUserDetailSheetContent`로 분리하고 상세 데이터를 prop 으로 받게 한다:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminUserDetailSheetContent } from '@/app/admin/users/_components/AdminUserDetailSheet';
import type { AdminUserDetail } from '@duing/types';

const detail: AdminUserDetail = {
  id: 12,
  name: '정우진',
  studentId: '2023118902',
  grade: 'SOPHOMORE',
  college: 'IT_ENGINEERING',
  major: '전자공학과',
  role: 'STUDENT',
  maskedPhone: '010-****-9983',
  phoneVerified: true,
  phoneVerifiedAt: '2024-03-04T01:00:00Z',
  status: 'SUSPENDED',
  createdAt: '2024-03-04T01:00:00Z',
  lastLoginAt: null,
  adminNote: '신고 누적으로 정지',
  adminNoteUpdatedAt: '2026-07-24T05:02:00Z',
  adminNoteUpdatedBy: '김운영',
  clubs: [{ clubId: 3, clubName: '두잉코드', role: 'LEADER', joinedAt: '2023-03-02T01:00:00Z' }],
  recentActions: [
    { action: 'ACCOUNT_SUSPENDED', actorName: '김운영', reason: '신고 3건', at: '2026-07-25T05:00:00Z' },
  ],
};

const noop = vi.fn();
const props = {
  detail,
  onClose: noop,
  onSuspend: noop,
  onUnsuspend: noop,
  onForceLogout: noop,
  onSaveNote: noop,
  onRevealPhone: noop,
  revealedPhone: null,
  isRevealingPhone: false,
  isSavingNote: false,
};

describe('회원 상세 Sheet', () => {
  it('마지막 로그인 기록이 없으면 "기록 없음"으로 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
  });

  it('휴대폰은 마스킹된 값으로 표시하고 원본은 버튼을 눌러야 조회한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('010-****-9983')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '번호 확인' })).toBeInTheDocument();
  });

  it('원본 번호를 조회하면 마스킹 대신 원본을 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} revealedPhone="010-2210-9983" />);
    expect(screen.getByText('010-2210-9983')).toBeInTheDocument();
  });

  it('휴대폰 인증 여부를 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
  });

  it('가입 동아리를 역할과 함께 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('두잉코드')).toBeInTheDocument();
    expect(screen.getByText('LEADER')).toBeInTheDocument();
  });

  it('메모 최종 수정 작업자를 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText(/김운영/)).toBeInTheDocument();
  });

  it('조치 이력을 사유와 함께 보여준다 — 사유가 어디에도 안 보이면 필수로 받는 의미가 없다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('계정 정지')).toBeInTheDocument();
    expect(screen.getByText(/신고 3건/)).toBeInTheDocument();
  });

  it('정지된 계정에는 해제 버튼을 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정 정지' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd frontend && pnpm test -- --run admin-user-detail-sheet
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 액션 라벨 맵 작성**

`frontend/apps/web/app/admin/users/_lib/userActionLabels.ts`:

```ts
import type { AdminUserActionType } from '@duing/types';

/** PHONE_VIEW 는 서버가 조치 이력에서 제외해 내려주지만, 라벨은 완전성을 위해 함께 둔다. */
export const ADMIN_USER_ACTION_LABEL: Record<AdminUserActionType, string> = {
  ACCOUNT_SUSPENDED: '계정 정지',
  ACCOUNT_UNSUSPENDED: '계정 정지 해제',
  FORCE_LOGOUT: '강제 로그아웃',
  ADMIN_NOTE_UPDATED: '관리자 메모 수정',
  PHONE_VIEW: '원본 번호 열람',
};
```

- [ ] **Step 4: Sheet 구현**

`AdminUserDetailSheet.tsx` — 컨테이너(데이터 패칭)와 `AdminUserDetailSheetContent`(순수 표시)로 나눈다:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAdminUserDetailQuery, useAdminUserNoteMutation, useAdminUserPhoneMutation } from '@duing/hooks';
import type { AdminUserDetail } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ADMIN_USER_ACTION_LABEL } from '../_lib/userActionLabels';
import { UserStatusBadge } from './UserStatusBadge';

const NOTE_MAX_LENGTH = 1000;

/** 절대시각(ISO)을 한국 표기로. 값이 없으면 호출 측이 "기록 없음" 등 자체 문구를 쓴다. */
function formatDateTime(isoOrNull: string | null): string | null {
  if (!isoOrNull) return null;
  return new Date(isoOrNull).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(isoOrNull: string | null): string | null {
  if (!isoOrNull) return null;
  return new Date(isoOrNull).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

type ContentProps = {
  detail: AdminUserDetail;
  revealedPhone: string | null;
  isRevealingPhone: boolean;
  isSavingNote: boolean;
  onRevealPhone: () => void;
  onSaveNote: (note: string) => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onForceLogout: () => void;
  onClose: () => void;
};

export function AdminUserDetailSheetContent({
  detail,
  revealedPhone,
  isRevealingPhone,
  isSavingNote,
  onRevealPhone,
  onSaveNote,
  onSuspend,
  onUnsuspend,
  onForceLogout,
}: ContentProps) {
  const [note, setNote] = useState(detail.adminNote ?? '');

  // 다른 회원으로 패널이 바뀌면 메모 입력값을 그 회원 것으로 다시 시드한다.
  useEffect(() => {
    setNote(detail.adminNote ?? '');
  }, [detail.id, detail.adminNote]);

  const noteUpdatedAt = formatDateTime(detail.adminNoteUpdatedAt);
  const lastLoginAt = formatDateTime(detail.lastLoginAt);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sage/15 text-[18px] font-bold text-ink">
          {detail.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-ink">{detail.name}</span>
            <UserStatusBadge status={detail.status} />
          </div>
          <p className="mt-0.5 text-[12px] text-charcoal-3">{detail.studentId}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SectionLabel>계정 · 조회 전용</SectionLabel>
        <dl className="grid grid-cols-2 gap-2">
          <Field label="휴대폰 번호" span2>
            <span className="inline-flex items-center gap-2">
              {revealedPhone ?? detail.maskedPhone}
              {revealedPhone === null && (
                <button
                  type="button"
                  onClick={onRevealPhone}
                  disabled={isRevealingPhone}
                  className="rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
                >
                  {isRevealingPhone && <ButtonSpinner />}번호 확인
                </button>
              )}
            </span>
          </Field>
          <Field label="휴대폰 인증">{detail.phoneVerified ? '인증 완료' : '미인증'}</Field>
          <Field label="소속 학과">{detail.major || '미입력'}</Field>
          <Field label="가입일">{formatDate(detail.createdAt) ?? '-'}</Field>
          <Field label="마지막 로그인">{lastLoginAt ?? '기록 없음'}</Field>
        </dl>

        <SectionLabel className="mt-6">가입 동아리 · {detail.clubs.length}개</SectionLabel>
        {detail.clubs.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">가입한 동아리가 없습니다</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.clubs.map((club) => (
              <li key={club.clubId}>
                <Link
                  href={`/admin/clubs/${club.clubId}`}
                  className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors hover:bg-graysoft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">{club.clubName}</span>
                    <span className="block text-[11.5px] text-charcoal-3">
                      가입 {formatDate(club.joinedAt) ?? '-'}
                    </span>
                  </span>
                  <span className="rounded-full bg-graysoft px-2 py-0.5 text-[11px] font-semibold text-charcoal-2">
                    {club.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <SectionLabel className="mt-6">관리자 메모 · 사용자 비공개</SectionLabel>
        <textarea
          aria-label="관리자 메모"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => setNote(event.target.value)}
          placeholder="이 회원에 대한 내부 메모를 남겨주세요"
          className="min-h-[84px] w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-[13px] text-charcoal placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-charcoal-3">
            {noteUpdatedAt ? `최종 수정 ${noteUpdatedAt} · ${detail.adminNoteUpdatedBy}` : ''}
          </span>
          <button
            type="button"
            onClick={() => onSaveNote(note)}
            disabled={isSavingNote}
            className="btn btn-sm btn-ghost disabled:opacity-50"
          >
            {isSavingNote && <ButtonSpinner />}메모 저장
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-coral/30 bg-coral/[0.05]">
          <p className="border-b border-coral/20 px-4 py-2.5 text-[12.5px] font-bold text-coral">위험 작업</p>
          <div className="flex flex-col gap-3 p-4">
            <DangerRow
              title="강제 로그아웃"
              description="모든 활성 세션을 즉시 종료합니다. 계정 상태는 유지됩니다."
              actionLabel="로그아웃"
              onAction={onForceLogout}
            />
            {detail.status === 'ACTIVE' ? (
              <DangerRow
                title="계정 정지"
                description="세션을 종료하고 로그인·API 접근을 차단합니다."
                actionLabel="계정 정지"
                onAction={onSuspend}
              />
            ) : (
              <DangerRow
                title="계정 정지 해제"
                description="다시 정상적으로 로그인할 수 있게 합니다."
                actionLabel="정지 해제"
                onAction={onUnsuspend}
              />
            )}
          </div>
        </div>

        <SectionLabel className="mt-6">최근 운영 기록</SectionLabel>
        {detail.recentActions.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">기록이 없습니다</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {detail.recentActions.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="border-l-2 border-line pl-3">
                <p className="text-[12.5px] font-semibold text-ink">
                  {ADMIN_USER_ACTION_LABEL[entry.action] ?? entry.action}
                </p>
                {/* 사유를 필수로 받으면서 어디에도 보여주지 않으면 받는 의미가 없다. */}
                {entry.reason && <p className="mt-0.5 text-[12px] text-charcoal-2">{entry.reason}</p>}
                <p className="mt-0.5 text-[11px] text-charcoal-3">
                  {entry.actorName ?? '알 수 없음'} · {formatDateTime(entry.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const SectionLabel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`mb-2.5 text-[12px] font-bold text-charcoal-2 ${className}`}>{children}</p>
);

const Field = ({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) => (
  <div className={`rounded-xl border border-line bg-cream px-3 py-2 ${span2 ? 'col-span-2' : ''}`}>
    <dt className="text-[10.5px] text-charcoal-3">{label}</dt>
    <dd className="mt-0.5 text-[12.5px] font-semibold text-ink">{children}</dd>
  </div>
);

const DangerRow = ({
  title, description, actionLabel, onAction,
}: { title: string; description: string; actionLabel: string; onAction: () => void }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1">
      <p className="text-[13px] font-bold text-coral">{title}</p>
      <p className="mt-0.5 text-[11.5px] text-coral/80">{description}</p>
    </div>
    <button
      type="button"
      onClick={onAction}
      className="shrink-0 rounded-lg border border-coral/40 bg-paper px-3 py-1.5 text-[12.5px] font-bold text-coral transition-colors hover:bg-coral/5"
    >
      {actionLabel}
    </button>
  </div>
);

type Props = {
  userId: number;
  onClose: () => void;
  onSuspend: (detail: AdminUserDetail) => void;
  onUnsuspend: (detail: AdminUserDetail) => void;
  onForceLogout: (detail: AdminUserDetail) => void;
};

export function AdminUserDetailSheet({ userId, onClose, onSuspend, onUnsuspend, onForceLogout }: Props) {
  const { addToast } = useToast();
  const detailQuery = useAdminUserDetailQuery(userId);
  const revealPhone = useAdminUserPhoneMutation();
  const saveNote = useAdminUserNoteMutation();

  // 원본 번호는 컴포넌트 로컬 상태에만 둔다 — 패널을 닫으면 함께 사라진다(React Query 캐시에 남기지 않는다).
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);

  useEffect(() => {
    setRevealedPhone(null);
  }, [userId]);

  const detail = detailQuery.data;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-[460px] overflow-hidden px-5 py-5">
        <SheetHeader className="sr-only">
          <SheetTitle>회원 상세</SheetTitle>
        </SheetHeader>

        {detailQuery.isLoading && <ListRowsSkeleton rows={6} rowClassName="h-12 rounded-md" label="회원 상세 불러오는 중" />}
        {detailQuery.isError && (
          <p className="py-12 text-center text-[13px] text-coral">회원 정보를 불러오지 못했습니다.</p>
        )}
        {detail && (
          <AdminUserDetailSheetContent
            detail={detail}
            revealedPhone={revealedPhone}
            isRevealingPhone={revealPhone.isPending}
            isSavingNote={saveNote.isPending}
            onRevealPhone={() =>
              revealPhone.mutate(userId, {
                onSuccess: (result) => setRevealedPhone(result.phone),
                onError: () => addToast('번호를 불러오지 못했어요.', { variant: 'error' }),
              })
            }
            onSaveNote={(note) =>
              saveNote.mutate(
                { userId, note },
                {
                  onSuccess: () => addToast('메모를 저장했어요.'),
                  onError: () => addToast('메모 저장에 실패했어요.', { variant: 'error' }),
                },
              )
            }
            onSuspend={() => onSuspend(detail)}
            onUnsuspend={() => onUnsuspend(detail)}
            onForceLogout={() => onForceLogout(detail)}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
```

`ui/sheet.tsx`가 내보내는 이름(`Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`, `side` prop 지원 여부)을 먼저 확인하고 다르면 맞춘다:
```bash
cd frontend && grep -n "^export\|side" apps/web/components/ui/sheet.tsx | head -20
```
기존 사용 전례는 `apps/web/app/admin/facility-bookings/submission/_components/SubmissionDetailSheet.tsx` 이다.

- [ ] **Step 5: 페이지에 Sheet 연결**

`AdminUsersPage.tsx`에서 `detailUserId !== null`일 때 `<AdminUserDetailSheet userId={detailUserId} onClose={() => setDetailUserId(null)} ... />`를 렌더한다. 조치 콜백은 Task 12에서 Dialog에 연결하므로 우선 상태만 끌어올린다.

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd frontend && pnpm test -- --run admin-user-detail-sheet && pnpm typecheck
```
Expected: PASS (8 tests)

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/admin/users/ frontend/apps/web/test/admin/admin-user-detail-sheet.test.tsx
git commit -m "feat(frontend): 회원 상세 패널

한 회원을 판단하는 데 필요한 것들을 한 화면에 모았다. 가입 정보와 인증
여부, 소속 동아리와 역할, 내부 메모, 그리고 지금까지 취한 조치 이력이
함께 보인다. 동아리는 관리 화면으로 바로 넘어갈 수 있다.

휴대폰은 마스킹된 값을 보여주고 버튼을 눌러야 원본을 가져온다. 가져온
번호는 패널을 닫으면 사라진다.

조치 이력에는 사유를 함께 표시한다. 사유를 필수로 받으면서 어디에도 보여
주지 않으면 받는 의미가 없다."
```

---

### Task 12: 상태 변경 Dialog와 조치 연결

**Files:**
- Create: `frontend/apps/web/app/admin/users/_components/AdminUserStatusDialog.tsx`
- Modify: `frontend/apps/web/app/admin/users/_pages/AdminUsersPage.tsx`
- Test: `frontend/apps/web/test/admin/admin-user-status-dialog.test.tsx`

**Interfaces:**
- Consumes: `useAdminUserStatusMutation`, `AdminUserDetail` (Task 9, 11)
- Produces: `AdminUserStatusDialog({ detail, nextStatus, isPending, onConfirm, onCancel })` — `onConfirm(reason: string)`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/admin/admin-user-status-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminUserStatusDialog } from '@/app/admin/users/_components/AdminUserStatusDialog';
import type { AdminUserDetail } from '@duing/types';

const detail = {
  id: 12,
  name: '정우진',
  studentId: '2023118902',
  status: 'ACTIVE',
  clubs: [{ clubId: 3, clubName: '두잉코드', role: 'LEADER', joinedAt: '2023-03-02T01:00:00Z' }],
} as AdminUserDetail;

describe('계정 상태 변경 확인 다이얼로그', () => {
  it('사유가 비어 있으면 확인 버튼을 누를 수 없다', () => {
    render(
      <AdminUserStatusDialog
        detail={detail}
        nextStatus="SUSPENDED"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '계정 정지' })).toBeDisabled();
  });

  it('사유를 입력하면 확인 버튼이 활성화되고 사유와 함께 확정된다', () => {
    const onConfirm = vi.fn();
    render(
      <AdminUserStatusDialog
        detail={detail}
        nextStatus="SUSPENDED"
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('정지 사유'), {
      target: { value: '커뮤니티 신고 3건 누적' },
    });
    fireEvent.click(screen.getByRole('button', { name: '계정 정지' }));

    expect(onConfirm).toHaveBeenCalledWith('커뮤니티 신고 3건 누적');
  });

  it('대상이 동아리 회장이면 경고를 표시하되 정지를 막지는 않는다', () => {
    render(
      <AdminUserStatusDialog
        detail={detail}
        nextStatus="SUSPENDED"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/두잉코드 동아리의 회장/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 정지' })).toBeInTheDocument();
  });

  it('사유는 감사 로그에 기록된다고 안내한다 — 관리자 메모에 남는다고 오해시키지 않는다', () => {
    render(
      <AdminUserStatusDialog
        detail={detail}
        nextStatus="SUSPENDED"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/감사 로그에 기록됩니다/)).toBeInTheDocument();
    expect(screen.queryByText(/관리자 메모에 기록/)).not.toBeInTheDocument();
  });

  it('해제할 때도 사유를 필수로 받는다', () => {
    render(
      <AdminUserStatusDialog
        detail={{ ...detail, status: 'SUSPENDED' }}
        nextStatus="ACTIVE"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('정지 해제 사유')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd frontend && pnpm test -- --run admin-user-status-dialog
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Dialog 구현**

`AdminUserStatusDialog.tsx` — `AdminForceLogoutDialog.tsx`의 구조(`onPointerDownOutside` 차단, `isPending` 중 닫기 방지)를 그대로 따른다:

```tsx
'use client';

import { useState } from 'react';

import type { AdminUserDetail, UserStatus } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const REASON_MAX_LENGTH = 200;

type Props = {
  detail: AdminUserDetail;
  nextStatus: UserStatus;
  isPending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function AdminUserStatusDialog({ detail, nextStatus, isPending, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  const isSuspending = nextStatus === 'SUSPENDED';
  const reasonLabel = isSuspending ? '정지 사유' : '정지 해제 사유';
  const confirmLabel = isSuspending ? '계정 정지' : '정지 해제';
  const trimmedReason = reason.trim();
  // 회장을 정지시켜야 할 상황 자체가 있을 수 있다 — 경고만 하고 막지 않는다(회장 교체는 별도 기능).
  const leaderClub = detail.clubs.find((club) => club.role === 'LEADER');

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isPending) onCancel(); }}>
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => { if (isPending) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{isSuspending ? '계정을 정지할까요?' : '정지를 해제할까요?'}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{detail.name}</span> ({detail.studentId}){' '}
            {isSuspending
              ? '회원의 모든 세션이 즉시 종료되고, 이후 로그인·API 접근이 차단됩니다.'
              : '회원이 다시 정상적으로 로그인할 수 있게 됩니다.'}
          </DialogDescription>
        </DialogHeader>

        {isSuspending && leaderClub && (
          <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
            이 회원은 {leaderClub.clubName} 동아리의 회장입니다. 계정을 정지하면 해당 동아리 운영에 영향이 있을
            수 있습니다.
          </p>
        )}

        <div>
          <label htmlFor="status-reason" className="mb-1.5 block text-[12.5px] font-semibold text-charcoal-2">
            {reasonLabel}
          </label>
          <textarea
            id="status-reason"
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="예) 커뮤니티 신고 3건 누적"
            className="min-h-[72px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-charcoal-3">
            {/* 사유는 관리자 메모가 아니라 감사 로그로 간다 — 둘은 별개의 저장소다. */}
            <span>입력한 사유는 감사 로그에 기록됩니다.</span>
            <span>
              {trimmedReason.length}/{REASON_MAX_LENGTH}
            </span>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmedReason)}
            disabled={isPending || trimmedReason.length === 0}
            className={`btn btn-sm text-paper transition-colors disabled:opacity-50 ${
              isSuspending ? 'bg-coral hover:bg-[#c2603f]' : 'bg-ink hover:bg-ink/90'
            }`}
          >
            {isPending && <ButtonSpinner />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 페이지에서 조치 연결**

`AdminUsersPage.tsx`:
- `const [statusTarget, setStatusTarget] = useState<{ detail: AdminUserDetail; nextStatus: UserStatus } | null>(null);`
- `const changeStatus = useAdminUserStatusMutation();`
- Sheet 의 `onSuspend` / `onUnsuspend` 콜백이 `setStatusTarget(...)` 을 호출
- 확정 시:

```tsx
  const handleStatusConfirm = (reason: string) => {
    if (!statusTarget) return;
    changeStatus.mutate(
      { userId: statusTarget.detail.id, status: statusTarget.nextStatus, reason },
      {
        onSuccess: () => {
          addToast(
            statusTarget.nextStatus === 'SUSPENDED'
              ? '계정을 정지했어요. 대상 회원의 모든 기기가 로그아웃됩니다.'
              : '계정 정지를 해제했어요. 다시 로그인할 수 있습니다.',
          );
          setStatusTarget(null);
        },
        onError: (error) => addToast(statusErrorMessage(error), { variant: 'error' }),
      },
    );
  };
```

`statusErrorMessage`는 기존 `forceLogoutErrorMessage`와 같은 형태로 작성한다(`ApiError`/`Error`면 메시지, 아니면 기본 문구 `계정 상태 변경에 실패했어요. 잠시 후 다시 시도해주세요.`).

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd frontend && pnpm test -- --run admin-user-status-dialog
```
Expected: PASS (5 tests)

- [ ] **Step 6: 전체 프론트 검증**

```bash
cd frontend && pnpm test && pnpm typecheck && pnpm lint && pnpm build
```
Expected: 전부 통과. `build`까지 도는 이유는 CI가 build 를 포함하기 때문이다.

- [ ] **Step 7: 실브라우저 확인**

```bash
cd frontend && pnpm dev > /tmp/duing-dev.log 2>&1 &
```
로그 파일에서 `Local:` 포트가 3000인지 확인한다(파이프로 띄우면 서버가 죽으므로 파일 리다이렉트를 쓴다). ADMIN 계정으로 `/admin/users`에 들어가 확인:
- 검색어 없이 목록이 보이고 상태 필터가 동작한다
- 상세 Sheet 가 열리고 마지막 로그인·인증 여부·동아리·메모·조치 이력이 표시된다
- `번호 확인` 후 Sheet 를 닫았다 다시 열면 마스킹 상태로 돌아온다
- 정지 확인 다이얼로그에서 사유 없이는 확인 버튼이 눌리지 않는다

확인이 끝나면 dev 서버를 정리한다 — 부모 프로세스 → 워커(`next-server`) → 포트 순으로 종료하고, `pkill -f "next dev"` 만으로는 워커가 남는다.

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/admin/users/ frontend/apps/web/test/admin/
git commit -m "feat(frontend): 계정 정지·해제 확인 다이얼로그

정지와 해제 모두 사유를 입력해야 확정할 수 있게 했다. 입력한 사유가
관리자 메모가 아니라 감사 로그로 간다는 점을 안내 문구에 명확히 적었다.
둘은 성격이 다른 저장소다.

대상이 동아리 회장이면 경고를 띄우되 막지는 않는다. 회장을 정지시켜야 할
상황 자체가 있을 수 있고, 회장 교체는 별도 기능이 이미 있다."
```

---

**PR-3 완료 지점.** 멈추고 보고한다.

---

## 후속 (이 계획 범위 밖)

PR-4(리디자인 + KPI/집계 API + 운영 기록 접기)는 스펙의 해당 섹션을 참조해 별도 계획으로 작성한다. 이 계획은 **기능 완성까지만** 다룬다.
