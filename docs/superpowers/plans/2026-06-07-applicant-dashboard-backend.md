# 지원자 관리 대시보드 — Backend Implementation Plan (B1~B4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-07-applicant-management-dashboard-design.md`

**Goal:** 운영진 지원자 관리 대시보드의 백엔드 4개 PR (B1~B4) 을 순차 구현한다. (1) 목록 검색·필터링 + 응답 컬럼 확장 (B1), (2) 상태 변경 audit log + 타임라인 응답 (B2), (3) 평가 도메인 신규 + myScore + 상세 응답 분리 (B3), (4) prev/next neighbor 엔드포인트 (B4).

**Architecture:** 기존 `application` 도메인 확장 + 신규 `applicationEvaluation` aggregate. `ApplicationStatusHistory` 는 application 도메인의 sub-entity (컬렉션 보유 X). 검색은 QueryDSL `BooleanExpression` 동적 조건. 모든 신규/확장 엔드포인트는 `clubAuthService.requireManager` 로 권한 가드.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / JPA / QueryDSL / Hibernate Validator / Lombok / Postgres 16 (TestContainers) / RestAssured / Fixture Monkey.

**브랜치 전략:** 4개 PR 순차 (`develop` 분기 → `develop` PR). B1 머지 후 B2, B2 머지 후 B3, B3 머지 후 B4.

---

## 사전 확인

플랜 시작 전 다음 패턴이 코드베이스에 그대로 있어야 한다 (없으면 plan 수정 필요).

- `com.duing.domain.clubmember.service.ClubAuthService.requireManager(Long userId, Long clubId)` — 권한 가드
- `com.duing.global.entity.BaseEntity` — `id / createdAt / updatedAt / deletedAt`
- `com.duing.domain.application.entity.Application.transitionTo(ApplicationStatus, boolean useInterview)` — 상태 전이 검증
- Flyway 마지막 버전: V42 (다음은 V43, V44)
- `com.duing.domain.user.entity.User` 에 `getCollege() / getMajor() / getGrade()` getter 존재

---

# PR B1 — 목록 검색·필터링 + 응답 컬럼 확장

**브랜치:** `feat/application-search-filter`

**Goal:** `GET /leader/recruitments/{recruitmentId}/applications` 에 `status / college / q / submittedFrom / submittedTo` 옵셔널 쿼리 파라미터 추가 + 응답에 `college / major / grade / interviewAt` 추가 (myScore 는 B3 에서).

## File Structure — B1

| Action | Path | 역할 |
|---|---|---|
| Modify | `backend/src/main/java/com/duing/domain/application/exception/ApplicationDomainException.java` | `InvalidDateRangeException` 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantQuery.java` | `college / major / grade / interviewAt` 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantResponse.java` | 같은 필드 추가 |
| Create | `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantSearchCondition.java` | 필터 파라미터 DTO |
| Create | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryCustom.java` | QueryDSL custom 인터페이스 |
| Create | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java` | QueryDSL 구현 |
| Modify | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java` | `extends ..., ApplicationRepositoryCustom` |
| Modify | `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java` | `getApplicants` 시그니처 변경 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` | custom repo 호출로 변경 |
| Modify | `backend/src/main/java/com/duing/domain/application/api/LeaderApplicationApi.java` | `@RequestParam` 추가 + description 업데이트 |
| Modify | `backend/src/main/java/com/duing/domain/application/controller/LeaderApplicationController.java` | params 전달 |
| Modify | `backend/src/test/java/com/duing/domain/application/controller/LeaderApplicationControllerTest.java` | 신규 필터 테스트 5개 |

## Task B1-0: 브랜치 생성

- [ ] **Step 1: develop 동기화 + 브랜치**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/application-search-filter
```

Expected: `Switched to a new branch 'feat/application-search-filter'`

## Task B1-1: `InvalidDateRangeException` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/exception/ApplicationDomainException.java`

- [ ] **Step 1: 예외 추가**

`ApplicationDomainException.java` 안에 `ConcurrentStatusUpdateException` 바로 위에 추가:

```java
    public static class InvalidDateRangeException extends ApplicationDomainException {
        private static final String MESSAGE = "submittedFrom 은 submittedTo 보다 늦을 수 없습니다.";

        public InvalidDateRangeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/exception/ApplicationDomainException.java
git commit -m "feat(application): InvalidDateRangeException 추가"
```

## Task B1-2: `ApplicantQuery` / `ApplicantResponse` 컬럼 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantResponse.java`

- [ ] **Step 1: `ApplicantQuery` 전체 교체**

```java
package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewAt
) {
    public static ApplicantQuery from(Application application) {
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                application.getAnswers(),
                application.getStatus(),
                application.getCreatedAt(),
                application.getInterviewAt()
        );
    }
}
```

- [ ] **Step 2: `ApplicantResponse` 전체 교체**

```java
package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantResponse(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewAt
) {
    public static ApplicantResponse from(ApplicantQuery applicantQuery) {
        return new ApplicantResponse(
                applicantQuery.applicationId(),
                applicantQuery.userId(),
                applicantQuery.userName(),
                applicantQuery.studentId(),
                applicantQuery.email(),
                applicantQuery.college(),
                applicantQuery.major(),
                applicantQuery.grade(),
                applicantQuery.answers(),
                applicantQuery.status(),
                applicantQuery.submittedAt(),
                applicantQuery.interviewAt()
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantQuery.java \
        backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantResponse.java
git commit -m "feat(application): ApplicantResponse 에 college/major/grade/interviewAt 추가"
```

## Task B1-3: `ApplicantSearchCondition` 신규

**Files:**
- Create: `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantSearchCondition.java`

- [ ] **Step 1: 파일 작성**

```java
package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;

/**
 * 운영진 지원자 목록 검색 조건. 모든 필드 옵셔널.
 * - submittedFrom / submittedTo: LocalDate. half-open 변환은 Repository 가 담당.
 * - q: 이름·학번·major 부분일치(OR), 대소문자 무시.
 */
public record ApplicantSearchCondition(
        ApplicationStatus status,
        College college,
        String q,
        LocalDate submittedFrom,
        LocalDate submittedTo
) {
    public ApplicantSearchCondition {
        if (submittedFrom != null && submittedTo != null && submittedFrom.isAfter(submittedTo)) {
            throw new ApplicationDomainException.InvalidDateRangeException();
        }
    }
}
```

- [ ] **Step 2: 컴파일**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantSearchCondition.java
git commit -m "feat(application): ApplicantSearchCondition 추가"
```

## Task B1-4: QueryDSL custom repository — 실패 테스트 먼저

**Files:**
- Create: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java`

- [ ] **Step 1: 인터페이스 작성**

`backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryCustom.java`:

```java
package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import java.util.List;

public interface ApplicationRepositoryCustom {

    /**
     * 운영진 지원자 목록 조회.
     * 정렬: createdAt DESC (최신 지원자가 위).
     * filter 의 모든 필드는 옵셔널 — null 이면 해당 조건 미적용.
     */
    List<Application> searchApplicants(Long recruitmentId, ApplicantSearchCondition condition);
}
```

- [ ] **Step 2: QueryDSL 구현**

`backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java`:

```java
package com.duing.domain.application.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ApplicationRepositoryImpl implements ApplicationRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<Application> searchApplicants(Long recruitmentId, ApplicantSearchCondition condition) {
        return queryFactory
                .selectFrom(application)
                .join(application.user, user).fetchJoin()
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        statusEq(condition.status()),
                        collegeEq(condition.college()),
                        searchKeyword(condition.q()),
                        submittedAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo())
                )
                .orderBy(application.createdAt.desc())
                .fetch();
    }

    private BooleanExpression statusEq(com.duing.domain.application.entity.ApplicationStatus status) {
        return status == null ? null : application.status.eq(status);
    }

    private BooleanExpression collegeEq(com.duing.domain.user.entity.College college) {
        return college == null ? null : user.college.eq(college);
    }

    private BooleanExpression searchKeyword(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        return user.name.containsIgnoreCase(q)
                .or(user.studentId.containsIgnoreCase(q))
                .or(user.major.containsIgnoreCase(q));
    }

    private BooleanExpression submittedAfter(LocalDate from) {
        return from == null ? null : application.createdAt.goe(from.atStartOfDay());
    }

    private BooleanExpression submittedBefore(LocalDate to) {
        if (to == null) return null;
        LocalDateTime exclusiveEnd = to.plusDays(1).atStartOfDay();
        return application.createdAt.lt(exclusiveEnd);
    }
}
```

- [ ] **Step 3: `ApplicationRepository` 가 custom 인터페이스 확장하도록 변경**

`ApplicationRepository.java` line 13 변경:

```java
public interface ApplicationRepository
        extends JpaRepository<Application, Long>, ApplicationRepositoryCustom {
```

