# Phase 1 — 학생 탐색·지원 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Du-ing 의 학생 end-to-end 플로우 — 메인에서 동아리·모집을 탐색하고, 상세 페이지를 거쳐 자체 폼 또는 외부 폼으로 지원한 뒤, 마이 페이지에서 진행 상태(5단계 + 면접 일정)를 확인하기까지의 전 구간 — 을 가시화한다.

**Architecture:** Spring REST API 단일 진입점 + Next.js App Router. Phase 0 의 데이터 모델·인증·파일·권한 헬퍼·미들웨어를 기반으로, 백엔드는 기존 도메인(Club/Recruitment/Application) 확장에 집중하고, 프론트는 기존 `@duing/api`·`@duing/hooks`·`@duing/stores` 스캐폴드를 조립해 화면을 만든다.

**Tech Stack:** Backend — Spring Boot 3.4 / Java 21 / JPA + QueryDSL / Hibernate / JUnit5 + Mockito. Frontend — Next.js 15 App Router / React 19 / TypeScript / React Query / Zustand / Tailwind / ky.

---

## File Structure

### Backend — 신규 / 수정

```
backend/src/main/java/com/duing/
  domain/club/
    api/ClubPhotoApi.java                                          NEW
    controller/ClubPhotoController.java                            NEW
    controller/dto/response/ClubPhotoResponse.java                 NEW
    photo/service/                                                 NEW pkg
      ClubPhotoService.java                                        NEW
      GeneralClubPhotoService.java                                 NEW
    service/dto/query/ClubPhotoQuery.java                          NEW
    controller/dto/response/ClubDetailResponse.java                MOD (필드 추가)
    controller/dto/response/ClubSummaryResponse.java               MOD (필드 추가)
    service/dto/query/ClubDetailQuery.java                         MOD (필드 추가)
    service/dto/query/ClubSummaryQuery.java                        MOD (필드 추가)
    service/dto/query/ClubSearchCondition.java                     MOD (tags, recruiting 추가)
    service/GeneralClubService.java                                MOD (Detail 매핑 + photos 조회)
    repository/ClubRepositoryImpl.java                             MOD (tags · recruiting 필터)
    api/ClubApi.java                                               MOD (필터 파라미터 + 신규 GET 시그니처)
    controller/ClubController.java                                 MOD (확장 파라미터 + 신규 핸들러)

  domain/recruitment/
    api/ClubRecruitmentApi.java                                    NEW (동아리별 모집 목록)
    controller/ClubRecruitmentController.java                      NEW
    repository/RecruitmentRepositoryCustom.java                    MOD (findByClubId 메서드 추가)
    repository/RecruitmentRepositoryImpl.java                      MOD
    service/RecruitmentService.java                                MOD (getByClubId)
    service/GeneralRecruitmentService.java                         MOD
    controller/dto/response/RecruitmentDetailResponse.java         MOD (mode/url/interview/target/clubLogo 등 추가)
    controller/dto/response/RecruitmentSummaryResponse.java        MOD (mode/target/useInterview 추가)
    service/dto/query/RecruitmentDetailQuery.java                  MOD
    service/dto/query/RecruitmentSummaryQuery.java                 MOD

  domain/application/
    api/ApplicationApi.java                                        MOD (내 지원 상세 시그니처 추가)
    controller/ApplicationController.java                          MOD (내 지원 상세 핸들러)
    controller/dto/response/ApplicationSummaryResponse.java        MOD (interview / 5단계 status)
    controller/dto/response/MyApplicationDetailResponse.java       NEW
    service/dto/query/ApplicationSummaryQuery.java                 MOD
    service/dto/query/MyApplicationDetailQuery.java                NEW
    service/ApplicationService.java                                MOD (getMyApplicationDetail 시그니처)
    service/GeneralApplicationService.java                         MOD (외부폼 가드·OFFICER 가드·targetRole · 상세 메서드)
    exception/ApplicationDomainException.java                      MOD (ExternalFormSubmitException, OfficerMembershipRequiredException, ForbiddenApplicationAccess)
    entity/Application.java                                        MOD (5단계 전이 검증으로 updateStatus 교체)

  domain/clubmember/service/
    ClubAuthService.java                                           이미 존재 (Phase 0)
```

### Backend — 테스트

```
backend/src/test/java/com/duing/
  domain/application/service/
    ApplicationSubmitServiceTest.java                              NEW (외부폼·OFFICER 가드·targetRole)
    ApplicationStatusTransitionTest.java                           NEW (5단계 전이 검증)
  domain/club/service/
    ClubSearchTagsRecruitingTest.java                              NEW (필터 동작)
```

### Frontend — 수정

```
frontend/packages/types/src/
  club.ts                                                          MOD (cover/tags/sns/faqs/photos + filter)
  recruitment.ts                                                   MOD (applicationMode/externalFormUrl/useInterview/targetRole)
  application.ts                                                   MOD (5단계 status + interviewAt/Location)
  user.ts                                                          MOD (필요 없으면 그대로)

frontend/packages/api/src/client.ts                                MOD (신규 엔드포인트 추가: photos, clubRecruitments, myApplicationDetail)
frontend/packages/hooks/src/clubs.ts                               MOD (useClubPhotos, useClubRecruitments)
frontend/packages/hooks/src/applications.ts                        MOD (useMyApplicationDetail)
```

### Frontend — 페이지 신규

```
frontend/apps/web/app/
  (public)/                                                        그룹 라우트 (비로그인 허용)
    page.tsx                                                       MOD (기존 / → 메인 탐색)
    clubs/[clubId]/page.tsx                                        NEW (동아리 상세)
    clubs/[clubId]/recruitments/[recruitmentId]/page.tsx           NEW (모집 상세 + 지원하기)
    calendar/page.tsx                                              NEW (월별 달력)
  (auth)/
    login/page.tsx                                                 NEW
    signup/page.tsx                                                NEW
  (student)/
    apply/[recruitmentId]/page.tsx                                 NEW (자체 폼 작성)
    me/applications/page.tsx                                       NEW (내 지원 목록)
    me/applications/[applicationId]/page.tsx                       NEW (내 지원 상세)
```

> 기존 `apps/web/app/page.tsx` 는 그대로 두고 `(public)/page.tsx` 가 새 메인이 된다 — Next.js App Router 의 그룹 라우트는 URL 에 영향 주지 않으므로 둘이 충돌한다. **기존 `apps/web/app/page.tsx`, `clubs/page.tsx`, `recruitments/page.tsx` 는 Task 11 직전에 삭제**한다. 즉 메인 작업 PR 에 "기존 placeholder 삭제 + (public)/page.tsx 신규" 가 함께 들어간다.

---

## Important Context Notes

**기존 코드 활용**
- 백엔드 `Application` 도메인은 이미 submit / getMyApplications / getApplicants / updateStatus 가 동작한다. Phase 1 은 **확장**: 외부폼 가드, OFFICER 멤버십 가드, targetRole 기반 ClubMember 배정, 5단계 상태 전이 검증, 내 지원 상세.
- 프론트는 `@duing/api` ky 기반 클라이언트, `@duing/hooks` React Query 훅, `@duing/stores` Zustand auth store, `@duing/storage` 의 web 백엔드(브라우저 localStorage) 가 이미 설정돼 있다. 새 페이지는 이 위에 얹기만 하면 된다.
- 인증 흐름: `useLogin` 호출 시 `useAuthStore.setSession()` 이 토큰을 `@duing/storage` 로 저장하고, ky 의 `beforeRequest` 후크가 `Authorization: Bearer` 헤더에 자동 첨부한다. 동시에 Phase 0 의 `setAuthToken()`(쿠키) 도 호출해 미들웨어가 인식할 수 있도록 한다 — 즉 **두 곳에 모두 써야** 라우트 가드와 API 호출이 함께 동작한다 (자세한 처리는 Task 10 참고).

**상태 전이 규칙 (Application)**
- 허용 전이:
  - `SUBMITTED → UNDER_REVIEW`
  - `UNDER_REVIEW → INTERVIEW_PENDING` (단, `recruitment.useInterview == true`)
  - `UNDER_REVIEW → ACCEPTED` 또는 `UNDER_REVIEW → REJECTED` (단, `recruitment.useInterview == false`)
  - `INTERVIEW_PENDING → ACCEPTED` 또는 `INTERVIEW_PENDING → REJECTED`
- 위반 시 `InvalidStatusTransitionException` (400). 본 검증은 `Application.transitionTo(newStatus, useInterview)` 메서드로 캡슐화하여 도메인 안에 둔다. 기존 `updateStatus(ApplicationStatus)` 는 5단계 전이 메서드 한 가지로 교체하고 호출부(`GeneralApplicationService.updateStatus`)도 함께 갱신.

**컨벤션**
- 한 PR = 한 API (또는 한 페이지). 본 plan 의 각 Task = 1 commit + 1 PR 후보.
- 백엔드: Bean Validation 한국어 메시지 / DDD 패키지 구조 / 변수명 풀네임.
- 프론트: 컴포넌트 한 파일 한 책임. Tailwind 유틸 사용. 라우트는 Phase 0 의 미들웨어 가드와 함께 동작 (`/me`, `/apply` 는 비로그인 시 `/login?next=...` 로 리다이렉트).

**브랜치**
- 단일 브랜치 `feat/phase1-student-explore-apply` 위에 모든 Task 를 순차 커밋. 마무리 단계에서 finishing-a-development-branch 가 분할 결정.

