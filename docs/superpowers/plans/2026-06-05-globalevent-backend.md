# PR1 — GlobalEvent 백엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 단위 행사 일정을 ADMIN 이 등록·관리할 수 있는 `GlobalEvent` 도메인을 풀스택(엔티티 + 마이그레이션 + 공개 read API + 어드민 CRUD + 카테고리 통계 + 테스트)으로 신설한다.

**Architecture:** Du-ing 백엔드의 DDD 패키지 컨벤션을 그대로 따른다. `domain/globalevent/` 하위에 `api` / `controller` / `service` / `repository` / `entity` / `exception` 패키지를 두고, 공개 조회는 `PublicGlobalEventController` 가 비로그인 포함 `permitAll()` 로, 어드민 CRUD 는 `AdminGlobalEventController` 가 `@PreAuthorize("hasRole('ADMIN')")` 로 분리한다. 카테고리 동적 필터는 QueryDSL `RepositoryCustom + Impl` 패턴으로 구현한다. 윈도우 / soft delete / period CHECK 등 검증 규칙은 ClubEvent 와 동일 정책.

**Tech Stack:** Spring Boot 3.4 · Java 21 · JPA + QueryDSL · Flyway · RestAssured + TestContainers · Fixture Monkey.

**브랜치:** `feat/calendar-globalevent-backend` (develop 에서 분기). 이 plan 의 모든 commit 은 본 브랜치 위에서 진행하고, 완료 후 develop 으로 1 PR.

**spec 참조:** [`docs/superpowers/specs/2026-06-05-calendar-integration-design.md`](../specs/2026-06-05-calendar-integration-design.md) §1.

---

## 사전 컨벤션 (모든 task 공통)

- DTO 는 전부 Java `record`.
- 한국어 `@DisplayName` 문장형 ("…한다"). 메서드명 금지.
- 변수명 축약 금지 (`e`, `r`, `dto` 금지 — `event`, `recruitment`, `request` 등 풀네임).
- 어노테이션 import 순서: `java → jakarta → spring → com.duing.global → com.duing.domain → lombok`.
- 모든 신규 클래스 패키지: `com.duing.domain.globalevent.{api|controller|controller.dto.request|controller.dto.response|service|service.dto.command|service.dto.query|repository|entity|exception}`.
- 빌드: 한 task 마지막 step 에서 `./gradlew compileJava` 로 컴파일 그린 확인 (테스트 task 는 `./gradlew test --tests <...>` 추가).
- 커밋 메시지 컨벤션: `feat(backend): ...` (Conventional Commits). `[#이슈번호] ...` 형식 사용 금지. Claude attribution 라인 추가 금지.

---

## File Structure (전체 PR 산출물)

**신규**
```
backend/src/main/resources/db/migration/
└── V35__create_global_event.sql

backend/src/main/java/com/duing/domain/globalevent/
├── entity/
│   ├── GlobalEvent.java
│   └── GlobalEventCategory.java
├── exception/
│   └── GlobalEventException.java
├── repository/
│   ├── GlobalEventRepository.java
│   ├── GlobalEventRepositoryCustom.java
│   └── GlobalEventRepositoryImpl.java
├── service/
│   ├── GlobalEventService.java
│   ├── GeneralGlobalEventService.java
│   └── dto/
│       ├── command/
│       │   ├── CreateGlobalEventCommand.java
│       │   └── UpdateGlobalEventCommand.java
│       └── query/
│           └── GlobalEventAdminSearchCondition.java
├── controller/
│   ├── PublicGlobalEventController.java
│   ├── AdminGlobalEventController.java
│   └── dto/
│       ├── request/
│       │   ├── CreateGlobalEventRequest.java
│       │   └── UpdateGlobalEventRequest.java
│       └── response/
│           ├── GlobalEventCardResponse.java
│           ├── GlobalEventDetailResponse.java
│           ├── AdminGlobalEventSummaryResponse.java
│           ├── AdminGlobalEventDetailResponse.java
│           └── GlobalEventCategoryStatsResponse.java
└── api/
    ├── PublicGlobalEventApi.java
    └── AdminGlobalEventApi.java

backend/src/test/java/com/duing/domain/globalevent/
└── GlobalEventAcceptanceTest.java
```

**수정**
```
backend/src/main/java/com/duing/global/config/SecurityConfig.java   # /api/v1/global-events GET permitAll
```

---

## Task 1: Flyway 마이그레이션 + 엔티티 + enum

도메인 스키마와 핵심 엔티티를 한 번에 만든다. 검증 로직(period / title) 은 엔티티 안에 가두고, 외부에서는 정적 팩토리 + update 메서드만 노출.

**Files:**
- Create: `backend/src/main/resources/db/migration/V35__create_global_event.sql`
- Create: `backend/src/main/java/com/duing/domain/globalevent/entity/GlobalEventCategory.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/entity/GlobalEvent.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/exception/GlobalEventException.java`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`V35__create_global_event.sql`:

```sql
-- global_event: 학교 단위 행사 일정 (ADMIN 만 작성)
CREATE TABLE global_event (
    id           BIGSERIAL    PRIMARY KEY,
    title        VARCHAR(120) NOT NULL,
    description  TEXT,
    start_at     TIMESTAMP    NOT NULL,
    end_at       TIMESTAMP    NOT NULL,
    location     VARCHAR(200),
    link_url     VARCHAR(500),
    category     VARCHAR(30)  NOT NULL,
    created_by   BIGINT       NOT NULL REFERENCES users(id),
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_global_event_period CHECK (end_at >= start_at)
);

CREATE INDEX idx_global_event_start
    ON global_event (start_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_global_event_category_start
    ON global_event (category, start_at)
    WHERE deleted_at IS NULL;
```