- [ ] **Step 4: QueryDSL Q-class 재생성 (compileQuerydsl 또는 그냥 compileJava)**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL. (QClass 가 `build/generated/querydsl/...` 에 자동 생성됨.)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryCustom.java \
        backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java \
        backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java
git commit -m "feat(application): QueryDSL custom repository 로 동적 검색 조건 도입"
```

## Task B1-5: 서비스·컨트롤러 연결

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/api/LeaderApplicationApi.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/LeaderApplicationController.java`

- [ ] **Step 1: 서비스 인터페이스 시그니처 변경**

`ApplicationService.java` 의 `getApplicants` 라인 교체:

```java
    List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition);
```

import 추가:

```java
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
```

- [ ] **Step 2: 구현체에 condition 사용**

`GeneralApplicationService.java` 의 `getApplicants` 메서드 교체:

```java
    @Override
    public List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

        return applicationRepository.searchApplicants(recruitmentId, condition).stream()
                .map(ApplicantQuery::from)
                .toList();
    }
```

import 추가:

```java
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
```

- [ ] **Step 3: `LeaderApplicationApi` 시그니처 + Swagger 업데이트**

`LeaderApplicationApi.java` 의 `getApplicants` 교체:

```java
    @Operation(
            summary = "지원자 목록 조회",
            description = "본인이 동아리장인 모집 공고의 지원자를 최근 제출 순(desc) 으로 반환한다. "
                    + "옵셔널 필터: status, college (단과대), q (이름·학번·학과명 부분일치 OR), "
                    + "submittedFrom·submittedTo (LocalDate, half-open: submittedTo 당일 23:59 까지 포함). "
                    + "submittedFrom > submittedTo 시 400."
    )
    @GetMapping("/leader/recruitments/{recruitmentId}/applications")
    ResponseEntity<ApiResponse<List<ApplicantResponse>>> getApplicants(
            @PathVariable Long recruitmentId,
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(required = false) College college,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
```

상단 import 추가:

```java
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.RequestParam;
```

- [ ] **Step 4: `LeaderApplicationController.getApplicants` 교체**

```java
    @Override
    public ResponseEntity<ApiResponse<List<ApplicantResponse>>> getApplicants(
            @PathVariable Long recruitmentId,
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(required = false) College college,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ApplicantSearchCondition condition = new ApplicantSearchCondition(status, college, q, submittedFrom, submittedTo);
        List<ApplicantResponse> applicants = applicationService
                .getApplicants(recruitmentId, currentUser.id(), condition).stream()
                .map(ApplicantResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(applicants));
    }
```

상단 import 추가 (interface 와 동일).

- [ ] **Step 5: 컴파일 + 기존 테스트 회귀**

```bash
./gradlew compileJava
./gradlew test --tests "com.duing.domain.application.*"
```

Expected: 기존 `getApplicants` 테스트는 무조건 fail (시그니처 변경). 다음 테스트 작성 단계에서 수정.

- [ ] **Step 6: 기존 테스트 시그니처 보정**

기존 `LeaderApplicationControllerTest` (또는 `GeneralApplicationServiceTest`) 에서 `getApplicants(recruitmentId, currentUserId)` 호출 → `getApplicants(recruitmentId, currentUserId, new ApplicantSearchCondition(null, null, null, null, null))` 로 수정. 모든 호출 보정.

```bash
./gradlew test --tests "com.duing.domain.application.*"
```

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/ApplicationService.java \
        backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java \
        backend/src/main/java/com/duing/domain/application/api/LeaderApplicationApi.java \
        backend/src/main/java/com/duing/domain/application/controller/LeaderApplicationController.java \
        backend/src/test/java/com/duing/domain/application/
git commit -m "feat(application): 운영진 목록 조회에 검색·필터 파라미터 추가"
```

## Task B1-6: 신규 통합 테스트

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/application/controller/LeaderApplicationControllerTest.java` (또는 신규 `ApplicantSearchControllerTest.java`)

- [ ] **Step 1: 실패 테스트 작성**

다음 케이스를 RestAssured 통합 테스트로 추가. 각 케이스마다 `@DisplayName` 사용. 기존 테스트 파일의 fixture 패턴 (`createRecruitmentFor`, `submitApplicationFor`) 을 그대로 따른다.

```java
    @Test
    @DisplayName("status 필터를 적용하면 해당 상태의 지원자만 반환된다")
    void statusFilterReturnsMatching() {
        Long recruitmentId = setUpRecruitmentWithApplicants(); // 3건: SUBMITTED, UNDER_REVIEW, ACCEPTED

        given().auth().oauth2(leaderToken)
                .queryParam("status", "UNDER_REVIEW")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().statusCode(200)
                .body("data.size()", is(1))
                .body("data[0].status", equalTo("UNDER_REVIEW"));
    }

    @Test
    @DisplayName("college 필터를 적용하면 해당 단과대 지원자만 반환된다")
    void collegeFilterReturnsMatching() {
        Long recruitmentId = setUpRecruitmentWithMixedColleges(); // ENGINEERING 2명, ARTS 1명

        given().auth().oauth2(leaderToken)
                .queryParam("college", "ENGINEERING")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().statusCode(200)
                .body("data.size()", is(2))
                .body("data.college", everyItem(equalTo("ENGINEERING")));
    }

    @Test
    @DisplayName("q 파라미터는 이름·학번·major 어느 하나만 일치해도 대소문자 무시로 매칭된다")
    void searchKeywordMatchesNameOrStudentIdOrMajor() {
        Long recruitmentId = setUpRecruitmentWithApplicantsForSearch();
        // 지원자: { name=홍길동, studentId=20200001, major=컴퓨터공학 }
        //         { name=김민수, studentId=20210042, major=ComputerScience }
        //         { name=박지호, studentId=20220099, major=전자공학 }

        given().auth().oauth2(leaderToken).queryParam("q", "홍길동")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().body("data.size()", is(1));

        given().auth().oauth2(leaderToken).queryParam("q", "20210042")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().body("data.size()", is(1));

        given().auth().oauth2(leaderToken).queryParam("q", "computer")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().body("data.size()", is(2));   // 홍길동(컴퓨터공학) + 김민수(ComputerScience)
    }

    @Test
    @DisplayName("submittedTo 당일 23:59 에 제출된 지원자도 포함된다")
    void submittedToInclusiveBoundary() {
        Long recruitmentId = createRecruitment();
        // 같은 날 23:59 에 제출된 지원자 1건 생성 (clock fixture 활용)
        submitApplicationAt(recruitmentId, LocalDateTime.of(2026, 5, 31, 23, 59, 30));

        given().auth().oauth2(leaderToken)
                .queryParam("submittedFrom", "2026-05-31")
                .queryParam("submittedTo", "2026-05-31")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("submittedFrom 이 submittedTo 보다 늦으면 400 을 반환한다")
    void invalidDateRange() {
        Long recruitmentId = createRecruitment();

        given().auth().oauth2(leaderToken)
                .queryParam("submittedFrom", "2026-06-10")
                .queryParam("submittedTo", "2026-06-01")
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId)
                .then().statusCode(400)
                .body("message", containsString("submittedFrom"));
    }
```

`setUpRecruitmentWithApplicants()` 등 fixture 메서드는 기존 fixture 패턴 (`common/fixture/`) 또는 같은 테스트 파일 내부 헬퍼로 작성.

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
./gradlew test --tests "com.duing.domain.application.controller.LeaderApplicationControllerTest"
```

Expected: FAIL (구현 미완료 시 — 그러나 B1-5 의 변경으로 사실상 통과해야 함. 확인 후 진행).

- [ ] **Step 3: 테스트 PASS 확인**

```bash
./gradlew test --tests "com.duing.domain.application.controller.LeaderApplicationControllerTest"
```

Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/application/controller/LeaderApplicationControllerTest.java
git commit -m "test(application): 운영진 목록 검색·필터 통합 테스트 추가"
```

## Task B1-7: PR 생성

- [ ] **Step 1: push + PR 생성**