---

## Task 1: ClubSearchCondition 에 tags · recruiting 필터 추가 + QueryDSL 확장 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java`
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSummaryQuery.java` (필드 추가)
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubSummaryResponse.java` (필드 추가)
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubSearchTagsRecruitingTest.java`

- [ ] **Step 1: ClubSearchCondition 에 tags · recruiting 필드 추가**

```java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import java.util.List;

public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting
) {
    public boolean hasTags() {
        return tags != null && !tags.isEmpty();
    }

    public boolean recruitingOnly() {
        return Boolean.TRUE.equals(recruiting);
    }
}
```

- [ ] **Step 2: 실패 테스트 작성**

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubSearchTagsRecruitingTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    @Test
    @DisplayName("tags 필터는 입력 태그를 하나라도 포함하는 동아리만 반환한다")
    void filtersByTagsContainment() throws Exception {
        Club a = saveClubWithTags("축구부", List.of("축구", "친목"));
        saveClubWithTags("러닝클럽", List.of("러닝"));

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, null, List.of("축구"), null),
                PageRequest.of(0, 10));

        assertThat(page.getContent()).extracting(Club::getName).containsExactly("축구부");
    }

    @Test
    @DisplayName("recruiting=true 는 오늘 기준 OPEN 이며 종료일이 지나지 않은 모집을 가진 동아리만 반환한다")
    void filtersByActiveRecruitment() throws Exception {
        Club withOpen = saveClubWithTags("A동아리", List.of());
        Club withClosed = saveClubWithTags("B동아리", List.of());
        saveOpenRecruitment(withOpen, LocalDate.now().minusDays(3), LocalDate.now().plusDays(7));
        saveClosedRecruitment(withClosed, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, null, null, true),
                PageRequest.of(0, 10));

        assertThat(page.getContent()).extracting(Club::getName).containsExactly("A동아리");
    }

    private Club saveClubWithTags(String name, List<String> tags) throws Exception {
        Club club = Club.create(name, ClubCategory.SPORTS, "체육", "desc", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        Field tagsField = Club.class.getDeclaredField("tags");
        tagsField.setAccessible(true);
        tagsField.set(club, new java.util.ArrayList<>(tags));
        return clubRepository.save(club);
    }

    private void saveOpenRecruitment(Club club, LocalDate start, LocalDate end) {
        Recruitment recruitment = Recruitment.create(club, "모집중", null, start, end, 5);
        recruitmentRepository.save(recruitment);
    }

    private void saveClosedRecruitment(Club club, LocalDate start, LocalDate end) throws Exception {
        Recruitment recruitment = Recruitment.create(club, "마감됨", null, start, end, 5);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(recruitment, RecruitmentStatus.CLOSED);
        recruitmentRepository.save(recruitment);
    }
}
```

- [ ] **Step 3: 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests ClubSearchTagsRecruitingTest 2>&1 | tail -30
```

기대: 컴파일 OK 하나 두 테스트 실패 — 필터가 아직 동작하지 않음.

- [ ] **Step 4: QueryDSL 필터 구현**

`backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` 의 `findByCondition` + 새 헬퍼:

```java
package com.duing.domain.club.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class ClubRepositoryImpl implements ClubRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Club> findByCondition(ClubSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                categoryEq(condition.category()),
                divisionEq(condition.division()),
                keywordContains(condition.keyword()),
                tagsOverlap(condition.tags()),
                hasActiveRecruitment(condition.recruitingOnly()),
        };

        List<Club> content = queryFactory
                .selectFrom(club)
                .where(predicates)
                .orderBy(club.name.asc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(club.count())
                .from(club)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression categoryEq(ClubCategory category) {
        return category != null ? club.category.eq(category) : null;
    }

    private BooleanExpression divisionEq(String division) {
        return StringUtils.hasText(division) ? club.division.eq(division) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) return null;
        return club.name.containsIgnoreCase(keyword)
                .or(club.description.containsIgnoreCase(keyword));
    }

    private BooleanExpression tagsOverlap(List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        // Postgres array overlap: tags && ARRAY['축구','러닝']::text[]
        // QueryDSL booleanTemplate 으로 표현.
        return Expressions.booleanTemplate(
                "function('array_overlap', {0}, function('array_from_text', {1}))",
                club.tags,
                String.join(",", tags));
    }

    private BooleanExpression hasActiveRecruitment(boolean recruitingOnly) {
        if (!recruitingOnly) return null;
        LocalDate today = LocalDate.now();
        return JPAExpressions
                .selectOne()
                .from(recruitment)
                .where(
                        recruitment.club.id.eq(club.id),
                        recruitment.status.eq(RecruitmentStatus.OPEN),
                        recruitment.endDate.goe(today)
                )
                .exists();
    }
}
```

Postgres `&&` 연산자가 JPA 표준이 아니므로 `function()` 으로 호출 가능한 SQL 함수를 등록한다.

`backend/src/main/java/com/duing/global/config/PostgresArrayFunctionsConfig.java` 신규:

```java
package com.duing.global.config;

import org.hibernate.boot.MetadataBuilder;
import org.hibernate.boot.spi.MetadataBuilderContributor;
import org.hibernate.query.sqm.function.SqmFunctionRegistry;
import org.hibernate.type.StandardBasicTypes;

public class PostgresArrayFunctionsContributor implements MetadataBuilderContributor {

    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        // 사용 위치(QueryDSL): function('array_overlap', club.tags, function('array_from_text', '축구,러닝'))
        // 결과 SQL: array_overlap(club.tags, string_to_array('축구,러닝', ','))
        metadataBuilder.applySqlFunction(
                "array_overlap",
                new org.hibernate.dialect.function.StandardSQLFunction("array_overlap", StandardBasicTypes.BOOLEAN));
        metadataBuilder.applySqlFunction(
                "array_from_text",
                new org.hibernate.dialect.function.StandardSQLFunction(
                        "string_to_array", StandardBasicTypes.STRING) {
                    @Override
                    public String render(org.hibernate.type.Type firstArgumentType, java.util.List arguments,
                                         org.hibernate.engine.spi.SessionFactoryImplementor factory) {
                        return "string_to_array(" + arguments.get(0) + ", ',')";
                    }
                });
    }
}
```

⚠ Hibernate 6.x 의 정확한 API 가 다를 수 있다. 이 패턴이 컴파일 실패하면 **다음 대안**으로 교체:

```java
// 대안 — RepositoryImpl 안에서 native SQL 로 우회.
private BooleanExpression tagsOverlap(List<String> tags) {
    if (tags == null || tags.isEmpty()) return null;
    String literal = "ARRAY[" + tags.stream()
            .map(t -> "'" + t.replace("'", "''") + "'")
            .collect(java.util.stream.Collectors.joining(",")) + "]::text[]";
    return Expressions.booleanTemplate("tags && " + literal);
}
```

후자(`Expressions.booleanTemplate("tags && ...")` 형태로 직접 SQL fragment 사용) 가 Hibernate 6 에서 가장 신뢰성 있다. **본 plan 의 implementer 는 후자를 우선 시도하고, 컴파일·런타임 양쪽에서 통과시키는 쪽으로 결정한다.** PostgresArrayFunctionsContributor 는 작성하지 않음.

- [ ] **Step 5: 테스트 재실행 → 통과 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests ClubSearchTagsRecruitingTest 2>&1 | tail -20
```

- [ ] **Step 6: ClubApi/Controller 파라미터 확장**

`backend/src/main/java/com/duing/domain/club/api/ClubApi.java` 의 `getClubs` 시그니처에 `tags`, `recruiting` 추가:

```java
@Operation(summary = "동아리 목록 조회",
        description = "카테고리·분류·키워드·태그·모집중 필터와 페이지네이션 지원.")
@GetMapping("/clubs")
ResponseEntity<ApiResponse<PageResponse<ClubSummaryResponse>>> getClubs(
        @Parameter(description = "카테고리 필터") @RequestParam(required = false) ClubCategory category,
        @Parameter(description = "분류 필터") @RequestParam(required = false) String division,
        @Parameter(description = "이름/설명 키워드") @RequestParam(required = false) String keyword,
        @Parameter(description = "태그 다중 (OR 매칭)") @RequestParam(required = false) List<String> tags,
        @Parameter(description = "오늘 기준 모집중인 동아리만") @RequestParam(required = false) Boolean recruiting,
        @Parameter(hidden = true) Pageable pageable
);
```

Controller 도 동일하게 시그니처를 받고 service 호출 시 `new ClubSearchCondition(category, division, keyword, tags, recruiting)` 로 위임.

- [ ] **Step 7: ClubSummaryQuery/Response 에 tags 노출 (목록 카드 표시용)**

`ClubSummaryQuery` 와 `ClubSummaryResponse` 에 `List<String> tags` 필드 추가. `ClubSummaryQuery.of(Club)` 정적 메서드에서 `club.getTags()` 를 채운다. `ClubSummaryResponse.from(query)` 도 단순 전달.

- [ ] **Step 8: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club \
        backend/src/test/java/com/duing/domain/club
git commit -m "feat(club): 동아리 목록에 태그·모집중 필터와 태그 표시 추가"
```

---

## Task 2: 동아리 상세 응답에 cover/tags/sns/faqs/photos 포함

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubPhotoQuery.java`

