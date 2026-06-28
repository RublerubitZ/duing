# Public Activity Feed API (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 Hero 용 공개(비인증) 최근 활동 피드 API — 6개 도메인의 최근 활동을 읽기 전용으로 집계해 시간순 JSON 으로 제공한다.

**Architecture:** 신규 read-model 도메인 `com.duing.domain.publicactivity`. 소스별 QueryDSL 쿼리 6개(`PublicActivityQueryRepository`)로 각 `sourceFetchLimit` 건씩 뽑아, 서비스가 머지→정렬(occurredAt DESC, clubId DESC, type ASC)→상위 `effectiveLimit`. 공개 GET `/api/v1/public-activities` 로 노출. DB 스키마·기존 도메인 쓰기경로 변경 없음.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / JPA / RestAssured + Testcontainers(Postgres) 테스트.

**스펙:** `docs/superpowers/specs/2026-06-29-public-activity-feed-api-design.md`

---

## 백엔드 사실 (탐색 확정 — 코드에 그대로 사용)

- **Club FK 혼재**: `Recruitment.club` 만 `@ManyToOne`(→ `recruitment.club.id/name/status`). `Notice.owningClubId`(Long, nullable), `ClubEvent.clubId`(Long), `FeePolicy.clubId`(Long), `InterviewRound.recruitmentId`(Long) 는 **원시 Long → 명시 조인**.
- **소프트삭제 자동 제외**: 모든 엔티티에 `@SQLRestriction("deleted_at IS NULL")` → QueryDSL 조회/조인 시 Hibernate 가 자동 적용. **명시 deletedAt 필터 불필요.**
- **enum**: `ClubStatus.ACTIVE` / `NoticeVisibility.PUBLIC` / 인터뷰 `RoundStatus`(`com.duing.domain.interview.entity` — `SCHEDULED`,`DRAFT`,`CANCELLED`,`COLLECTING`,`ASSIGNING`; ⚠️ `domain.club.entity.RoundStatus` 와 혼동 금지). `Recruitment` 엔 드래프트 컬럼 없음.
- **시간**: BaseEntity `createdAt`/`updatedAt`/`deletedAt` 은 `LocalDateTime`. `InterviewRound.assignmentCompletedAt` 은 `LocalDateTime`(nullable). 기존 `Clock` 빈 = `TimeConfig.seoulClock()`(Asia/Seoul) — **주입해서 사용**(새로 안 만듦).
- **Jackson**: 커스텀 없음 → Boot 기본. `Instant` → ISO `...Z` 직렬화 OK.
- **QueryDSL**: `JPAQueryFactory` 빈은 `QueryDslConfig`. `@RequiredArgsConstructor` 로 주입. Q클래스 static import: `import static com.duing.domain.<dom>.entity.Q<Entity>.<entity>;`.
- **@ConfigurationProperties**: record + `@Validated` + `@Configuration @EnableConfigurationProperties(...)`(메인앱에 `@ConfigurationPropertiesScan` 없음). 설정은 `application.yml` 의 `duing.<feature>` 네스팅.
- **응답 envelope**: `{ "ok": true, "data": ... }`. 컨트롤러는 기존 `ApiResponse` 래퍼 사용 — **`PromotionController` 의 정확한 팩토리/방식(명시 래핑 vs 어드바이스)을 읽고 그대로 따른다**(이 플랜은 `ApiResponse.ok(body)` 로 가정; 다르면 맞춤).
- **테스트**: `extends IntegrationTestBase` + `@Import(TestcontainersConfiguration.class)` + `@SpringBootTest(webEnvironment = RANDOM_PORT)` + RestAssured. `@BeforeEach` 가 TRUNCATE. 시드는 `repository.save(Entity.create(...))`(엔티티 정적 팩토리). 비인증 = Authorization 헤더 없이 호출. **Docker 필요.**
- **빌드/테스트 cwd = `backend/`**: `./gradlew compileJava` / `./gradlew test --tests "*Name*"` / `./gradlew test`. `| tail` 금지(exit code 가림) — 출력에서 `BUILD SUCCESSFUL` 확인.

---

## File Structure

