# 회비 관리 시스템 Sprint 1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 단위 회비 정책·청구(수동 멱등 발행)·조회 기능을 백엔드 API와 프론트 화면으로 구현한다.

**Architecture:** 백엔드는 기존 DDD 레이어(`domain/fee/{api,controller,service,repository,entity,exception}`)에 `FeePolicy`·`FeeBill` 두 애그리거트를 추가한다. 권한은 `ClubAuthService.requireManager`로 클럽 운영진(LEADER/OFFICER)을 강제하고, 청구 발행은 `uk_fee_bill_idem` 유니크 인덱스로 멱등성을 보장한다. 프론트는 기존 `/manage/clubs/[clubId]` 서브라우트에 `fees` 페이지(2탭)와 `/me/fees`를 추가하고 `packages/{types,api,hooks,schemas}`로 배선한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA · QueryDSL · Flyway / RestAssured · Testcontainers · Fixture Monkey · Next.js 15 / React 19 / TanStack Query · Zod · React Hook Form · Vitest

**참고 설계서:** `docs/superpowers/specs/2026-06-16-fee-system-sprint1-design.md`

---

## 실행 규율 (모든 Task 공통)

- **브랜치:** 각 Task = `develop`에서 분기한 1브랜치 = 1PR. 브랜치명 `feat/{설명}`. **subagent 구현 시 push·PR 생성 금지** — 구현+테스트까지만, PR은 사용자 지시 후 메인 세션에서.
- **커밋 메시지:** Conventional Commits 한국어 (`feat(backend): ...`, `test(backend): ...`, `feat(frontend): ...`). `[#이슈번호]` 형식·`Co-Authored-By`·`🤖 Generated` 라인 금지.
- **리뷰:** 각 Task 구현 후 `duing-code-reviewer` + `codex:review` 기본. 이 기능은 **권한·상태전이·동시성·데이터무결성·Migration·API contract**에 모두 해당하므로 BE Task는 **`codex:adversarial-review` 추가 필수**.
- **백엔드 필수 순서(도메인 규칙):** 마이그레이션 → `api/` Swagger 인터페이스 → `controller/` → `service/` + command/query DTO → `repository/` → 테스트.
- **금지:** 기존 Flyway 파일 수정(새 파일만), 엔티티 물리 삭제, `api/` 인터페이스 없는 컨트롤러, 시크릿 하드코딩, 의사코드, `any`/`as`(프론트).

---

## File Structure

### 백엔드 (`backend/src/main/java/com/duing/`)
```
domain/fee/
├── entity/
│   ├── FeePolicy.java          # 정책 애그리거트 (clubId, name, amount, billingType, active)
│   ├── FeeBill.java            # 청구 애그리거트 (clubId, userId, feePolicyId, amount, 기간, dueDate, status)
│   ├── BillingType.java        # MONTHLY/SEMESTER/YEARLY/ONE_TIME
│   └── FeeStatus.java          # PENDING/PAID/PARTIAL_PAID/OVERDUE/CANCELLED
├── repository/
│   ├── FeePolicyRepository.java
│   ├── FeeBillRepository.java
│   ├── FeeBillRepositoryCustom.java
│   └── FeeBillRepositoryImpl.java   # QueryDSL 동적 필터
├── service/
│   ├── FeePolicyService.java / GeneralFeePolicyService.java
│   ├── FeeBillService.java / GeneralFeeBillService.java
│   ├── BillingPeriodResolver.java   # billingType → period/start/end/due 산출
│   └── dto/command/ , dto/query/
├── controller/
│   ├── LeaderFeePolicyController.java / dto/{request,response}
│   ├── LeaderFeeBillController.java   / dto/{request,response}
│   └── MyFeeController.java           / dto/response
├── api/  (LeaderFeePolicyApi, LeaderFeeBillApi, MyFeeApi — Swagger 인터페이스)
└── exception/ (FeePolicyException, FeeBillException)
```
- **Modify:** `domain/clubmember/repository/ClubMemberRepository.java` (활성 회원 userId 조회 메서드 추가)
- **Create:** `resources/db/migration/V60__create_fee_tables.sql`
- **Test:** `src/test/java/com/duing/domain/fee/**`, `src/test/java/com/duing/common/fixture/Fee*Fixture.java`

### 프론트 (`frontend/`)
```
packages/types/src/fee.ts
packages/api/src/client.ts           # leader.fees.*, my.fees.* 추가
packages/hooks/src/fee.ts , feeQueryKeys.ts , index.ts(export)
packages/schemas/src/index.ts        # createFeePolicySchema, generateBillsSchema
apps/web/app/manage/clubs/[clubId]/fees/
├── page.tsx
├── _pages/ClubFeesPage.tsx          # 2탭(정책/청구)
├── _components/ (PolicyList, CreatePolicyDialog, BillList, GenerateBillsDialog)
└── _lib/feeLabels.ts                # billingType/status 라벨, 금액 포맷
apps/web/app/me/fees/
├── page.tsx
└── _components/MyFeeList.tsx
apps/web/app/manage/_components/ManageNav.tsx   # fees 링크 추가(Modify)
apps/web/test/manage/fees.test.tsx , apps/web/test/me/my-fees.test.tsx
```

---

## Task BE-1: V60 마이그레이션 + fee 도메인 엔티티/enum/리포지토리 골격

**Files:**
- Create: `backend/src/main/resources/db/migration/V60__create_fee_tables.sql`
- Create: `backend/src/main/java/com/duing/domain/fee/entity/{BillingType,FeeStatus,FeePolicy,FeeBill}.java`
- Create: `backend/src/main/java/com/duing/domain/fee/repository/{FeePolicyRepository,FeeBillRepository}.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`
- Test: `backend/src/test/java/com/duing/domain/fee/entity/FeeBillTest.java`

- [ ] **Step 1: 마이그레이션 작성** `V60__create_fee_tables.sql`

```sql
-- 회비 관리 Sprint 1: 동아리별 회비 정책(fee_policy)과 회원별 청구서(fee_bill)를 추가한다.
-- 금액은 정수 원(BIGINT), 상태/유형은 VARCHAR+CHECK. 신규 테이블은 RLS 를 켠다(V59 정책 준수).
CREATE TABLE fee_policy (
    id           BIGSERIAL PRIMARY KEY,
    club_id      BIGINT       NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    name         VARCHAR(100) NOT NULL,
    amount       BIGINT       NOT NULL CHECK (amount >= 0),
    billing_type VARCHAR(20)  NOT NULL CHECK (billing_type IN ('MONTHLY','SEMESTER','YEARLY','ONE_TIME')),
    active       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fee_policy_club ON fee_policy (club_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_policy ENABLE ROW LEVEL SECURITY;

CREATE TABLE fee_bill (
    id                 BIGSERIAL PRIMARY KEY,
    club_id            BIGINT      NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    fee_policy_id      BIGINT      NOT NULL REFERENCES fee_policy(id) ON DELETE RESTRICT,
    amount             BIGINT      NOT NULL CHECK (amount >= 0),
    billing_period     VARCHAR(30) NOT NULL,
    billing_start_date DATE        NOT NULL,
    billing_end_date   DATE        NOT NULL,
    due_date           DATE        NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','PAID','PARTIAL_PAID','OVERDUE','CANCELLED')),
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_fee_bill_period_range CHECK (billing_end_date >= billing_start_date),
    CONSTRAINT chk_fee_bill_due_in_range  CHECK (due_date >= billing_start_date)
);
-- 멱등: 같은 정책·회원·회차(시작일)는 1건, 취소건은 제외해 재발행 허용
CREATE UNIQUE INDEX uk_fee_bill_idem ON fee_bill (fee_policy_id, user_id, billing_start_date)
    WHERE deleted_at IS NULL AND status <> 'CANCELLED';
CREATE INDEX idx_fee_bill_club_status ON fee_bill (club_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fee_bill_user ON fee_bill (user_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_bill ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: enum 작성** — `BillingType.java`, `FeeStatus.java`

```java
package com.duing.domain.fee.entity;

public enum BillingType { MONTHLY, SEMESTER, YEARLY, ONE_TIME }
```
```java
package com.duing.domain.fee.entity;