- [ ] **Step 1: ClubPhotoQuery 정적 변환 record 작성**

```java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.photo.entity.ClubPhoto;

public record ClubPhotoQuery(
        Long id,
        String storageKey,
        String caption,
        Integer width,
        Integer height,
        int displayOrder
) {
    public static ClubPhotoQuery from(ClubPhoto photo) {
        return new ClubPhotoQuery(
                photo.getId(),
                photo.getStorageKey(),
                photo.getCaption(),
                photo.getWidth(),
                photo.getHeight(),
                photo.getDisplayOrder()
        );
    }
}
```

- [ ] **Step 2: ClubDetailQuery 필드 확장**

```java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ClubStatus;
import java.util.List;

public record ClubDetailQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs,
        Long leaderId,
        String leaderName,
        ClubStatus status,
        List<ClubPhotoQuery> photos
) {
    public static ClubDetailQuery of(Club club, Long leaderId, String leaderName,
                                     List<ClubPhotoQuery> photos) {
        return new ClubDetailQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getDescription(),
                club.getLogoUrl(),
                club.getCoverUrl(),
                club.getTags(),
                club.getSnsLinks(),
                club.getFaqs(),
                leaderId,
                leaderName,
                club.getStatus(),
                photos
        );
    }
}
```

- [ ] **Step 3: ClubDetailResponse 동기화**

`ClubDetailResponse.from(ClubDetailQuery)` 가 새 필드를 전부 노출하도록 record 와 변환 메서드를 갱신. 필드명·순서는 query 와 일치.

- [ ] **Step 4: GeneralClubService.getDetail 갱신**

기존 service 가 `ClubDetailQuery.of(club, leaderId, leaderName)` 만 호출하면 컴파일 실패한다. `ClubPhotoRepository.findByClubIdOrderByDisplayOrderAsc` 를 호출해 `List<ClubPhotoQuery>` 로 변환 후 함께 넘긴다.

```java
@Override
public ClubDetailQuery getDetail(Long clubId) {
    Club club = clubRepository.findById(clubId)
            .orElseThrow(ClubException.ClubNotFoundException::new);
    var leader = clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER);
    Long leaderId = leader.map(member -> member.getUser().getId()).orElse(null);
    String leaderName = leader.map(member -> member.getUser().getName()).orElse(null);

    List<ClubPhotoQuery> photos = clubPhotoRepository
            .findByClubIdOrderByDisplayOrderAsc(clubId)
            .stream()
            .map(ClubPhotoQuery::from)
            .toList();

    return ClubDetailQuery.of(club, leaderId, leaderName, photos);
}
```

위에서 `clubPhotoRepository` 는 `GeneralClubService` 의 `@RequiredArgsConstructor` 가 final 필드로 주입하도록 추가.

- [ ] **Step 5: 빌드 + bootRun 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew build 2>&1 | tail -10
```

테스트 회귀가 없는지 확인. 기존 `ClubControllerTest` 등이 있다면 ClubDetailResponse 변경에 따라 깨질 수 있다 — 깨지면 그 자리에서 함께 갱신.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club
git commit -m "feat(club): 동아리 상세에 cover/tags/sns/faqs/photos 포함"
```

---

## Task 3: ClubPhoto 공개 조회 API (GET /api/v1/clubs/{clubId}/photos)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/api/ClubPhotoApi.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/ClubPhotoController.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubPhotoResponse.java`
- Create: `backend/src/main/java/com/duing/domain/club/photo/service/ClubPhotoService.java`
- Create: `backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java`

- [ ] **Step 1: Response DTO**

```java
package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.service.dto.query.ClubPhotoQuery;

public record ClubPhotoResponse(
        Long id,
        String storageKey,
        String caption,
        Integer width,
        Integer height,
        int displayOrder
) {
    public static ClubPhotoResponse from(ClubPhotoQuery query) {
        return new ClubPhotoResponse(
                query.id(), query.storageKey(), query.caption(),
                query.width(), query.height(), query.displayOrder()
        );
    }
}
```

- [ ] **Step 2: Service interface + impl**

```java
package com.duing.domain.club.photo.service;

import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;

public interface ClubPhotoService {
    List<ClubPhotoQuery> getPhotosByClubId(Long clubId);
}
```

```java
package com.duing.domain.club.photo.service;

import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubPhotoService implements ClubPhotoService {

    private final ClubPhotoRepository clubPhotoRepository;

    @Override
    public List<ClubPhotoQuery> getPhotosByClubId(Long clubId) {
        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }
}
```

- [ ] **Step 3: API + Controller**

```java
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 사진", description = "동아리 활동사진 (공개)")
public interface ClubPhotoApi {

    @Operation(summary = "활동사진 목록", description = "displayOrder 오름차순.")
    @GetMapping("/clubs/{clubId}/photos")
    ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> listPhotos(@PathVariable Long clubId);
}
```

```java
package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubPhotoApi;
import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubPhotoController implements ClubPhotoApi {

    private final ClubPhotoService clubPhotoService;

    @Override
    public ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> listPhotos(@PathVariable Long clubId) {
        List<ClubPhotoResponse> photos = clubPhotoService.getPhotosByClubId(clubId).stream()
                .map(ClubPhotoResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(photos));
    }
}
```

- [ ] **Step 4: 빌드 + bootRun 스모크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew build 2>&1 | tail -10
```

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club
git commit -m "feat(club-photo): 활동사진 공개 조회 API 추가"
```

---

## Task 4: 동아리별 모집 목록 API (GET /api/v1/clubs/{clubId}/recruitments)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryCustom.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/RecruitmentService.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/api/ClubRecruitmentApi.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/controller/ClubRecruitmentController.java`

- [ ] **Step 1: Repository 메서드 추가**

`RecruitmentRepositoryCustom`:
```java
List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId);
```

`RecruitmentRepositoryImpl` 에서:
```java
@Override
public List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId) {
    return queryFactory
            .selectFrom(recruitment)
            .where(recruitment.club.id.eq(clubId))
            // OPEN 인 행이 먼저, 그 다음 startDate 최신순
            .orderBy(
                    new CaseBuilder()
                            .when(recruitment.status.eq(RecruitmentStatus.OPEN)).then(0)
                            .otherwise(1).asc(),
                    recruitment.startDate.desc()
            )
            .fetch();
}
```
필요 import: `com.querydsl.core.types.dsl.CaseBuilder`.

- [ ] **Step 2: Service 메서드 추가**

`RecruitmentService` 에:
```java
List<RecruitmentSummaryQuery> getByClubId(Long clubId);
```

`GeneralRecruitmentService` 구현:
```java
@Override
public List<RecruitmentSummaryQuery> getByClubId(Long clubId) {
    return recruitmentRepository
            .findByClubIdOrderByStatusOpenFirstAndStartDateDesc(clubId)
            .stream()
            .map(RecruitmentSummaryQuery::from)
            .toList();
}
```

- [ ] **Step 3: 새 API/Controller**

```java
package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 모집 목록", description = "특정 동아리의 모집 공고 목록 (공개)")
public interface ClubRecruitmentApi {

    @Operation(summary = "동아리별 모집 공고 목록", description = "OPEN 인 모집이 먼저, 그 다음 시작일 최신순.")
    @GetMapping("/clubs/{clubId}/recruitments")
    ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> listByClub(@PathVariable Long clubId);
}
```

```java
package com.duing.domain.recruitment.controller;

import com.duing.domain.recruitment.api.ClubRecruitmentApi;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubRecruitmentController implements ClubRecruitmentApi {

    private final RecruitmentService recruitmentService;

    @Override
    public ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> listByClub(@PathVariable Long clubId) {
        List<RecruitmentSummaryResponse> list = recruitmentService.getByClubId(clubId).stream()
                .map(RecruitmentSummaryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(list));
    }
}
```

- [ ] **Step 4: 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew build 2>&1 | tail -10
```

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment
git commit -m "feat(recruitment): 동아리별 모집 공고 목록 공개 API 추가"
```

---

## Task 5: Recruitment 응답 DTO 확장 (mode/external_form/use_interview/target_role)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentSummaryResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java`

- [ ] **Step 1: Query/Response 에 신규 필드 4개 추가**

`RecruitmentSummaryQuery` 와 `RecruitmentDetailQuery` 모두에 `ApplicationMode applicationMode`, `String externalFormUrl`, `boolean useInterview`, `TargetRole targetRole` 추가. `from(Recruitment)` 정적 메서드에서 각각 `recruitment.getApplicationMode()`, `getExternalFormUrl()`, `isUseInterview()`, `getTargetRole()` 로 채움.

- [ ] **Step 2: Response 도 동일 필드 노출**

`RecruitmentSummaryResponse`, `RecruitmentDetailResponse` 에 같은 4개 필드 + 변환 메서드 갱신.

- [ ] **Step 3: 빌드 회귀 (DTO 호출부 자동으로 깨지면 자리에서 보강)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew build 2>&1 | tail -15
```

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment
git commit -m "feat(recruitment): 모집 응답 DTO 에 applicationMode/externalFormUrl/useInterview/targetRole 노출"
```

---