신규 `backend/src/main/java/com/duing/domain/publicactivity/`:
- `entity/PublicActivityType.java` — enum 6종(FE `HeroActivityType` 1:1 계약).
- `config/PublicActivityProperties.java` — `@ConfigurationProperties(prefix="duing.public-activity")` record.
- `config/PublicActivityConfig.java` — `@Configuration @EnableConfigurationProperties(PublicActivityProperties.class)`.
- `service/dto/query/ActivityItem.java` — `record(type, clubId, clubName, occurredAt:Instant)`.
- `repository/PublicActivityQueryRepository.java` — `@Repository`, JPAQueryFactory+Clock, 소스별 메서드 6개.
- `service/PublicActivityService.java` (interface) + `service/GeneralPublicActivityService.java` (impl).
- `api/PublicActivityApi.java` (Swagger) + `controller/PublicActivityController.java`.
- `controller/dto/response/PublicActivityResponse.java` — `record(items)` + nested `Item`.

수정:
- `global/config/SecurityConfig.java` — permitAll 1줄.
- `src/main/resources/application.yml` — `duing.public-activity.*`.

테스트:
- `src/test/java/com/duing/domain/publicactivity/PublicActivityServiceTest.java` (단위: 머지/정렬/limit/clamp).
- `src/test/java/com/duing/domain/publicactivity/PublicActivityAcceptanceTest.java` (통합: 소스별 가시성·정렬·limit·헤더·ISO).

---

## Task 0: 브랜치 + 문서 커밋

- [ ] **Step 1: develop 최신 + 분기**
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing checkout develop && git -C /Users/ksy/Desktop/BASIC/Coding/Duing pull origin develop --ff-only
git -C /Users/ksy/Desktop/BASIC/Coding/Duing checkout -b feat/public-activity-feed-api
```
- [ ] **Step 2: 스펙·플랜 커밋(untracked 이므로 add 후 pathspec 커밋)**
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add docs/superpowers/specs/2026-06-29-public-activity-feed-api-design.md docs/superpowers/plans/2026-06-29-public-activity-feed-api.md
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "docs(backend): 공개 활동 피드 API 스펙·플랜 추가" -- docs/superpowers/specs/2026-06-29-public-activity-feed-api-design.md docs/superpowers/plans/2026-06-29-public-activity-feed-api.md
```
Expected: 문서 2개만 커밋.

---

## Task 1: 기반 — enum · 설정 · 보안

**Files:** Create `entity/PublicActivityType.java`, `config/PublicActivityProperties.java`, `config/PublicActivityConfig.java`; Modify `application.yml`, `SecurityConfig.java`.

- [ ] **Step 1: `PublicActivityType` enum**

Create `backend/src/main/java/com/duing/domain/publicactivity/entity/PublicActivityType.java`:
```java
package com.duing.domain.publicactivity.entity;

// FE 의 HeroActivityType 과 1:1 계약. enum name 변경/삭제/rename 은 Breaking Change.
// 신규 타입은 뒤에 추가(additive)만 허용한다.
public enum PublicActivityType {
    RECRUIT_OPEN,
    NOTICE_CREATED,
    INTERVIEW_CREATED,
    INTERVIEW_RESULT,
    EVENT_CREATED,
    FEE_OPEN,
}
```

- [ ] **Step 2: 설정 properties + config**

Create `config/PublicActivityProperties.java`:
```java
package com.duing.domain.publicactivity.config;

import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "duing.public-activity")
public record PublicActivityProperties(
        @Positive int windowDays,
        @Positive int defaultLimit,
        @Positive int maxLimit
) {}
```
Create `config/PublicActivityConfig.java`:
```java
package com.duing.domain.publicactivity.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(PublicActivityProperties.class)
public class PublicActivityConfig {
}
```

- [ ] **Step 3: `application.yml` 에 기본값 추가**

`backend/src/main/resources/application.yml` 의 `duing:` 블록 아래에 추가(기존 `duing.privacy` 등과 같은 레벨):
```yaml
  public-activity:
    window-days: ${DUING_PUBLIC_ACTIVITY_WINDOW_DAYS:30}
    default-limit: ${DUING_PUBLIC_ACTIVITY_DEFAULT_LIMIT:10}
    max-limit: ${DUING_PUBLIC_ACTIVITY_MAX_LIMIT:20}
```
(들여쓰기는 `duing:` 하위 2칸 — `privacy:` 와 동일 깊이. 기존 `duing:` 키가 어디 있는지 확인 후 그 아래에.)