**인덱스 전략 판단 근거 (Rationale):**

공개 윈도우 조회 쿼리는 `WHERE start_at <= :to AND end_at >= :from ORDER BY start_at` — 즉 `start_at` 에는 범위 + 정렬 둘 다 적용되지만 `end_at` 은 범위만 적용된다. PostgreSQL B-Tree 는 다중 컬럼 범위 인덱스의 두 번째 컬럼을 잘 활용하지 못하므로, `(start_at, end_at)` 복합 인덱스를 만들어도 두 번째 컬럼은 사실상 sequential scan 이 된다. 따라서 단일 `start_at` 인덱스로 시작한다.

**충분성 판단:**
- 학교 단위 행사 (박람회 / 축제 / 신청 마감 / 대회 / 총동연 행사 / 기타) 의 연간 등록 규모는 **수십 ~ 수백 건**. soft delete + ADMIN 만 작성하는 도메인 특성상 5 년 후에도 1 ~ 2 천 건 미만 예상.
- 윈도우 기본 ±30/+180 일 = 약 210 일 윈도우 → 평균적으로 전체의 10 ~ 20% 만 매칭.
- 카테고리 필터는 어드민 목록에서만 사용 (공개 GE-1 은 카테고리 필터 없음) — `(category, start_at)` 부분 인덱스로 충분.
- 한 번 fetch 한 결과는 프론트에서 30s staleTime 캐시되므로 동일 윈도우에 대한 반복 호출도 없음.

**향후 검토 트리거 (현재는 시작 시점이라 도입 X):**
- 데이터 규모가 1 만 건 이상으로 늘어나거나
- p95 쿼리 시간이 100ms 를 넘으면

GiST 의 `tstzrange + && 연산자` 또는 PostgreSQL 14+ 의 `range types` 를 도입해 진정한 overlap 인덱싱을 검토한다. 현재는 YAGNI.

이 판단을 PR 본문의 "🤔 고민했던 내용" 에도 한 줄 남겨, 리뷰어가 인덱스 전략을 의도된 선택으로 인지하도록 함.

- [ ] **Step 2: `GlobalEventCategory` enum 작성**

```java
package com.duing.domain.globalevent.entity;

public enum GlobalEventCategory {
    FAIR,        // 박람회
    FESTIVAL,    // 축제·공연
    APPLICATION, // 신청 시작/마감
    CONTEST,     // 대회
    UNION,       // 총동연 행사
    OTHER        // 기타 (가급적 다른 카테고리 사용)
}
```

- [ ] **Step 3: `GlobalEventException` 작성**

ClubEventException 의 inner static class 패턴을 그대로 따른다. `ApplicationException` 상속.

```java
package com.duing.domain.globalevent.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class GlobalEventException extends ApplicationException {

    protected GlobalEventException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class GlobalEventNotFoundException extends GlobalEventException {
        public GlobalEventNotFoundException() {
            super("글로벌 이벤트를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidPeriodException extends GlobalEventException {
        public InvalidPeriodException() {
            super("종료 시각은 시작 시각 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidTitleException extends GlobalEventException {
        public InvalidTitleException() {
            super("제목은 공백일 수 없습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidWindowException extends GlobalEventException {
        public InvalidWindowException() {
            super("조회 기간은 400일 이내여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
```

- [ ] **Step 4: `GlobalEvent` 엔티티 작성**

```java
package com.duing.domain.globalevent.entity;

import com.duing.domain.globalevent.exception.GlobalEventException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "global_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE global_event SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class GlobalEvent extends BaseEntity {

    @Column(nullable = false, length = 120)              private String title;
    @Column(columnDefinition = "TEXT")                   private String description;
    @Column(name = "start_at", nullable = false)         private LocalDateTime startAt;
    @Column(name = "end_at",   nullable = false)         private LocalDateTime endAt;
    @Column(length = 200)                                private String location;
    @Column(name = "link_url", length = 500)             private String linkUrl;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)               private GlobalEventCategory category;
    @Column(name = "created_by", nullable = false)       private Long createdBy;

    @Builder(access = AccessLevel.PRIVATE)
    private GlobalEvent(String title, String description,
                        LocalDateTime startAt, LocalDateTime endAt,
                        String location, String linkUrl,
                        GlobalEventCategory category, Long createdBy) {
        validateTitle(title);
        validatePeriod(startAt, endAt);
        this.title = title.trim();
        this.description = description;
        this.startAt = startAt;
        this.endAt = endAt;
        this.location = location;
        this.linkUrl = linkUrl;
        this.category = category;
        this.createdBy = createdBy;
    }

    public static GlobalEvent create(String title, String description,
                                     LocalDateTime startAt, LocalDateTime endAt,
                                     String location, String linkUrl,
                                     GlobalEventCategory category, Long createdBy) {
        return GlobalEvent.builder()
                .title(title).description(description)
                .startAt(startAt).endAt(endAt)
                .location(location).linkUrl(linkUrl)
                .category(category).createdBy(createdBy)
                .build();
    }

    public void update(String title, String description,
                       LocalDateTime startAt, LocalDateTime endAt,
                       String location, String linkUrl,
                       GlobalEventCategory category) {
        LocalDateTime nextStart = startAt != null ? startAt : this.startAt;
        LocalDateTime nextEnd   = endAt   != null ? endAt   : this.endAt;
        validatePeriod(nextStart, nextEnd);
        if (title != null) {
            validateTitle(title);
            this.title = title.trim();
        }
        if (description != null) this.description = description;
        if (startAt != null) this.startAt = startAt;
        if (endAt != null) this.endAt = endAt;
        if (location != null) this.location = location;
        if (linkUrl != null) this.linkUrl = linkUrl;
        if (category != null) this.category = category;
    }

    private static void validatePeriod(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            throw new GlobalEventException.InvalidPeriodException();
        }
        if (end.isBefore(start)) {
            throw new GlobalEventException.InvalidPeriodException();
        }
    }

    private static void validateTitle(String title) {
        if (title == null || title.trim().isEmpty()) {
            throw new GlobalEventException.InvalidTitleException();
        }
    }
}
```