## Task 6: Application 도메인 상태 전이 5단계 + 외부폼 가드 + OFFICER 가드 + targetRole 자동 배정 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/entity/Application.java`
- Modify: `backend/src/main/java/com/duing/domain/application/exception/ApplicationDomainException.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Create: `backend/src/test/java/com/duing/domain/application/service/ApplicationStatusTransitionTest.java`
- Create: `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitGuardsTest.java`

- [ ] **Step 1: 새 예외 클래스 추가**

`ApplicationDomainException` 에 inner class 3개 추가 (기존 inner class 보존):

```java
public static class ExternalFormSubmitException extends ApplicationDomainException {
    private static final String MESSAGE = "외부 폼 모집은 du-ing 에서 직접 지원할 수 없습니다.";
    public ExternalFormSubmitException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
}

public static class OfficerMembershipRequiredException extends ApplicationDomainException {
    private static final String MESSAGE = "운영진 모집은 해당 동아리의 기존 부원만 지원할 수 있습니다.";
    public OfficerMembershipRequiredException() { super(MESSAGE, HttpStatus.FORBIDDEN); }
}

public static class ForbiddenApplicationAccessException extends ApplicationDomainException {
    private static final String MESSAGE = "본인의 지원 내역만 조회할 수 있습니다.";
    public ForbiddenApplicationAccessException() { super(MESSAGE, HttpStatus.FORBIDDEN); }
}
```

- [ ] **Step 2: Application 엔티티에 상태 전이 메서드 추가**

기존 `updateStatus(ApplicationStatus newStatus)` 를 다음 2단계로 분리:

```java
import com.duing.domain.application.exception.ApplicationDomainException;
import java.time.LocalDateTime;

public void transitionTo(ApplicationStatus newStatus, boolean useInterview) {
    if (!isAllowedTransition(this.status, newStatus, useInterview)) {
        throw new ApplicationDomainException.InvalidStatusTransitionException();
    }
    this.status = newStatus;
}

private static boolean isAllowedTransition(ApplicationStatus from, ApplicationStatus to, boolean useInterview) {
    return switch (from) {
        case SUBMITTED -> to == ApplicationStatus.UNDER_REVIEW;
        case UNDER_REVIEW -> useInterview
                ? to == ApplicationStatus.INTERVIEW_PENDING
                  || to == ApplicationStatus.REJECTED
                : to == ApplicationStatus.ACCEPTED || to == ApplicationStatus.REJECTED;
        case INTERVIEW_PENDING -> to == ApplicationStatus.ACCEPTED || to == ApplicationStatus.REJECTED;
        case ACCEPTED, REJECTED -> false;
    };
}

public void scheduleInterview(LocalDateTime at, String location) {
    if (this.status != ApplicationStatus.INTERVIEW_PENDING) {
        throw new ApplicationDomainException.InvalidStatusTransitionException();
    }
    this.interviewAt = at;
    this.interviewLocation = location;
}
```

기존 `updateStatus(ApplicationStatus newStatus)` 메서드는 제거.

- [ ] **Step 3: TDD — 5단계 전이 테스트**

```java
package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationStatusTransitionTest {

    @Test
    @DisplayName("면접 미사용 모집은 UNDER_REVIEW 에서 ACCEPTED 로 바로 전이된다")
    void underReviewToAcceptedWhenNoInterview() {
        Application application = buildSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        application.transitionTo(ApplicationStatus.ACCEPTED, false);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("면접 사용 모집은 UNDER_REVIEW 에서 ACCEPTED 로 바로 가지 못한다")
    void cannotSkipInterviewWhenUseInterview() {
        Application application = buildSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.ACCEPTED, true))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("면접 사용 모집은 UNDER_REVIEW → INTERVIEW_PENDING → ACCEPTED 흐름이다")
    void interviewFlow() {
        Application application = buildSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        application.transitionTo(ApplicationStatus.ACCEPTED, true);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("종료 상태(ACCEPTED/REJECTED) 에서는 어디로도 전이할 수 없다")
    void terminalStatesAreFinal() {
        Application accepted = buildSubmittedApplication();
        accepted.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        accepted.transitionTo(ApplicationStatus.ACCEPTED, false);
        assertThatThrownBy(() -> accepted.transitionTo(ApplicationStatus.REJECTED, false))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    private Application buildSubmittedApplication() {
        Club club = Club.create("동아리", ClubCategory.OTHER, null, null, null);
        Recruitment recruitment = Recruitment.create(club, "모집", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 5);
        User user = User.signup("20240001", "홍길동", "hong@daegu.ac.kr", "hash");
        return Application.submit(recruitment, user, List.of());
    }
}
```

실행 후 PASS 확인:

```bash
./gradlew test --tests ApplicationStatusTransitionTest 2>&1 | tail -20
```

- [ ] **Step 4: TDD — submit 가드 테스트**

```java
package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationSubmitGuardsTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);

    private final GeneralApplicationService service = new GeneralApplicationService(
            applicationRepository, recruitmentRepository, userRepository, clubMemberRepository);

    @Test
    @DisplayName("외부 폼 모집에는 직접 지원할 수 없다")
    void externalFormCannotBeSubmittedDirectly() {
        Recruitment recruitment = mockExternalFormRecruitment();
        when(recruitmentRepository.findById(1L)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> service.submit(new SubmitApplicationCommand(1L, 10L, List.of())))
                .isInstanceOf(ApplicationDomainException.ExternalFormSubmitException.class);
    }

    @Test
    @DisplayName("OFFICER 모집은 해당 동아리 비-부원이 지원하면 차단된다")
    void officerRecruitmentRequiresExistingMember() {
        Recruitment recruitment = mockOfficerRecruitmentWithClubId(7L);
        when(recruitmentRepository.findById(1L)).thenReturn(Optional.of(recruitment));
        when(userRepository.findById(10L)).thenReturn(Optional.of(mock(User.class)));
        when(applicationRepository.existsByRecruitmentIdAndUserId(any(), any())).thenReturn(false);
        when(clubMemberRepository.existsByClubIdAndUserId(7L, 10L)).thenReturn(false);

        assertThatThrownBy(() -> service.submit(new SubmitApplicationCommand(1L, 10L, List.of())))
                .isInstanceOf(ApplicationDomainException.OfficerMembershipRequiredException.class);
    }

    private Recruitment mockExternalFormRecruitment() {
        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        return recruitment;
    }

    private Recruitment mockOfficerRecruitmentWithClubId(Long clubId) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(clubId);
        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getTargetRole()).thenReturn(TargetRole.OFFICER);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn(null);
        when(recruitment.getId()).thenReturn(1L);
        return recruitment;
    }

    // import org.mockito.ArgumentMatchers.any; 등 정적 임포트 누락 시 컴파일러 안내 메시지를 따라 추가
}
```

Import `static org.mockito.ArgumentMatchers.any;` 가 필요. 실패 확인:

```bash
./gradlew test --tests ApplicationSubmitGuardsTest 2>&1 | tail -20
```

- [ ] **Step 5: submit 가드 구현 + 상태 전이 호출 갱신**

`GeneralApplicationService.submit` 갱신 후 `updateStatus` 도 새 메서드 호출하도록 갱신:

```java
@Override
@Transactional
public Long submit(SubmitApplicationCommand submitApplicationCommand) {
    Recruitment recruitment = recruitmentRepository.findById(submitApplicationCommand.recruitmentId())
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

    if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
        throw new ApplicationDomainException.RecruitmentClosedException();
    }

    if (recruitment.getApplicationMode() == ApplicationMode.EXTERNAL) {
        throw new ApplicationDomainException.ExternalFormSubmitException();
    }

    User user = userRepository.findById(submitApplicationCommand.userId())
            .orElseThrow(UserException.UserNotFoundException::new);

    if (applicationRepository.existsByRecruitmentIdAndUserId(recruitment.getId(), user.getId())) {
        throw new ApplicationDomainException.DuplicateApplicationException();
    }

    if (recruitment.getTargetRole() == TargetRole.OFFICER) {
        boolean isExistingMember = clubMemberRepository
                .existsByClubIdAndUserId(recruitment.getClub().getId(), user.getId());
        if (!isExistingMember) {
            throw new ApplicationDomainException.OfficerMembershipRequiredException();
        }
    }

    validateAnswersAgainstForm(recruitment, submitApplicationCommand.answers());

    Application application = Application.submit(recruitment, user, submitApplicationCommand.answers());
    return applicationRepository.save(application).getId();
}

@Override
@Transactional
public void updateStatus(UpdateApplicationStatusCommand command) {
    Application application = applicationRepository.findById(command.applicationId())
            .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
    verifyClubManager(application.getRecruitment().getClub(), command.currentUserId());

    application.transitionTo(command.status(), application.getRecruitment().isUseInterview());

    if (command.status() == ApplicationStatus.ACCEPTED) {
        Club club = application.getRecruitment().getClub();
        User applicant = application.getUser();
        ClubMemberRole grantedRole = application.getRecruitment().getTargetRole().toClubMemberRole();
        if (!clubMemberRepository.existsByClubIdAndUserId(club.getId(), applicant.getId())) {
            clubMemberRepository.save(ClubMember.builder()
                    .club(club).user(applicant).role(grantedRole)
                    .build());
        }
    }
}
```

⚠ `ClubMember.builder()` 가 `@Builder(access = PRIVATE)` 라 외부 호출 불가. 대신 `ClubMember.asMember/asLeader` 와 같은 정적 팩토리를 추가하여 사용한다. `ClubMember` 엔티티에 다음 정적 메서드를 추가:

```java
public static ClubMember of(Club club, User user, ClubMemberRole role) {
    return ClubMember.builder().club(club).user(user).role(role).build();
}
```

그러면 서비스에서:
```java
clubMemberRepository.save(ClubMember.of(club, applicant, grantedRole));
```

- [ ] **Step 6: 전체 테스트 재실행**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test 2>&1 | tail -20
```