- [ ] **Step 4: SecurityConfig permitAll**

`global/config/SecurityConfig.java` 의 `.authorizeHttpRequests(...)` 안, `/api/v1/promotions` permitAll 줄 **다음**에 추가:
```java
        .requestMatchers(HttpMethod.GET, "/api/v1/public-activities", "/api/v1/public-activities/**").permitAll()
```

- [ ] **Step 5: 컴파일 검증 + 커밋**

Run (cwd `backend/`): `./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`.
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add backend/src/main/java/com/duing/domain/publicactivity backend/src/main/resources/application.yml backend/src/main/java/com/duing/global/config/SecurityConfig.java
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(backend): 공개 활동 피드 타입·설정·공개 라우트 기반 추가"
```

---

## Task 2: ActivityItem + 소스별 QueryDSL 리포지토리

**Files:** Create `service/dto/query/ActivityItem.java`, `repository/PublicActivityQueryRepository.java`.

> 이 Task 의 쿼리 정확성(가시성 필터·조인·timestamp)은 **Task 4 의 acceptance 테스트로 통합 검증**한다(실DB 필요). 본 Task 는 컴파일까지 확인하고 커밋.

- [ ] **Step 1: `ActivityItem` record**

Create `service/dto/query/ActivityItem.java`:
```java
package com.duing.domain.publicactivity.service.dto.query;

import com.duing.domain.publicactivity.entity.PublicActivityType;
import java.time.Instant;