- [ ] **Step 5: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/resources/db/migration/V35__create_global_event.sql \
        backend/src/main/java/com/duing/domain/globalevent/entity/ \
        backend/src/main/java/com/duing/domain/globalevent/exception/
git commit -m "feat(backend): GlobalEvent 엔티티/마이그레이션/예외 신설"
```

---

## Task 2: Repository (QueryDSL 동적 필터 포함)

공개 윈도우 조회 + 어드민 페이지네이션 검색 + 카테고리 통계를 지원한다. `clubEvent` 와 달리 어드민 검색에 동적 카테고리·키워드 조건이 들어가므로 `RepositoryCustom + Impl` 분리.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/globalevent/repository/GlobalEventRepository.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/repository/GlobalEventRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/repository/GlobalEventRepositoryImpl.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/service/dto/query/GlobalEventAdminSearchCondition.java`

- [ ] **Step 1: Query 조건 record 작성**

`GlobalEventAdminSearchCondition.java`:

```java
package com.duing.domain.globalevent.service.dto.query;

import com.duing.domain.globalevent.entity.GlobalEventCategory;

public record GlobalEventAdminSearchCondition(
        GlobalEventCategory category,
        String keyword
) {}
```

- [ ] **Step 2: `GlobalEventRepositoryCustom` 인터페이스 작성**

```java
package com.duing.domain.globalevent.repository;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface GlobalEventRepositoryCustom {
    Page<GlobalEvent> findAdminList(GlobalEventAdminSearchCondition condition, Pageable pageable);

    Map<GlobalEventCategory, Long> countByCategory();
}
```

- [ ] **Step 3: `GlobalEventRepository` (Spring Data) 작성**

```java
package com.duing.domain.globalevent.repository;

import com.duing.domain.globalevent.entity.GlobalEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GlobalEventRepository extends JpaRepository<GlobalEvent, Long>, GlobalEventRepositoryCustom {

    @Query("""
        SELECT event FROM GlobalEvent event
        WHERE event.startAt <= :to
          AND event.endAt   >= :from
        ORDER BY event.startAt ASC
    """)
    List<GlobalEvent> findWindow(@Param("from") LocalDateTime from,
                                  @Param("to") LocalDateTime to);
}
```

윈도우 조건은 **다일 이벤트(박람회 D1~D3)** 가 윈도우의 일부 구간만 걸쳐도 잡히도록 `startAt <= to AND endAt >= from` 으로 잡는다. (ClubEvent 의 `startAt BETWEEN from AND to` 와 의도적으로 다름 — spec §3.4 의 박람회 3일 span 케이스 대응.)

- [ ] **Step 4: `GlobalEventRepositoryImpl` (QueryDSL) 작성**

```java
package com.duing.domain.globalevent.repository;

import static com.duing.domain.globalevent.entity.QGlobalEvent.globalEvent;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class GlobalEventRepositoryImpl implements GlobalEventRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<GlobalEvent> findAdminList(GlobalEventAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                categoryEq(condition.category()),
                keywordContains(condition.keyword())
        };

        List<GlobalEvent> content = queryFactory
                .selectFrom(globalEvent)
                .where(predicates)
                .orderBy(globalEvent.startAt.desc(), globalEvent.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(globalEvent.count())
                .from(globalEvent)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public Map<GlobalEventCategory, Long> countByCategory() {
        List<Tuple> rows = queryFactory
                .select(globalEvent.category, globalEvent.count())
                .from(globalEvent)
                .groupBy(globalEvent.category)
                .fetch();

        Map<GlobalEventCategory, Long> distribution = new EnumMap<>(GlobalEventCategory.class);
        for (GlobalEventCategory categoryValue : GlobalEventCategory.values()) {
            distribution.put(categoryValue, 0L);
        }
        for (Tuple row : rows) {
            GlobalEventCategory key = row.get(globalEvent.category);
            Long count = row.get(globalEvent.count());
            if (key != null && count != null) distribution.put(key, count);
        }
        return distribution;
    }

    private BooleanExpression categoryEq(GlobalEventCategory category) {
        return category == null ? null : globalEvent.category.eq(category);
    }

    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) return null;
        return globalEvent.title.containsIgnoreCase(keyword)
                .or(globalEvent.description.containsIgnoreCase(keyword));
    }
}
```