회귀 있는지 점검. Fixture 가 깨지면 자리에서 보강.

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/application \
        backend/src/main/java/com/duing/domain/clubmember/entity/ClubMember.java \
        backend/src/test/java/com/duing/domain/application/service
git commit -m "feat(application): 5단계 전이·외부폼 가드·OFFICER 가드·targetRole 자동 배정"
```

---

## Task 7: 내 지원 상세 API + 응답 DTO 확장 (interview/5단계)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicationSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicationSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/application/service/dto/query/MyApplicationDetailQuery.java`
- Create: `backend/src/main/java/com/duing/domain/application/controller/dto/response/MyApplicationDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/api/ApplicationApi.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/ApplicationController.java`

- [ ] **Step 1: ApplicationSummaryQuery/Response 확장**

`ApplicationSummaryQuery` 에 `LocalDateTime interviewAt`, `String interviewLocation` 추가, `from(Application)` 에서 채움. `ApplicationSummaryResponse` 도 같은 필드 노출.

- [ ] **Step 2: MyApplicationDetailQuery + Response**

```java
package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import java.time.LocalDateTime;
import java.util.List;

public record MyApplicationDetailQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt
) {
    public static MyApplicationDetailQuery from(Application application) {
        var recruitment = application.getRecruitment();
        var club = recruitment.getClub();
        var form = recruitment.getForm();
        return new MyApplicationDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                club.getId(),
                club.getName(),
                form == null ? List.of() : form.getQuestions(),
                application.getAnswers(),
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt()
        );
    }
}
```

Response 는 같은 모양으로 record + `from(query)`.

- [ ] **Step 3: ApplicationService 시그니처 추가 + 구현**

```java
MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId);
```

```java
@Override
public MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId) {
    Application application = applicationRepository.findById(applicationId)
            .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
    if (!application.getUser().getId().equals(currentUserId)) {
        throw new ApplicationDomainException.ForbiddenApplicationAccessException();
    }
    return MyApplicationDetailQuery.from(application);
}
```

- [ ] **Step 4: API + Controller 핸들러**

`ApplicationApi` 에:
```java
@Operation(summary = "내 지원 상세 조회", description = "본인 지원만 조회 가능. 답변·면접 일시·장소 포함.")
@GetMapping("/users/me/applications/{applicationId}")
ResponseEntity<ApiResponse<MyApplicationDetailResponse>> getMyApplicationDetail(
        @PathVariable Long applicationId,
        @AuthenticationPrincipal UserPrincipal currentUser
);
```

`ApplicationController` 구현:
```java
@Override
public ResponseEntity<ApiResponse<MyApplicationDetailResponse>> getMyApplicationDetail(
        @PathVariable Long applicationId,
        @AuthenticationPrincipal UserPrincipal currentUser) {
    MyApplicationDetailResponse body = MyApplicationDetailResponse.from(
            applicationService.getMyApplicationDetail(applicationId, currentUser.id()));
    return ResponseEntity.ok(ApiResponse.success(body));
}
```

- [ ] **Step 5: 빌드 + 회귀**

```bash
./gradlew build 2>&1 | tail -10
```

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application
git commit -m "feat(application): 내 지원 상세 API + 면접·5단계 응답 노출"
```

---

## Task 8: 프론트 타입 + API 클라이언트 + 훅 갱신

**Files:**
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/types/src/recruitment.ts`
- Modify: `frontend/packages/types/src/application.ts`
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/hooks/src/clubs.ts`
- Modify: `frontend/packages/hooks/src/applications.ts`

- [ ] **Step 1: club.ts 갱신**

```typescript
// frontend/packages/types/src/club.ts
export type ClubCategory =
  | 'ACADEMIC'
  | 'CULTURE'
  | 'ART'
  | 'SPORTS'
  | 'VOLUNTEER'
  | 'RELIGION'
  | 'HOBBY'
  | 'OTHER';

export type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE';

export interface ClubSummary {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
}

export interface ClubSnsLink {
  platform: string;
  url: string;
}

export interface ClubFaq {
  question: string;
  answer: string;
  order: number;
}

export interface ClubPhoto {
  id: number;
  storageKey: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  displayOrder: number;
}

export interface ClubDetail extends ClubSummary {
  description: string | null;
  coverUrl: string | null;
  snsLinks: ClubSnsLink[];
  faqs: ClubFaq[];
  leaderId: number | null;
  leaderName: string | null;
  photos: ClubPhoto[];
}

export interface ClubSearchParams {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  tags?: string[];
  recruiting?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export interface CreateClubPayload {
  name: string;
  category: ClubCategory;
  division?: string;
  description?: string;
  logoUrl?: string;
  leaderId: number;
}

export interface UpdateClubStatusPayload {
  status: ClubStatus;
}
```

- [ ] **Step 2: recruitment.ts 갱신**

```typescript
export type RecruitmentStatus = 'OPEN' | 'CLOSED';
export type ApplicationMode = 'SELF' | 'EXTERNAL';
export type TargetRole = 'MEMBER' | 'OFFICER';

export interface RecruitmentSummary {
  id: number;
  clubId: number;
  clubName: string;
  title: string;
  startDate: string;
  endDate: string;
  capacity: number;
  status: RecruitmentStatus;
  effectivelyOpen: boolean;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  useInterview: boolean;
  targetRole: TargetRole;
}

export interface RecruitmentDetail extends RecruitmentSummary {
  content: string | null;
  questions: string[];
}

export interface CreateRecruitmentPayload {
  title: string;
  content?: string;
  startDate: string;
  endDate: string;
  capacity: number;
  questions?: string[];
  applicationMode?: ApplicationMode;
  externalFormUrl?: string;
  useInterview?: boolean;
  targetRole?: TargetRole;
}
```

- [ ] **Step 3: application.ts 갱신**

```typescript
export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW_PENDING'
  | 'ACCEPTED'
  | 'REJECTED';

export interface ApplicationSummary {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string;
}

export interface MyApplicationDetail {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  questions: string[];
  answers: string[];
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string;
}

export interface Applicant {
  applicationId: number;
  userId: number;
  userName: string;
  studentId: string;
  email: string;
  answers: string[];
  status: ApplicationStatus;
  submittedAt: string;
}

export interface SubmitApplicationPayload {
  answers: string[];
}

export interface UpdateApplicationStatusPayload {
  status: Exclude<ApplicationStatus, 'SUBMITTED'>;
}
```

- [ ] **Step 4: API 클라이언트에 신규 엔드포인트 추가**

`packages/api/src/client.ts`:

Interface `DuingApiClient` 의 `clubs` 와 `applications` 와 `recruitments` 섹션을 다음으로 확장:

```typescript
clubs: {
  list(params?: ClubSearchParams): Promise<PageResponse<ClubSummary>>;
  detail(clubId: number): Promise<ClubDetail>;
  photos(clubId: number): Promise<ClubPhoto[]>;
  recruitmentsByClub(clubId: number): Promise<RecruitmentSummary[]>;
  create(payload: CreateClubPayload): Promise<number>;
  updateStatus(clubId: number, payload: UpdateClubStatusPayload): Promise<void>;
};
applications: {
  submit(recruitmentId: number, payload: SubmitApplicationPayload): Promise<number>;
  myDetail(applicationId: number): Promise<MyApplicationDetail>;
  applicants(recruitmentId: number): Promise<Applicant[]>;
  updateStatus(applicationId: number, payload: UpdateApplicationStatusPayload): Promise<void>;
};
```

추가로 import 에 `ClubPhoto, MyApplicationDetail` 포함.

`createApiClient` 구현 객체에 다음 메서드 추가:

```typescript
clubs: {
  // ...
  photos: (clubId) => jsonOk<ClubPhoto[]>(http.get(`clubs/${clubId}/photos`)),
  recruitmentsByClub: (clubId) =>
    jsonOk<RecruitmentSummary[]>(http.get(`clubs/${clubId}/recruitments`)),
  // ...
},
applications: {
  // ...
  myDetail: (applicationId) =>
    jsonOk<MyApplicationDetail>(http.get(`users/me/applications/${applicationId}`)),
  // ...
}
```

- [ ] **Step 5: 훅 추가**

`packages/hooks/src/clubs.ts` 끝에 추가:

```typescript
export function useClubPhotos(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', clubId, 'photos'],
    queryFn: () => client.clubs.photos(clubId as number),
    enabled: clubId !== undefined,
  });
}

export function useClubRecruitments(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['clubs', clubId, 'recruitments'],
    queryFn: () => client.clubs.recruitmentsByClub(clubId as number),
    enabled: clubId !== undefined,
  });
}
```

`packages/hooks/src/applications.ts` 에:

```typescript
export function useMyApplicationDetail(applicationId: number | undefined) {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['users', 'me', 'applications', applicationId],
    queryFn: () => client.applications.myDetail(applicationId as number),
    enabled: status === 'authenticated' && applicationId !== undefined,
  });
}
```

- [ ] **Step 6: typecheck / build**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm install
pnpm -r typecheck 2>&1 | tail -20
pnpm --filter web build 2>&1 | tail -10
```