public enum FeeStatus { PENDING, PAID, PARTIAL_PAID, OVERDUE, CANCELLED }
```

- [ ] **Step 3: FeePolicy 엔티티** (ClubMember 엔티티 패턴 그대로: `@SQLDelete`/`@SQLRestriction`, `@Builder(PRIVATE)`, static `create`)

```java
package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "fee_policy")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE fee_policy SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FeePolicy extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private Long amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_type", nullable = false, length = 20)
    private BillingType billingType;

    @Column(nullable = false)
    private boolean active;

    @Builder(access = AccessLevel.PRIVATE)
    private FeePolicy(Long clubId, String name, Long amount, BillingType billingType, boolean active) {
        this.clubId = clubId;
        this.name = name;
        this.amount = amount;
        this.billingType = billingType;
        this.active = active;
    }

    public static FeePolicy create(Long clubId, String name, Long amount, BillingType billingType) {
        return FeePolicy.builder()
                .clubId(clubId).name(name).amount(amount).billingType(billingType).active(true)
                .build();
    }

    public void update(String name, Long amount, BillingType billingType, Boolean active) {
        if (name != null) {
            this.name = name;
        }
        if (amount != null) {
            this.amount = amount;
        }
        if (billingType != null) {
            this.billingType = billingType;
        }
        if (active != null) {
            this.active = active;
        }
    }
}
```

- [ ] **Step 4: FeeBill 엔티티**

```java
package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "fee_bill")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE fee_bill SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FeeBill extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "fee_policy_id", nullable = false)
    private Long feePolicyId;

    @Column(nullable = false)
    private Long amount;

    @Column(name = "billing_period", nullable = false, length = 30)
    private String billingPeriod;

    @Column(name = "billing_start_date", nullable = false)
    private LocalDate billingStartDate;

    @Column(name = "billing_end_date", nullable = false)
    private LocalDate billingEndDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FeeStatus status;

    @Builder(access = AccessLevel.PRIVATE)
    private FeeBill(Long clubId, Long userId, Long feePolicyId, Long amount, String billingPeriod,
                    LocalDate billingStartDate, LocalDate billingEndDate, LocalDate dueDate, FeeStatus status) {
        this.clubId = clubId;
        this.userId = userId;
        this.feePolicyId = feePolicyId;
        this.amount = amount;
        this.billingPeriod = billingPeriod;
        this.billingStartDate = billingStartDate;
        this.billingEndDate = billingEndDate;
        this.dueDate = dueDate;
        this.status = status;
    }

    public static FeeBill issue(Long clubId, Long userId, Long feePolicyId, Long amount, String billingPeriod,
                                LocalDate billingStartDate, LocalDate billingEndDate, LocalDate dueDate) {
        return FeeBill.builder()
                .clubId(clubId).userId(userId).feePolicyId(feePolicyId).amount(amount)
                .billingPeriod(billingPeriod).billingStartDate(billingStartDate)
                .billingEndDate(billingEndDate).dueDate(dueDate).status(FeeStatus.PENDING)
                .build();
    }

    public void cancel() {
        this.status = FeeStatus.CANCELLED;
    }
}
```

- [ ] **Step 5: 리포지토리 골격**

```java
// FeePolicyRepository.java
package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeePolicy;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeePolicyRepository extends JpaRepository<FeePolicy, Long> {
    List<FeePolicy> findAllByClubIdOrderByCreatedAtDesc(Long clubId);
    Optional<FeePolicy> findByIdAndClubId(Long id, Long clubId);

    // 발행/수정/삭제가 같은 정책 행에 대해 직렬화되도록 비관적 쓰기 잠금으로 조회한다(§7 정책 lifecycle 경합).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM FeePolicy p WHERE p.id = :id AND p.clubId = :clubId")
    Optional<FeePolicy> findByIdAndClubIdForUpdate(@Param("id") Long id, @Param("clubId") Long clubId);
}
```
```java
// FeeBillRepository.java  (Custom 은 BE-4 에서 추가)
package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeeBillRepository extends JpaRepository<FeeBill, Long> {
    Optional<FeeBill> findByIdAndClubId(Long id, Long clubId);

    // 발행 이력 존재(불변성·삭제 가드 공유). 취소·soft-delete 행까지 모두 포함해야 하므로
    // @SQLRestriction 을 우회하는 네이티브 쿼리로 deleted_at·status 무관하게 본다(= uk_fee_bill_idem 의 역).
    @Query(value = "SELECT EXISTS (SELECT 1 FROM fee_bill WHERE fee_policy_id = :policyId)", nativeQuery = true)
    boolean existsByFeePolicyId(@Param("policyId") Long policyId);

    // 멱등 발행: club_member 에서 활성 회원을 직접 SELECT 해 단일 원자 INSERT 한다(대상 선별=삽입, TOCTOU 없음).
    // 부분 유니크 인덱스(uk_fee_bill_idem) 술어를 ON CONFLICT 에 그대로 명시해야 매칭된다(생략 시 Postgres 에러).
    // 반환값 = 실제 INSERT 된 행 수(=created). saveAll 금지(충돌 시 트랜잭션 전체 롤백).
    // flushAutomatically: 같은 TX의 선행 ClubMember 변경을 flush 후 네이티브 SELECT가 최신 상태를 읽도록(stale read 방지, 기존 ClubFavoriteRepository 선례 정렬).
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO fee_bill (club_id, user_id, fee_policy_id, amount, billing_period,
                                  billing_start_date, billing_end_date, due_date, status)
            SELECT :clubId, cm.user_id, :policyId, :amount, :billingPeriod,
                   :startDate, :endDate, :dueDate, 'PENDING'
            FROM club_member cm
            WHERE cm.club_id = :clubId AND cm.deleted_at IS NULL
            ORDER BY cm.user_id
            ON CONFLICT (fee_policy_id, user_id, billing_start_date)
              WHERE deleted_at IS NULL AND status <> 'CANCELLED'
            DO NOTHING
            """, nativeQuery = true)
    int bulkInsertBills(@Param("clubId") Long clubId, @Param("policyId") Long policyId,
                        @Param("amount") Long amount, @Param("billingPeriod") String billingPeriod,
                        @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate,
                        @Param("dueDate") LocalDate dueDate);
}
```

- [ ] **Step 6: ClubMemberRepository 에 활성 회원 수 카운트 추가**

발행은 `INSERT...SELECT` 가 대상 선별을 담당하므로 userId 목록이 아니라 `skipped` 계산용 카운트만 필요하다.
`ClubMemberRepository.java` 에 메서드 추가:
```java
    @Query("SELECT COUNT(cm) FROM ClubMember cm WHERE cm.club.id = :clubId")
    long countActiveByClubId(@Param("clubId") Long clubId);
```
(`@SQLRestriction("deleted_at IS NULL")` 가 자동 적용되어 활성 멤버만 센다.)

- [ ] **Step 7: 엔티티 단위 테스트 작성** `FeeBillTest.java`

```java
package com.duing.domain.fee.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeBillTest {

    @Test
    @DisplayName("청구서를 발행하면 상태가 PENDING 으로 생성된다")
    void issueCreatesPendingBill() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.PENDING);
        assertThat(bill.getAmount()).isEqualTo(10000L);
    }

    @Test
    @DisplayName("청구서를 취소하면 상태가 CANCELLED 로 전이된다")
    void cancelTransitionsToCancelled() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        bill.cancel();
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.CANCELLED);
    }
}
```

- [ ] **Step 8: 공유 테스트 인프라(모든 fee HTTP 테스트의 선결)**

`IntegrationTestBase` 의 `TRUNCATE ... RESTART IDENTITY CASCADE` 테이블 목록에 `fee_bill`·`fee_policy` 를 추가한다(단일 CASCADE 문이라 순서는 무관; 누락 시 모든 fee HTTP 테스트가 행을 누수하거나 FK 로 깨짐). fee 테이블도 RLS 활성(정책 없음)이므로 Testcontainers 데이터소스가 owner 역할로 접속하는지 확인한다(V59 이후 기존 RLS 테이블 테스트가 통과하므로 이미 충족일 가능성 높음).

- [ ] **Step 9: 컴파일 + 테스트 + 마이그레이션 검증**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.entity.FeeBillTest"`
Expected: PASS (Flyway V60 가 Testcontainers 부팅 시 적용되어 스키마 검증됨)

- [ ] **Step 10: 커밋**

```bash
git checkout -b feat/fee-domain-skeleton
git add backend/src/main/resources/db/migration/V60__create_fee_tables.sql \
        backend/src/main/java/com/duing/domain/fee \
        backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java \
        backend/src/test/java/com/duing/common/IntegrationTestBase.java \
        backend/src/test/java/com/duing/domain/fee
git commit -m "feat(backend): 회비 도메인 스키마(V60)와 FeePolicy·FeeBill 엔티티 골격 추가"
```

---

## Task BE-2: 회비 정책 CRUD API

**Files:**
- Create: `domain/fee/service/dto/command/{CreateFeePolicyCommand,UpdateFeePolicyCommand}.java`, `service/dto/query/FeePolicyQuery.java`
- Create: `domain/fee/service/{FeePolicyService,GeneralFeePolicyService}.java`
- Create: `domain/fee/exception/FeePolicyException.java`
- Create: `domain/fee/api/LeaderFeePolicyApi.java`, `controller/LeaderFeePolicyController.java`, `controller/dto/request/{CreateFeePolicyRequest,UpdateFeePolicyRequest}.java`, `controller/dto/response/FeePolicyResponse.java`
- Test: `src/test/java/com/duing/domain/fee/LeaderFeePolicyControllerTest.java`, `common/fixture/FeePolicyFixture.java`

- [ ] **Step 1: 예외 클래스** (기존 `{Domain}Exception` + static inner 패턴)

```java
package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FeePolicyException extends ApplicationException {

    public FeePolicyException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class NotFound extends FeePolicyException {
        public NotFound() { super("회비 정책을 찾을 수 없습니다.", HttpStatus.NOT_FOUND); }
    }

    public static class Inactive extends FeePolicyException {
        public Inactive() { super("비활성 상태의 회비 정책으로는 청구할 수 없습니다.", HttpStatus.CONFLICT); }
    }

    public static class DeleteForbidden extends FeePolicyException {
        public DeleteForbidden() { super("이미 청구 이력이 있는 정책은 삭제할 수 없습니다. 비활성화하세요.", HttpStatus.CONFLICT); }
    }

    public static class BillingTypeImmutable extends FeePolicyException {
        public BillingTypeImmutable() { super("이미 청구 이력이 있는 정책의 회비 유형은 변경할 수 없습니다.", HttpStatus.CONFLICT); }
    }
}
```
> 주: `ApplicationException` 의 실제 생성자 시그니처를 BE 구현 시작 시 `global/exception/ApplicationException.java` 에서 확인하고 일치시킨다(추출된 코드 기준 `(String message, HttpStatus status)` 형태이나, `code` 인자가 있으면 그에 맞춘다).

- [ ] **Step 2: command/query DTO**

```java
// CreateFeePolicyCommand.java  (service/dto/command)
package com.duing.domain.fee.service.dto.command;
import com.duing.domain.fee.entity.BillingType;
public record CreateFeePolicyCommand(Long clubId, Long actorId, String name, Long amount, BillingType billingType) {}
```
```java
// UpdateFeePolicyCommand.java
package com.duing.domain.fee.service.dto.command;
import com.duing.domain.fee.entity.BillingType;
public record UpdateFeePolicyCommand(Long clubId, Long actorId, Long policyId,
                                     String name, Long amount, BillingType billingType, Boolean active) {}
```
```java
// FeePolicyQuery.java  (service/dto/query)
package com.duing.domain.fee.service.dto.query;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
public record FeePolicyQuery(Long id, String name, Long amount, BillingType billingType, boolean active) {
    public static FeePolicyQuery from(FeePolicy policy) {
        return new FeePolicyQuery(policy.getId(), policy.getName(), policy.getAmount(),
                policy.getBillingType(), policy.isActive());
    }
}
```

- [ ] **Step 3: 서비스 인터페이스 + 구현** (`@Transactional(readOnly=true)` 클래스, 쓰기만 오버라이드, `requireManager` 호출)

```java
// FeePolicyService.java
package com.duing.domain.fee.service;
import com.duing.domain.fee.service.dto.command.CreateFeePolicyCommand;
import com.duing.domain.fee.service.dto.command.UpdateFeePolicyCommand;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;
import java.util.List;
public interface FeePolicyService {
    Long create(CreateFeePolicyCommand command);
    void update(UpdateFeePolicyCommand command);
    void delete(Long clubId, Long actorId, Long policyId);
    List<FeePolicyQuery> getPolicies(Long clubId, Long actorId);
}
```
```java
// GeneralFeePolicyService.java
package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.exception.FeePolicyException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.command.CreateFeePolicyCommand;
import com.duing.domain.fee.service.dto.command.UpdateFeePolicyCommand;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeePolicyService implements FeePolicyService {

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillRepository feeBillRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        FeePolicy policy = FeePolicy.create(command.clubId(), command.name(), command.amount(), command.billingType());
        return feePolicyRepository.save(policy).getId();
    }

    @Override
    @Transactional
    public void update(UpdateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 잠금 조회로 동시 발행(generate)과 직렬화 — 발행 중 billing_type 변경/삭제 경합 방지.
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(command.policyId(), command.clubId())
                .orElseThrow(FeePolicyException.NotFound::new);
        // billing_type 은 발행 이력(취소·soft-delete 포함)이 있으면 불변. 값이 실제로 달라질 때만 검사(동일값 PATCH 통과).
        boolean changesBillingType = command.billingType() != null
                && command.billingType() != policy.getBillingType();
        if (changesBillingType && feeBillRepository.existsByFeePolicyId(command.policyId())) {
            throw new FeePolicyException.BillingTypeImmutable();
        }
        policy.update(command.name(), command.amount(), command.billingType(), command.active());
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long actorId, Long policyId) {
        clubAuthService.requireManager(actorId, clubId);
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(policyId, clubId)
                .orElseThrow(FeePolicyException.NotFound::new);
        if (feeBillRepository.existsByFeePolicyId(policyId)) { // update 와 동일한 '발행 이력 존재' 검사 공유
            throw new FeePolicyException.DeleteForbidden();
        }
        feePolicyRepository.delete(policy); // @SQLDelete soft delete
    }

    @Override
    public List<FeePolicyQuery> getPolicies(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        return feePolicyRepository.findAllByClubIdOrderByCreatedAtDesc(clubId).stream()
                .map(FeePolicyQuery::from).toList();
    }
}
```

- [ ] **Step 4: request/response DTO** (`@Valid` 한국어 메시지, `toCommand()`/`Response.from()`)

```java
// CreateFeePolicyRequest.java (controller/dto/request)
package com.duing.domain.fee.controller.dto.request;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.command.CreateFeePolicyCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
public record CreateFeePolicyRequest(
        @NotBlank(message = "정책 이름은 필수입니다.") @Size(max = 100) String name,
        @NotNull(message = "금액은 필수입니다.") @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        @NotNull(message = "회비 유형은 필수입니다.") BillingType billingType) {
    public CreateFeePolicyCommand toCommand(Long clubId, Long actorId) {
        return new CreateFeePolicyCommand(clubId, actorId, name, amount, billingType);
    }
}
```
```java
// UpdateFeePolicyRequest.java — name/amount/billingType/active 모두 nullable(부분 수정)
package com.duing.domain.fee.controller.dto.request;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.command.UpdateFeePolicyCommand;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
public record UpdateFeePolicyRequest(
        @Size(max = 100) String name,
        @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        BillingType billingType, Boolean active) {
    public UpdateFeePolicyCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new UpdateFeePolicyCommand(clubId, actorId, policyId, name, amount, billingType, active);
    }
}
```
```java
// FeePolicyResponse.java (controller/dto/response)
package com.duing.domain.fee.controller.dto.response;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;
public record FeePolicyResponse(Long id, String name, Long amount, BillingType billingType, boolean active) {
    public static FeePolicyResponse from(FeePolicyQuery query) {
        return new FeePolicyResponse(query.id(), query.name(), query.amount(), query.billingType(), query.active());
    }
}
```

- [ ] **Step 5: Swagger api 인터페이스 + 컨트롤러** (기존 `ApiResponse<T>` 래퍼와 ResponseEntity 상태코드 패턴 준수 — 구현 시작 시 한 개의 기존 Leader 컨트롤러를 열어 `ApiResponse` 사용법·반환 타입을 1:1로 맞춘다)

```java
// LeaderFeePolicyController.java (api/LeaderFeePolicyApi 인터페이스 implements)
package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderFeePolicyApi;
import com.duing.domain.fee.controller.dto.request.CreateFeePolicyRequest;
import com.duing.domain.fee.controller.dto.request.UpdateFeePolicyRequest;
import com.duing.domain.fee.controller.dto.response.FeePolicyResponse;
import com.duing.domain.fee.service.FeePolicyService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
@RequestMapping("/api/v1/leader/clubs/{clubId}/fee-policies")
public class LeaderFeePolicyController implements LeaderFeePolicyApi {

    private final FeePolicyService feePolicyService;

    @Override
    @PostMapping
    public ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser,
            @Valid @RequestBody CreateFeePolicyRequest request) {
        Long policyId = feePolicyService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(policyId));
    }

    @Override
    @GetMapping
    public ResponseEntity<ApiResponse<List<FeePolicyResponse>>> getPolicies(
            @PathVariable Long clubId, @AuthenticationPrincipal UserPrincipal currentUser) {
        List<FeePolicyResponse> responses = feePolicyService.getPolicies(clubId, currentUser.id())
                .stream().map(FeePolicyResponse::from).toList();
        return ResponseEntity.ok(ApiResponse.success(responses));
    }

    @Override
    @PatchMapping("/{policyId}")
    public ResponseEntity<Void> update(
            @PathVariable Long clubId, @PathVariable Long policyId,
            @AuthenticationPrincipal UserPrincipal currentUser,
            @Valid @RequestBody UpdateFeePolicyRequest request) {
        feePolicyService.update(request.toCommand(clubId, currentUser.id(), policyId));
        return ResponseEntity.noContent().build();
    }

    @Override
    @DeleteMapping("/{policyId}")
    public ResponseEntity<Void> delete(
            @PathVariable Long clubId, @PathVariable Long policyId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        feePolicyService.delete(clubId, currentUser.id(), policyId);
        return ResponseEntity.noContent().build();
    }
}
```
> 응답 래퍼 팩토리는 `ApiResponse.success(data)`/`success()`(실파일 `global/response/ApiResponse.java` 확인됨). `LeaderFeePolicyApi` 는 `@Tag`/`@Operation` 만 단 동일 시그니처 인터페이스로 작성한다.

- [ ] **Step 6: Fixture + RestAssured 통합 테스트** (`IntegrationTestBase` 상속, `jwtTokenProvider.createToken`, `@DisplayName` 한국어 문장)

`FeePolicyFixture.java`:
```java
package com.duing.common.fixture;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
public final class FeePolicyFixture {
    private FeePolicyFixture() {}
    public static FeePolicy monthly(Long clubId) {
        return FeePolicy.create(clubId, "월 회비", 10000L, BillingType.MONTHLY);
    }
}
```

`LeaderFeePolicyControllerTest.java` (핵심 케이스 — 기존 통합테스트의 셋업/토큰 헬퍼를 그대로 사용):
```java
@Test @DisplayName("운영진(OFFICER)이 회비 정책을 생성하면 201 을 반환한다")
void officerCreatesPolicy() { /* OFFICER 토큰으로 POST, statusCode(201) */ }

@Test @DisplayName("일반 멤버가 회비 정책을 생성하면 403 을 반환한다")
void memberForbidden() { /* MEMBER 토큰으로 POST, statusCode(403) */ }

@Test @DisplayName("청구 이력이 있는 정책을 삭제하면 409 를 반환한다")
void deleteWithBillsConflict() { /* FeeBill 한 건 저장 후 DELETE, statusCode(409) */ }

@Test @DisplayName("청구 이력이 있는 정책의 billing_type 을 변경하면 409 를 반환한다")
void billingTypeImmutableConflict() {
    /* FeeBill 한 건(취소 상태 포함해도 동일) 저장 후 billingType 변경 PATCH → 409 BillingTypeImmutable.
       같은 요청에서 name/amount/active 만 변경하면 204(billingType 미변경은 통과). */
}
```
> 각 테스트는 `@BeforeEach` 에서 `User` + `ClubMember.asLeader/of(...)` 로 권한 셋업, `jwtTokenProvider.createToken(userId, "STUDENT")` 로 Bearer 토큰을 만든다(추출된 `IntegrationTestBase`/fixture 패턴 그대로). 실제 본문은 구현 시 기존 컨트롤러 테스트 1개를 복제해 채운다.

- [ ] **Step 7: 테스트 실행**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeePolicyControllerTest"`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git checkout -b feat/fee-policy-api
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing
git commit -m "feat(backend): 회비 정책 CRUD API 구현"
```

---

## Task BE-3: 회비 청구 발행·취소 API (멱등)

**Files:**
- Create: `domain/fee/service/BillingPeriodResolver.java`
- Create: `domain/fee/service/dto/command/{GenerateBillsCommand}.java`, `service/dto/query/GenerateBillsResult.java`
- Create: `domain/fee/service/{FeeBillService,GeneralFeeBillService}.java`
- Create: `domain/fee/exception/FeeBillException.java`
- Create: `domain/fee/api/LeaderFeeBillApi.java`, `controller/LeaderFeeBillController.java`, `controller/dto/request/GenerateBillsRequest.java`, `controller/dto/response/GenerateBillsResponse.java`
- Test: `src/test/java/com/duing/domain/fee/BillingPeriodResolverTest.java`, `LeaderFeeBillControllerTest.java`

- [ ] **Step 1: BillingPeriodResolver 테스트 먼저 작성 (TDD)**

```java
package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BillingPeriodResolverTest {

    // 발행일을 2026-06-15(Asia/Seoul)로 고정해 기본 마감일 산출을 결정적으로 검증한다.
    private final Clock clock = Clock.fixed(
            LocalDate.of(2026, 6, 15).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),
            ZoneId.of("Asia/Seoul"));
    private final BillingPeriodResolver resolver = new BillingPeriodResolver(clock);

    @Test
    @DisplayName("MONTHLY 는 회차 라벨로 해당 월 1일~말일과 말일 마감을 산출한다")
    void monthly() {
        var resolved = resolver.resolveMonthly("2026-07");
        assertThat(resolved.billingPeriod()).isEqualTo("2026-07");
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(resolved.endDate()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("YEARLY 는 1/1~12/31 기간과 기본 마감 = 발행월 말일(2026-06-30)을 산출한다")
    void yearly() {
        var resolved = resolver.resolveYearly("2026", null);
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(resolved.endDate()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2026, 6, 30)); // 발행월(2026-06) 말일
    }

    @Test
    @DisplayName("미래 연도를 선발행하면 기본 마감을 기간 시작일로 clamp 해 due < start 를 막는다")
    void yearlyFutureClampsToStart() {
        var resolved = resolver.resolveYearly("2027", null); // 발행일 2026-06-15
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2027, 1, 1));
        // 발행월 말일(2026-06-30) < 기간 시작(2027-01-01) → start 로 clamp(§5.1-1·chk_fee_bill_due_in_range 위반 방지)
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2027, 1, 1));
    }
}
```

- [ ] **Step 2: BillingPeriodResolver 구현**

```java
package com.duing.domain.fee.service;

import com.duing.domain.fee.exception.FeeBillException;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Component;

@Component
public class BillingPeriodResolver {

    private final Clock clock; // Asia/Seoul Clock 빈 주입(기본 마감일 산출의 '오늘', 테스트 결정성)

    public BillingPeriodResolver(Clock clock) {
        this.clock = clock;
    }

    public record Resolved(String billingPeriod, LocalDate startDate, LocalDate endDate, LocalDate dueDate) {}

    public Resolved resolveMonthly(String yearMonth) {
        LocalDate start = parseFirstDayOfMonth(yearMonth);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return new Resolved(yearMonth, start, end, end); // 기본 마감 = 청구월 말일
    }

    public Resolved resolveYearly(String year, LocalDate dueOverride) {
        int y = parseYear(year);
        LocalDate start = LocalDate.of(y, 1, 1);
        LocalDate end = LocalDate.of(y, 12, 31);
        // 기본 마감 = max(발행월 말일, 기간 시작일). 미래 연도 선발행 시 발행월 말일이 start 보다 과거가 되어
        // due < start(§5.1-1·chk_fee_bill_due_in_range)를 위반하므로 start 로 clamp 한다.
        LocalDate issueMonthEnd = issueMonthEnd();
        LocalDate defaultDue = issueMonthEnd.isBefore(start) ? start : issueMonthEnd;
        LocalDate due = dueOverride != null ? dueOverride : defaultDue;
        return new Resolved(year, start, end, due);
    }

    public Resolved resolveExplicit(String label, LocalDate start, LocalDate end, LocalDate due) {
        if (start == null || end == null || due == null || end.isBefore(start)) {
            throw new FeeBillException.InvalidBillingPeriod();
        }
        return new Resolved(label, start, end, due);
    }

    private LocalDate issueMonthEnd() {
        LocalDate today = LocalDate.now(clock);
        return today.withDayOfMonth(today.lengthOfMonth());
    }

    private LocalDate parseFirstDayOfMonth(String yearMonth) {
        try {
            String[] parts = yearMonth.split("-");
            return LocalDate.of(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), 1);
        } catch (RuntimeException invalid) {
            throw new FeeBillException.InvalidBillingPeriod();
        }
    }

    private int parseYear(String year) {
        try { return Integer.parseInt(year.trim()); }
        catch (NumberFormatException invalid) { throw new FeeBillException.InvalidBillingPeriod(); }
    }
}
```
> 주: 기존 `global/config/TimeConfig` 의 Asia/Seoul `Clock` 빈을 그대로 주입받는다(이미 존재 — 중복 `@Bean Clock` 등록 금지). `BillingPeriodResolver`/`GeneralFeeBillService` 가 이를 주입받고, 테스트는 `Clock.fixed(...)` 로 발행일을 고정한다.

- [ ] **Step 3: 예외 클래스**

```java
package com.duing.domain.fee.exception;
import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;
public class FeeBillException extends ApplicationException {
    public FeeBillException(String message, HttpStatus status) { super(message, status); }
    // code 를 실어 프론트가 마감일 오류를 구분(§5.1). ApplicationException(message, status, code) 시그니처에 정렬.
    public FeeBillException(String message, HttpStatus status, String code) { super(message, status, code); }
    public static class NotFound extends FeeBillException {
        public NotFound() { super("청구서를 찾을 수 없습니다.", HttpStatus.NOT_FOUND); }
    }
    public static class InvalidBillingPeriod extends FeeBillException {
        public InvalidBillingPeriod() { super("청구 회차/기간 입력이 올바르지 않습니다.", HttpStatus.BAD_REQUEST); }
        private InvalidBillingPeriod(String message, String code) { super(message, HttpStatus.BAD_REQUEST, code); }
        // 마감일 검증(§5.1)은 별도 예외를 만들지 않고 같은 400 을 code 로 구분한다.
        public static InvalidBillingPeriod dueBeforePeriod() {
            return new InvalidBillingPeriod("마감일은 청구 기간 시작일 이후여야 합니다.", "DUE_DATE_BEFORE_PERIOD");
        }
        public static InvalidBillingPeriod dueInPast() {
            return new InvalidBillingPeriod("마감일은 발행일보다 과거일 수 없습니다.", "DUE_DATE_IN_PAST");
        }
    }
}
```
> 주: `ApplicationException` 의 `code` 인자(머신 판독용) 지원 여부를 구현 시작 시 `global/exception/ApplicationException.java` 에서 확인한다. 없으면 `code` 를 메시지 접두어로 대체하되, 전역 핸들러 응답에 `code` 필드를 노출하는 방향을 우선한다.

- [ ] **Step 4: command/result DTO**

```java
// GenerateBillsCommand.java
package com.duing.domain.fee.service.dto.command;
import com.duing.domain.fee.entity.BillingType;
import java.time.LocalDate;
public record GenerateBillsCommand(
        Long clubId, Long actorId, Long policyId,
        String billingPeriod,        // MONTHLY/YEARLY 라벨 또는 ONE_TIME/SEMESTER 표시 라벨
        LocalDate billingStartDate,  // 명시형(SEMESTER/ONE_TIME)일 때 사용
        LocalDate billingEndDate,
        LocalDate dueDate) {}        // null 이면 타입별 자동 산출
```
```java
// GenerateBillsResult.java
package com.duing.domain.fee.service.dto.query;
public record GenerateBillsResult(int created, int skipped) {}
```

- [ ] **Step 5: FeeBillService 발행 로직 (멱등)**

```java
// FeeBillService.java
package com.duing.domain.fee.service;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
public interface FeeBillService {
    GenerateBillsResult generate(GenerateBillsCommand command);
    void cancel(Long clubId, Long actorId, Long billId);
}
```
```java
// GeneralFeeBillService.java (핵심: requireManager → 정책 잠금·검증 → 기간/마감 산출·검증 → 단일 원자 INSERT...ON CONFLICT)
package com.duing.domain.fee.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.exception.FeePolicyException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeeBillService implements FeeBillService {

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillRepository feeBillRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final BillingPeriodResolver periodResolver;
    private final Clock clock; // Asia/Seoul Clock 빈(due_date 과거 검증의 '오늘')

    @Override
    @Transactional
    public GenerateBillsResult generate(GenerateBillsCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 비관적 잠금: 발행 도중 정책 비활성화·삭제(update/delete)와의 경합을 직렬화한다.
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(command.policyId(), command.clubId())
                .orElseThrow(FeePolicyException.NotFound::new);
        if (!policy.isActive()) {
            throw new FeePolicyException.Inactive();
        }
        BillingPeriodResolver.Resolved resolved = resolve(policy.getBillingType(), command);
        validateDueDate(resolved, command.dueDate(), policy.getBillingType());

        // 단일 원자 INSERT...SELECT...ON CONFLICT DO NOTHING. created = 실제 INSERT 된 행 수.
        int created = feeBillRepository.bulkInsertBills(
                command.clubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), resolved.dueDate());
        long activeCount = clubMemberRepository.countActiveByClubId(command.clubId());
        int skipped = (int) Math.max(0L, activeCount - created); // 동시 멤버 변동으로 음수가 되지 않게 클램프

        log.info("fee bills generated: actorId={}, clubId={}, policyId={}, period={}, created={}, skipped={}",
                command.actorId(), command.clubId(), policy.getId(), resolved.billingPeriod(), created, skipped);
        return new GenerateBillsResult(created, skipped);
    }

    @Override
    @Transactional
    public void cancel(Long clubId, Long actorId, Long billId) {
        clubAuthService.requireManager(actorId, clubId);
        FeeBill bill = feeBillRepository.findByIdAndClubId(billId, clubId)
                .orElseThrow(FeeBillException.NotFound::new);
        FeeStatus previous = bill.getStatus();
        bill.cancel(); // 이미 CANCELLED 면 멱등 no-op
        log.info("fee bill cancelled: actorId={}, billId={}, previousStatus={}", actorId, billId, previous);
    }

    private BillingPeriodResolver.Resolved resolve(BillingType type, GenerateBillsCommand command) {
        return switch (type) {
            case MONTHLY -> periodResolver.resolveMonthly(command.billingPeriod());
            case YEARLY -> periodResolver.resolveYearly(command.billingPeriod(), command.dueDate());
            case SEMESTER, ONE_TIME -> periodResolver.resolveExplicit(
                    command.billingPeriod(), command.billingStartDate(), command.billingEndDate(), command.dueDate());
        };
    }

    // §5.1 마감일 검증. 1) 정합성(전 타입): due >= start. 2) 과거 차단(운영자 override 한정, ONE_TIME 면제).
    private void validateDueDate(BillingPeriodResolver.Resolved resolved, LocalDate dueOverride, BillingType type) {
        if (resolved.dueDate().isBefore(resolved.startDate())) {
            throw FeeBillException.InvalidBillingPeriod.dueBeforePeriod();
        }
        boolean operatorOverride = dueOverride != null;
        if (operatorOverride && type != BillingType.ONE_TIME
                && resolved.dueDate().isBefore(LocalDate.now(clock))) {
            throw FeeBillException.InvalidBillingPeriod.dueInPast();
        }
    }
}
```

- [ ] **Step 6: request/response DTO + api 인터페이스 + 컨트롤러**

```java
// GenerateBillsRequest.java
package com.duing.domain.fee.controller.dto.request;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;
public record GenerateBillsRequest(
        @NotBlank(message = "회차 라벨은 필수입니다.") String billingPeriod,
        LocalDate billingStartDate, LocalDate billingEndDate, LocalDate dueDate) {
    public GenerateBillsCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new GenerateBillsCommand(clubId, actorId, policyId,
                billingPeriod, billingStartDate, billingEndDate, dueDate);
    }
}
```
```java
// GenerateBillsResponse.java
package com.duing.domain.fee.controller.dto.response;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
public record GenerateBillsResponse(int created, int skipped) {
    public static GenerateBillsResponse from(GenerateBillsResult result) {
        return new GenerateBillsResponse(result.created(), result.skipped());
    }
}
```
컨트롤러 `LeaderFeeBillController` (`@RequestMapping("/api/v1/leader/clubs/{clubId}")`):
- `POST /fee-policies/{policyId}/bills` → 201, `ApiResponse<GenerateBillsResponse>`
- `DELETE /fee-bills/{billId}` → 204
(BE-2 의 컨트롤러 패턴·`ApiResponse`·`@PreAuthorize("isAuthenticated()")`·`@AuthenticationPrincipal` 동일)

- [ ] **Step 7: 멱등성/권한 통합 테스트**

```java
@Test @DisplayName("동일 정책·회차로 두 번 발행하면 두 번째는 created 0, skipped N 이다")
void idempotentGenerate() { /* 활성 회원 3명 셋업, 같은 body 로 2회 POST. 1회차 created=3, 2회차 created=0 skipped=3 */ }

@Test @DisplayName("탈퇴(soft delete)한 회원은 청구 대상에서 제외된다")
void excludesDeletedMembers() { /* 멤버 3명 중 1명 ClubMember soft delete 후 발행 → created=2 */ }

@Test @DisplayName("취소한 청구는 같은 회원·회차로 재발행할 수 있다")
void reissueAfterCancel() { /* 발행 → cancel → 재발행 시 created=1 */ }

@Test @DisplayName("비활성 정책으로 청구하면 409 를 반환한다")
void inactivePolicyConflict() { /* active=false 정책으로 POST → 409 */ }

@Test @DisplayName("정책 금액 변경 후 재발행해도 기존 청구액은 불변이고, 다음 회차는 새 금액으로 발행된다")
void amountSnapshot() { /* 10000 발행 → 정책 12000 update → 기존 bill.amount=10000 유지, 다른 회차 발행 시 새 bill.amount=12000 */ }

@Test @DisplayName("같은 정책·회차를 10개 스레드가 동시에 발행해도 청구는 회원 수만큼만 생성된다")
void concurrentGenerateIsIdempotent() {
    /* 활성 100명 셋업. IntegrationTestBase 상속(테스트 메서드 @Transactional 금지 — per-request TX).
       CyclicBarrier(10)으로 동시 진입, ExecutorService(10)로 동일 (policyId, 동일 billingPeriod) POST 10회.
       pool.shutdown()+awaitTermination, Future.get 로 silent 예외 표면화.
       단언: fee_bill count==100; 10응답 created 합==100·skipped 합==900; distinct user_id==100; 모든 응답 2xx(409 0건). */
}

@Test @DisplayName("활성 회원이 없는 club 에 발행하면 201 created=0 skipped=0 이다")
void zeroMembers() { /* 멤버 0명 club 발행 → 201, created=0, skipped=0 */ }

@Test @DisplayName("취소 후 동시 재발행해도 활성 청구는 1건만 생성된다")
void concurrentReissueAfterCancel() { /* 1건 발행→cancel(CANCELLED)→10스레드 동시 재발행 → 활성 1건만(2건 금지) */ }

@Test @DisplayName("연중 연회비 발행은 기본 마감이 과거가 아니며, 과거 마감 명시·기간前 마감은 400(code 구분) 이다")
void dueDateRules() {
    /* YEARLY "2026" 발행 → due=발행월 말일(과거 아님), 201.
       운영자 dueDate 를 발행일 이전으로 명시 → 400 code=DUE_DATE_IN_PAST(SEMESTER/YEARLY).
       due < billing_start_date → 400 code=DUE_DATE_BEFORE_PERIOD(DB CHECK 로도 차단).
       ONE_TIME 과거 행사(과거 dueDate)는 허용. (발행일 고정이 필요하면 테스트 프로파일에 고정 Clock 빈 주입) */
}
```

- [ ] **Step 8: 실행 + 커밋**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.*"`
```bash
git checkout -b feat/fee-bill-generate
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee
git commit -m "feat(backend): 회비 청구 멱등 발행·취소 API 구현"
```

---

## Task BE-4: 청구 현황 조회 + /my/fees

**Files:**
- Create: `domain/fee/repository/{FeeBillRepositoryCustom,FeeBillRepositoryImpl}.java`
- Create: `service/dto/query/{FeeBillQuery,BillSearchQuery,MyFeeSearchQuery}.java`
- Modify: `service/GeneralFeeBillService.java` (조회 메서드 추가), `FeeBillService.java`
- Create: `service/{MyFeeService,GeneralMyFeeService}.java`
- Create: `controller/dto/response/{FeeBillResponse,MyFeeResponse}.java`
- Modify/Create: `controller/LeaderFeeBillController.java` (GET 추가), `controller/MyFeeController.java` + `api/MyFeeApi.java`
- Test: `FeeBillQueryTest.java`(QueryDSL), `MyFeeControllerTest.java`

- [ ] **Step 1: QueryDSL Custom 인터페이스 + Impl** (추출된 `{Domain}RepositoryImpl` 패턴: `JPAQueryFactory` 주입, `private BooleanExpression`, `Page<T>`)

```java
// FeeBillRepositoryCustom.java
package com.duing.domain.fee.repository;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import com.duing.domain.fee.entity.FeeBill;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
public interface FeeBillRepositoryCustom {
    Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, Pageable pageable);
    List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query);
}
```
`FeeBillRepositoryImpl` 은 `QFeeBill.feeBill` 로 `billingPeriodEq`/`statusEq`/`userIdEq`/`clubIdEq` 등 null-safe `BooleanExpression` 을 `where(...)` 에 결합한다. `FeeBillRepository extends JpaRepository<FeeBill,Long>, FeeBillRepositoryCustom` 으로 변경.

- [ ] **Step 2: query DTO**

```java
// BillSearchQuery.java
package com.duing.domain.fee.service.dto.query;
import com.duing.domain.fee.entity.FeeStatus;
public record BillSearchQuery(String billingPeriod, FeeStatus status, Long userId) {}
// MyFeeSearchQuery.java
package com.duing.domain.fee.service.dto.query;
import com.duing.domain.fee.entity.FeeStatus;
public record MyFeeSearchQuery(Long clubId, FeeStatus status) {}
// FeeBillQuery.java — FeeBill → Query 변환 (from)
```

- [ ] **Step 3: 서비스 조회 메서드** — `GeneralFeeBillService.searchClubBills(clubId, actorId, query, pageable)` 는 `requireManager` 후 `Page<FeeBillResponse>` 반환. `GeneralMyFeeService.getMyFees(userId, query)` 는 `requireManager` 없이 `userId` 로만 조회.

- [ ] **Step 4: 컨트롤러**
  - `GET /api/v1/leader/clubs/{clubId}/fee-bills?billingPeriod=&status=&userId=&page=&size=` → 200, `ApiResponse<Page<FeeBillResponse>>`
  - `GET /api/v1/my/fees?clubId=&status=` → 200, `ApiResponse<List<MyFeeResponse>>` (`MyFeeController` 클래스 `@PreAuthorize("isAuthenticated()")`, `currentUser.id()`)

- [ ] **Step 5: 테스트** — QueryDSL 필터 테스트 + `MyFeeControllerTest`:
```java
@Test @DisplayName("내 회비 조회는 본인 user_id 의 청구만 반환한다")
void myFeesOnlyOwn() { /* 회원 A·B 청구 발행 후 A 토큰으로 GET /my/fees → A 것만 */ }
@Test @DisplayName("청구 현황은 status 필터로 좁혀진다")
void filterByStatus() { /* PENDING/CANCELLED 섞어 발행 후 status=PENDING 필터 */ }
```

- [ ] **Step 6: 실행 + 커밋**

```bash
git checkout -b feat/fee-bill-query
git commit -am "feat(backend): 회비 청구 현황 조회 및 내 회비 조회 API 구현"
```

---

## Task FE-1: 프론트 packages 배선 (types/api/hooks/schemas)

**Files:**
- Create: `packages/types/src/fee.ts` + barrel export
- Modify: `packages/api/src/client.ts` (타입 import + `leader.fees` / `my.fees` 메서드)
- Create: `packages/hooks/src/fee.ts`, `packages/hooks/src/feeQueryKeys.ts` + `index.ts` export
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: 타입** `packages/types/src/fee.ts` (`export type`, no `any`)

```ts
export type BillingType = 'MONTHLY' | 'SEMESTER' | 'YEARLY' | 'ONE_TIME';
export type FeeStatus = 'PENDING' | 'PAID' | 'PARTIAL_PAID' | 'OVERDUE' | 'CANCELLED';

export type FeePolicy = {
  id: number;
  name: string;
  amount: number;
  billingType: BillingType;
  active: boolean;
};

export type FeeBill = {
  id: number;
  clubId: number;
  userId: number;
  feePolicyId: number;
  amount: number;
  billingPeriod: string;
  billingStartDate: string;
  billingEndDate: string;
  dueDate: string;
  status: FeeStatus;
};

export type GenerateBillsResult = { created: number; skipped: number };

export type CreateFeePolicyPayload = { name: string; amount: number; billingType: BillingType };
export type UpdateFeePolicyPayload = Partial<CreateFeePolicyPayload> & { active?: boolean };
export type GenerateBillsPayload = {
  billingPeriod: string;
  billingStartDate?: string;
  billingEndDate?: string;
  dueDate?: string;
};
export type BillSearchParams = { billingPeriod?: string; status?: FeeStatus; userId?: number; page?: number; size?: number };
export type MyFeeSearchParams = { clubId?: number; status?: FeeStatus };
// PageResponse 는 packages/types/src/api.ts 에 이미 있으니 재정의하지 말고 import 해 쓴다
// (실제 형태: { content; page; size; totalElements; totalPages; hasNext }).
```
(`PageResponse` 가 이미 types 에 있으면 재사용하고 중복 정의하지 않는다.) `packages/types/src/index.ts` 에 `export * from './fee';` 추가.

- [ ] **Step 2: API 클라이언트** — `packages/api/src/client.ts` 에 추가 (기존 `leader.*`/`clubs.*` 네임스페이스 패턴, `jsonOk`/`jsonVoid` 헬퍼 사용)

```ts
leader: {
  // ...기존...
  fees: {
    listPolicies: (clubId: number) =>
      jsonOk<FeePolicy[]>(http.get(`leader/clubs/${clubId}/fee-policies`)),
    createPolicy: (clubId: number, payload: CreateFeePolicyPayload) =>
      jsonOk<number>(http.post(`leader/clubs/${clubId}/fee-policies`, { json: payload })),
    updatePolicy: (clubId: number, policyId: number, payload: UpdateFeePolicyPayload) =>
      jsonVoid(http.patch(`leader/clubs/${clubId}/fee-policies/${policyId}`, { json: payload })),
    deletePolicy: (clubId: number, policyId: number) =>
      jsonVoid(http.delete(`leader/clubs/${clubId}/fee-policies/${policyId}`)),
    generateBills: (clubId: number, policyId: number, payload: GenerateBillsPayload) =>
      jsonOk<GenerateBillsResult>(http.post(`leader/clubs/${clubId}/fee-policies/${policyId}/bills`, { json: payload })),
    listBills: (clubId: number, params: BillSearchParams) =>
      jsonOk<PageResponse<FeeBill>>(http.get(`leader/clubs/${clubId}/fee-bills`, { searchParams: cleanParams(params) })),
    cancelBill: (clubId: number, billId: number) =>
      jsonVoid(http.delete(`leader/clubs/${clubId}/fee-bills/${billId}`)),
  },
},
my: {
  fees: (params: MyFeeSearchParams) =>
    jsonOk<FeeBill[]>(http.get('my/fees', { searchParams: cleanParams(params) })),
},
```
> `ApiResponse<T>` 언랩(`jsonOk`)·`searchParams` 직렬화 헬퍼(`cleanParams`, 실파일 client.ts 확인됨)는 기존 client.ts 구현을 그대로 따른다. 응답이 `ApiResponse` 로 감싸여 있으므로 `jsonOk` 가 `.data` 를 푼다(기존 패턴 확인).

- [ ] **Step 3: queryKeys** `packages/hooks/src/feeQueryKeys.ts`

```ts
import type { BillSearchParams, MyFeeSearchParams } from '@duing/types';
export const feeQueryKeys = {
  all: ['fees'] as const,
  policies: (clubId: number) => [...feeQueryKeys.all, 'policies', clubId] as const,
  bills: (clubId: number, params: BillSearchParams) => [...feeQueryKeys.all, 'bills', clubId, params] as const,
  myFees: (params: MyFeeSearchParams) => [...feeQueryKeys.all, 'my', params] as const,
};
```

- [ ] **Step 4: hooks** `packages/hooks/src/fee.ts` (query + mutation + 무효화, `useApiClient()` 경유)

```ts
export function useClubFeePoliciesQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({ queryKey: feeQueryKeys.policies(clubId), queryFn: () => client.leader.fees.listPolicies(clubId) });
}
export function useCreateFeePolicyMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFeePolicyPayload) => client.leader.fees.createPolicy(clubId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feeQueryKeys.policies(clubId) }),
  });
}
// useUpdateFeePolicyMutation, useDeleteFeePolicyMutation — 동일 무효화
export function useClubFeeBillsQuery(clubId: number, params: BillSearchParams) {
  const client = useApiClient();
  return useQuery({ queryKey: feeQueryKeys.bills(clubId, params), queryFn: () => client.leader.fees.listBills(clubId, params) });
}
export function useGenerateBillsMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, payload }: { policyId: number; payload: GenerateBillsPayload }) =>
      client.leader.fees.generateBills(clubId, policyId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...feeQueryKeys.all, 'bills', clubId] }),
  });
}
// useCancelBillMutation — bills 무효화
export function useMyFeesQuery(params: MyFeeSearchParams) {
  const client = useApiClient();
  return useQuery({ queryKey: feeQueryKeys.myFees(params), queryFn: () => client.my.fees(params) });
}
```
`packages/hooks/src/index.ts` 에 새 훅·queryKeys export 추가.

- [ ] **Step 5: Zod 스키마** `packages/schemas/src/index.ts` (기존 패턴: 한국어 메시지, `z.infer`)

```ts
export const createFeePolicySchema = z.object({
  name: z.string().min(1, '정책 이름은 필수입니다.').max(100, '이름은 100자 이하여야 합니다.'),
  amount: z.coerce.number().int('금액은 정수여야 합니다.').min(0, '금액은 0 이상이어야 합니다.'),
  billingType: z.enum(['MONTHLY', 'SEMESTER', 'YEARLY', 'ONE_TIME']),
});
export type CreateFeePolicyInput = z.infer<typeof createFeePolicySchema>;

// 폼 검증은 선택 정책의 billingType 으로 분기(discriminatedUnion). 와이어는 flat(GenerateBillsPayload, billingType 미포함).
const monthlyBills = z.object({
  billingType: z.literal('MONTHLY'),
  billingPeriod: z.string().min(1, '회차(YYYY-MM)는 필수입니다.'),
  dueDate: z.string().optional(),
});
const yearlyBills = z.object({
  billingType: z.literal('YEARLY'),
  billingPeriod: z.string().min(1, '연도는 필수입니다.'),
  dueDate: z.string().optional(),
});
const semesterBills = z.object({
  billingType: z.literal('SEMESTER'),
  billingPeriod: z.string().min(1, '라벨은 필수입니다.'),
  billingStartDate: z.string().min(1, '시작일은 필수입니다.'),
  billingEndDate: z.string().min(1, '종료일은 필수입니다.'),
  dueDate: z.string().min(1, '마감일은 필수입니다.'),
});
const oneTimeBills = z.object({
  billingType: z.literal('ONE_TIME'),
  billingPeriod: z.string().min(1, '라벨은 필수입니다.'),
  billingStartDate: z.string().min(1, '행사일은 필수입니다.'),
  dueDate: z.string().min(1, '마감일은 필수입니다.'),
});
export const generateBillsSchema = z.discriminatedUnion('billingType', [
  monthlyBills, yearlyBills, semesterBills, oneTimeBills,
]);
export type GenerateBillsInput = z.infer<typeof generateBillsSchema>;

// 제출 시 billingType 을 떼어 flat 와이어 페이로드로 변환(백엔드 단일 DTO 와 정합; GenerateBillsPayload 는 @duing/types).
export const toGenerateBillsPayload = (input: GenerateBillsInput): GenerateBillsPayload => {
  const { billingType: _ignored, ...payload } = input;
  return payload;
};
```

- [ ] **Step 6: 타입체크 + 커밋**

Run: `cd frontend && pnpm -w typecheck`
```bash
git checkout -b feat/fee-frontend-wiring
git commit -am "feat(frontend): 회비 도메인 타입·API·훅·스키마 배선"
```

---

## Task FE-2: 회비 정책 탭 (`/manage/clubs/[clubId]/fees`)

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/fees/page.tsx`, `_pages/ClubFeesPage.tsx`, `_lib/feeLabels.ts`, `_components/PolicyList.tsx`, `_components/CreatePolicyDialog.tsx`
- Modify: `apps/web/app/manage/_components/ManageNav.tsx` (fees 링크)
- Test: `apps/web/test/manage/fee-labels.test.ts`, `apps/web/test/manage/policy-list.test.tsx`

- [ ] **Step 1: 라벨/포맷 유틸 + 테스트 먼저** `_lib/feeLabels.ts`

```ts
import type { BillingType, FeeStatus } from '@duing/types';
const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  MONTHLY: '월 회비', SEMESTER: '학기 회비', YEARLY: '연 회비', ONE_TIME: '일회성',
};
const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  PENDING: '납부대기', PAID: '납부완료', PARTIAL_PAID: '부분납부', OVERDUE: '연체', CANCELLED: '취소됨',
};
export const billingTypeLabel = (type: BillingType) => BILLING_TYPE_LABEL[type];
export const feeStatusLabel = (status: FeeStatus) => FEE_STATUS_LABEL[status];
export const formatWon = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
```
테스트: `formatWon(10000) === '10,000원'`, `billingTypeLabel('MONTHLY') === '월 회비'`.

- [ ] **Step 2: page.tsx** (`params: Promise<{clubId}>` + `use()` 패턴, members/page.tsx 그대로)

- [ ] **Step 3: ClubFeesPage.tsx** — 2탭(`정책`/`청구`) 상태, 정책 탭은 `PolicyList` + "정책 추가" 버튼→`CreatePolicyDialog`. `useClubFeePoliciesQuery(clubId)` 로딩/빈 상태 처리.

- [ ] **Step 4: PolicyList.tsx** — 정책 카드/행(이름·금액 `formatWon`·`billingTypeLabel`·활성 토글), 활성 토글은 `useUpdateFeePolicyMutation`. 정책 수정 UI(수정 다이얼로그/인라인)는 발행 이력이 있으면 `billingType` 입력을 비활성화하고(서버 409 `BillingTypeImmutable` 방지), 금액 입력 옆에 "기존 발행 청구액은 바뀌지 않습니다" 안내를 노출한다.

- [ ] **Step 5: CreatePolicyDialog.tsx** — `Dialog` + `useForm(zodResolver(createFeePolicySchema))` + `cn()` 에러 표시, 제출 시 `useCreateFeePolicyMutation`, `onSuccess` 닫기(추출된 `PromotionRequestModal` 폼 패턴 그대로).

- [ ] **Step 6: ManageNav 에 fees 링크 추가** — `const feesPath = toRoute(\`/manage/clubs/${currentClubId}/fees\`)`, `<Link href={feesPath}>회비 관리</Link>`.

- [ ] **Step 7: 테스트(Vitest, `vi.mock('@duing/hooks')`) + 실행 + 커밋**

```bash
git checkout -b feat/fee-policy-ui
git commit -am "feat(frontend): 회비 정책 관리 화면(정책 탭) 구현"
```

---

## Task FE-3: 청구 탭 (발행·현황·취소)

**Files:**
- Create: `_components/BillList.tsx`, `_components/GenerateBillsDialog.tsx`
- Modify: `_pages/ClubFeesPage.tsx` (청구 탭 연결)
- Test: `apps/web/test/manage/generate-bills-dialog.test.tsx`

- [ ] **Step 1: GenerateBillsDialog.tsx** — 정책 선택(`useClubFeePoliciesQuery`) → 선택 정책의 `billingType` 으로 `generateBillsSchema`(discriminatedUnion) 분기(MONTHLY: 회차 `YYYY-MM`만; SEMESTER/ONE_TIME: 기간·마감·라벨; YEARLY: 연도+선택 마감). 제출 시 `toGenerateBillsPayload()` 로 flat 변환 후 `useGenerateBillsMutation`. 성공 토스트는 "발행 완료 (신규 N · 기존 M)"(`created`/`skipped`), 그리고 **항상 청구 목록 쿼리를 invalidate**(동시 발행으로 `created=0`이어도 갱신 — 응답값만 신뢰하지 않음).
- [ ] **Step 2: BillList.tsx** — `useClubFeeBillsQuery(clubId, params)` 페이지네이션·`status`/`billingPeriod` 필터, 행별 상태 뱃지(`feeStatusLabel`)·취소 버튼(`useCancelBillMutation`, 확인 다이얼로그).
- [ ] **Step 3: 청구 탭 조립 + 테스트 + 커밋**

```bash
git checkout -b feat/fee-bill-ui
git commit -am "feat(frontend): 회비 청구 발행·현황·취소 화면(청구 탭) 구현"
```

---

## Task FE-4: 회원 내 회비 (`/me/fees`)

**Files:**
- Create: `apps/web/app/me/fees/page.tsx`, `_components/MyFeeList.tsx`
- Test: `apps/web/test/me/my-fees.test.tsx`

- [ ] **Step 1: page.tsx** (`/me` 패턴, 클라이언트 페이지) — `useMyFeesQuery({})`.
- [ ] **Step 2: MyFeeList.tsx** — 본인 청구 목록(동아리별 그룹 또는 평면), 회차·금액(`formatWon`)·마감일·상태 뱃지(`feeStatusLabel`). 빈 상태 "청구된 회비가 없습니다."
- [ ] **Step 3: (선택) /me 네비에 회비 항목 추가** — 기존 `/me` 메뉴 구성 확인 후 일관되게 추가.
- [ ] **Step 4: 테스트 + 커밋**

```bash
git checkout -b feat/my-fees-ui
git commit -am "feat(frontend): 회원 내 회비 조회 화면 구현"
```

---

## 자가 검토 결과 (계획 작성자 기록)

- **스펙 커버리지:** 정책 CRUD(BE-2/FE-2), 멱등 발행·취소(BE-3/FE-3), 조회+`/my/fees`(BE-4/FE-4), billing_type 규칙(BE-3 `BillingPeriodResolver`), 금액·상태 스냅샷/멱등 인덱스(BE-1), 권한(`requireManager` 전 Task), RLS/V60(BE-1) — 스펙 9개 In Scope 항목 모두 Task에 매핑됨.
- **타입 일관성:** `FeeBill.issue(...)`, `FeePolicy.create(...)`, `generate(GenerateBillsCommand)→GenerateBillsResult`, `bulkInsertBills(...)`/`countActiveByClubId`, `existsByFeePolicyId`(취소·soft-delete 포함), `findByIdAndClubIdForUpdate`, `feeQueryKeys.*`, `leader.fees.*`/`my.fees` 가 BE↔FE 전 구간에서 동일 시그니처로 사용됨.
- **설계 개정 반영(2026-06-16, 동시성·정합성 리뷰):** 단일 `INSERT...ON CONFLICT`(BE-1 repo·BE-3 service, `saveAll`/`findIssuedUserIds` 폐기), due_date 정합·과거차단·YEARLY clamp + 주입 `Clock`(BE-3 resolver/service + V60 `chk_fee_bill_due_in_range`), `billing_type` 불변(BE-2), 정책 행 비관적 잠금·발행 감사 로그(BE-3), 동시성·엣지·due 테스트(BE-3) + 공유 테스트 인프라(BE-1 Step 8) — 설계서 §2·§4·§5·§7·§8·§10·§11 과 정렬됨.
- **확인 보류(구현 시작 시 실파일 대조):** `ApplicationException` 생성자 시그니처(`code` 인자 유무), `ApiResponse` 팩토리명, `jsonOk` 의 `ApiResponse` 언랩 여부, `IntegrationTestBase` 클래스명/토큰 헬퍼 — 각 Task Step 주석에 명시함. 이는 placeholder 가 아니라 "기존 구현과 1:1 정렬" 지시.