- [ ] **Step 5: 컴파일 확인 (Q 클래스 생성 필요)**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL — `QGlobalEvent` 가 `build/generated/.../entity/` 에 생성됨.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/repository/ \
        backend/src/main/java/com/duing/domain/globalevent/service/dto/query/
git commit -m "feat(backend): GlobalEvent repository (QueryDSL 어드민 검색 + 카테고리 통계)"
```

---

## Task 3: Service 인터페이스 + 구현 + Command DTO

`@Transactional(readOnly = true)` 기본 + 쓰기 메서드만 override. 윈도우 캡 / soft delete / 어드민 검색 / 카테고리 통계 로직을 모두 담는다.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/globalevent/service/dto/command/CreateGlobalEventCommand.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/service/dto/command/UpdateGlobalEventCommand.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/service/GlobalEventService.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java`

- [ ] **Step 1: Command record 작성**

`CreateGlobalEventCommand.java`:

```java
package com.duing.domain.globalevent.service.dto.command;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record CreateGlobalEventCommand(
        Long createdBy,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        GlobalEventCategory category
) {}
```

`UpdateGlobalEventCommand.java`:

```java
package com.duing.domain.globalevent.service.dto.command;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record UpdateGlobalEventCommand(
        Long eventId,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        GlobalEventCategory category
) {}
```

- [ ] **Step 2: `GlobalEventService` 인터페이스 작성**

```java
package com.duing.domain.globalevent.service;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface GlobalEventService {
    Long create(CreateGlobalEventCommand command);
    void update(UpdateGlobalEventCommand command);
    void delete(Long eventId);

    List<GlobalEvent> listPublicWindow(LocalDate from, LocalDate to);
    GlobalEvent getPublic(Long eventId);

    Page<GlobalEvent> listAdmin(GlobalEventAdminSearchCondition condition, Pageable pageable);
    GlobalEvent getAdmin(Long eventId);
    Map<GlobalEventCategory, Long> categoryStats();
}
```

엔티티 반환을 선택한 이유: response 변환은 컨트롤러에서 user 정보를 함께 조회해 `from()` 으로 만들 책임. (`ClubEventDetailResponse.from(event, creator)` 패턴과 동일.)

- [ ] **Step 3: `GeneralGlobalEventService` 구현 작성**

```java
package com.duing.domain.globalevent.service;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.exception.GlobalEventException;
import com.duing.domain.globalevent.repository.GlobalEventRepository;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralGlobalEventService implements GlobalEventService {

    private static final int DEFAULT_PAST_DAYS = 30;
    private static final int DEFAULT_FUTURE_DAYS = 180;
    private static final int MAX_WINDOW_DAYS = 400;

    private final GlobalEventRepository eventRepository;

    @Override
    @Transactional
    public Long create(CreateGlobalEventCommand command) {
        GlobalEvent event = GlobalEvent.create(
                command.title(), command.description(),
                command.startAt(), command.endAt(),
                command.location(), command.linkUrl(),
                command.category(), command.createdBy()
        );
        return eventRepository.save(event).getId();
    }

    @Override
    @Transactional
    public void update(UpdateGlobalEventCommand command) {
        GlobalEvent event = eventRepository.findById(command.eventId())
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
        event.update(command.title(), command.description(),
                command.startAt(), command.endAt(),
                command.location(), command.linkUrl(),
                command.category());
    }

    @Override
    @Transactional
    public void delete(Long eventId) {
        GlobalEvent event = eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
        eventRepository.delete(event);
    }

    @Override
    public List<GlobalEvent> listPublicWindow(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate fromDate = from != null ? from : today.minusDays(DEFAULT_PAST_DAYS);
        LocalDate toDate   = to   != null ? to   : today.plusDays(DEFAULT_FUTURE_DAYS);
        if (toDate.isBefore(fromDate)) {
            throw new GlobalEventException.InvalidWindowException();
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
            throw new GlobalEventException.InvalidWindowException();
        }
        LocalDateTime fromTs = fromDate.atStartOfDay();
        LocalDateTime toTs   = toDate.atTime(LocalTime.MAX);
        return eventRepository.findWindow(fromTs, toTs);
    }

    @Override
    public GlobalEvent getPublic(Long eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
    }

    @Override
    public Page<GlobalEvent> listAdmin(GlobalEventAdminSearchCondition condition, Pageable pageable) {
        return eventRepository.findAdminList(condition, pageable);
    }

    @Override
    public GlobalEvent getAdmin(Long eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
    }

    @Override
    public Map<GlobalEventCategory, Long> categoryStats() {
        return eventRepository.countByCategory();
    }
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/service/
git commit -m "feat(backend): GlobalEventService (윈도우 조회 + 어드민 검색 + 카테고리 통계)"
```

---

## Task 4: Request/Response DTO