- [ ] **Step 7: 커밋**

```bash
git add frontend/packages/types/src/ frontend/packages/api/src/client.ts \
        frontend/packages/hooks/src/clubs.ts frontend/packages/hooks/src/applications.ts
git commit -m "feat(web): Phase 1 신규 필드·엔드포인트·훅 추가"
```

---

## Task 9: 인증 store 와 미들웨어 쿠키 동기화

**Files:**
- Modify: `frontend/packages/stores/src/auth-store.ts`

문제: 현재 `useAuthStore.setSession()` 은 `@duing/storage` 의 localStorage 에만 토큰을 저장한다. 그런데 Phase 0 의 미들웨어는 `duing_token` 쿠키를 본다. 로그인 직후 페이지 이동 시 미들웨어가 인증을 인식하지 못해 `/login` 으로 다시 튕길 수 있다.

해결: `setSession` 호출 시 `setAuthToken()`(쿠키) 도 함께 호출, `clearSession` 시 `clearAuthToken()` 도 호출.

- [ ] **Step 1: auth-store.ts 수정**

```typescript
import { create } from 'zustand';
import type { User } from '@duing/types';
import {
  clearToken,
  readToken,
  writeToken,
  setAuthToken,
  clearAuthToken,
} from '@duing/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: 'idle' | 'authenticated' | 'unauthenticated';
  setSession(user: User, accessToken: string): Promise<void>;
  clearSession(): Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  async setSession(user, accessToken) {
    await writeToken(accessToken);
    setAuthToken(accessToken); // 쿠키 (미들웨어용)
    set({ user, accessToken, status: 'authenticated' });
  },
  async clearSession() {
    await clearToken();
    clearAuthToken();
    set({ user: null, accessToken: null, status: 'unauthenticated' });
  },
}));

export async function hydrateAuthFromStorage(): Promise<void> {
  const token = await readToken();
  if (token) {
    setAuthToken(token); // SSR/CSR boot 시점에 쿠키 비어 있으면 채움
    useAuthStore.setState({ accessToken: token, status: 'authenticated' });
  } else {
    useAuthStore.setState({ status: 'unauthenticated' });
  }
}
```

- [ ] **Step 2: typecheck**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm -r typecheck 2>&1 | tail -10
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/stores/src/auth-store.ts
git commit -m "fix(web): 로그인 시 localStorage 와 쿠키 동시 갱신해 미들웨어 가드와 동기화"
```

---

## Task 10: 로그인 / 회원가입 페이지

**Files:**
- Create: `frontend/apps/web/app/(auth)/login/page.tsx`
- Create: `frontend/apps/web/app/(auth)/signup/page.tsx`

- [ ] **Step 1: 로그인 페이지**

```tsx
// frontend/apps/web/app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLogin } from '@duing/hooks';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/me';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = useLogin();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">로그인</h1>
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="hong@daegu.ac.kr"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {login.isPending ? '로그인 중…' : '로그인'}
      </button>
      <p className="text-center text-sm text-slate-500">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="text-slate-900 underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: 회원가입 페이지**

```tsx
// frontend/apps/web/app/(auth)/signup/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSignup } from '@duing/hooks';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignup();

  const [form, setForm] = useState({
    studentId: '',
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await signup.mutateAsync(form);
      router.replace('/login?next=/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.');
    }
  }

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">회원가입</h1>
      <label className="block">
        <span className="text-sm text-slate-600">학번</span>
        <input
          required
          pattern="\d{7,10}"
          value={form.studentId}
          onChange={(e) => update('studentId', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="7~10자리 숫자"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">이름</span>
        <input
          required
          maxLength={50}
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="hong@daegu.ac.kr"
        />
        <span className="mt-1 block text-xs text-slate-500">
          대구대학교(@daegu.ac.kr) 이메일만 사용 가능합니다.
        </span>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <input
          required
          type="password"
          minLength={8}
          maxLength={72}
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="8~72자"
        />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={signup.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {signup.isPending ? '가입 중…' : '회원가입'}
      </button>
      <p className="text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-slate-900 underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: 빌드 + dev 스모크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -10
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/\(auth\)/login frontend/apps/web/app/\(auth\)/signup
git commit -m "feat(web): 로그인·회원가입 페이지 추가"
```

---

## Task 11: 메인 페이지 — 동아리 탐색/검색/필터/그리드

**Files:**
- Delete: `frontend/apps/web/app/page.tsx` (기존 placeholder)
- Delete: `frontend/apps/web/app/clubs/page.tsx`
- Delete: `frontend/apps/web/app/recruitments/page.tsx`
- Create: `frontend/apps/web/app/page.tsx` (새 탐색 메인)
- Create: `frontend/apps/web/app/_components/ClubCard.tsx`
- Create: `frontend/apps/web/app/_components/ClubFilters.tsx`

> Next.js App Router 에서 `_components` 접두사는 라우트 비포함 폴더라 안전하게 공용 컴포넌트 자리로 쓸 수 있다.

- [ ] **Step 1: 기존 placeholder 삭제**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
rm frontend/apps/web/app/clubs/page.tsx
rm frontend/apps/web/app/recruitments/page.tsx
rmdir frontend/apps/web/app/clubs frontend/apps/web/app/recruitments 2>/dev/null || true
```

`page.tsx` 는 다음 단계에서 새 내용으로 교체.

- [ ] **Step 2: ClubCard 컴포넌트**

```tsx
// frontend/apps/web/app/_components/ClubCard.tsx
import Link from 'next/link';
import type { ClubSummary } from '@duing/types';

const CATEGORY_LABEL: Record<ClubSummary['category'], string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