```bash
git push -u origin feat/application-search-filter
gh pr create --base develop --title "feat(application): 운영진 지원자 목록 검색·필터링 API (Spec B1)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `GET /api/v1/leader/recruitments/{recruitmentId}/applications` 에 옵셔널 검색·필터 파라미터 5종 추가 (`status`, `college`, `q`, `submittedFrom`, `submittedTo`).
- 응답 `ApplicantResponse` 에 `college`, `major`, `grade`, `interviewAt` 추가 (`answers` 는 그대로 유지).
- 정렬 기본값을 최근 제출 순(desc) 으로 변경.
- QueryDSL `ApplicationRepositoryCustom` 도입 — 동적 BooleanExpression 조합.
- `submittedFrom > submittedTo` 일 때 400 `InvalidDateRangeException`.

## 🤔 고민했던 내용
- 기간 필터의 inclusive 경계 해석 모호성 차단을 위해 LocalDate 단위 half-open 으로 명세 (`< submittedTo.plusDays(1)`). 시간대 모호성을 서버 한 곳에서만 처리.
- `q` 파라미터를 이름·학번·major 세 컬럼 통합으로 일원화 — UX 가 검색창 하나로 단순해지고 향후 컬럼 추가 시 확장 용이.
- 응답 wrapper(`PagedApplicantsResponse`) 도입은 본 PR 에서 의도적으로 미포함 (YAGNI). 페이지네이션이 실제 필요할 때 백엔드·프론트 동시 변경 묶음으로 처리.

## 💬 리뷰 중점사항
- QueryDSL `searchApplicants` 의 user fetch join 이 N+1 을 막고 있는지.
- `ApplicantSearchCondition` 생성자에서의 검증이 컴포넌트 책임으로 충분한지 (`@Valid` 대신 도메인 record 자체에서 던지는 패턴).
EOF
)"
```

PR URL 을 받아 머지 후 다음 PR 로 진행.

---

# PR B2 — 상태 변경 audit log + 타임라인 응답

**브랜치:** `feat/application-status-history`

**Goal:** `application_status_history` 테이블 신규 (V43) + 상태 변경 시 자동 적재 + 상세 응답에 `statusHistory` 필드 추가 (newest-first).

## File Structure — B2

| Action | Path | 역할 |
|---|---|---|
| Create | `backend/src/main/resources/db/migration/V43__create_application_status_history.sql` | DDL |
| Create | `backend/src/main/java/com/duing/domain/application/entity/ApplicationStatusHistory.java` | 엔티티 (append-only) |
| Create | `backend/src/main/java/com/duing/domain/application/repository/ApplicationStatusHistoryRepository.java` | repository |
| Modify | `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` | 상태 변경 흐름에 history 기록 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java` | `statusHistory` 필드 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantDetailResponse.java` | `statusHistory` 필드 + `StatusHistoryItem` |
| Modify | `backend/src/test/java/com/duing/domain/application/...` | 기록 흐름 + 정렬 + bulk 부분실패 회귀 |

## Task B2-0: 브랜치 생성

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/application-status-history
```

## Task B2-1: V43 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V43__create_application_status_history.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- V43__create_application_status_history.sql
-- 상태 전이 audit log. append-only.
-- previous_status / new_status: SUBMITTED 진입은 기록하지 않으므로 둘 다 NOT NULL.
-- deleted_at 컬럼은 BaseEntity 일관성 때문에 남기되 항상 NULL (엔티티에서 hard/soft delete 모두 막음).

CREATE TABLE IF NOT EXISTS application_status_history (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT      NOT NULL REFERENCES application (id),
    previous_status VARCHAR(20) NOT NULL,
    new_status      VARCHAR(20) NOT NULL,
    changed_by      BIGINT      NOT NULL REFERENCES users (id),
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_status_history_application
    ON application_status_history (application_id, created_at);
```

- [ ] **Step 2: Flyway 검증**

```bash
./gradlew flywayValidate
```

Expected: PASS. (TestContainers PostgreSQL 에서 검증됨.)

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V43__create_application_status_history.sql
git commit -m "feat(application): V43 application_status_history 테이블 추가"
```

## Task B2-2: 엔티티 + repository

**Files:**
- Create: `backend/src/main/java/com/duing/domain/application/entity/ApplicationStatusHistory.java`
- Create: `backend/src/main/java/com/duing/domain/application/repository/ApplicationStatusHistoryRepository.java`

- [ ] **Step 1: 엔티티 작성**

```java
package com.duing.domain.application.entity;

import com.duing.domain.user.entity.User;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 지원서 상태 전이 audit log. append-only — 의도적으로 @SQLDelete / @SQLRestriction 없음.
 * hard delete 도 금지: Repository 에 delete API 미노출로 보장.
 * deleted_at 컬럼은 BaseEntity 일관성 때문에 따라오지만 항상 NULL.
 */
@Entity
@Table(name = "application_status_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationStatusHistory extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false, length = 20)
    private ApplicationStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 20)
    private ApplicationStatus newStatus;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by", nullable = false)
    private User changedBy;

    @Builder(access = AccessLevel.PRIVATE)
    private ApplicationStatusHistory(Application application,
                                    ApplicationStatus previousStatus,
                                    ApplicationStatus newStatus,
                                    User changedBy) {
        this.application = application;
        this.previousStatus = previousStatus;
        this.newStatus = newStatus;
        this.changedBy = changedBy;
    }

    public static ApplicationStatusHistory record(Application application,
                                                  ApplicationStatus previousStatus,
                                                  ApplicationStatus newStatus,
                                                  User changedBy) {
        return ApplicationStatusHistory.builder()
                .application(application)
                .previousStatus(previousStatus)
                .newStatus(newStatus)
                .changedBy(changedBy)
                .build();
    }
}
```

- [ ] **Step 2: Repository 작성**

```java
package com.duing.domain.application.repository;

import com.duing.domain.application.entity.ApplicationStatusHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationStatusHistoryRepository
        extends JpaRepository<ApplicationStatusHistory, Long> {

    /** newest-first. changedBy fetch join 으로 N+1 방지. */
    @Query("SELECT h FROM ApplicationStatusHistory h "
            + "JOIN FETCH h.changedBy "
            + "WHERE h.application.id = :applicationId "
            + "ORDER BY h.createdAt DESC")
    List<ApplicationStatusHistory> findByApplicationIdOrderByCreatedAtDesc(
            @Param("applicationId") Long applicationId);
}
```

- [ ] **Step 3: 컴파일**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/entity/ApplicationStatusHistory.java \
        backend/src/main/java/com/duing/domain/application/repository/ApplicationStatusHistoryRepository.java
git commit -m "feat(application): ApplicationStatusHistory 엔티티·리포지토리 추가"
```

## Task B2-3: `ApplicantDetailQuery` / `ApplicantDetailResponse` 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantDetailResponse.java`

- [ ] **Step 1: Query 에 `statusHistory` 추가**

`ApplicantDetailQuery` 의 record 시그니처에 마지막 필드 추가:

```java
public record ApplicantDetailQuery(
        Long applicationId,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicantInfoQuery applicant,
        List<QuestionAnswerQuery> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt,
        List<StatusHistoryItemQuery> statusHistory          // NEW
) {

    public record ApplicantInfoQuery(...) {}
    public record QuestionAnswerQuery(...) {}

    public record StatusHistoryItemQuery(
            ApplicationStatus previousStatus,
            ApplicationStatus newStatus,
            Long changedById,
            String changedByName,
            LocalDateTime changedAt
    ) {}

    // 기존 from(Application) 은 그대로 두되 statusHistory 는 service 가 별도로 주입.
    // → from 대신 fromWithHistory(application, history) 정적 메서드 추가.
    public static ApplicantDetailQuery fromWithHistory(
            Application application,
            List<ApplicationStatusHistory> historyRows
    ) {
        // 기존 from(application) 의 모든 매핑 + statusHistory 매핑.
        // ... (기존 매핑 유지) ...
        List<StatusHistoryItemQuery> statusHistory = historyRows.stream()
                .map(row -> new StatusHistoryItemQuery(
                        row.getPreviousStatus(),
                        row.getNewStatus(),
                        row.getChangedBy().getId(),
                        row.getChangedBy().getName(),
                        row.getCreatedAt()
                ))
                .toList();
        return new ApplicantDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                club.getId(),
                club.getName(),
                applicantInfo,
                pairedAnswers,
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt(),
                statusHistory
        );
    }
```

(기존 `from(Application)` 시그니처가 service 다른 호출자에 의해 사용된다면 backward-compat 으로 빈 리스트를 넘기는 단축 메서드 유지.)

- [ ] **Step 2: Response 에 같은 구조 추가**

```java
public record ApplicantDetailResponse(
        Long applicationId,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicantInfo applicant,
        List<QuestionAnswer> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt,
        List<StatusHistoryItem> statusHistory          // NEW
) {

    public record ApplicantInfo(...) {}
    public record QuestionAnswer(...) {}

    public record StatusHistoryItem(
            ApplicationStatus previousStatus,
            ApplicationStatus newStatus,
            Long changedById,
            String changedByName,
            LocalDateTime changedAt
    ) {}

    public static ApplicantDetailResponse from(ApplicantDetailQuery detailQuery) {
        // 기존 매핑 + statusHistory 매핑
        List<StatusHistoryItem> history = detailQuery.statusHistory().stream()
                .map(item -> new StatusHistoryItem(
                        item.previousStatus(), item.newStatus(),
                        item.changedById(), item.changedByName(), item.changedAt()))
                .toList();
        // 기존 reuturn 객체 끝에 history 추가
    }
}
```