public record ActivityItem(
        PublicActivityType type,
        Long clubId,
        String clubName,
        Instant occurredAt
) {}
```

- [ ] **Step 2: `PublicActivityQueryRepository` (6 쿼리)**

Create `repository/PublicActivityQueryRepository.java`. Q-instance 명(소문자 카멜)은 각 엔티티의 생성 Q클래스 기본 인스턴스명(`recruitment`,`club`,`notice`,`interviewRound`,`clubEvent`,`feePolicy`) — 컴파일 에러 시 생성된 Q클래스에서 정확한 인스턴스명 확인.
```java
package com.duing.domain.publicactivity.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubevent.entity.QClubEvent.clubEvent;
import static com.duing.domain.fee.entity.QFeePolicy.feePolicy;
import static com.duing.domain.interview.entity.QInterviewRound.interviewRound;
import static com.duing.domain.notice.entity.QNotice.notice;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.publicactivity.entity.PublicActivityType;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.DateTimePath;
import com.querydsl.core.types.dsl.NumberPath;
import com.querydsl.core.types.dsl.StringPath;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class PublicActivityQueryRepository {

    private final JPAQueryFactory queryFactory;
    private final Clock clock;

    public List<ActivityItem> findRecentRecruitOpen(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(recruitment.club.id, recruitment.club.name, recruitment.createdAt)
                .from(recruitment)
                .where(
                        recruitment.club.status.eq(ClubStatus.ACTIVE),
                        recruitment.createdAt.goe(since)
                )
                .orderBy(recruitment.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.RECRUIT_OPEN,
                recruitment.club.id, recruitment.club.name, recruitment.createdAt);
    }

    public List<ActivityItem> findRecentNoticeCreated(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(club.id, club.name, notice.createdAt)
                .from(notice)
                .join(club).on(club.id.eq(notice.owningClubId))
                .where(
                        notice.visibility.eq(NoticeVisibility.PUBLIC),
                        club.status.eq(ClubStatus.ACTIVE),
                        notice.createdAt.goe(since)
                )
                .orderBy(notice.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.NOTICE_CREATED, club.id, club.name, notice.createdAt);
    }

    public List<ActivityItem> findRecentInterviewCreated(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(recruitment.club.id, recruitment.club.name, interviewRound.createdAt)
                .from(interviewRound)
                .join(recruitment).on(recruitment.id.eq(interviewRound.recruitmentId))
                .where(
                        interviewRound.status.ne(RoundStatus.DRAFT),
                        interviewRound.status.ne(RoundStatus.CANCELLED),
                        recruitment.club.status.eq(ClubStatus.ACTIVE),
                        interviewRound.createdAt.goe(since)
                )
                .orderBy(interviewRound.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.INTERVIEW_CREATED,
                recruitment.club.id, recruitment.club.name, interviewRound.createdAt);
    }

    public List<ActivityItem> findRecentInterviewResult(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(recruitment.club.id, recruitment.club.name, interviewRound.assignmentCompletedAt)
                .from(interviewRound)
                .join(recruitment).on(recruitment.id.eq(interviewRound.recruitmentId))
                .where(
                        interviewRound.status.eq(RoundStatus.SCHEDULED),
                        interviewRound.assignmentCompletedAt.isNotNull(),
                        interviewRound.assignmentCompletedAt.goe(since),
                        recruitment.club.status.eq(ClubStatus.ACTIVE)
                )
                .orderBy(interviewRound.assignmentCompletedAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.INTERVIEW_RESULT,
                recruitment.club.id, recruitment.club.name, interviewRound.assignmentCompletedAt);
    }

    public List<ActivityItem> findRecentEventCreated(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(club.id, club.name, clubEvent.createdAt)
                .from(clubEvent)
                .join(club).on(club.id.eq(clubEvent.clubId))
                .where(
                        club.status.eq(ClubStatus.ACTIVE),
                        clubEvent.createdAt.goe(since)
                )
                .orderBy(clubEvent.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.EVENT_CREATED, club.id, club.name, clubEvent.createdAt);
    }

    public List<ActivityItem> findRecentFeeOpen(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(club.id, club.name, feePolicy.createdAt)
                .from(feePolicy)
                .join(club).on(club.id.eq(feePolicy.clubId))
                .where(
                        feePolicy.active.isTrue(),
                        club.status.eq(ClubStatus.ACTIVE),
                        feePolicy.createdAt.goe(since)
                )
                .orderBy(feePolicy.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.FEE_OPEN, club.id, club.name, feePolicy.createdAt);
    }

    private List<ActivityItem> toItems(List<Tuple> rows, PublicActivityType type,
                                       NumberPath<Long> clubIdPath, StringPath clubNamePath,
                                       DateTimePath<LocalDateTime> tsPath) {
        return rows.stream()
                .map(row -> new ActivityItem(
                        type,
                        row.get(clubIdPath),
                        row.get(clubNamePath),
                        toInstant(row.get(tsPath))))
                .toList();
    }

    private Instant toInstant(LocalDateTime ldt) {
        return ldt.atZone(clock.getZone()).toInstant();
    }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

Run (cwd `backend/`): `./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`. (Q클래스 인스턴스명/필드 에러 시 생성된 `build/generated/querydsl/.../Q*.java` 에서 정확한 명칭 확인 후 수정.)
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add backend/src/main/java/com/duing/domain/publicactivity/service/dto backend/src/main/java/com/duing/domain/publicactivity/repository
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(backend): 공개 활동 6소스 QueryDSL 집계 리포지토리"
```

---

## Task 3: 서비스 (머지/정렬/limit) + 단위 테스트 (TDD)

**Files:** Create `service/PublicActivityService.java`, `service/GeneralPublicActivityService.java`; Test `test/.../publicactivity/PublicActivityServiceTest.java`.

- [ ] **Step 1: 실패 테스트 작성** (repo 는 Mockito mock, Clock 고정 → 머지/정렬/limit/clamp 검증)

Create `backend/src/test/java/com/duing/domain/publicactivity/PublicActivityServiceTest.java`:
```java
package com.duing.domain.publicactivity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.duing.domain.publicactivity.config.PublicActivityProperties;
import com.duing.domain.publicactivity.entity.PublicActivityType;
import com.duing.domain.publicactivity.repository.PublicActivityQueryRepository;
import com.duing.domain.publicactivity.service.GeneralPublicActivityService;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PublicActivityServiceTest {

    @Mock PublicActivityQueryRepository repository;

    GeneralPublicActivityService service;
    final Clock clock = Clock.fixed(Instant.parse("2026-06-29T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    ActivityItem item(PublicActivityType type, long clubId, String name, String iso) {
        return new ActivityItem(type, clubId, name, Instant.parse(iso));
    }

    @BeforeEach
    void setUp() {
        var props = new PublicActivityProperties(30, 10, 20);
        service = new GeneralPublicActivityService(repository, props, clock);
    }

    private void stubAllEmptyExceptRecruit(List<ActivityItem> recruit) {
        when(repository.findRecentRecruitOpen(any(), anyInt())).thenReturn(recruit);
        when(repository.findRecentNoticeCreated(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentInterviewCreated(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentInterviewResult(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentEventCreated(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentFeeOpen(any(), anyInt())).thenReturn(List.of());
    }

    @Test
    void 머지_후_occurredAt_내림차순_정렬() {
        stubAllEmptyExceptRecruit(List.of(
                item(PublicActivityType.RECRUIT_OPEN, 1L, "A", "2026-06-20T00:00:00Z"),
                item(PublicActivityType.RECRUIT_OPEN, 2L, "B", "2026-06-25T00:00:00Z")));
        List<ActivityItem> result = service.getRecentActivities(null);
        assertThat(result).extracting(ActivityItem::clubId).containsExactly(2L, 1L); // 최신(25일) 먼저
    }

    @Test
    void 동일_occurredAt_은_clubId_DESC_그다음_type_ASC() {
        String t = "2026-06-25T00:00:00Z";
        stubAllEmptyExceptRecruit(List.of(
                item(PublicActivityType.NOTICE_CREATED, 5L, "E", t),   // clubId 5
                item(PublicActivityType.RECRUIT_OPEN, 9L, "I", t),     // clubId 9 (더 큼 → 먼저)
                item(PublicActivityType.RECRUIT_OPEN, 9L, "I2", t)));   // 같은 clubId 9, type 동일
        List<ActivityItem> result = service.getRecentActivities(null);
        // clubId DESC: 9, 9, 5 순. (type 동일하므로 9끼리 순서는 안정적이면 됨)
        assertThat(result).extracting(ActivityItem::clubId).containsExactly(9L, 9L, 5L);
    }

    @Test
    void limit_미지정시_defaultLimit_적용() {
        stubAllEmptyExceptRecruit(java.util.stream.IntStream.range(0, 15)
                .mapToObj(i -> item(PublicActivityType.RECRUIT_OPEN, i, "C" + i,
                        "2026-06-%02dT00:00:00Z".formatted(1 + i)))
                .toList());
        assertThat(service.getRecentActivities(null)).hasSize(10); // default
    }

    @Test
    void limit_상한_초과는_maxLimit_로_클램프() {
        stubAllEmptyExceptRecruit(java.util.stream.IntStream.range(0, 25)
                .mapToObj(i -> item(PublicActivityType.RECRUIT_OPEN, i, "C" + i,
                        "2026-06-%02dT00:00:00Z".formatted(1 + i)))
                .toList());
        assertThat(service.getRecentActivities(50)).hasSize(20); // max
    }

    @Test
    void limit_1미만은_1로_클램프() {
        stubAllEmptyExceptRecruit(List.of(item(PublicActivityType.RECRUIT_OPEN, 1L, "A", "2026-06-25T00:00:00Z")));
        assertThat(service.getRecentActivities(0)).hasSize(1);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run (cwd `backend/`): `./gradlew test --tests "*PublicActivityServiceTest"`
Expected: FAIL — `GeneralPublicActivityService`/`PublicActivityService` 미존재(컴파일 에러).

- [ ] **Step 3: 서비스 구현**

Create `service/PublicActivityService.java`:
```java
package com.duing.domain.publicactivity.service;

import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.util.List;

public interface PublicActivityService {
    List<ActivityItem> getRecentActivities(Integer limitParam);
}
```
Create `service/GeneralPublicActivityService.java`:
```java
package com.duing.domain.publicactivity.service;

import com.duing.domain.publicactivity.config.PublicActivityProperties;
import com.duing.domain.publicactivity.repository.PublicActivityQueryRepository;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GeneralPublicActivityService implements PublicActivityService {

    private final PublicActivityQueryRepository queryRepository;
    private final PublicActivityProperties properties;
    private final Clock clock;

    // 정렬: occurredAt DESC → clubId DESC → type ASC (clubName 은 가변값이라 미사용).
    private static final Comparator<ActivityItem> ORDER =
            Comparator.comparing(ActivityItem::occurredAt).reversed()
                    .thenComparing(Comparator.comparing(ActivityItem::clubId).reversed())
                    .thenComparing(ActivityItem::type);

    @Override
    @Transactional(readOnly = true)
    public List<ActivityItem> getRecentActivities(Integer limitParam) {
        int effectiveLimit = clampLimit(limitParam);
        int sourceFetchLimit = effectiveLimit * 2; // 머지 헤드룸
        LocalDateTime since = LocalDateTime.now(clock).minusDays(properties.windowDays());

        List<ActivityItem> merged = new ArrayList<>();
        merged.addAll(queryRepository.findRecentRecruitOpen(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentNoticeCreated(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentInterviewCreated(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentInterviewResult(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentEventCreated(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentFeeOpen(since, sourceFetchLimit));

        return merged.stream().sorted(ORDER).limit(effectiveLimit).toList();
    }

    private int clampLimit(Integer limitParam) {
        int requested = (limitParam == null) ? properties.defaultLimit() : limitParam;
        return Math.max(1, Math.min(requested, properties.maxLimit()));
    }
}
```

- [ ] **Step 4: 통과 확인**

Run (cwd `backend/`): `./gradlew test --tests "*PublicActivityServiceTest"`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add backend/src/main/java/com/duing/domain/publicactivity/service backend/src/test/java/com/duing/domain/publicactivity/PublicActivityServiceTest.java
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(backend): 공개 활동 피드 서비스(머지·정렬·limit 클램프) + 단위 테스트"
```

---

## Task 4: API · 응답 DTO · 컨트롤러 + Acceptance 테스트 (TDD)

**Files:** Create `controller/dto/response/PublicActivityResponse.java`, `api/PublicActivityApi.java`, `controller/PublicActivityController.java`; Test `test/.../publicactivity/PublicActivityAcceptanceTest.java`.

> ⚠️ 시드는 각 엔티티의 **정적 팩토리/빌더**로 한다 — 정확한 시그니처는 해당 엔티티 클래스에서 확인(예: `Club.create("동아리", ClubCategory.ACADEMIC, null, "설명", null)` 은 확인됨; Recruitment/Notice/InterviewRound/ClubEvent/FeePolicy 는 각 엔티티의 팩토리 확인). `createdAt` 은 JPA 감사로 자동 = 저장 시각(now). **윈도우 제외 검증**은 저장 후 native UPDATE 로 `created_at`(또는 `assignment_completed_at`)을 과거로 백데이트해서 한다(아래 Step 1 에 헬퍼 포함).

- [ ] **Step 1: 실패 acceptance 테스트 작성**

Create `backend/src/test/java/com/duing/domain/publicactivity/PublicActivityAcceptanceTest.java`. (응답 envelope `{ok,data}`; 본 피드는 `data.items[]`.)
```java
package com.duing.domain.publicactivity;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.matchesPattern;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
// 엔티티/리포지토리 import 는 시드에 필요한 것만 — 구현 시 추가.
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PublicActivityAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;
    // @Autowired 로 필요한 리포지토리 주입(ClubRepository, NoticeRepository, ClubEventRepository, FeePolicyRepository,
    //   RecruitmentRepository, InterviewRoundRepository) — 시드용. 구현 시 추가.

    @BeforeEach
    void setUp() { RestAssured.port = port; }

    @Test
    void 비인증_GET_은_200_과_Cache_Control_헤더를_준다() {
        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then().statusCode(200)
                .header("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    }

    @Test
    void ACTIVE_동아리의_공개_공지가_피드에_타입과_ISO시각으로_나온다() {
        // given: ACTIVE 동아리 + PUBLIC 공지(owningClubId=club.id) 시드.
        //   (Club.create(...) 저장 → status 가 ACTIVE 가 되도록(필요시 승인 전이 메서드 호출) ;
        //    Notice 정적 팩토리(createForClub 류)로 PUBLIC 공지 저장.)
        // expect: data.items 중 NOTICE_CREATED + 해당 clubName + occurredAt 이 ISO(...Z) 패턴.
        RestAssured.given()
                .when().get("/api/v1/public-activities?limit=20")
                .then().statusCode(200)
                .body("data.items.type", hasItem("NOTICE_CREATED"))
                .body("data.items.find { it.type == 'NOTICE_CREATED' }.occurredAt",
                        matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z"))
                .body("data.items.find { it.type == 'NOTICE_CREATED' }.clubId", greaterThanOrEqualTo(1));
    }

    @Test
    void 비ACTIVE_동아리_와_비PUBLIC_공지_와_DRAFT_라운드_는_피드에서_제외된다() {
        // given: INACTIVE 동아리의 공지/행사, ACTIVE 동아리의 OFFICERS_ALL(비PUBLIC) 공지, DRAFT 인터뷰 라운드 시드.
        // expect: 그 어느 것도 data.items 에 없음(해당 clubName/타입 부재).
        RestAssured.given()
                .when().get("/api/v1/public-activities?limit=20")
                .then().statusCode(200);
        // 구현 시: 시드한 비공개 항목들의 clubName 이 응답에 없음을 단언(.body("data.items.clubName", not(hasItem("숨김동아리")))).
    }

    @Test
    void limit_은_max_로_클램프된다() {
        RestAssured.given()
                .when().get("/api/v1/public-activities?limit=999")
                .then().statusCode(200)
                .body("data.items.size()", greaterThanOrEqualTo(0)); // 구현 후 25건 시드 → size == 20 으로 강화
    }

    @Test
    void 윈도우_밖_활동은_제외된다() {
        // given: 활동 1건 저장 후, native UPDATE 로 created_at 을 (windowDays+5)일 전으로 백데이트.
        //   (@Autowired EntityManager em; em.createNativeQuery("UPDATE notice SET created_at = ? WHERE id = ?")
        //      .setParameter(1, LocalDateTime.now().minusDays(35)).setParameter(2, id).executeUpdate();)
        // expect: 그 활동이 data.items 에 없음.
        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then().statusCode(200);
    }
}
```
> 위 테스트의 시드/단언 본문(주석)을 구현 단계에서 실제 엔티티 팩토리로 채운다. 최소한 ① Cache-Control 헤더 ② 한 소스(공지) 타입·ISO 매핑 ③ 비ACTIVE/비PUBLIC/DRAFT 제외 ④ limit 클램프 ⑤ 윈도우 제외 — 5케이스가 실제 단언을 갖도록 완성한다.

- [ ] **Step 2: 실패 확인**

Run (cwd `backend/`, Docker 필요): `./gradlew test --tests "*PublicActivityAcceptanceTest"`
Expected: FAIL — `/api/v1/public-activities` 404(컨트롤러 미존재).

- [ ] **Step 3: 응답 DTO + API + 컨트롤러 구현**

Create `controller/dto/response/PublicActivityResponse.java`:
```java
package com.duing.domain.publicactivity.controller.dto.response;

import com.duing.domain.publicactivity.entity.PublicActivityType;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.time.Instant;
import java.util.List;

public record PublicActivityResponse(List<Item> items) {

    public record Item(PublicActivityType type, Long clubId, String clubName, Instant occurredAt) {}

    public static PublicActivityResponse from(List<ActivityItem> items) {
        return new PublicActivityResponse(items.stream()
                .map(it -> new Item(it.type(), it.clubId(), it.clubName(), it.occurredAt()))
                .toList());
    }
}
```
Create `api/PublicActivityApi.java` (Swagger interface — 기존 `*Api` 패턴 따름; 어노테이션은 다른 Api 파일 참고):
```java
package com.duing.domain.publicactivity.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
// 프로젝트의 공통 응답 래퍼 타입 import (ApiResponse 등) — PromotionApi 확인 후 시그니처 맞춤.

@Tag(name = "PublicActivity", description = "홈 Hero 공개 최근 활동 피드")
public interface PublicActivityApi {
    @Operation(summary = "최근 공개 활동 피드", description = "6개 도메인의 최근 활동을 시간순으로 반환(공개).")
    Object getPublicActivities(Integer limit); // 반환타입은 컨트롤러 구현의 ResponseEntity<ApiResponse<...>> 에 맞춰 확정
}
```
Create `controller/PublicActivityController.java`. **`ApiResponse` 래핑은 `PromotionController` 와 동일하게** — 아래는 명시 래핑 가정:
```java
package com.duing.domain.publicactivity.controller;

import com.duing.domain.publicactivity.api.PublicActivityApi;
import com.duing.domain.publicactivity.controller.dto.response.PublicActivityResponse;
import com.duing.domain.publicactivity.service.PublicActivityService;
// import com.duing.global.response.ApiResponse;  // 실제 패키지/타입은 기존 컨트롤러에서 확인
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PublicActivityController implements PublicActivityApi {

    private final PublicActivityService publicActivityService;

    @Override
    @GetMapping("/api/v1/public-activities")
    public ResponseEntity<?> getPublicActivities(@RequestParam(required = false) Integer limit) {
        PublicActivityResponse body = PublicActivityResponse.from(
                publicActivityService.getRecentActivities(limit));
        CacheControl cacheControl = CacheControl.maxAge(Duration.ofSeconds(60))
                .cachePublic()
                .staleWhileRevalidate(Duration.ofSeconds(30));
        return ResponseEntity.ok()
                .cacheControl(cacheControl)
                .body(/* PromotionController 와 동일 래핑 */ ApiResponseWrap(body));
    }
}
```
구현 시: `PromotionController` 를 열어 ① 공통 응답 래퍼 타입·팩토리(예 `ApiResponse.ok(body)`)와 ② `*Api` 인터페이스 반환타입·어노테이션을 그대로 맞춘다. `ResponseEntity` 에 `.cacheControl(cacheControl)` 를 더해 헤더를 싣는다(어드바이스로 envelope 을 감싸는 구조면, 컨트롤러는 `body` 만 반환하되 헤더는 `ResponseEntity` 로 싣는 방법을 그 프로젝트 패턴대로 적용).

- [ ] **Step 4: acceptance 시드/단언 본문 완성 후 통과 확인**

Step 1 테스트의 주석 시드/단언을 실제 엔티티 팩토리로 채운다. Run (cwd `backend/`): `./gradlew test --tests "*PublicActivityAcceptanceTest"`
Expected: PASS (5 케이스).

- [ ] **Step 5: 커밋**
```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add backend/src/main/java/com/duing/domain/publicactivity/api backend/src/main/java/com/duing/domain/publicactivity/controller backend/src/test/java/com/duing/domain/publicactivity/PublicActivityAcceptanceTest.java
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(backend): 공개 활동 피드 엔드포인트(GET /api/v1/public-activities) + acceptance 테스트"
```

---

## Task 5: 전체 빌드·테스트 + 리뷰

- [ ] **Step 1: 전체 테스트(Docker 필요)**

Run (cwd `backend/`): `./gradlew test`
Expected: `BUILD SUCCESSFUL`(전체 GREEN). 출력에서 직접 확인(`| tail` 금지).

- [ ] **Step 2: 리뷰**

스펙의 "리뷰 강도": 신규 **공개 API + 가시성** → 기본(`duing-code-reviewer` + `codex:review`)에 **`codex:adversarial-review` 추가**. 적대적 중점: 비공개/비ACTIVE/DRAFT/삭제 데이터의 피드 누출, limit 클램프 우회, 윈도우 경계, 타임존 변환. **리뷰 통과 전 push/PR 금지**(머지·PR 은 사용자 지시 후).

---

## Self-Review (계획 작성자 점검)

- **스펙 커버리지**: 6타입(RECRUIT_CLOSE 제외)·공개 엔드포인트·집계 머지·ActivityItem(clubId 포함)·Instant(Clock/Asia-Seoul)·duing.public-activity 설정·정렬(occurredAt DESC→clubId DESC→type ASC)·Cache-Control SWR·가시성(ACTIVE+PUBLIC+소프트삭제 자동)·윈도우·API 계약(additive) — Task 1~4 에 매핑. Out of Scope(RECRUIT_CLOSE·마이그레이션·FE 연동) 미구현 유지.
- **타입 일관성**: `ActivityItem(type,clubId,clubName,occurredAt:Instant)`, `PublicActivityType` 6값, repo 메서드 `findRecentX(LocalDateTime since, int limit)`, 서비스 `getRecentActivities(Integer)`, 정렬 Comparator, properties `windowDays/defaultLimit/maxLimit` 가 Task 전반 동일.
- **바운디드 확인(플레이스홀더 아님)**: ① `ApiResponse` 정확한 팩토리/`*Api` 시그니처(=PromotionController/PromotionApi 읽고 맞춤) ② 5개 엔티티 정적 팩토리 시그니처(=각 엔티티 확인) ③ Q-instance 명(=생성 Q클래스 확인). 모두 "특정 파일에서 확인"으로 한정된 조회이며, 로직/단언/구조는 완결.