export function ClubCard({ club }: { club: ClubSummary }) {
  return (
    <Link
      href={`/clubs/${club.id}`}
      className="block rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        {club.logoUrl ? (
          <img src={club.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-slate-200" />
        )}
        <div>
          <h3 className="font-semibold">{club.name}</h3>
          <p className="text-xs text-slate-500">
            {CATEGORY_LABEL[club.category]}
            {club.division ? ` · ${club.division}` : ''}
          </p>
        </div>
      </div>
      {club.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1">
          {club.tags.slice(0, 5).map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
```

- [ ] **Step 3: ClubFilters 컴포넌트**

```tsx
// frontend/apps/web/app/_components/ClubFilters.tsx
'use client';

import type { ClubCategory, ClubSearchParams } from '@duing/types';

const CATEGORIES: { value: ClubCategory; label: string }[] = [
  { value: 'ACADEMIC', label: '학술' },
  { value: 'CULTURE', label: '문화' },
  { value: 'ART', label: '예술' },
  { value: 'SPORTS', label: '체육' },
  { value: 'VOLUNTEER', label: '봉사' },
  { value: 'RELIGION', label: '종교' },
  { value: 'HOBBY', label: '취미' },
  { value: 'OTHER', label: '기타' },
];

interface Props {
  value: ClubSearchParams;
  onChange(next: ClubSearchParams): void;
}

export function ClubFilters({ value, onChange }: Props) {
  function toggleCategory(category: ClubCategory) {
    onChange({ ...value, category: value.category === category ? undefined : category });
  }
  function toggleRecruiting() {
    onChange({ ...value, recruiting: value.recruiting ? undefined : true });
  }
  function updateKeyword(keyword: string) {
    onChange({ ...value, keyword: keyword || undefined });
  }

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="동아리 이름·소개 검색"
        value={value.keyword ?? ''}
        onChange={(e) => updateKeyword(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const active = value.category === category.value;
          return (
            <button
              key={category.value}
              type="button"
              onClick={() => toggleCategory(category.value)}
              className={
                'rounded-full px-3 py-1 text-sm border ' +
                (active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-slate-300 text-slate-600 hover:border-slate-500')
              }
            >
              {category.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={toggleRecruiting}
          className={
            'rounded-full px-3 py-1 text-sm border ' +
            (value.recruiting
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'border-slate-300 text-slate-600 hover:border-slate-500')
          }
        >
          모집중만
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 메인 페이지**

```tsx
// frontend/apps/web/app/page.tsx
'use client';

import { useState } from 'react';
import type { ClubSearchParams } from '@duing/types';
import { useClubList } from '@duing/hooks';
import { ClubCard } from './_components/ClubCard';
import { ClubFilters } from './_components/ClubFilters';

export default function HomePage() {
  const [params, setParams] = useState<ClubSearchParams>({ page: 0, size: 20 });
  const query = useClubList(params);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Du-ing</h1>
        <p className="mt-2 text-slate-600">대구대학교 동아리를 탐색하고 지원하세요.</p>
      </header>

      <section className="mb-8">
        <ClubFilters
          value={params}
          onChange={(next) => setParams({ ...next, page: 0, size: params.size ?? 20 })}
        />
      </section>

      <section>
        {query.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
        {query.error && (
          <p className="text-sm text-rose-600">
            {query.error instanceof Error ? query.error.message : '오류가 발생했습니다.'}
          </p>
        )}
        {query.data && (
          <>
            <p className="mb-3 text-sm text-slate-500">총 {query.data.totalElements}개</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {query.data.content.map((club) => (
                <li key={club.id}>
                  <ClubCard club={club} />
                </li>
              ))}
            </ul>
            {query.data.totalPages > 1 && (
              <Pagination
                page={params.page ?? 0}
                totalPages={query.data.totalPages}
                onPage={(page) => setParams({ ...params, page })}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage(p: number): void;
}) {
  return (
    <nav className="mt-6 flex justify-center gap-2">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
      >
        이전
      </button>
      <span className="px-3 py-1 text-sm text-slate-600">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page + 1 >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
      >
        다음
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: build + dev 동작 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -10
```

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/page.tsx frontend/apps/web/app/_components
git add -u frontend/apps/web/app
git commit -m "feat(web): 메인 페이지를 동아리 탐색·검색·필터·그리드로 교체"
```

---

## Task 12: 모집 달력 페이지 (/calendar)

**Files:**
- Create: `frontend/apps/web/app/calendar/page.tsx`

- [ ] **Step 1: 페이지 구현**

```tsx
// frontend/apps/web/app/calendar/page.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRecruitmentCalendar } from '@duing/hooks';

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [yearMonth, setYearMonth] = useState(() => toYearMonth(new Date()));
  const query = useRecruitmentCalendar(yearMonth);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-end justify-between">
        <h1 className="text-2xl font-bold">모집 달력</h1>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1"
        />
      </header>
      {query.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {query.data && (
        <ul className="space-y-3">
          {query.data.length === 0 && (
            <li className="text-sm text-slate-500">해당 월에 진행되는 모집이 없습니다.</li>
          )}
          {query.data.map((recruitment) => (
            <li
              key={recruitment.id}
              className="rounded-lg border border-slate-200 p-4 hover:border-slate-400"
            >
              <Link href={`/clubs/${recruitment.clubId}/recruitments/${recruitment.id}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{recruitment.title}</span>
                  <span className="text-sm text-slate-500">
                    {recruitment.startDate} ~ {recruitment.endDate}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{recruitment.clubName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {recruitment.effectivelyOpen ? '모집중' : '마감'} ·{' '}
                  {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'} · 정원 {recruitment.capacity}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: build + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -5

cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/calendar
git commit -m "feat(web): 모집 달력 페이지 추가"
```

---

## Task 13: 동아리 상세 페이지 (/clubs/[clubId])

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/page.tsx`

- [ ] **Step 1: 페이지 구현**

```tsx
// frontend/apps/web/app/clubs/[clubId]/page.tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClubDetail, useClubRecruitments, useClubPhotos } from '@duing/hooks';

export default function ClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const detail = useClubDetail(clubId);
  const photos = useClubPhotos(clubId);
  const recruitments = useClubRecruitments(clubId);

  if (detail.isLoading) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  if (!detail.data) return <p className="p-6 text-sm text-rose-600">동아리를 찾을 수 없습니다.</p>;
  const club = detail.data;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {club.coverUrl && (
        <img src={club.coverUrl} alt="" className="mb-6 h-48 w-full rounded-xl object-cover" />
      )}
      <header className="mb-6 flex items-center gap-4">
        {club.logoUrl && (
          <img src={club.logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{club.name}</h1>
          <p className="text-sm text-slate-500">
            {club.division ?? ''}
            {club.leaderName ? ` · 회장 ${club.leaderName}` : ''}
          </p>
        </div>
      </header>

      {club.tags.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1">
          {club.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}

      {club.description && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">소개</h2>
          <p className="whitespace-pre-wrap text-slate-700">{club.description}</p>
        </section>
      )}

      {recruitments.data && recruitments.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">진행 중인 모집</h2>
          <ul className="space-y-2">
            {recruitments.data
              .filter((r) => r.effectivelyOpen)
              .map((recruitment) => (
                <li key={recruitment.id}>
                  <Link
                    href={`/clubs/${club.id}/recruitments/${recruitment.id}`}
                    className="block rounded-lg border border-slate-200 p-3 hover:border-slate-400"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">{recruitment.title}</span>
                      <span className="text-xs text-slate-500">
                        ~ {recruitment.endDate}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'} ·{' '}
                      {recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'} 모집 · 정원{' '}
                      {recruitment.capacity}
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      {photos.data && photos.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">활동 사진</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.data.map((photo) => (
              <img
                key={photo.id}
                src={photo.storageKey}
                alt={photo.caption ?? ''}
                className="aspect-square rounded-md object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {club.faqs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">FAQ</h2>
          <ul className="space-y-3">
            {club.faqs
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((faq, idx) => (
                <li key={idx} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium">Q. {faq.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{faq.answer}</p>
                </li>
              ))}
          </ul>
        </section>
      )}

      {club.snsLinks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">SNS</h2>
          <ul className="flex flex-wrap gap-2">
            {club.snsLinks.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:border-slate-500"
                >
                  {link.platform}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

> Next.js 15 의 `params` 는 Promise. `React.use(params)` 로 푼다. `useClubPhotos`/`useClubRecruitments` 가 클라이언트 훅이므로 페이지를 `'use client'` 로 둔다 (`react.use` 도 client 에서 동작).

- [ ] **Step 2: build + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -5

cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs
git commit -m "feat(web): 동아리 상세 페이지(소개·태그·사진·FAQ·SNS·모집) 추가"
```

---

## Task 14: 모집 상세 페이지 + "지원하기" 분기 (/clubs/[clubId]/recruitments/[recruitmentId])

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`

- [ ] **Step 1: 페이지 구현**

```tsx
// frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useRecruitmentDetail } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

export default function RecruitmentDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { recruitmentId: recruitmentIdParam } = use(params);
  const recruitmentId = Number(recruitmentIdParam);
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);

  const query = useRecruitmentDetail(recruitmentId);
  if (query.isLoading) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  if (!query.data) return <p className="p-6 text-sm text-rose-600">모집을 찾을 수 없습니다.</p>;
  const recruitment = query.data;

  function handleApplyClick() {
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      window.open(recruitment.externalFormUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (authStatus !== 'authenticated') {
      const next = `/apply/${recruitment.id}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    router.push(`/apply/${recruitment.id}`);
  }

  const canApply = recruitment.effectivelyOpen;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm text-slate-500">{recruitment.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{recruitment.title}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {recruitment.startDate} ~ {recruitment.endDate} · 정원 {recruitment.capacity}명 ·{' '}
        {recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'} 모집
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {recruitment.effectivelyOpen ? '모집중' : '마감'} ·{' '}
        {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼으로 진행' : '자체 폼'} ·{' '}
        {recruitment.useInterview ? '면접 진행' : '면접 없음'}
      </p>

      {recruitment.content && (
        <article className="mt-6 whitespace-pre-wrap text-slate-700">
          {recruitment.content}
        </article>
      )}

      {recruitment.applicationMode === 'SELF' && recruitment.questions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">지원서 질문</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {recruitment.questions.map((question, idx) => (
              <li key={idx}>{question}</li>
            ))}
          </ol>
        </section>
      )}

      {recruitment.targetRole === 'OFFICER' && (
        <p className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          ⚠ 이 모집은 운영진 모집입니다. 이 동아리의 기존 부원만 지원할 수 있습니다.
        </p>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={handleApplyClick}
          disabled={!canApply}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
        >
          {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼으로 이동' : '지원하기'}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: build + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -5

cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/\[clubId\]/recruitments
git commit -m "feat(web): 모집 상세 페이지 + 지원하기 분기(외부폼·자체폼·OFFICER 안내)"
```

---

## Task 15: 지원서 작성 페이지 (/apply/[recruitmentId])

**Files:**
- Create: `frontend/apps/web/app/apply/[recruitmentId]/page.tsx`

- [ ] **Step 1: 페이지 구현**

```tsx
// frontend/apps/web/app/apply/[recruitmentId]/page.tsx
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRecruitmentDetail, useSubmitApplication } from '@duing/hooks';

export default function ApplyPage({
  params,
}: {
  params: Promise<{ recruitmentId: string }>;
}) {
  const { recruitmentId: idParam } = use(params);
  const recruitmentId = Number(idParam);
  const router = useRouter();

  const detail = useRecruitmentDetail(recruitmentId);
  const submit = useSubmitApplication(recruitmentId);

  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data) {
      // 외부 폼 모집은 여기 들어오면 안 됨 — 안내 후 상세로 돌려보냄.
      if (detail.data.applicationMode === 'EXTERNAL') {
        router.replace(`/clubs/${detail.data.clubId}/recruitments/${detail.data.id}`);
        return;
      }
      setAnswers((prev) =>
        prev.length === detail.data!.questions.length
          ? prev
          : detail.data!.questions.map(() => ''),
      );
    }
  }, [detail.data, router]);

  if (detail.isLoading || !detail.data) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }
  const recruitment = detail.data;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const applicationId = await submit.mutateAsync({ answers });
      router.replace(`/me/applications/${applicationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '지원에 실패했습니다.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-slate-500">{recruitment.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{recruitment.title}</h1>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        {recruitment.questions.length === 0 && (
          <p className="text-sm text-slate-500">
            이 모집은 별도 질문이 없습니다. 제출 버튼을 눌러 지원할 수 있습니다.
          </p>
        )}
        {recruitment.questions.map((question, idx) => (
          <label key={idx} className="block">
            <span className="text-sm font-medium text-slate-700">
              {idx + 1}. {question}
            </span>
            <textarea
              required
              rows={4}
              value={answers[idx] ?? ''}
              onChange={(e) =>
                setAnswers((prev) => {
                  const next = prev.slice();
                  next[idx] = e.target.value;
                  return next;
                })
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        ))}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {submit.isPending ? '제출 중…' : '제출'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: build + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -5

cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/apply
git commit -m "feat(web): 지원서 작성 페이지(동적 질문 렌더링·제출) 추가"
```

---

## Task 16: 내 지원 목록 + 상세 페이지 (/me/applications, /me/applications/[id])

**Files:**
- Create: `frontend/apps/web/app/me/applications/page.tsx`
- Create: `frontend/apps/web/app/me/applications/[applicationId]/page.tsx`

- [ ] **Step 1: 상수 — 상태 라벨**

각 페이지에서 재사용할 라벨 매핑을 페이지 안 const 로 둔다 (별도 파일 불필요):

```typescript
const STATUS_LABEL: Record<
  'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_PENDING' | 'ACCEPTED' | 'REJECTED',
  string
> = {
  SUBMITTED: '제출됨',
  UNDER_REVIEW: '서류 검토중',
  INTERVIEW_PENDING: '면접 대기',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};
```

- [ ] **Step 2: 내 지원 목록 페이지**

```tsx
// frontend/apps/web/app/me/applications/page.tsx
'use client';

import Link from 'next/link';
import { useMyApplications } from '@duing/hooks';

const STATUS_LABEL = {
  SUBMITTED: '제출됨',
  UNDER_REVIEW: '서류 검토중',
  INTERVIEW_PENDING: '면접 대기',
  ACCEPTED: '합격',
  REJECTED: '불합격',
} as const;

export default function MyApplicationsPage() {
  const query = useMyApplications();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">내 지원 목록</h1>
      {query.isLoading && <p className="mt-4 text-sm text-slate-500">불러오는 중…</p>}
      {query.data?.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">아직 제출한 지원이 없습니다.</p>
      )}
      {query.data && query.data.length > 0 && (
        <ul className="mt-4 space-y-3">
          {query.data.map((application) => (
            <li
              key={application.id}
              className="rounded-lg border border-slate-200 p-4 hover:border-slate-400"
            >
              <Link href={`/me/applications/${application.id}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{application.recruitmentTitle}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {STATUS_LABEL[application.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{application.clubName}</p>
                {application.interviewAt && (
                  <p className="mt-1 text-xs text-emerald-700">
                    면접: {new Date(application.interviewAt).toLocaleString()} ·{' '}
                    {application.interviewLocation ?? '장소 미정'}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: 내 지원 상세 페이지**

```tsx
// frontend/apps/web/app/me/applications/[applicationId]/page.tsx
'use client';

import { use } from 'react';
import { useMyApplicationDetail } from '@duing/hooks';

const STATUS_LABEL = {
  SUBMITTED: '제출됨',
  UNDER_REVIEW: '서류 검토중',
  INTERVIEW_PENDING: '면접 대기',
  ACCEPTED: '합격',
  REJECTED: '불합격',
} as const;

export default function MyApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId: idParam } = use(params);
  const applicationId = Number(idParam);
  const query = useMyApplicationDetail(applicationId);

  if (query.isLoading) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  if (!query.data) return <p className="p-6 text-sm text-rose-600">지원 내역을 찾을 수 없습니다.</p>;
  const application = query.data;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-slate-500">{application.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{application.recruitmentTitle}</h1>
      <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm">
        {STATUS_LABEL[application.status]}
      </p>

      {application.status === 'INTERVIEW_PENDING' && (
        <section className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">면접 일정 안내</p>
          {application.interviewAt ? (
            <p className="mt-1">
              {new Date(application.interviewAt).toLocaleString()} ·{' '}
              {application.interviewLocation ?? '장소 미정'}
            </p>
          ) : (
            <p className="mt-1">아직 면접 일정이 등록되지 않았습니다.</p>
          )}
        </section>
      )}

      {application.questions.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="font-semibold">지원서 답변</h2>
          {application.questions.map((question, idx) => (
            <div key={idx} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">
                {idx + 1}. {question}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {application.answers[idx] ?? ''}
              </p>
            </div>
          ))}
        </section>
      )}

      <p className="mt-6 text-xs text-slate-500">
        제출일: {new Date(application.submittedAt).toLocaleString()}
      </p>
    </main>
  );
}
```

- [ ] **Step 4: build + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web build 2>&1 | tail -10

cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/me
git commit -m "feat(web): 내 지원 목록·상세 페이지(면접 일정 포함) 추가"
```

---

## Task 17: 전체 회귀 — 백엔드 빌드/테스트 + 프론트 빌드/타입체크 + 수동 스모크

**Files:** 없음 (검증만).

- [ ] **Step 1: 백엔드 전체 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew clean build 2>&1 | tail -30
```

기대: BUILD SUCCESSFUL. Phase 0 의 11개 테스트 + Phase 1 신규 테스트(ClubSearchTagsRecruitingTest 2 + ApplicationStatusTransitionTest 4 + ApplicationSubmitGuardsTest 2 = 8개) → 총 19개 통과.

- [ ] **Step 2: 프론트엔드 전체 빌드 + 타입체크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm install
pnpm -r typecheck 2>&1 | tail -30
pnpm --filter web build 2>&1 | tail -10
```

기대: 모든 워크스페이스 패키지 ✅, web 빌드 성공.

- [ ] **Step 3: 수동 스모크 시나리오 (콘솔에 기록)**

```bash
cat <<'EOF'
[수동 검증 시나리오 — Backend 와 Frontend 모두 띄운 상태에서]

1. http://localhost:3000 메인:
   - 동아리 카드 그리드 노출
   - 검색·카테고리·모집중 필터 동작
2. 카드 클릭 → /clubs/{id}:
   - 커버·로고·태그·소개·진행중 모집·활동사진·FAQ·SNS 노출
3. 모집 카드 클릭 → /clubs/{id}/recruitments/{rid}:
   - 자체 폼: "지원하기" → 비로그인 시 /login?next=... 리다이렉트 (Phase 0 미들웨어)
   - 외부 폼: "외부 폼으로 이동" → 새 탭
4. 로그인 → /apply/{rid}:
   - 질문 렌더링, 제출 시 /me/applications/{id} 이동
5. /me/applications:
   - 본인 지원 목록 + 상태 라벨
   - 면접대기 항목에 일정 안내 (있을 시)
EOF
```

- [ ] **Step 4: 빌드 그린 확정 후 마무리 안내**

```bash
echo "Phase 1 구현 완료. finishing-a-development-branch 로 PR 분할 절차 진행 가능."
```

---

## Self-Review

**1. 스펙 커버리지** (Phase 1 의 spec 항목과 본 plan task 매핑)

| Spec | Plan Task |
|---|---|
| 1.1 GET /clubs 확장 (tags, recruiting) | Task 1 |
| 1.2 GET /clubs/{id} 확장 (photos/faqs/sns) | Task 2 |
| 1.3 GET /clubs/{id}/photos | Task 3 |
| 1.4 GET /clubs/{id}/recruitments | Task 4 |
| 1.5 POST /recruitments/{id}/applications (외부 폼 가드·OFFICER 가드·targetRole) | Task 5 (DTO 노출) + Task 6 (서비스 가드·전이 + targetRole 자동 배정) |
| 1.6 GET /users/me/applications (5단계·면접) | Task 7 |
| 1.7 GET /users/me/applications/{id} | Task 7 |
| 1.A 메인 (검색·필터·그리드) | Task 8 (types/client) + Task 11 |
| 1.B 달력 | Task 12 |
| 1.C 동아리 상세 | Task 13 |
| 1.D 모집 상세 + 지원 분기 | Task 14 |
| 1.E 로그인/회원가입 | Task 9 (store 동기화) + Task 10 |
| 1.F 지원서 작성 | Task 15 |
| 1.G 내 지원 목록·상세 | Task 16 |
| Done 회귀 검증 | Task 17 |

**2. Placeholder 스캔** — TBD / TODO / "implement later" 없음 확인 ✅. 단 Task 1 의 QueryDSL Postgres array overlap 처리는 두 경로(SQL function 등록 vs 직접 fragment) 를 제시하고 implementer 가 동작 보장되는 쪽을 택하도록 명시 — placeholder 아니라 실행 가능한 결정 지점.

**3. 타입·시그니처 일관성**
- `ClubMember.of(club, user, role)` 정적 메서드를 Task 6 에서 추가, Task 6 외에서 호출 안 함 (Task 7 에서는 무관, Phase 2 의 OFFICER 승급/강등에서 사용 예정).
- `Application.transitionTo(newStatus, useInterview)` Task 6 정의, Task 17 에서만 호출됨 (다른 task 는 service 통해 간접).
- `MyApplicationDetailQuery`/`MyApplicationDetailResponse` Task 7 정의, Task 8 의 client type `MyApplicationDetail` 과 1:1 매칭 (필드명·타입 동일).
- `ClubPhoto` 의 `storageKey` 가 client URL 로 직접 쓰일 수 있는지: Phase 0 의 file upload 가 URL 을 그대로 storageKey 로 저장하므로 `<img src={photo.storageKey}>` 가 동작. 향후 storageKey/url 분리 시 Task 13 의 `photos[].storageKey` → `photos[].url` 로 교체 필요.

**4. 스코프 점검** — 단일 plan 으로 적정. 17 task 가 많아 보이나, 각 Task 가 단일 책임(1 API or 1 페이지 or 1 인프라 변경) 이라 PR 분할이 자연스러움. 백엔드는 8 task, 프론트는 8 task, 회귀 1 task.