- [ ] **Step 3: 컴파일**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java \
        backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantDetailResponse.java
git commit -m "feat(application): 상세 응답에 statusHistory 필드 추가"
```

## Task B2-4: 상태 변경 흐름에 history 기록 + service 변경

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`

- [ ] **Step 1: `ApplicationStatusHistoryRepository` 의존성 주입**

`GeneralApplicationService` 의 필드 추가:

```java
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
```

- [ ] **Step 2: `updateStatus` 메서드 변경**

기존 `application.transitionTo(...)` 호출 직전에 previous 캡처, 직후에 history save:

```java
    @Override
    @Transactional
    public void updateStatus(UpdateApplicationStatusCommand command) {
        Application application = applicationRepository.findById(command.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(command.currentUserId(), application.getRecruitment().getClub().getId());

        ApplicationStatus previousStatus = application.getStatus();
        application.transitionTo(command.status(), application.getRecruitment().isUseInterview());

        User changedBy = userRepository.findById(command.currentUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        applicationStatusHistoryRepository.save(
                ApplicationStatusHistory.record(application, previousStatus, command.status(), changedBy)
        );

        // 기존 ACCEPTED 분기 로직 유지 (club member 등록 등)
        if (command.status() == ApplicationStatus.ACCEPTED) {
            // ... 기존 로직 그대로 ...
        }
    }
```

- [ ] **Step 3: `bulkUpdateStatus` 메서드도 동일 패턴 적용**

성공한 건마다 history 1 줄 적재. 개별 트랜잭션 구조 유지. 기존 흐름 안에 history save 한 줄 추가.

- [ ] **Step 4: `getApplicantDetail` 에 history 주입**

```java
    @Override
    public ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        Long clubId = application.getRecruitment().getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        List<ApplicationStatusHistory> history =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
        return ApplicantDetailQuery.fromWithHistory(application, history);
    }
```

- [ ] **Step 5: 컴파일**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java
git commit -m "feat(application): 상태 변경 시 history 자동 기록"
```

## Task B2-5: 신규 테스트

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/application/service/GeneralApplicationServiceTest.java`

- [ ] **Step 1: 4개 테스트 작성**

```java
    @Test
    @DisplayName("상태 변경 시 history 가 적재된다")
    void statusTransitionRecordsHistory() {
        Long applicationId = createSubmittedApplication();

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.UNDER_REVIEW));

        List<ApplicationStatusHistory> rows =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getPreviousStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(rows.get(0).getNewStatus()).isEqualTo(ApplicationStatus.UNDER_REVIEW);
        assertThat(rows.get(0).getChangedBy().getId()).isEqualTo(leaderId);
    }

    @Test
    @DisplayName("Bulk 상태 변경 시 성공한 건만 history 가 적재된다")
    void bulkPartialSuccessOnlyRecordsSuccessfulRows() {
        Long a1 = createSubmittedApplication();
        Long a2 = createAcceptedApplication(); // 이미 최종 상태 — 실패 예상

        applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(List.of(a1, a2), ApplicationStatus.UNDER_REVIEW, leaderId));

        assertThat(applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(a1)).hasSize(1);
        assertThat(applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(a2)).isEmpty();
    }

    @Test
    @DisplayName("상세 응답의 statusHistory 가 newest-first 로 정렬된다")
    void statusHistoryIsNewestFirstInDetail() {
        Long applicationId = createSubmittedApplication();
        applicationService.updateStatus(new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.UNDER_REVIEW));
        applicationService.updateStatus(new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.INTERVIEW_PENDING));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(applicationId, leaderId);

        assertThat(detail.statusHistory()).hasSize(2);
        assertThat(detail.statusHistory().get(0).newStatus()).isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(detail.statusHistory().get(1).newStatus()).isEqualTo(ApplicationStatus.UNDER_REVIEW);
    }

    @Test
    @DisplayName("history save 가 실패하면 상태 전이도 롤백된다")
    void transitionRollsBackWhenHistorySaveFails() {
        Long applicationId = createSubmittedApplication();
        // ApplicationStatusHistoryRepository 를 spy/mock 으로 만들어 save 시 RuntimeException 강제.
        // ApplicationConfig 에서 @MockBean 으로 교체 or @SpyBean 후 doThrow.

        assertThatThrownBy(() ->
                applicationService.updateStatus(
                        new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.UNDER_REVIEW)))
                .isInstanceOf(RuntimeException.class);

        Application reloaded = applicationRepository.findById(applicationId).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
    }
```

- [ ] **Step 2: 테스트 실행 → PASS**

```bash
./gradlew test --tests "com.duing.domain.application.service.GeneralApplicationServiceTest"
```

Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/application/service/GeneralApplicationServiceTest.java
git commit -m "test(application): 상태 history 기록·정렬·롤백 테스트 추가"
```

## Task B2-6: PR 생성

- [ ] **Step 1: push + PR**

```bash
git push -u origin feat/application-status-history
gh pr create --base develop --title "feat(application): 지원자 상태 변경 audit log + 타임라인 응답 (Spec B2)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `application_status_history` 테이블 V43 추가. previous/new status + changedBy + createdAt 저장.
- 상태 변경 흐름(단건/Bulk) 에 history 자동 기록 — 같은 트랜잭션 내 처리로 원자성 보장.
- 운영진 상세 응답에 `statusHistory` 필드 추가 (newest-first 정렬).

## 🤔 고민했던 내용
- Application 에 `@OneToMany histories` 컬렉션을 두지 않았다. 목록 조회처럼 history 가 불필요한 경로에서 LAZY 트리거 위험 + audit log 는 Application 의 invariant 가 아님 → repository 직접 조회 패턴이 더 깔끔.
- @SQLDelete / @SQLRestriction 어노테이션을 의도적으로 붙이지 않음. append-only 의도를 코드 레벨에서 가시화 (엔티티 주석으로 의도 명시).
- bulk 흐름의 건별 트랜잭션 구조를 그대로 유지 — 한 건 실패가 다른 건 history 적재를 막지 않는다.

## 💬 리뷰 중점사항
- `transitionTo` ↔ history save 가 같은 `@Transactional` 안에 있는지, save 실패 시 transition 도 롤백되는지.
- `findByApplicationIdOrderByCreatedAtDesc` 의 fetch join 으로 N+1 이 막혀 있는지.
EOF
)"
```

---

# PR B3 — 평가 도메인 신규 + myScore + 상세 응답 분리

**브랜치:** `feat/application-evaluation`

**Goal:** `applicationEvaluation` 신규 aggregate + V44 + PUT/DELETE `/evaluations/me` + 목록 `ApplicantResponse` 에 `myScore` 추가 + 상세 `ApplicantDetailResponse` 에 `myEvaluation` / `otherEvaluations` 분리.

## File Structure — B3

| Action | Path | 역할 |
|---|---|---|
| Create | `backend/src/main/resources/db/migration/V44__create_application_evaluation.sql` | DDL |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/entity/ApplicationEvaluation.java` | 엔티티 |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/repository/ApplicationEvaluationRepository.java` | repository |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/exception/ApplicationEvaluationDomainException.java` | 예외 |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/service/dto/command/UpsertApplicationEvaluationCommand.java` | command |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/service/ApplicationEvaluationService.java` | 인터페이스 |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/service/GeneralApplicationEvaluationService.java` | 구현체 |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/controller/dto/request/UpsertApplicationEvaluationRequest.java` | request |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/api/LeaderApplicationEvaluationApi.java` | Swagger |
| Create | `backend/src/main/java/com/duing/domain/applicationEvaluation/controller/LeaderApplicationEvaluationController.java` | 컨트롤러 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantQuery.java` | `myScore` 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantResponse.java` | `myScore` 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java` | myScore LEFT JOIN projection |
| Modify | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryCustom.java` | searchApplicants 시그니처 변경 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java` | `myEvaluation` / `otherEvaluations` 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantDetailResponse.java` | 같은 필드 + 새 record |
| Modify | `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` | evaluation 분리 매핑 |
| Create | `backend/src/test/java/com/duing/domain/applicationEvaluation/...` | 신규 통합 테스트 8개 |

## Task B3-0: 브랜치

- [ ] **Step 1**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/application-evaluation
```

## Task B3-1: V44 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V44__create_application_evaluation.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- V44__create_application_evaluation.sql
-- 운영진 1인당 1개 평가 (application_id, evaluator_id) partial unique (active rows only).
-- soft delete 후 재작성 허용.