전부 record. validation 한국어 메시지. `linkUrl` 은 `@Pattern` 으로 `^https?://.+` 검증.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/request/CreateGlobalEventRequest.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/request/UpdateGlobalEventRequest.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/GlobalEventCardResponse.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/GlobalEventDetailResponse.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/AdminGlobalEventSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/AdminGlobalEventDetailResponse.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/GlobalEventCategoryStatsResponse.java`

- [ ] **Step 1: `CreateGlobalEventRequest` 작성**

```java
package com.duing.domain.globalevent.controller.dto.request;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateGlobalEventRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,

        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,

        @NotNull(message = "시작 시각은 필수 입력값입니다.") LocalDateTime startAt,
        @NotNull(message = "종료 시각은 필수 입력값입니다.") LocalDateTime endAt,

        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location,

        @Pattern(regexp = "^https?://.+", message = "링크는 http:// 또는 https:// 로 시작해야 합니다.")
        @Size(max = 500, message = "링크는 500자 이하여야 합니다.") String linkUrl,

        @NotNull(message = "카테고리는 필수 입력값입니다.") GlobalEventCategory category
) {
    public CreateGlobalEventCommand toCommand(Long createdBy) {
        return new CreateGlobalEventCommand(
                createdBy, title, description, startAt, endAt,
                location, linkUrl, category
        );
    }
}
```

- [ ] **Step 2: `UpdateGlobalEventRequest` 작성**

```java
package com.duing.domain.globalevent.controller.dto.request;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateGlobalEventRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location,
        @Pattern(regexp = "^https?://.+", message = "링크는 http:// 또는 https:// 로 시작해야 합니다.")
        @Size(max = 500, message = "링크는 500자 이하여야 합니다.") String linkUrl,
        GlobalEventCategory category
) {
    public UpdateGlobalEventCommand toCommand(Long eventId) {
        return new UpdateGlobalEventCommand(
                eventId, title, description, startAt, endAt,
                location, linkUrl, category
        );
    }
}
```

`Pattern` 은 null 일 경우 매칭을 건너뛰므로 partial update 와 호환된다.

- [ ] **Step 3: 공개 Response DTO 작성**

`GlobalEventCardResponse.java`:

```java
package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record GlobalEventCardResponse(
        Long id,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        GlobalEventCategory category
) {
    public static GlobalEventCardResponse from(GlobalEvent event) {
        return new GlobalEventCardResponse(
                event.getId(), event.getTitle(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getCategory()
        );
    }
}
```

`GlobalEventDetailResponse.java`:

```java
package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record GlobalEventDetailResponse(
        Long id,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        GlobalEventCategory category
) {
    public static GlobalEventDetailResponse from(GlobalEvent event) {
        return new GlobalEventDetailResponse(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(), event.getCategory()
        );
    }
}
```

- [ ] **Step 4: 어드민 Response DTO 작성**

`AdminGlobalEventSummaryResponse.java`:

```java
package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record AdminGlobalEventSummaryResponse(
        Long id,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        GlobalEventCategory category,
        Long createdById,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static AdminGlobalEventSummaryResponse from(GlobalEvent event) {
        return new AdminGlobalEventSummaryResponse(
                event.getId(), event.getTitle(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getCategory(),
                event.getCreatedBy(),
                event.getCreatedAt(), event.getUpdatedAt()
        );
    }
}
```

`AdminGlobalEventDetailResponse.java`:

```java
package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;

public record AdminGlobalEventDetailResponse(
        Long id,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        GlobalEventCategory category,
        CreatorRef createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record CreatorRef(Long id, String name) {}

    public static AdminGlobalEventDetailResponse from(GlobalEvent event, User creator) {
        return new AdminGlobalEventDetailResponse(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(), event.getCategory(),
                new CreatorRef(creator.getId(), creator.getName()),
                event.getCreatedAt(), event.getUpdatedAt()
        );
    }
}
```

`GlobalEventCategoryStatsResponse.java`:

```java
package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.util.EnumMap;
import java.util.Map;

public record GlobalEventCategoryStatsResponse(
        Map<GlobalEventCategory, Long> distribution
) {
    public static GlobalEventCategoryStatsResponse from(Map<GlobalEventCategory, Long> stats) {
        Map<GlobalEventCategory, Long> normalized = new EnumMap<>(GlobalEventCategory.class);
        for (GlobalEventCategory categoryValue : GlobalEventCategory.values()) {
            normalized.put(categoryValue, stats.getOrDefault(categoryValue, 0L));
        }
        return new GlobalEventCategoryStatsResponse(normalized);
    }
}
```

응답 JSON 형태: `{ "distribution": { "FAIR": 5, ... } }`. spec §1.5 의 평탄한 Map 형태가 필요하면 `distribution` 키를 벗기는 게 가능하지만, 다른 어드민 응답들이 모두 객체 wrap 컨벤션을 따르므로 컨벤션 유지.

- [ ] **Step 5: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/controller/dto/
git commit -m "feat(backend): GlobalEvent Request/Response DTO (validation + 변환)"
```

---

## Task 5: 공개 API 인터페이스 + 컨트롤러

GE-1 (윈도우 조회) + GE-2 (상세). 비로그인 포함 permitAll.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/globalevent/api/PublicGlobalEventApi.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/PublicGlobalEventController.java`
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java`

- [ ] **Step 1: `PublicGlobalEventApi` 인터페이스 작성**

```java
package com.duing.domain.globalevent.api;

import com.duing.domain.globalevent.controller.dto.response.GlobalEventCardResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventDetailResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "글로벌 이벤트 (공개)")
public interface PublicGlobalEventApi {

    @Operation(summary = "글로벌 이벤트 윈도우 조회 (공개)")
    @GetMapping("/global-events")
    ResponseEntity<ApiResponse<List<GlobalEventCardResponse>>> listWindow(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );

    @Operation(summary = "글로벌 이벤트 상세 (공개)")
    @GetMapping("/global-events/{eventId}")
    ResponseEntity<ApiResponse<GlobalEventDetailResponse>> getDetail(@PathVariable Long eventId);
}
```

- [ ] **Step 2: `PublicGlobalEventController` 구현**

```java
package com.duing.domain.globalevent.controller;

import com.duing.domain.globalevent.api.PublicGlobalEventApi;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventCardResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventDetailResponse;
import com.duing.domain.globalevent.service.GlobalEventService;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PublicGlobalEventController implements PublicGlobalEventApi {

    private final GlobalEventService eventService;

    @Override
    public ResponseEntity<ApiResponse<List<GlobalEventCardResponse>>> listWindow(LocalDate from, LocalDate to) {
        List<GlobalEventCardResponse> items = eventService.listPublicWindow(from, to)
                .stream()
                .map(GlobalEventCardResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(items));
    }

    @Override
    public ResponseEntity<ApiResponse<GlobalEventDetailResponse>> getDetail(Long eventId) {
        return ResponseEntity.ok(
                ApiResponse.success(GlobalEventDetailResponse.from(eventService.getPublic(eventId)))
        );
    }
}
```

- [ ] **Step 3: SecurityConfig 에 공개 매칭 추가**

`SecurityConfig.java` 의 `authorizeHttpRequests` 블록에서 `notices` permitAll 줄 바로 아래에 추가:

```java
.requestMatchers(HttpMethod.GET, "/api/v1/global-events", "/api/v1/global-events/**").permitAll()
```

Read 후 정확한 위치 확인 — `notices` 줄 아래, `promotions` 줄 위.

- [ ] **Step 4: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/api/PublicGlobalEventApi.java \
        backend/src/main/java/com/duing/domain/globalevent/controller/PublicGlobalEventController.java \
        backend/src/main/java/com/duing/global/config/SecurityConfig.java
git commit -m "feat(backend): GlobalEvent 공개 조회 API (비로그인 포함)"
```

---

## Task 6: 어드민 API 인터페이스 + 컨트롤러

GE-3 (목록) / GE-3.5 (카테고리 통계) / GE-4 (상세) / GE-5 (생성) / GE-6 (수정) / GE-7 (삭제). 클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")`.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/globalevent/api/AdminGlobalEventApi.java`
- Create: `backend/src/main/java/com/duing/domain/globalevent/controller/AdminGlobalEventController.java`

- [ ] **Step 1: `AdminGlobalEventApi` 인터페이스 작성**

ClubEventWriteApi 패턴 그대로 — `create` 만 `UserPrincipal` 을 hidden 파라미터로 받음 (감사 목적 `createdBy` 채우기).

```java
package com.duing.domain.globalevent.api;

import com.duing.domain.globalevent.controller.dto.request.CreateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.request.UpdateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventDetailResponse;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventSummaryResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventCategoryStatsResponse;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "글로벌 이벤트 (어드민)")
@SecurityRequirement(name = "BearerAuth")
public interface AdminGlobalEventApi {

    @Operation(summary = "어드민 목록 (ADMIN)")
    @GetMapping("/admin/global-events")
    ResponseEntity<ApiResponse<PageResponse<AdminGlobalEventSummaryResponse>>> list(
            @RequestParam(required = false) GlobalEventCategory category,
            @RequestParam(required = false) String keyword,
            @ParameterObject Pageable pageable
    );

    @Operation(summary = "카테고리 분포 통계 (ADMIN)")
    @GetMapping("/admin/global-events/category-stats")
    ResponseEntity<ApiResponse<GlobalEventCategoryStatsResponse>> categoryStats();

    @Operation(summary = "어드민 상세 (ADMIN)")
    @GetMapping("/admin/global-events/{eventId}")
    ResponseEntity<ApiResponse<AdminGlobalEventDetailResponse>> getDetail(@PathVariable Long eventId);

    @Operation(summary = "글로벌 이벤트 생성 (ADMIN)")
    @PostMapping("/admin/global-events")
    ResponseEntity<ApiResponse<Long>> create(
            @Valid @RequestBody CreateGlobalEventRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "글로벌 이벤트 수정 (ADMIN)")
    @PatchMapping("/admin/global-events/{eventId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long eventId,
            @Valid @RequestBody UpdateGlobalEventRequest request
    );

    @Operation(summary = "글로벌 이벤트 삭제 (ADMIN)")
    @DeleteMapping("/admin/global-events/{eventId}")
    ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long eventId);
}
```

- [ ] **Step 2: `AdminGlobalEventController` 구현**

```java
package com.duing.domain.globalevent.controller;

