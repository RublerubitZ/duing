# PR1 — 백엔드 상시모집 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Recruitment.endDate` 를 nullable 로 만들고 `displayStatus`(UPCOMING / OPEN / ALWAYS_OPEN / CLOSED) 를 응답에 추가해 상시모집을 표현할 수 있게 한다.

**Architecture:** (1) Flyway 마이그레이션으로 `end_date` NOT NULL 제약 제거, (2) 엔티티에서 `endDate == null` 을 상시모집으로 취급, (3) 백엔드에서 `displayStatus` 를 계산해 Query DTO / Response DTO 에 포함, (4) 마감 알림 잡 / 모집중 필터 쿼리에서 `endDate IS NULL` 케이스를 안전하게 처리.

**Tech Stack:** Spring Boot 3.4, Java 21, Flyway, QueryDSL, JPA, JUnit 5 + AssertJ, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-05-18-recruitment-integration-and-always-open-design.md` §3 (상시모집).

**브랜치:** `feat/recruitment-always-open-backend` (develop 에서 분기, develop 으로 PR)

---

## File Structure

**Create:**
- `backend/src/main/resources/db/migration/V20__alter_recruitment_end_date_nullable.sql`
- `backend/src/main/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatus.java`
- `backend/src/test/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatusTest.java`
- `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentAlwaysOpenTest.java`

**Modify:**
- `backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentSummaryQuery.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentSummaryResponse.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java`
- `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java`
- `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepository.java` (네이티브 쿼리)
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` (`hasActiveRecruitment`)
- `backend/src/main/java/com/duing/domain/favorite/repository/ClubFavoriteRepositoryImpl.java` (서브쿼리 count)

---

## Task 1: Flyway 마이그레이션 — end_date NOT NULL 제약 제거

**Files:**
- Create: `backend/src/main/resources/db/migration/V20__alter_recruitment_end_date_nullable.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 상시모집(end_date 없음)을 표현할 수 있도록 NOT NULL 제약을 제거한다.
ALTER TABLE recruitment ALTER COLUMN end_date DROP NOT NULL;
```

- [ ] **Step 2: 애플리케이션 부팅으로 마이그레이션 적용 확인**

Run: `./gradlew :backend:bootRun --args='--spring.profiles.active=local' -x test`
또는 통합테스트 한 건만 실행:
Run: `./gradlew :backend:test --tests "com.duing.domain.recruitment.service.RecruitmentCreateExtensionTest"`
Expected: 빌드 PASS, Flyway 로그에 `V20` 적용 라인

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V20__alter_recruitment_end_date_nullable.sql
git commit -m "feat(backend): 상시모집 지원을 위해 recruitment.end_date NOT NULL 제거"
```

---

## Task 2: `RecruitmentDisplayStatus` enum 생성 + 도출 로직 단위 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatus.java`
- Create: `backend/src/test/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatusTest.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatusTest.java`:

```java
package com.duing.domain.recruitment.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecruitmentDisplayStatusTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 18);

    @Test
    @DisplayName("CLOSED 상태는 날짜와 무관하게 CLOSED 로 도출된다")
    void closedStatusAlwaysResolvesToClosed() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.CLOSED,
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }

    @Test
    @DisplayName("시작일이 오늘 이후면 UPCOMING 으로 도출된다")
    void beforeStartDateResolvesToUpcoming() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 20),
                LocalDate.of(2026, 5, 30),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.UPCOMING);
    }

    @Test
    @DisplayName("OPEN + endDate 가 null 이고 시작일이 도래했으면 ALWAYS_OPEN 으로 도출된다")
    void openWithNullEndDateAfterStartIsAlwaysOpen() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 1),
                null,
                TODAY)).isEqualTo(RecruitmentDisplayStatus.ALWAYS_OPEN);
    }

    @Test
    @DisplayName("OPEN + 시작일~종료일 사이면 OPEN 으로 도출된다")
    void openWithinPeriodResolvesToOpen() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 10),
                LocalDate.of(2026, 5, 30),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.OPEN);
    }

    @Test
    @DisplayName("OPEN 이지만 종료일이 지났으면 CLOSED 로 도출된다 (자동 만료)")
    void openButPastEndDateResolvesToClosed() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 10),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `./gradlew :backend:compileTestJava`
Expected: `RecruitmentDisplayStatus` 클래스 미존재로 컴파일 실패

- [ ] **Step 3: 최소 구현**

`backend/src/main/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatus.java`:

```java
package com.duing.domain.recruitment.entity;