CREATE TABLE IF NOT EXISTS application_evaluation (
    id             BIGSERIAL PRIMARY KEY,
    application_id BIGINT      NOT NULL REFERENCES application (id),
    evaluator_id   BIGINT      NOT NULL REFERENCES users (id),
    score          SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
    memo           TEXT,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_application_evaluation_active
    ON application_evaluation (application_id, evaluator_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_evaluation_application
    ON application_evaluation (application_id);
```

- [ ] **Step 2: Flyway validate + 커밋**

```bash
./gradlew flywayValidate
git add backend/src/main/resources/db/migration/V44__create_application_evaluation.sql
git commit -m "feat(applicationEvaluation): V44 application_evaluation 테이블 추가"
```

## Task B3-2: 예외 + 엔티티 + repository

**Files:**
- Create: 4 파일

- [ ] **Step 1: 예외**

```java
package com.duing.domain.applicationEvaluation.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ApplicationEvaluationDomainException extends ApplicationException {

    protected ApplicationEvaluationDomainException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class EvaluationScoreOutOfRangeException extends ApplicationEvaluationDomainException {
        public EvaluationScoreOutOfRangeException() {
            super("평가 점수는 1~5 사이여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
```

- [ ] **Step 2: 엔티티**

```java
package com.duing.domain.applicationEvaluation.entity;

import com.duing.domain.application.entity.Application;
import com.duing.domain.applicationEvaluation.exception.ApplicationEvaluationDomainException;
import com.duing.domain.user.entity.User;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "application_evaluation")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE application_evaluation SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ApplicationEvaluation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "evaluator_id", nullable = false)
    private User evaluator;

    @Column(nullable = false)
    private Integer score;

    @Column(columnDefinition = "TEXT")
    private String memo;

    @Builder(access = AccessLevel.PRIVATE)
    private ApplicationEvaluation(Application application, User evaluator, int score, String memo) {
        this.application = application;
        this.evaluator = evaluator;
        this.score = score;
        this.memo = memo;
    }

    public static ApplicationEvaluation create(Application application, User evaluator, int score, String memo) {
        validateScore(score);
        return ApplicationEvaluation.builder()
                .application(application).evaluator(evaluator).score(score).memo(memo).build();
    }

    public void update(int score, String memo) {
        validateScore(score);
        this.score = score;
        this.memo = memo;
    }

    private static void validateScore(int score) {
        if (score < 1 || score > 5) {
            throw new ApplicationEvaluationDomainException.EvaluationScoreOutOfRangeException();
        }
    }
}
```

- [ ] **Step 3: Repository**

```java
package com.duing.domain.applicationEvaluation.repository;

import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationEvaluationRepository
        extends JpaRepository<ApplicationEvaluation, Long> {

    Optional<ApplicationEvaluation> findByApplicationIdAndEvaluatorId(Long applicationId, Long evaluatorId);

    @Query("SELECT e FROM ApplicationEvaluation e "
            + "JOIN FETCH e.evaluator "
            + "WHERE e.application.id = :applicationId "
            + "ORDER BY e.createdAt DESC")
    List<ApplicationEvaluation> findByApplicationIdWithEvaluator(@Param("applicationId") Long applicationId);
}
```

- [ ] **Step 4: Command**

```java
package com.duing.domain.applicationEvaluation.service.dto.command;

public record UpsertApplicationEvaluationCommand(
        Long applicationId,
        Long evaluatorId,
        int score,
        String memo
) {}
```

- [ ] **Step 5: 컴파일 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/applicationEvaluation/
git commit -m "feat(applicationEvaluation): 엔티티·리포지토리·command·예외 추가"
```

## Task B3-3: 서비스 + 컨트롤러 + API

**Files:** 4 파일 (service interface/impl, api, controller, request DTO)

- [ ] **Step 1: 인터페이스**

```java
package com.duing.domain.applicationEvaluation.service;

import com.duing.domain.applicationEvaluation.service.dto.command.UpsertApplicationEvaluationCommand;

public interface ApplicationEvaluationService {
    void upsert(UpsertApplicationEvaluationCommand command);
    void deleteMine(Long applicationId, Long evaluatorId);
}
```

- [ ] **Step 2: 구현체**

```java
package com.duing.domain.applicationEvaluation.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.applicationEvaluation.service.dto.command.UpsertApplicationEvaluationCommand;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationEvaluationService implements ApplicationEvaluationService {

    private final ApplicationEvaluationRepository evaluationRepository;
    private final ApplicationRepository applicationRepository;
    private final UserRepository userRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public void upsert(UpsertApplicationEvaluationCommand command) {
        Application application = applicationRepository.findById(command.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        Long clubId = application.getRecruitment().getClub().getId();
        clubAuthService.requireManager(command.evaluatorId(), clubId);

        evaluationRepository.findByApplicationIdAndEvaluatorId(command.applicationId(), command.evaluatorId())
                .ifPresentOrElse(
                        existing -> existing.update(command.score(), command.memo()),
                        () -> {
                            User evaluator = userRepository.findById(command.evaluatorId())
                                    .orElseThrow(UserException.UserNotFoundException::new);
                            evaluationRepository.save(
                                    ApplicationEvaluation.create(application, evaluator, command.score(), command.memo()));
                        });
    }

    @Override
    @Transactional
    public void deleteMine(Long applicationId, Long evaluatorId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(evaluatorId, application.getRecruitment().getClub().getId());

        evaluationRepository.findByApplicationIdAndEvaluatorId(applicationId, evaluatorId)
                .ifPresent(evaluationRepository::delete);   // 없으면 그냥 통과 (idempotent)
    }
}
```

- [ ] **Step 3: Request DTO**

```java
package com.duing.domain.applicationEvaluation.controller.dto.request;

import com.duing.domain.applicationEvaluation.service.dto.command.UpsertApplicationEvaluationCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpsertApplicationEvaluationRequest(
        @NotNull(message = "score 는 필수입니다.")
        @Min(value = 1, message = "score 는 1~5 사이여야 합니다.")
        @Max(value = 5, message = "score 는 1~5 사이여야 합니다.")
        Integer score,

        @Size(max = 2000, message = "memo 는 2000자 이내여야 합니다.")
        String memo
) {
    public UpsertApplicationEvaluationCommand toCommand(Long applicationId, Long evaluatorId) {
        return new UpsertApplicationEvaluationCommand(applicationId, evaluatorId, score, memo);
    }
}
```

- [ ] **Step 4: API 인터페이스**

```java
package com.duing.domain.applicationEvaluation.api;

import com.duing.domain.applicationEvaluation.controller.dto.request.UpsertApplicationEvaluationRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "지원자 평가(동아리장)", description = "운영진의 지원자 평가 — 본인 평가만 작성·수정·삭제")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderApplicationEvaluationApi {

    @Operation(summary = "내 평가 upsert", description = "본인 평가가 없으면 생성, 있으면 score/memo 를 갱신한다. 멱등.")
    @PutMapping("/leader/applications/{applicationId}/evaluations/me")
    ResponseEntity<ApiResponse<Void>> upsertMyEvaluation(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpsertApplicationEvaluationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 평가 삭제", description = "본인 평가를 삭제. 없는 상태에서 호출해도 204 (idempotent).")
    @DeleteMapping("/leader/applications/{applicationId}/evaluations/me")
    ResponseEntity<ApiResponse<Void>> deleteMyEvaluation(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 5: 컨트롤러**

```java
package com.duing.domain.applicationEvaluation.controller;

import com.duing.domain.applicationEvaluation.api.LeaderApplicationEvaluationApi;
import com.duing.domain.applicationEvaluation.controller.dto.request.UpsertApplicationEvaluationRequest;
import com.duing.domain.applicationEvaluation.service.ApplicationEvaluationService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class LeaderApplicationEvaluationController implements LeaderApplicationEvaluationApi {

    private final ApplicationEvaluationService evaluationService;

    @Override
    public ResponseEntity<ApiResponse<Void>> upsertMyEvaluation(
            @PathVariable Long applicationId,
            @Valid @RequestBody UpsertApplicationEvaluationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        evaluationService.upsert(request.toCommand(applicationId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteMyEvaluation(
            @PathVariable Long applicationId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        evaluationService.deleteMine(applicationId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 6: 컴파일 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/applicationEvaluation/
git commit -m "feat(applicationEvaluation): PUT/DELETE /evaluations/me 엔드포인트 추가"
```

## Task B3-4: 목록 응답에 `myScore` 추가

**Files:**
- Modify: `ApplicantQuery.java`, `ApplicantResponse.java`, `ApplicationRepositoryCustom.java`, `ApplicationRepositoryImpl.java`, `GeneralApplicationService.java`

- [ ] **Step 1: `ApplicantQuery` 에 `myScore` 추가**

```java
public record ApplicantQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewAt,
        Integer myScore                  // NEW
) {
    // 기존 from(Application) 는 myScore = null 로 호출 (호환).
    public static ApplicantQuery from(Application application) {
        return fromWithMyScore(application, null);
    }

    public static ApplicantQuery fromWithMyScore(Application application, Integer myScore) {
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                application.getAnswers(),
                application.getStatus(),
                application.getCreatedAt(),
                application.getInterviewAt(),
                myScore
        );
    }
}
```

- [ ] **Step 2: `ApplicantResponse` 에 `myScore` 추가**

레코드 시그니처 + `from` 매핑에 `myScore` 추가.

- [ ] **Step 3: `searchApplicants` 시그니처에 `currentUserId` 추가**

`ApplicationRepositoryCustom.java`:

```java
public interface ApplicationRepositoryCustom {
    List<ApplicantWithScore> searchApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition);

    record ApplicantWithScore(Application application, Integer myScore) {}
}
```

`ApplicationRepositoryImpl.java` 변경 — LEFT JOIN 으로 evaluation 매칭:

```java
import com.duing.domain.applicationEvaluation.entity.QApplicationEvaluation;

@Override
public List<ApplicantWithScore> searchApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition) {
    QApplicationEvaluation evaluation = QApplicationEvaluation.applicationEvaluation;

    return queryFactory
            .select(Projections.constructor(ApplicantWithScore.class,
                    application,
                    evaluation.score))
            .from(application)
            .join(application.user, user).fetchJoin()
            .leftJoin(evaluation)
                .on(evaluation.application.eq(application)
                        .and(evaluation.evaluator.id.eq(currentUserId))
                        .and(evaluation.deletedAt.isNull()))
            .where(
                    application.recruitment.id.eq(recruitmentId),
                    statusEq(condition.status()),
                    collegeEq(condition.college()),
                    searchKeyword(condition.q()),
                    submittedAfter(condition.submittedFrom()),
                    submittedBefore(condition.submittedTo())
            )
            .orderBy(application.createdAt.desc())
            .fetch();
}
```

(주의: `fetchJoin` + `Projections.constructor` 는 일반적으로 충돌. 안전한 패턴: `select(application, evaluation.score).from(application).join(...).leftJoin(evaluation).on(...).where(...).fetch()` 후 Tuple 매핑. 필요 시 패턴 조정.)

- [ ] **Step 4: 서비스에서 매핑 변경**

```java
@Override
public List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

    return applicationRepository.searchApplicants(recruitmentId, currentUserId, condition).stream()
            .map(row -> ApplicantQuery.fromWithMyScore(row.application(), row.myScore()))
            .toList();
}
```

- [ ] **Step 5: 컴파일 + 회귀**

```bash
./gradlew compileJava
./gradlew test --tests "com.duing.domain.application.*"
```

Expected: PASS (필터 회귀 + 신규 myScore null 값 회귀).

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/
git commit -m "feat(application): 목록 응답에 myScore 추가 (LEFT JOIN application_evaluation)"
```

## Task B3-5: 상세 응답에 `myEvaluation` / `otherEvaluations` 추가

**Files:**
- Modify: `ApplicantDetailQuery.java`, `ApplicantDetailResponse.java`, `GeneralApplicationService.java`

- [ ] **Step 1: Query 에 필드 추가**

```java
public record ApplicantDetailQuery(
        // ... 기존 ...,
        List<StatusHistoryItemQuery> statusHistory,
        EvaluationItemQuery myEvaluation,                  // NEW (nullable)
        List<EvaluationItemQuery> otherEvaluations         // NEW
) {
    public record EvaluationItemQuery(
            Long evaluatorId,
            String evaluatorName,
            Integer score,
            String memo,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    public static ApplicantDetailQuery fromAll(
            Application application,
            List<ApplicationStatusHistory> historyRows,
            List<ApplicationEvaluation> allEvaluations,
            Long currentUserId
    ) {
        EvaluationItemQuery mine = allEvaluations.stream()
                .filter(e -> e.getEvaluator().getId().equals(currentUserId))
                .findFirst()
                .map(ApplicantDetailQuery::toEvalItem)
                .orElse(null);
        List<EvaluationItemQuery> others = allEvaluations.stream()
                .filter(e -> !e.getEvaluator().getId().equals(currentUserId))
                .map(ApplicantDetailQuery::toEvalItem)
                .toList();
        // 기존 fromWithHistory 매핑 + mine + others.
        // ...
    }

    private static EvaluationItemQuery toEvalItem(ApplicationEvaluation e) {
        return new EvaluationItemQuery(
                e.getEvaluator().getId(),
                e.getEvaluator().getName(),
                e.getScore(),
                e.getMemo(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }
}
```

- [ ] **Step 2: Response 에 같은 구조 추가**

`ApplicantDetailResponse` 에 `ApplicationEvaluationItem` record 추가 + 필드 2개 추가 + `from` 매핑.

- [ ] **Step 3: 서비스에서 evaluation 조회 + 매핑**

```java
@Override
public ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId) {
    Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
            .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
    Long clubId = application.getRecruitment().getClub().getId();
    clubAuthService.requireManager(currentUserId, clubId);

    List<ApplicationStatusHistory> history =
            applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
    List<ApplicationEvaluation> evaluations =
            applicationEvaluationRepository.findByApplicationIdWithEvaluator(applicationId);

    return ApplicantDetailQuery.fromAll(application, history, evaluations, currentUserId);
}
```

`applicationEvaluationRepository` 의존성 주입 (`GeneralApplicationService` 필드 추가).

- [ ] **Step 4: 컴파일 + 회귀**

```bash
./gradlew compileJava
./gradlew test --tests "com.duing.domain.application.*"
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/
git commit -m "feat(application): 상세 응답에 myEvaluation/otherEvaluations 분리 추가"
```

## Task B3-6: 통합 테스트 (8개)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/applicationEvaluation/controller/LeaderApplicationEvaluationControllerTest.java`

- [ ] **Step 1: 테스트 8개 작성**

```java
@SpringBootTest
@AutoConfigureMockMvc
class LeaderApplicationEvaluationControllerTest extends IntegrationTestBase {

    @Test
    @DisplayName("PUT /evaluations/me — 없으면 신규 생성되고 204")
    void putCreates() {
        Long applicationId = setUp();

        given().auth().oauth2(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 4, "memo", "프로젝트 우수"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        Optional<ApplicationEvaluation> saved = evaluationRepository
                .findByApplicationIdAndEvaluatorId(applicationId, leaderId);
        assertThat(saved).isPresent();
        assertThat(saved.get().getScore()).isEqualTo(4);
    }

    @Test
    @DisplayName("PUT /evaluations/me — 있으면 갱신되고 204")
    void putUpdates() {
        Long applicationId = setUp();
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId).orElseThrow(),
                userRepository.findById(leaderId).orElseThrow(),
                3, "초기 메모"));

        given().auth().oauth2(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 5, "memo", "재평가"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        ApplicationEvaluation reloaded = evaluationRepository
                .findByApplicationIdAndEvaluatorId(applicationId, leaderId).orElseThrow();
        assertThat(reloaded.getScore()).isEqualTo(5);
        assertThat(reloaded.getMemo()).isEqualTo("재평가");
    }

    @Test
    @DisplayName("score 가 0 / 6 / null 이면 400")
    void invalidScoreRejected() {
        Long applicationId = setUp();

        for (Integer invalid : Arrays.asList(0, 6)) {
            given().auth().oauth2(leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("score", invalid, "memo", "x"))
                    .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                    .then().statusCode(400);
        }

        given().auth().oauth2(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("memo", "no score"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(400);
    }

    @Test
    @DisplayName("memo 가 2000자 초과면 400, null 은 허용")
    void memoSize() {
        Long applicationId = setUp();

        // 2001자
        String over = "a".repeat(2001);
        given().auth().oauth2(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3, "memo", over))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(400);

        // null memo
        given().auth().oauth2(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);
    }

    @Test
    @DisplayName("다른 운영진의 평가는 본인 PUT 으로 수정되지 않는다")
    void putDoesNotTouchOthers() {
        Long applicationId = setUp();
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId).orElseThrow(),
                userRepository.findById(otherLeaderId).orElseThrow(),
                2, "다른 평가"));

        given().auth().oauth2(leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 5, "memo", "내 평가"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        ApplicationEvaluation othersReloaded = evaluationRepository
                .findByApplicationIdAndEvaluatorId(applicationId, otherLeaderId).orElseThrow();
        assertThat(othersReloaded.getScore()).isEqualTo(2);
        assertThat(othersReloaded.getMemo()).isEqualTo("다른 평가");
    }

    @Test
    @DisplayName("DELETE /evaluations/me — 없는 평가에 대해서도 204")
    void deleteIdempotent() {
        Long applicationId = setUp();

        given().auth().oauth2(leaderToken)
                .when().delete("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);
    }

    @Test
    @DisplayName("운영진이 아닌 사용자가 PUT/DELETE 호출 시 403")
    void nonManagerRejected() {
        Long applicationId = setUp();

        given().auth().oauth2(memberToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(403);

        given().auth().oauth2(memberToken)
                .when().delete("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(403);
    }

    @Test
    @DisplayName("지원자 본인의 마이페이지 응답에 평가 관련 필드가 존재하지 않는다 (privacy 회귀)")
    void privacyRegressionForApplicant() {
        Long applicationId = setUp();
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId).orElseThrow(),
                userRepository.findById(leaderId).orElseThrow(),
                5, "비공개 메모"));

        Response response = given().auth().oauth2(applicantToken)
                .when().get("/api/v1/me/applications/{id}", applicationId);
        response.then().statusCode(200);

        String body = response.getBody().asString();
        assertThat(body).doesNotContain("myEvaluation");
        assertThat(body).doesNotContain("otherEvaluations");
        assertThat(body).doesNotContain("비공개 메모");
    }
}
```

- [ ] **Step 2: 상세 응답 분리 회귀 테스트 (별도 파일 또는 기존 service test 에 추가)**

```java
    @Test
    @DisplayName("상세 응답에서 myEvaluation 과 otherEvaluations 가 currentUserId 기준으로 분리된다")
    void detailSplitsByCurrentUser() {
        Long applicationId = setUp();
        Application application = applicationRepository.findById(applicationId).orElseThrow();
        evaluationRepository.save(ApplicationEvaluation.create(
                application, userRepository.findById(leaderId).orElseThrow(), 4, "내 평가"));
        evaluationRepository.save(ApplicationEvaluation.create(
                application, userRepository.findById(otherLeaderId).orElseThrow(), 3, "타인 평가"));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(applicationId, leaderId);

        assertThat(detail.myEvaluation().score()).isEqualTo(4);
        assertThat(detail.otherEvaluations()).hasSize(1);
        assertThat(detail.otherEvaluations().get(0).score()).isEqualTo(3);

        ApplicantDetailQuery fromOther = applicationService.getApplicantDetail(applicationId, otherLeaderId);
        assertThat(fromOther.myEvaluation().score()).isEqualTo(3);
        assertThat(fromOther.otherEvaluations()).hasSize(1);
        assertThat(fromOther.otherEvaluations().get(0).score()).isEqualTo(4);
    }
```

- [ ] **Step 3: 목록 myScore 회귀 테스트**

```java
    @Test
    @DisplayName("목록 응답에 myScore 가 currentUser 의 평가 점수로 채워진다 (없으면 null)")
    void listMyScoreReflectsCurrentUserEvaluation() {
        Long recruitmentId = createRecruitment();
        Long a1 = createApplication(recruitmentId);
        Long a2 = createApplication(recruitmentId);
        // a1 만 leader 가 평가
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(a1).orElseThrow(),
                userRepository.findById(leaderId).orElseThrow(), 4, null));

        Response res = given().auth().oauth2(leaderToken)
                .when().get("/api/v1/leader/recruitments/{rId}/applications", recruitmentId);

        res.then().statusCode(200);
        List<Map<String, Object>> rows = res.jsonPath().getList("data");
        Map<String, Object> a1Row = rows.stream()
                .filter(r -> Long.valueOf(r.get("applicationId").toString()).equals(a1))
                .findFirst().orElseThrow();
        Map<String, Object> a2Row = rows.stream()
                .filter(r -> Long.valueOf(r.get("applicationId").toString()).equals(a2))
                .findFirst().orElseThrow();

        assertThat(a1Row.get("myScore")).isEqualTo(4);
        assertThat(a2Row.get("myScore")).isNull();
    }
```

- [ ] **Step 4: 실행**

```bash
./gradlew test --tests "com.duing.domain.applicationEvaluation.*"
./gradlew test --tests "com.duing.domain.application.*"
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/applicationEvaluation/ \
        backend/src/test/java/com/duing/domain/application/
git commit -m "test(applicationEvaluation): 평가 CRUD·분리·privacy·myScore 통합 테스트 추가"
```

## Task B3-7: PR 생성

- [ ] **Step 1**

```bash
git push -u origin feat/application-evaluation
gh pr create --base develop --title "feat(applicationEvaluation): 운영진 평가 도메인 + myScore + 상세 분리 (Spec B3)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `application_evaluation` 테이블 V44 추가 — `(application_id, evaluator_id)` partial unique active rows.
- `domain/applicationEvaluation/` 신규 aggregate 일체 (entity·repository·service·controller·exception).
- `PUT /api/v1/leader/applications/{id}/evaluations/me` — score(1-5) + memo upsert, 204.
- `DELETE /api/v1/leader/applications/{id}/evaluations/me` — 본인 평가 삭제, 없어도 204 (idempotent).
- 목록 `ApplicantResponse` 에 `myScore` 추가 (LEFT JOIN application_evaluation).
- 상세 `ApplicantDetailResponse` 에 `myEvaluation` / `otherEvaluations` 분리 추가.
- 지원자 본인 마이페이지 응답에는 평가 관련 필드 노출 X (privacy 회귀 테스트).

## 🤔 고민했던 내용
- 평가 모델은 다인 평가(1인 1개) 로 결정 — 모집 운영 실제 워크플로(여러 운영진이 각자 본 후 합의) 와 정합.
- 본인 평가 식별 키를 별도 evaluation id 로 노출하지 않고 `/me` 경로로 처리 — REST 적이고 UX 도 명확.
- LEFT JOIN 으로 myScore 한 번에 가져옴 — N+1 회피.

## 💬 리뷰 중점사항
- partial UNIQUE 인덱스 (`WHERE deleted_at IS NULL`) 가 soft delete 후 재작성 시나리오를 막지 않는지.
- ApplicantDetailQuery 의 evaluation 분리 매핑 (`fromAll`) 이 currentUserId 기준으로 정확한지.
- privacy 회귀 테스트가 실제 응답 body 에 평가 관련 필드가 새지 않음을 확인하는지.
EOF
)"
```

---

# PR B4 — Neighbor 엔드포인트

**브랜치:** `feat/application-neighbors-api`

**Goal:** `GET /leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors?<filters>` — 동일 필터에서 prev/next applicationId 반환.

## File Structure — B4

| Action | Path | 역할 |
|---|---|---|
| Create | `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantNeighborsResponse.java` | response |
| Create | `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantNeighborsQuery.java` | query |
| Modify | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryCustom.java` | `findNeighbors` 메서드 |
| Modify | `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java` | 구현 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java` | `getNeighbors` 추가 |
| Modify | `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` | 구현 |
| Modify | `backend/src/main/java/com/duing/domain/application/api/LeaderApplicationApi.java` | 엔드포인트 인터페이스 |
| Modify | `backend/src/main/java/com/duing/domain/application/controller/LeaderApplicationController.java` | 컨트롤러 메서드 |
| Modify | `backend/src/test/java/com/duing/domain/application/controller/...` | 테스트 4개 |

## Task B4-0~7: 브랜치 ~ PR

- [ ] **Step 1: 브랜치**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/application-neighbors-api
```

- [ ] **Step 2: DTO 생성**

`ApplicantNeighborsResponse.java`:
```java
package com.duing.domain.application.controller.dto.response;

public record ApplicantNeighborsResponse(Long prevApplicationId, Long nextApplicationId) {}
```

`ApplicantNeighborsQuery.java`:
```java
package com.duing.domain.application.service.dto.query;

public record ApplicantNeighborsQuery(Long prevApplicationId, Long nextApplicationId) {}
```

- [ ] **Step 3: Repository 메서드 추가**

`ApplicationRepositoryCustom`:

```java
ApplicantNeighborsQuery findNeighbors(Long recruitmentId, Long applicationId, ApplicantSearchCondition condition);
```

`ApplicationRepositoryImpl`:

```java
@Override
public ApplicantNeighborsQuery findNeighbors(Long recruitmentId, Long applicationId, ApplicantSearchCondition condition) {
    // 현재 application 의 createdAt 조회
    LocalDateTime pivot = queryFactory
            .select(application.createdAt)
            .from(application)
            .where(application.id.eq(applicationId))
            .fetchOne();
    if (pivot == null) {
        return new ApplicantNeighborsQuery(null, null);
    }

    // 정렬은 createdAt desc. prev (UI상 "이전 = 더 최근") = pivot 보다 newer 중 가장 가까운 것.
    Long prevId = queryFactory
            .select(application.id)
            .from(application)
            .join(application.user, user)
            .where(
                    application.recruitment.id.eq(recruitmentId),
                    application.createdAt.gt(pivot),
                    statusEq(condition.status()),
                    collegeEq(condition.college()),
                    searchKeyword(condition.q()),
                    submittedAfter(condition.submittedFrom()),
                    submittedBefore(condition.submittedTo())
            )
            .orderBy(application.createdAt.asc())   // 가장 가까운 newer
            .limit(1).fetchOne();

    // next (UI상 "다음 = 더 오래된") = pivot 보다 older 중 가장 가까운 것.
    Long nextId = queryFactory
            .select(application.id)
            .from(application)
            .join(application.user, user)
            .where(
                    application.recruitment.id.eq(recruitmentId),
                    application.createdAt.lt(pivot),
                    statusEq(condition.status()),
                    collegeEq(condition.college()),
                    searchKeyword(condition.q()),
                    submittedAfter(condition.submittedFrom()),
                    submittedBefore(condition.submittedTo())
            )
            .orderBy(application.createdAt.desc())   // 가장 가까운 older
            .limit(1).fetchOne();

    return new ApplicantNeighborsQuery(prevId, nextId);
}
```

- [ ] **Step 4: 서비스 메서드 추가**

`ApplicationService.java`:

```java
ApplicantNeighborsQuery getNeighbors(Long recruitmentId, Long applicationId, Long currentUserId, ApplicantSearchCondition condition);
```

`GeneralApplicationService.java`:

```java
@Override
public ApplicantNeighborsQuery getNeighbors(Long recruitmentId, Long applicationId, Long currentUserId, ApplicantSearchCondition condition) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
    return applicationRepository.findNeighbors(recruitmentId, applicationId, condition);
}
```

- [ ] **Step 5: API 인터페이스 + 컨트롤러 메서드 추가**

`LeaderApplicationApi.java` 에 추가:

```java
@Operation(summary = "지원자 이웃(prev/next) 조회",
           description = "운영진 상세 페이지의 이전/다음 지원자 이동용. 동일 필터 컨텍스트에서 createdAt desc 정렬 기준 이웃을 반환한다.")
@GetMapping("/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors")
ResponseEntity<ApiResponse<ApplicantNeighborsResponse>> getApplicantNeighbors(
        @PathVariable Long recruitmentId,
        @PathVariable Long applicationId,
        @RequestParam(required = false) ApplicationStatus status,
        @RequestParam(required = false) College college,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
        @AuthenticationPrincipal UserPrincipal currentUser
);
```

`LeaderApplicationController.java` 에 컨트롤러 메서드:

```java
@Override
public ResponseEntity<ApiResponse<ApplicantNeighborsResponse>> getApplicantNeighbors(
        @PathVariable Long recruitmentId,
        @PathVariable Long applicationId,
        @RequestParam(required = false) ApplicationStatus status,
        @RequestParam(required = false) College college,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
        @AuthenticationPrincipal UserPrincipal currentUser
) {
    ApplicantSearchCondition condition = new ApplicantSearchCondition(status, college, q, submittedFrom, submittedTo);
    ApplicantNeighborsQuery query = applicationService.getNeighbors(
            recruitmentId, applicationId, currentUser.id(), condition);
    return ResponseEntity.ok(ApiResponse.success(
            new ApplicantNeighborsResponse(query.prevApplicationId(), query.nextApplicationId())));
}
```

- [ ] **Step 6: 컴파일 + 테스트 추가**

```java
@Test
@DisplayName("동일 필터에서 prev/next id 가 createdAt desc 정렬과 일치한다")
void neighborsMatchListOrdering() {
    Long rId = createRecruitment();
    Long a1 = createApplicationAt(rId, LocalDateTime.of(2026, 5, 1, 9, 0));  // oldest
    Long a2 = createApplicationAt(rId, LocalDateTime.of(2026, 5, 5, 9, 0));
    Long a3 = createApplicationAt(rId, LocalDateTime.of(2026, 5, 10, 9, 0));  // newest

    given().auth().oauth2(leaderToken)
            .when().get("/api/v1/leader/recruitments/{rId}/applications/{aId}/neighbors", rId, a2)
            .then().statusCode(200)
            .body("data.prevApplicationId", equalTo(a3.intValue()))   // 더 최근
            .body("data.nextApplicationId", equalTo(a1.intValue()));  // 더 오래된
}

@Test
@DisplayName("첫 번째 (UI상 가장 위) 지원자는 prevApplicationId 가 null")
void firstHasNullPrev() {
    Long rId = createRecruitment();
    Long a1 = createApplicationAt(rId, LocalDateTime.of(2026, 5, 1, 9, 0));
    Long a2 = createApplicationAt(rId, LocalDateTime.of(2026, 5, 10, 9, 0));

    given().auth().oauth2(leaderToken)
            .when().get("/api/v1/leader/recruitments/{rId}/applications/{aId}/neighbors", rId, a2)
            .then().statusCode(200)
            .body("data.prevApplicationId", nullValue())
            .body("data.nextApplicationId", equalTo(a1.intValue()));
}

@Test
@DisplayName("마지막 지원자는 nextApplicationId 가 null")
void lastHasNullNext() {
    Long rId = createRecruitment();
    Long a1 = createApplicationAt(rId, LocalDateTime.of(2026, 5, 1, 9, 0));
    createApplicationAt(rId, LocalDateTime.of(2026, 5, 10, 9, 0));

    given().auth().oauth2(leaderToken)
            .when().get("/api/v1/leader/recruitments/{rId}/applications/{aId}/neighbors", rId, a1)
            .then().statusCode(200)
            .body("data.nextApplicationId", nullValue());
}

@Test
@DisplayName("필터로 1건만 남으면 prev/next 모두 null")
void filteredToOneReturnsBothNull() {
    Long rId = createRecruitment();
    Long a1 = createApplicationWithStatus(rId, ApplicationStatus.SUBMITTED);
    Long a2 = createApplicationWithStatus(rId, ApplicationStatus.UNDER_REVIEW);

    given().auth().oauth2(leaderToken)
            .queryParam("status", "UNDER_REVIEW")
            .when().get("/api/v1/leader/recruitments/{rId}/applications/{aId}/neighbors", rId, a2)
            .then().statusCode(200)
            .body("data.prevApplicationId", nullValue())
            .body("data.nextApplicationId", nullValue());
}

@Test
@DisplayName("운영진이 아닌 사용자 호출 시 403")
void nonManagerRejected() {
    Long rId = createRecruitment();
    Long a1 = createApplication(rId);

    given().auth().oauth2(memberToken)
            .when().get("/api/v1/leader/recruitments/{rId}/applications/{aId}/neighbors", rId, a1)
            .then().statusCode(403);
}
```

- [ ] **Step 7: 실행 + PASS 확인**

```bash
./gradlew test --tests "com.duing.domain.application.controller.LeaderApplicationControllerTest"
```

Expected: PASS.

- [ ] **Step 8: 커밋 + PR**

```bash
git add backend/src/main/java/com/duing/domain/application/ \
        backend/src/test/java/com/duing/domain/application/
git commit -m "feat(application): 운영진 지원자 prev/next neighbor API 추가"
git push -u origin feat/application-neighbors-api
gh pr create --base develop --title "feat(application): 지원자 이웃 조회 API (Spec B4)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `GET /api/v1/leader/recruitments/{rId}/applications/{aId}/neighbors` 신규.
- 동일 필터 컨텍스트(status/college/q/기간) 에서 createdAt desc 정렬 기준 prev/next id 반환.
- prev = 더 최근 (UI 상 위쪽), next = 더 오래된 (UI 상 아래쪽).

## 🤔 고민했던 내용
- 프론트 캐시에서 인접 id 계산하는 방식은 딥링크 직접 진입·캐시 stale·필터 일관성 문제가 있어 서버 단일 진실로 전환.
- 응답을 가볍게 (id 2개) 유지 — 매 클릭마다 1회 호출이 정상.
- 정렬·필터 BooleanExpression 은 목록 조회와 100% 동일하게 재사용.

## 💬 리뷰 중점사항
- prev/next 의 의미 (prev=newer / next=older) 가 spec 명세와 일치하는지.
- pivot 의 createdAt 이 동일한 row 가 있을 가능성 (드물지만) 처리 — 동일 createdAt 끼리 정렬 안정성을 위해 id 보조 정렬이 필요한지 검토.
EOF
)"
```

---

## Self-Review 체크리스트 (이 plan 실행 시)

1. **B1 머지 전**: 기존 프론트 `useApplicantsQuery` 호출이 새 query params 없이 작동하는지 확인 (모두 옵셔널이라 OK).
2. **B2 머지 전**: 기존 `ApplicantDetailResponse` 소비자(프론트 ApplicantDetailModal) 가 `statusHistory` 필드를 무시해도 동작하는지 확인.
3. **B3 머지 전**: 응답에 `myScore` / `myEvaluation` / `otherEvaluations` 추가는 backward-compat (옵셔널 필드 추가). 프론트가 사용 안 해도 깨지지 않음.
4. **B4 머지 전**: 별도 신규 엔드포인트라 영향 없음.
5. **모두 머지 후 F1 진행** — 프론트 plan 파일 참조.