import com.duing.domain.globalevent.api.AdminGlobalEventApi;
import com.duing.domain.globalevent.controller.dto.request.CreateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.request.UpdateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventDetailResponse;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventSummaryResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventCategoryStatsResponse;
import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.GlobalEventService;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminGlobalEventController implements AdminGlobalEventApi {

    private final GlobalEventService eventService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminGlobalEventSummaryResponse>>> list(
            GlobalEventCategory category, String keyword, Pageable pageable
    ) {
        Page<GlobalEvent> page = eventService.listAdmin(
                new GlobalEventAdminSearchCondition(category, keyword), pageable
        );
        Page<AdminGlobalEventSummaryResponse> mapped = page.map(AdminGlobalEventSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<GlobalEventCategoryStatsResponse>> categoryStats() {
        return ResponseEntity.ok(
                ApiResponse.success(GlobalEventCategoryStatsResponse.from(eventService.categoryStats()))
        );
    }

    @Override
    public ResponseEntity<ApiResponse<AdminGlobalEventDetailResponse>> getDetail(Long eventId) {
        GlobalEvent event = eventService.getAdmin(eventId);
        User creator = userRepository.findById(event.getCreatedBy())
                .orElseThrow(() -> new IllegalStateException("global event creator missing: " + event.getCreatedBy()));
        return ResponseEntity.ok(
                ApiResponse.success(AdminGlobalEventDetailResponse.from(event, creator))
        );
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            CreateGlobalEventRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long eventId = eventService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(eventId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(Long eventId, UpdateGlobalEventRequest request) {
        eventService.update(request.toCommand(eventId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(Long eventId) {
        eventService.delete(eventId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/api/AdminGlobalEventApi.java \
        backend/src/main/java/com/duing/domain/globalevent/controller/AdminGlobalEventController.java
git commit -m "feat(backend): GlobalEvent 어드민 CRUD + 카테고리 통계 API"
```

---

## Task 7: Acceptance Test (RestAssured + TestContainers)

`ClubEventAcceptanceTest` 동일 패턴. ADMIN / STUDENT 토큰 분리. 케이스: 공개 조회 (비로그인·기본 윈도우·캡 400), 어드민 생성·수정·삭제·검색, 카테고리 통계 6 키 보장, STUDENT 403, 검증 실패 4 케이스(title 공백·endAt<startAt·linkUrl 패턴·category null).

**Files:**
- Create: `backend/src/test/java/com/duing/domain/globalevent/GlobalEventAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.globalevent;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
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
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class GlobalEventAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;
    private Long adminId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminId = admin.getId();
        adminToken   = jwtTokenProvider.createToken(admin.getId(),   admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }

    private Map<String, Object> samplePayload(LocalDateTime start, LocalDateTime end) {
        Map<String, Object> body = new HashMap<>();
        body.put("title", "가을 동아리 박람회");
        body.put("description", "박람회 안내");
        body.put("startAt", start.toString());
        body.put("endAt", end.toString());
        body.put("location", "중앙광장");
        body.put("linkUrl", "https://example.com/info");
        body.put("category", "FAIR");
        return body;
    }

    private Long createAsAdmin(LocalDateTime start, LocalDateTime end) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(samplePayload(start, end))
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    @Test
    @DisplayName("ADMIN 이 등록한 글로벌 이벤트를 비로그인 사용자가 조회한다")
    void publicListWithoutAuth() {
        LocalDateTime start = LocalDateTime.now().plusDays(10).withNano(0);
        createAsAdmin(start, start.plusHours(8));

        RestAssured.given()
                .when().get("/api/v1/global-events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(greaterThanOrEqualTo(1)))
                .body("data[0].category", equalTo("FAIR"));
    }

    @Test
    @DisplayName("from/to 기본값은 today-30d ~ today+180d 로 적용된다")
    void publicWindowDefaults() {
        // 윈도우 안 (+10일)
        LocalDateTime inside = LocalDateTime.now().plusDays(10).withNano(0);
        createAsAdmin(inside, inside.plusHours(2));

        // 윈도우 밖 (+300일) — default to=+180d 이므로 미노출 기대
        LocalDateTime outside = LocalDateTime.now().plusDays(300).withNano(0);
        createAsAdmin(outside, outside.plusHours(2));

        RestAssured.given()
                .when().get("/api/v1/global-events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1));
    }

    @Test
    @DisplayName("윈도우가 400일을 초과하면 400 을 반환한다")
    void publicWindowCap() {
        LocalDate from = LocalDate.now().minusDays(1);
        LocalDate to   = LocalDate.now().plusDays(500);
        RestAssured.given()
                .when().get("/api/v1/global-events?from=" + from + "&to=" + to)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 글로벌 이벤트 상세는 404 를 반환한다")
    void publicDetailNotFound() {
        RestAssured.given()
                .when().get("/api/v1/global-events/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("STUDENT 가 어드민 엔드포인트에 접근하면 403 을 반환한다")
    void studentForbiddenOnAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("title 이 공백이면 생성 요청은 400 을 반환한다")
    void createInvalidTitle() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.plusHours(1));
        body.put("title", "   ");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("endAt 이 startAt 보다 이르면 400 을 반환한다")
    void createInvalidPeriod() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.minusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("linkUrl 이 http(s) 로 시작하지 않으면 400 을 반환한다")
    void createInvalidLinkUrl() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.plusHours(1));
        body.put("linkUrl", "javascript:alert(1)");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("category 가 null 이면 400 을 반환한다")
    void createNullCategory() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.plusHours(1));
        body.remove("category");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ADMIN 이 부분 수정·삭제하면 공개 목록에서 반영된다")
    void adminUpdateAndDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(5).withNano(0);
        Long eventId = createAsAdmin(start, start.plusHours(2));

        // partial update: title + linkUrl
        Map<String, Object> patch = new HashMap<>();
        patch.put("title", "가을 동아리 박람회 (수정)");
        patch.put("linkUrl", "https://example.com/v2");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(patch)
                .when().patch("/api/v1/admin/global-events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .when().get("/api/v1/global-events/" + eventId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.title", equalTo("가을 동아리 박람회 (수정)"))
                .body("data.linkUrl", equalTo("https://example.com/v2"));

        // delete (soft)
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete("/api/v1/admin/global-events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .when().get("/api/v1/global-events/" + eventId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("카테고리 통계는 enum 6 키를 모두 0 포함으로 반환한다")
    void categoryStatsAllKeys() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        createAsAdmin(start, start.plusHours(1)); // FAIR=1

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/global-events/category-stats")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.distribution.FAIR",        equalTo(1))
                .body("data.distribution.FESTIVAL",    equalTo(0))
                .body("data.distribution.APPLICATION", equalTo(0))
                .body("data.distribution.CONTEST",     equalTo(0))
                .body("data.distribution.UNION",       equalTo(0))
                .body("data.distribution.OTHER",       equalTo(0));
    }

    @Test
    @DisplayName("어드민 목록은 카테고리 필터와 키워드를 동시에 적용한다")
    void adminListFilter() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        // FAIR (default title 에 박람회 포함)
        createAsAdmin(start, start.plusHours(1));
        // FESTIVAL — 별도 호출로 카테고리만 바꿔 등록
        Map<String, Object> festivalBody = samplePayload(start.plusDays(1), start.plusDays(1).plusHours(2));
        festivalBody.put("title", "두잉 페스티벌");
        festivalBody.put("category", "FESTIVAL");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(festivalBody)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/global-events?category=FAIR")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].category", equalTo("FAIR"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/global-events?keyword=페스티벌")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].title", equalTo("두잉 페스티벌"));
    }
}
```

> `TestcontainersConfiguration` / `UserRole.ADMIN` / `JwtTokenProvider.createToken` 시그니처는 ClubEventAcceptanceTest 와 동일 패턴. 만약 `UserRole.ADMIN` 이 다른 이름이면(`UserRole.ADMIN` vs `UserRole.UNION` 등) `User.java` 의 enum 정의를 grep 으로 확인 후 맞춘다.

- [ ] **Step 2: 테스트 실행**

Run: `./gradlew test --tests com.duing.domain.globalevent.GlobalEventAcceptanceTest`
Expected: 모든 테스트 PASS. Docker 실행 중이어야 함.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/globalevent/GlobalEventAcceptanceTest.java
git commit -m "test(backend): GlobalEvent acceptance 테스트 (공개·어드민·카테고리 통계·검증)"
```

---

## Task 8: 전체 빌드 + PR 준비

- [ ] **Step 1: 전체 빌드 + 테스트**

Run: `./gradlew clean build`
Expected: BUILD SUCCESSFUL. 모든 테스트 PASS, Flyway 마이그레이션 적용 OK.

- [ ] **Step 2: spec / PR 체크리스트 self-review**

다음 7개 self-check 확인:
1. spec §1.4 의 모든 엔드포인트 (GE-1 ~ GE-7, GE-3.5) 구현됐는가
2. spec §1.5 응답 DTO 형태 일치하는가 (카테고리 통계 enum 6 키 보장 포함)
3. spec §1.3 필드 정책 (≤120 / ≤2000 / linkUrl regex / category NOT NULL) 모두 반영됐는가
4. soft delete 동작 (`@SQLDelete` + `@SQLRestriction` + 인덱스 `WHERE deleted_at IS NULL`) 검증 테스트 통과하는가
5. SecurityConfig 의 공개 GET 매칭이 추가됐는가
6. ADMIN 만 어드민 엔드포인트 접근 가능 — STUDENT 403 테스트 통과하는가
7. 커밋 메시지에 Conventional Commits 형식 + Claude attribution 없는가

- [ ] **Step 3: PR 생성 안내 (수동)**

이 plan 의 모든 task 가 완료되면 `feat/calendar-globalevent-backend` 브랜치를 push 하고 develop 대상 PR 을 생성. PR 본문은 다음 구조:

```
## 🚀 작업 내용
학교 단위 행사 일정을 ADMIN 이 등록·관리할 수 있는 GlobalEvent 도메인을 신설했습니다.
캘린더 실데이터 통합의 첫 단계로, 공개 read API 2 개와 어드민 CRUD 5 개, 카테고리 분포 통계 1 개를 함께 제공합니다.

## 🤔 고민했던 내용
- 윈도우 조회 시 다일 이벤트 (박람회 3일 등) 가 부분 구간만 걸쳐도 잡혀야 해서 `startAt <= to AND endAt >= from` 으로 잡았습니다.
- 카테고리 통계 응답은 enum 6 키를 항상 0 포함으로 반환하도록 정규화 — 프론트가 분포 차트를 안전하게 그릴 수 있도록.
- OTHER 카테고리 남용 가시화는 백엔드에서 통계만 제공하고, 임계치 기반 UI 경고는 PR2 의 어드민 위젯에서 처리하기로 했습니다.

## 💬 리뷰 중점사항
- 공개 GET 엔드포인트의 SecurityConfig `permitAll()` 매칭 위치
- 윈도우 정책 (default ±30/+180, max 400d) 의 ClubEvent 와의 일관성
- linkUrl `^https?://.+` 패턴이 partial update 와 호환되는지 (null 패스)
```

(PR 본문에 파일/클래스명 나열 금지 — 자연스러운 글로.)

---

## Out of Scope (이 plan 에서 안 함)

- 어드민 UI (PR 2) / 캘린더 통합 UI (PR 3) — 별도 plan.
- 반복 일정 / 종일 플래그 / 이미지 첨부 / 외부 노출 차단 등 — spec §6 Out of Scope.
- `ApplicationException` / `JwtTokenProvider` / `UserPrincipal` 같은 공통 클래스 수정 — 이미 존재한다고 가정 (없으면 plan 실행 전 별도 확인 필요).