import java.time.LocalDate;

/**
 * 모집 공고의 사용자 표시용 상태.
 * - 저장 상태({@link RecruitmentStatus})와 startDate / endDate / today 를 결합해 도출한다.
 * - endDate 가 null 이면 상시모집(ALWAYS_OPEN) 으로 취급한다.
 */
public enum RecruitmentDisplayStatus {
    UPCOMING,
    OPEN,
    ALWAYS_OPEN,
    CLOSED;

    public static RecruitmentDisplayStatus resolve(
            RecruitmentStatus status,
            LocalDate startDate,
            LocalDate endDate,
            LocalDate today
    ) {
        if (status == RecruitmentStatus.CLOSED) {
            return CLOSED;
        }
        if (today.isBefore(startDate)) {
            return UPCOMING;
        }
        if (endDate == null) {
            return ALWAYS_OPEN;
        }
        if (today.isAfter(endDate)) {
            return CLOSED;
        }
        return OPEN;
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.recruitment.entity.RecruitmentDisplayStatusTest"`
Expected: 5건 PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatus.java \
        backend/src/test/java/com/duing/domain/recruitment/entity/RecruitmentDisplayStatusTest.java
git commit -m "feat(backend): RecruitmentDisplayStatus enum과 도출 로직 추가"
```

---

## Task 3: `Recruitment` 엔티티 — endDate nullable + 상시모집 검증/조회 메서드

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java`

- [ ] **Step 1: 예외 클래스에 "상시모집 ↔ 기간모집 전환 불가" 예외 추가**

`backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java` 의 inner class 영역에 추가 (기존 패턴 따름):

```java
public static class AlwaysOpenConversionNotAllowedException extends RecruitmentException {
    public AlwaysOpenConversionNotAllowedException() {
        super("상시모집과 기간모집은 서로 전환할 수 없습니다. 새 모집을 생성하세요.");
    }
}
```

> 기존 `RecruitmentException` 안에 어떤 부모/공통 생성자를 쓰는지 파일을 먼저 읽어 그 패턴 그대로 따른다.

- [ ] **Step 2: `Recruitment.java` 수정**

기존 코드(`Recruitment.java:43-47`):

```java
@Column(name = "end_date", nullable = false)
private LocalDate endDate;
```

→ 변경:

```java
@Column(name = "end_date")
private LocalDate endDate;
```

기존 `createWithOptions` 검증 블록(`Recruitment.java:105-110`):

```java
if (endDate.isBefore(startDate)) {
    throw new IllegalArgumentException("모집 종료일은 시작일보다 빠를 수 없습니다.");
}
if (capacity <= 0) {
    throw new IllegalArgumentException("모집 정원은 1명 이상이어야 합니다.");
}
```

→ 변경 (`endDate` null 허용 + null 이 아닐 때만 비교):

```java
if (endDate != null && endDate.isBefore(startDate)) {
    throw new IllegalArgumentException("모집 종료일은 시작일보다 빠를 수 없습니다.");
}
if (capacity <= 0) {
    throw new IllegalArgumentException("모집 정원은 1명 이상이어야 합니다.");
}
```

기존 `isEffectivelyOpen` (`Recruitment.java:130-132`):

```java
public boolean isEffectivelyOpen(LocalDate today) {
    return status == RecruitmentStatus.OPEN && !today.isAfter(endDate);
}
```

→ 변경 (`endDate == null` 이면 종료 조건 무시):

```java
public boolean isEffectivelyOpen(LocalDate today) {
    if (status != RecruitmentStatus.OPEN) {
        return false;
    }
    return endDate == null || !today.isAfter(endDate);
}
```

`update` 메서드(`Recruitment.java:134-168`)에서 endDate 처리 영역(`Recruitment.java:147-155`):

```java
LocalDate resolvedStartDate = command.startDate() != null ? command.startDate() : this.startDate;
LocalDate resolvedEndDate = command.endDate() != null ? command.endDate() : this.endDate;
if (command.startDate() != null || command.endDate() != null) {
    if (resolvedEndDate.isBefore(resolvedStartDate)) {
        throw new RecruitmentException.InvalidRecruitmentPeriodException();
    }
    this.startDate = resolvedStartDate;
    this.endDate = resolvedEndDate;
}
```

→ 변경 (상시모집 ↔ 기간모집 전환을 명시적으로 차단):

```java
LocalDate resolvedStartDate = command.startDate() != null ? command.startDate() : this.startDate;
if (command.endDate() != null) {
    // 기존이 상시모집(endDate=null)이면 기간모집으로 전환 금지
    if (this.endDate == null) {
        throw new RecruitmentException.AlwaysOpenConversionNotAllowedException();
    }
    if (command.endDate().isBefore(resolvedStartDate)) {
        throw new RecruitmentException.InvalidRecruitmentPeriodException();
    }
    this.endDate = command.endDate();
}
if (command.startDate() != null) {
    if (this.endDate != null && this.endDate.isBefore(command.startDate())) {
        throw new RecruitmentException.InvalidRecruitmentPeriodException();
    }
    this.startDate = command.startDate();
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: 빌드 SUCCESS

- [ ] **Step 4: 기존 모집 단위 테스트가 깨지지 않는지 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.recruitment.*"`
Expected: 전부 PASS (기존 동작 회귀 없음). 만약 깨지면 변경 의도가 기존과 호환되지 않으므로 분석 후 보정.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java \
        backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java
git commit -m "feat(backend): Recruitment.endDate nullable화 + 상시모집 ↔ 기간모집 전환 차단"
```

---

## Task 4: Query DTO 에 `displayStatus` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java`

- [ ] **Step 1: `RecruitmentSummaryQuery` 수정**

전체 파일을 다음으로 교체 (`endDate` nullable + `displayStatus` 추가):

```java
package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;

public record RecruitmentSummaryQuery(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole
) {
    public static RecruitmentSummaryQuery from(Recruitment recruitment, LocalDate today) {
        return new RecruitmentSummaryQuery(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitment.getClub().getName(),
                recruitment.getTitle(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                recruitment.getCapacity(),
                recruitment.getStatus(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.isEffectivelyOpen(today),
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole()
        );
    }
}
```

- [ ] **Step 2: `RecruitmentDetailQuery` 수정**

전체 파일을 다음으로 교체:

```java
package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;
import java.util.List;

public record RecruitmentDetailQuery(
        Long id,
        Long clubId,
        String clubName,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        List<String> questions,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole
) {
    public static RecruitmentDetailQuery from(Recruitment recruitment, LocalDate today) {
        List<String> questions = recruitment.getForm() != null
                ? recruitment.getForm().getQuestions()
                : List.of();
        return new RecruitmentDetailQuery(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitment.getClub().getName(),
                recruitment.getTitle(),
                recruitment.getContent(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                recruitment.getCapacity(),
                recruitment.getStatus(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.isEffectivelyOpen(today),
                questions,
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole()
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: SUCCESS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentSummaryQuery.java \
        backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java
git commit -m "feat(backend): 모집 Query DTO에 displayStatus 필드 추가"
```

---

## Task 5: Response DTO 에 `displayStatus` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentSummaryResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java`

- [ ] **Step 1: `RecruitmentSummaryResponse` 수정**

전체 파일을 다음으로 교체:

```java
package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.LocalDate;

public record RecruitmentSummaryResponse(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole
) {
    public static RecruitmentSummaryResponse from(RecruitmentSummaryQuery summaryQuery) {
        return new RecruitmentSummaryResponse(
                summaryQuery.id(),
                summaryQuery.clubId(),
                summaryQuery.clubName(),
                summaryQuery.title(),
                summaryQuery.startDate(),
                summaryQuery.endDate(),
                summaryQuery.capacity(),
                summaryQuery.status(),
                summaryQuery.displayStatus(),
                summaryQuery.effectivelyOpen(),
                summaryQuery.applicationMode(),
                summaryQuery.externalFormUrl(),
                summaryQuery.useInterview(),
                summaryQuery.targetRole()
        );
    }
}
```

- [ ] **Step 2: `RecruitmentDetailResponse` 수정 — 동일 패턴**

전체 파일을 다음으로 교체:

```java
package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import java.time.LocalDate;
import java.util.List;

public record RecruitmentDetailResponse(
        Long id,
        Long clubId,
        String clubName,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        List<String> questions,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole
) {
    public static RecruitmentDetailResponse from(RecruitmentDetailQuery detailQuery) {
        return new RecruitmentDetailResponse(
                detailQuery.id(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.title(),
                detailQuery.content(),
                detailQuery.startDate(),
                detailQuery.endDate(),
                detailQuery.capacity(),
                detailQuery.status(),
                detailQuery.displayStatus(),
                detailQuery.effectivelyOpen(),
                detailQuery.questions(),
                detailQuery.applicationMode(),
                detailQuery.externalFormUrl(),
                detailQuery.useInterview(),
                detailQuery.targetRole()
        );
    }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `./gradlew :backend:compileJava`
Expected: SUCCESS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentSummaryResponse.java \
        backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java
git commit -m "feat(backend): 모집 Response DTO에 displayStatus 노출"
```

---

## Task 6: `CreateRecruitmentRequest` 에서 endDate optional 처리

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java`

- [ ] **Step 1: `endDate` 의 `@NotNull` 제거**

`backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java:27-28`:

```java
@NotNull(message = "모집 종료일은 필수 입력값입니다.")
LocalDate endDate,
```

→ 변경 (null 허용):

```java
LocalDate endDate,
```

`@NotNull` import 가 다른 필드에서 여전히 사용되므로 import 는 유지.

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java
git commit -m "feat(backend): CreateRecruitmentRequest.endDate를 optional로 변경"
```

---

## Task 7: 알림 잡 네이티브 쿼리에서 상시모집 제외

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepository.java`

- [ ] **Step 1: 네이티브 쿼리에 `end_date IS NOT NULL` 추가**

`backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepository.java:17-29` 의 `@Query` 본문을 다음으로 교체:

```java
@Query(value = """
        SELECT r.id AS recruitmentId, r.club_id AS clubId, c.name AS clubName, r.title AS title,
               r.end_date AS endDate,
               CASE
                 WHEN r.start_date = :today                                    THEN 'OPENED'
                 WHEN r.end_date IS NOT NULL AND (r.end_date - :today) IN (3,1,0) THEN 'DEADLINE'
               END AS kind,
               (r.end_date - :today) AS daysToEnd
          FROM recruitment r JOIN club c ON c.id = r.club_id
         WHERE r.status = 'OPEN' AND r.deleted_at IS NULL
           AND (
                 r.start_date = :today
                 OR ( r.end_date IS NOT NULL AND (r.end_date - :today) IN (3,1,0) )
               )
        """, nativeQuery = true)
List<DeadlineRow> findDeadlineNotificationCandidates(@Param("today") LocalDate today);
```

> 상시모집(`end_date IS NULL`)은 OPENED 알림(`start_date = :today`)에는 정상 포함되고, DEADLINE 알림에는 제외된다.

- [ ] **Step 2: 빌드/테스트 컴파일 확인**

Run: `./gradlew :backend:compileTestJava`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepository.java
git commit -m "feat(backend): 마감 알림 잡 쿼리에서 상시모집(end_date IS NULL) 안전 처리"
```

---

## Task 8: 모집중 필터 쿼리 — `ClubRepositoryImpl.hasActiveRecruitment`

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`

- [ ] **Step 1: QueryDSL 표현식 수정**

`backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java:83-95` 를 다음으로 교체:

```java
private BooleanExpression hasActiveRecruitment(boolean recruitingOnly) {
    if (!recruitingOnly) return null;
    LocalDate today = LocalDate.now();
    return JPAExpressions
            .selectOne()
            .from(recruitment)
            .where(
                    recruitment.club.id.eq(club.id),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
            )
            .exists();
}
```

- [ ] **Step 2: 빌드 확인**

Run: `./gradlew :backend:compileJava`
Expected: SUCCESS

- [ ] **Step 3: 기존 검색 테스트 회귀 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.club.service.ClubSearchTagsRecruitingTest"`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java
git commit -m "feat(backend): 동아리 검색의 '모집중' 필터에서 상시모집 포함"
```

---

## Task 9: 즐겨찾기 — `ClubFavoriteRepositoryImpl` 활성 모집 카운트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/favorite/repository/ClubFavoriteRepositoryImpl.java`

- [ ] **Step 1: 서브쿼리 where 절 수정**

`backend/src/main/java/com/duing/domain/favorite/repository/ClubFavoriteRepositoryImpl.java:38-43`:

```java
.where(
        recruitment.club.id.eq(club.id),
        recruitment.status.eq(RecruitmentStatus.OPEN),
        recruitment.endDate.goe(LocalDate.now()),
        recruitment.deletedAt.isNull()
)
```

→ 변경:

```java
.where(
        recruitment.club.id.eq(club.id),
        recruitment.status.eq(RecruitmentStatus.OPEN),
        recruitment.endDate.isNull().or(recruitment.endDate.goe(LocalDate.now())),
        recruitment.deletedAt.isNull()
)
```

- [ ] **Step 2: 빌드 확인**

Run: `./gradlew :backend:compileJava`
Expected: SUCCESS

- [ ] **Step 3: 즐겨찾기 테스트 회귀 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.favorite.service.ClubFavoriteServiceTest"`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/favorite/repository/ClubFavoriteRepositoryImpl.java
git commit -m "feat(backend): 즐겨찾기 활성 모집 카운트에서 상시모집 포함"
```

---

## Task 10: 상시모집 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentAlwaysOpenTest.java`

> 기존 `RecruitmentCreateExtensionTest` 와 같은 통합 테스트 패턴(`@SpringBootTest + @Transactional + TestcontainersConfiguration`)을 따른다. 가독성을 위해 도우미 메서드(`saveUser`, `saveLeader`, `saveClub`)는 기존 테스트에서 그대로 가져온다.

- [ ] **Step 1: 테스트 파일 작성**

`backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentAlwaysOpenTest.java`:

```java
package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class RecruitmentAlwaysOpenTest {

    @Autowired private RecruitmentService recruitmentService;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("endDate 가 null 이면 상시모집으로 생성되고 displayStatus 가 ALWAYS_OPEN 으로 도출된다")
    void createAlwaysOpenRecruitment() {
        Club club = saveClubWithLeader();

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                club.getLeader().getId(),
                "상시모집 공고",
                "언제든 환영",
                LocalDate.now().minusDays(1),
                null,                                // 상시모집
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of("자기소개를 해주세요")
        ));

        Recruitment saved = recruitmentRepository.findById(recruitmentId).orElseThrow();
        assertThat(saved.getEndDate()).isNull();
        assertThat(saved.isEffectivelyOpen(LocalDate.now().plusYears(1))).isTrue();

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.displayStatus()).isEqualTo(RecruitmentDisplayStatus.ALWAYS_OPEN);
    }

    @Test
    @DisplayName("상시모집(endDate=null)을 기간모집으로 전환하려고 하면 예외가 발생한다")
    void cannotConvertAlwaysOpenToPeriodRecruitment() {
        Club club = saveClubWithLeader();
        Long recruitmentId = recruitmentService.create(alwaysOpenCommand(club));

        UpdateRecruitmentCommand convertToPeriod = new UpdateRecruitmentCommand(
                recruitmentId,
                club.getLeader().getId(),
                null, null,
                null,
                LocalDate.now().plusDays(7),  // 기간모집으로 전환 시도
                null, null, null
        );

        assertThatThrownBy(() -> recruitmentService.update(convertToPeriod))
                .isInstanceOf(RecruitmentException.AlwaysOpenConversionNotAllowedException.class);
    }

    @Test
    @DisplayName("상시모집은 close() 로 마감되며 그 후 displayStatus 는 CLOSED 로 도출된다")
    void closeAlwaysOpenRecruitment() {
        Club club = saveClubWithLeader();
        Long recruitmentId = recruitmentService.create(alwaysOpenCommand(club));

        recruitmentService.close(recruitmentId, club.getLeader().getId());

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.displayStatus()).isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }

    private CreateRecruitmentCommand alwaysOpenCommand(Club club) {
        return new CreateRecruitmentCommand(
                club.getId(),
                club.getLeader().getId(),
                "상시모집",
                null,
                LocalDate.now().minusDays(1),
                null,
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of("자기소개")
        );
    }

    private Club saveClubWithLeader() {
        User leader = userRepository.save(User.builder()
                .email("leader" + sequence.incrementAndGet() + "@daegu.ac.kr")
                .password("encoded-password")
                .name("리더")
                .role(UserRole.USER)
                .college(College.IT)
                .grade(Grade.GRADE_3)
                .phone("010-1234-5678")
                .build());
        Club club = clubRepository.save(Club.builder()
                .name("상시모집 동아리 " + sequence.incrementAndGet())
                .category(ClubCategory.ACADEMIC)
                .leader(leader)
                .status(ClubStatus.ACTIVE)
                .build());
        clubMemberRepository.save(ClubMember.builder()
                .club(club)
                .user(leader)
                .role(ClubMemberRole.LEADER)
                .build());
        return club;
    }
}
```

> **주의:** 위 도우미 `User.builder()` / `Club.builder()` / `ClubMember.builder()` 의 필수 필드는 기존 `RecruitmentCreateExtensionTest` (`backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentCreateExtensionTest.java`) 의 `saveUser`, `saveLeader`, `saveClub` 도우미를 그대로 참조해 맞춘다. 빌더 메서드명/필수 필드가 다르면 그쪽을 그대로 카피한다.

- [ ] **Step 2: 테스트 실행**

Run: `./gradlew :backend:test --tests "com.duing.domain.recruitment.service.RecruitmentAlwaysOpenTest"`
Expected: 3건 PASS

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentAlwaysOpenTest.java
git commit -m "test(backend): 상시모집 생성/마감/전환차단 통합 테스트 추가"
```

---

## Task 11: 전체 빌드/테스트 + PR

- [ ] **Step 1: 전체 테스트 실행**

Run: `./gradlew :backend:test`
Expected: BUILD SUCCESSFUL, 전 테스트 PASS

- [ ] **Step 2: 회귀 발생 시**

깨진 테스트 분석 → 영향 받은 곳 보정(별도 커밋). 회귀 위험이 큰 곳:
- `DeadlineNotificationJobTest` — 알림 잡 조건이 바뀌었으므로 fixture 가 endDate null 케이스를 다뤄야 할 수 있음
- `ClubSearchTagsRecruitingTest` — 모집중 필터의 상시모집 포함 케이스 명시적 검증 추가 고려
- `ClubFavoriteServiceTest` — 카운트가 늘어나는 케이스 fixture 확인

- [ ] **Step 3: develop 으로 PR 생성**

```bash
git push -u origin feat/recruitment-always-open-backend
gh pr create --base develop --title "feat(backend): 모집 상시모집 지원 + displayStatus 응답 추가" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 모집 종료일(`end_date`) 제약을 풀어 상시모집(end_date=null) 을 표현할 수 있게 했습니다.
- 사용자 표시용 상태 `RecruitmentDisplayStatus` (UPCOMING / OPEN / ALWAYS_OPEN / CLOSED) 를 백엔드에서 계산해 응답에 포함합니다.
- 마감 알림 잡, 동아리 검색의 모집중 필터, 즐겨찾기 활성 모집 카운트 모두 상시모집을 안전하게 다루도록 보정했습니다.
- 상시모집과 기간모집은 서로 전환할 수 없도록 도메인 규칙을 못박았습니다.

## 🤔 고민했던 내용
- `effectivelyOpen` 을 폐기할지 검토했지만 기존 호출처가 많아 호환을 위해 그대로 유지하고 `displayStatus` 를 신규 필드로 노출했습니다.
- 상시모집 ↔ 기간모집 전환을 허용할 경우 운영 혼란이 크다고 판단해 도메인 단에서 차단했습니다. 운영진은 새 모집을 만들어야 합니다.

## 💬 리뷰 중점사항
- `RecruitmentDisplayStatus.resolve` 순서대로 처리되는 우선순위(특히 OPEN + endDate=null + 미래 startDate 의 UPCOMING 우선)가 의도와 맞는지 확인 부탁드립니다.
- 네이티브 알림 쿼리에 상시모집 제외 조건이 빠짐없이 들어갔는지 봐주세요.
EOF
)"
```

---

## Self-Review (작성자 체크리스트)

- [x] **스펙 커버리지** — 스펙 §3 의 모든 요구사항(엔티티 nullable / displayStatus / DTO / 알림잡 / is_recruiting 정렬·필터 / 수정 규칙 / 테스트) 이 Task 1~10 에 매핑됨.
- [x] **플레이스홀더 검사** — TBD / TODO / "implement later" 없음. 모든 코드 블록 완성.
- [x] **타입 일관성** — `RecruitmentDisplayStatus` 명칭과 enum value(`UPCOMING/OPEN/ALWAYS_OPEN/CLOSED`) 가 Query DTO / Response DTO / 테스트 전부 동일.
- [x] **DRY** — DisplayStatus 도출 로직은 `RecruitmentDisplayStatus.resolve` 한 곳에서만 일어남. Query DTO 두 곳에서 같은 메서드를 호출.
- [x] **TDD** — Task 2 는 테스트 먼저, Task 10 도 통합 테스트 별도 작업.
- [x] **자주 커밋** — 11개 작업 단위로 11개의 별도 커밋.

---

## 잔여 / 다음 PR로 연결되는 항목

- 프론트엔드 타입(`packages/types/src/recruitment.ts`) 의 `endDate: string | null` + `displayStatus` 필드 반영, 관리자 폼/표시 자리 일괄 교체는 **PR2** 에서 다룬다.
- 학생측 동아리 상세 페이지 재디자인 + 모집 통합은 **PR3** 에서 다룬다.
