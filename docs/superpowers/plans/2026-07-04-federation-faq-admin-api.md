# 총동연 FAQ Admin API (P1-PR2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN)이 FAQ를 관리하는 API를 구현한다 — FAQ CRUD·정렬(PUT order)·카테고리 생성/수정. 스펙 `docs/superpowers/specs/2026-07-04-federation-qna-design.md` §5 관리자 표의 P1-PR2 범위. 카테고리 **삭제**는 P2(스펙 §8)로 이번 범위 밖.

**Architecture:** PR1(#572, develop 머지됨)의 `domain/federation/` 위에 admin 레이어만 추가. `AdminNoticeApi`/`AdminNoticeController` 패턴(클래스 레벨 `hasRole('ADMIN')`) + `ClubPhotoApi`의 PUT order 전례(집합 일치 검증). 마이그레이션 불필요(V73에 모든 컬럼 존재).

**Tech Stack:** Spring Boot 3.4 / QueryDSL / TestContainers + RestAssured

**주의(전 태스크 공통):**
- 커밋 메시지 Conventional Commits 한국어, AI 서명 라인 금지. 구현 서브에이전트는 push·PR 생성 금지.
- gradlew는 `backend/`에서 실행, `| tail` 금지. 테스트 날짜는 상대 날짜만.

---

## File Structure

```
backend/src/main/java/com/duing/domain/federation/
├── entity/FederationFaq.java                        [수정] update()·changeSortOrder() 도메인 메서드
├── entity/FederationFaqCategory.java                [수정] update() 도메인 메서드
├── repository/FederationFaqRepository.java          [수정] findMaxSortOrder()
├── repository/FederationFaqRepositoryCustom.java    [수정] searchForAdmin 추가
├── repository/FederationFaqRepositoryImpl.java      [수정] searchForAdmin 구현
├── repository/FederationFaqCategoryRepository.java  [수정] existsByName, findMaxSortOrder
├── exception/FederationFaqException.java            [수정] 예외 3종 추가
├── service/FederationFaqService.java                [수정] admin 메서드 7종 추가
├── service/GeneralFederationFaqService.java         [수정] 구현 (+쓰기 @Transactional)
├── service/dto/query/FederationFaqAdminSearchCondition.java   [생성]
├── service/dto/command/CreateFederationFaqCommand.java        [생성]
├── service/dto/command/UpdateFederationFaqCommand.java        [생성]
├── service/dto/command/ReorderFederationFaqsCommand.java      [생성]
├── service/dto/command/CreateFederationFaqCategoryCommand.java [생성]
├── service/dto/command/UpdateFederationFaqCategoryCommand.java [생성]
├── api/AdminFederationFaqApi.java                   [생성]
├── controller/AdminFederationFaqController.java     [생성]
├── controller/dto/request/CreateFederationFaqRequest.java     [생성]
├── controller/dto/request/UpdateFederationFaqRequest.java     [생성]
├── controller/dto/request/ReorderFederationFaqsRequest.java   [생성]
├── controller/dto/request/CreateFederationFaqCategoryRequest.java [생성]
├── controller/dto/request/UpdateFederationFaqCategoryRequest.java [생성]
└── controller/dto/response/AdminFederationFaqResponse.java    [생성]
backend/src/test/java/com/duing/domain/federation/
└── FederationFaqAdminAcceptanceTest.java            [생성]
```

SecurityConfig 변경 없음 — `/api/v1/admin/**`은 anyRequest().authenticated() + 클래스 레벨 hasRole('ADMIN')으로 커버(AdminNoticeController 동일).

---

### Task 1: 브랜치 + 리포지토리 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqRepositoryCustom.java`
- Modify: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqRepositoryImpl.java`
- Modify: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqCategoryRepository.java`
- Create: `backend/src/main/java/com/duing/domain/federation/service/dto/query/FederationFaqAdminSearchCondition.java`

- [ ] **Step 1: 브랜치 분기**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/federation-faq-admin-api
```

- [ ] **Step 2: admin 검색 조건 query DTO**

```java
package com.duing.domain.federation.service.dto.query;

public record FederationFaqAdminSearchCondition(
        Boolean published,
        Long categoryId,
        String keyword
) {
}
```

- [ ] **Step 3: Custom 인터페이스에 searchForAdmin 추가**

`FederationFaqRepositoryCustom.java`에 메서드 추가(import 포함):

```java
    Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable);
```

- [ ] **Step 4: Impl 구현 — 기존 predicates 스타일 그대로**

`FederationFaqRepositoryImpl.java`에 추가. 정렬은 공개 목록과 동일(관리 화면 = 공개 화면 WYSIWYG):

```java
    @Override
    public Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationFaq.deletedAt.isNull(),
                publishedEq(condition.published()),
                categoryIdEq(condition.categoryId()),
                keywordContains(condition.keyword())
        };

        List<FederationFaq> content = queryFactory
                .selectFrom(federationFaq)
                .where(predicates)
                .orderBy(
                        federationFaq.pinned.desc(),
                        federationFaq.sortOrder.asc(),
                        federationFaq.id.desc()
                )
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(federationFaq.count())
                .from(federationFaq)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression publishedEq(Boolean published) {
        return published != null ? federationFaq.published.eq(published) : null;
    }
```

(기존 `searchPublished`의 predicates 배열 스타일이 이미 있으므로 동일하게. `categoryIdEq`/`keywordContains` 헬퍼는 기존 것 재사용.)

- [ ] **Step 5: FAQ 리포지토리에 max sortOrder 쿼리**

`FederationFaqRepository.java`에 추가:

```java
import org.springframework.data.jpa.repository.Query;

    // 신규 FAQ는 맨 뒤 배치 — soft delete 제외 최대 정렬값 (@SQLRestriction이 JPQL에 적용되지만 명시 조건으로 고정)
    @Query("select coalesce(max(faq.sortOrder), -1) from FederationFaq faq where faq.deletedAt is null")
    int findMaxSortOrder();
```

- [ ] **Step 6: 카테고리 리포지토리 확장**

`FederationFaqCategoryRepository.java`에 추가:

```java
    boolean existsByName(String name);

    @Query("select coalesce(max(category.sortOrder), -1) from FederationFaqCategory category where category.deletedAt is null")
    int findMaxSortOrder();
```

(`import org.springframework.data.jpa.repository.Query;` 추가)

- [ ] **Step 7: 컴파일 + Commit**

Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

```bash
git add backend/src/main/java/com/duing/domain/federation/repository/ backend/src/main/java/com/duing/domain/federation/service/dto/query/
git commit -m "feat(backend): 총동연 FAQ admin 검색·정렬 리포지토리 확장"
```

---

### Task 2: 엔티티 도메인 메서드

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/federation/entity/FederationFaq.java`
- Modify: `backend/src/main/java/com/duing/domain/federation/entity/FederationFaqCategory.java`

- [ ] **Step 1: FederationFaq에 update·changeSortOrder 추가** (create 팩토리 아래)

```java
    public void update(Long categoryId, String question, String answer, boolean pinned, boolean published) {
        this.categoryId = categoryId;
        this.question = question;
        this.answer = answer;
        this.pinned = pinned;
        this.published = published;
    }

    public void changeSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
```

- [ ] **Step 2: FederationFaqCategory에 update 추가**

```java
    public void update(String name, int sortOrder) {
        this.name = name;
        this.sortOrder = sortOrder;
    }
```

- [ ] **Step 3: 컴파일 + Commit**

Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

```bash
git add backend/src/main/java/com/duing/domain/federation/entity/
git commit -m "feat(backend): 총동연 FAQ 엔티티 수정 도메인 메서드 추가"
```

---

### Task 3: 예외 + command DTO + 서비스 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/federation/exception/FederationFaqException.java`
- Create: `service/dto/command/` 5종 (아래)
- Modify: `backend/src/main/java/com/duing/domain/federation/service/FederationFaqService.java`
- Modify: `backend/src/main/java/com/duing/domain/federation/service/GeneralFederationFaqService.java`

- [ ] **Step 1: 예외 3종 추가** (기존 FederationFaqNotFoundException 아래)

```java
    public static class FederationFaqCategoryNotFoundException extends FederationFaqException {
        private static final String MESSAGE = "FAQ 카테고리를 찾을 수 없습니다.";
        public FederationFaqCategoryNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class DuplicateFederationFaqCategoryNameException extends FederationFaqException {
        private static final String MESSAGE = "이미 존재하는 카테고리 이름입니다.";
        public DuplicateFederationFaqCategoryNameException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class FaqOrderMismatchException extends FederationFaqException {
        private static final String MESSAGE = "정렬 대상 FAQ 목록이 현재 목록과 일치하지 않습니다.";
        public FaqOrderMismatchException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

- [ ] **Step 2: command DTO 5종** (`service/dto/command/`, 전부 record)

```java
package com.duing.domain.federation.service.dto.command;

public record CreateFederationFaqCommand(
        Long categoryId, String question, String answer,
        boolean pinned, boolean published, Long authorId
) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

public record UpdateFederationFaqCommand(
        Long faqId, Long categoryId, String question, String answer,
        boolean pinned, boolean published
) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

import java.util.List;

public record ReorderFederationFaqsCommand(List<Long> orderedIds) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

public record CreateFederationFaqCategoryCommand(String name) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

public record UpdateFederationFaqCategoryCommand(Long categoryId, String name, int sortOrder) {
}
```

- [ ] **Step 3: 서비스 인터페이스 확장**

`FederationFaqService.java`에 추가 (import: command 5종, FederationFaqAdminSearchCondition):

```java
    Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable);

    Long create(CreateFederationFaqCommand command);

    void update(UpdateFederationFaqCommand command);

    void delete(Long faqId);

    void reorder(ReorderFederationFaqsCommand command);

    Long createCategory(CreateFederationFaqCategoryCommand command);

    void updateCategory(UpdateFederationFaqCategoryCommand command);
```

- [ ] **Step 4: General 구현** — 클래스 레벨 readOnly 유지, 쓰기 메서드만 `@Transactional` 오버라이드

`GeneralFederationFaqService.java`에 추가:

```java
    @Override
    public Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable) {
        return federationFaqRepository.searchForAdmin(condition, pageable);
    }

    @Override
    @Transactional
    public Long create(CreateFederationFaqCommand command) {
        requireCategory(command.categoryId());
        FederationFaq faq = FederationFaq.create(
                command.categoryId(), command.question(), command.answer(),
                command.pinned(), command.published(),
                federationFaqRepository.findMaxSortOrder() + 1,  // 신규는 맨 뒤 자동 배치 (스펙 §5)
                command.authorId());
        return federationFaqRepository.save(faq).getId();
    }

    @Override
    @Transactional
    public void update(UpdateFederationFaqCommand command) {
        FederationFaq faq = getFaqForAdmin(command.faqId());
        requireCategory(command.categoryId());
        faq.update(command.categoryId(), command.question(), command.answer(),
                command.pinned(), command.published());
    }

    @Override
    @Transactional
    public void delete(Long faqId) {
        FederationFaq faq = getFaqForAdmin(faqId);
        federationFaqRepository.delete(faq);  // @SQLDelete soft delete
    }

    @Override
    @Transactional
    public void reorder(ReorderFederationFaqsCommand command) {
        List<FederationFaq> currentFaqs = federationFaqRepository.findAll();
        Set<Long> currentIds = currentFaqs.stream().map(FederationFaq::getId).collect(Collectors.toSet());
        List<Long> orderedIds = command.orderedIds();
        // 전체 교체 계약: 현재 전체 id 집합과 payload 가 정확히 일치해야 한다 (ClubPhoto reorder 전례)
        if (orderedIds.size() != currentIds.size() || !currentIds.equals(Set.copyOf(orderedIds))) {
            throw new FederationFaqException.FaqOrderMismatchException();
        }
        Map<Long, FederationFaq> faqById = currentFaqs.stream()
                .collect(Collectors.toMap(FederationFaq::getId, faq -> faq));
        for (int index = 0; index < orderedIds.size(); index++) {
            faqById.get(orderedIds.get(index)).changeSortOrder(index);
        }
    }

    @Override
    @Transactional
    public Long createCategory(CreateFederationFaqCategoryCommand command) {
        // 사전 중복 검사(친절한 409) + DB partial unique 인덱스가 최종 백스톱
        if (categoryRepository.existsByName(command.name())) {
            throw new FederationFaqException.DuplicateFederationFaqCategoryNameException();
        }
        FederationFaqCategory category = FederationFaqCategory.create(
                command.name(), categoryRepository.findMaxSortOrder() + 1);
        return categoryRepository.save(category).getId();
    }

    @Override
    @Transactional
    public void updateCategory(UpdateFederationFaqCategoryCommand command) {
        FederationFaqCategory category = categoryRepository.findById(command.categoryId())
                .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
        if (!category.getName().equals(command.name()) && categoryRepository.existsByName(command.name())) {
            throw new FederationFaqException.DuplicateFederationFaqCategoryNameException();
        }
        category.update(command.name(), command.sortOrder());
    }

    private FederationFaq getFaqForAdmin(Long faqId) {
        return federationFaqRepository.findById(faqId)
                .orElseThrow(FederationFaqException.FederationFaqNotFoundException::new);
    }

    private void requireCategory(Long categoryId) {
        // FAQ 생성·수정 트랜잭션 안에서 카테고리 유효성 재검증 (스펙 §4 — @SQLRestriction이 삭제 카테고리를 걸러줌)
        if (!categoryRepository.existsById(categoryId)) {
            throw new FederationFaqException.FederationFaqCategoryNotFoundException();
        }
    }
```

(import 추가: `java.util.Map`, `java.util.Set`, `java.util.stream.Collectors`, command 5종, `FederationFaqAdminSearchCondition`)

- [ ] **Step 5: 컴파일 + Commit**

Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

```bash
git add backend/src/main/java/com/duing/domain/federation/
git commit -m "feat(backend): 총동연 FAQ admin 서비스·예외·커맨드 추가"
```

---

### Task 4: 인수 테스트 (RED)

**Files:**
- Test: `backend/src/test/java/com/duing/domain/federation/FederationFaqAdminAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성** — 시딩·토큰은 FederationFaqPublicAcceptanceTest/NoticeAdminAcceptanceTest 패턴. 시작 전에 두 파일을 읽고 실태와 다르면 조정.

```java
package com.duing.domain.federation;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationFaqAdminAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long adminId;
    private String adminToken;
    private String studentToken;
    private Long categoryId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminId = admin.getId();
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        categoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-관리" + sequence.incrementAndGet(), 0)).getId();
    }

    @Test
    @DisplayName("ADMIN이 FAQ를 생성하면 정렬순서가 맨 뒤로 자동 배치되고 비공개 포함 목록에서 조회된다")
    void adminCreatesFaqAppendedToEnd() {
        seedFaq("기존 질문", true, 0);

        Long createdId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": %d, "question": "새 질문", "answer": "새 답변",
                      "pinned": false, "published": false }
                    """.formatted(categoryId))
            .when()
                .post("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faqs?published=false")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }.question".formatted(createdId), equalTo("새 질문"))
                .body("data.content.find { it.id == %d }.sortOrder".formatted(createdId), equalTo(1));
    }

    @Test
    @DisplayName("STUDENT가 admin FAQ API에 접근하면 403, 익명은 401을 받는다")
    void nonAdminBlocked() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
            .when()
                .get("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("FAQ 수정으로 내용·카테고리·공개 여부가 반영된다")
    void adminUpdatesFaq() {
        Long faqId = seedFaq("수정 전", true, 0);
        Long newCategoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-이동" + sequence.incrementAndGet(), 1)).getId();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": %d, "question": "수정 후", "answer": "수정된 답변",
                      "pinned": true, "published": true }
                    """.formatted(newCategoryId))
            .when()
                .patch("/api/v1/admin/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.question", equalTo("수정 후"))
                .body("data.pinned", equalTo(true))
                .body("data.categoryId", equalTo(newCategoryId.intValue()));
    }

    @Test
    @DisplayName("존재하지 않는 카테고리로 FAQ를 만들면 404를 받는다")
    void createWithMissingCategoryFails() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": 999999, "question": "질문", "answer": "답변",
                      "pinned": false, "published": true }
                    """)
            .when()
                .post("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("FAQ 삭제는 soft delete로 공개 목록에서 사라진다")
    void adminDeletesFaq() {
        Long faqId = seedFaq("삭제될 질문", true, 0);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .delete("/api/v1/admin/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("정렬 전체 교체로 FAQ 순서가 바뀌고, id 집합이 불일치하면 400을 받는다")
    void adminReordersFaqs() {
        Long firstId = seedFaq("질문 A", true, 0);
        Long secondId = seedFaq("질문 B", true, 1);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"orderedIds\": [%d, %d] }".formatted(secondId, firstId))
            .when()
                .put("/api/v1/admin/federation/faqs/order")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content[0].question", equalTo("질문 B"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"orderedIds\": [%d] }".formatted(firstId))
            .when()
                .put("/api/v1/admin/federation/faqs/order")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("카테고리를 생성·수정할 수 있고 중복 이름은 409를 받는다")
    void adminManagesCategories() {
        String name = "테스트-생성" + sequence.incrementAndGet();

        Long createdCategoryId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s\" }".formatted(name))
            .when()
                .post("/api/v1/admin/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s\" }".formatted(name))
            .when()
                .post("/api/v1/admin/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s-변경\", \"sortOrder\": 3 }".formatted(name))
            .when()
                .patch("/api/v1/admin/federation/faq-categories/" + createdCategoryId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.find { it.id == %d }.sortOrder".formatted(createdCategoryId), equalTo(3));
    }

    // ---- helpers ----

    private Long seedFaq(String question, boolean published, int sortOrder) {
        return faqRepository.save(FederationFaq.create(
                categoryId, question, "답변 본문입니다.", false, published, sortOrder, adminId)).getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
```

- [ ] **Step 2: RED 확인**

Run: `cd backend && ./gradlew test --tests "*FederationFaqAdminAcceptanceTest*"`
Expected: FAIL — admin 엔드포인트 미구현으로 대부분 404/401. 컴파일 에러는 안 됨. (`nonAdminBlocked`의 익명 401은 통과 가능)

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/federation/
git commit -m "test(backend): 총동연 FAQ admin API 인수 테스트 추가(RED)"
```

---

### Task 5: 요청 DTO + AdminApi + AdminController (GREEN)

**Files:**
- Create: `controller/dto/request/` 5종, `controller/dto/response/AdminFederationFaqResponse.java`
- Create: `api/AdminFederationFaqApi.java`, `controller/AdminFederationFaqController.java`

- [ ] **Step 1: 요청 DTO 5종** (검증 한국어 메시지, toCommand — CreateNoticeRequest 패턴)

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateFederationFaqRequest(
        @NotNull Long categoryId,
        @NotBlank @Size(max = 300) String question,
        @NotBlank @Size(max = 4000) String answer,
        boolean pinned,
        boolean published
) {
    public CreateFederationFaqCommand toCommand(Long authorId) {
        return new CreateFederationFaqCommand(categoryId, question, answer, pinned, published, authorId);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateFederationFaqRequest(
        @NotNull Long categoryId,
        @NotBlank @Size(max = 300) String question,
        @NotBlank @Size(max = 4000) String answer,
        boolean pinned,
        boolean published
) {
    public UpdateFederationFaqCommand toCommand(Long faqId) {
        return new UpdateFederationFaqCommand(faqId, categoryId, question, answer, pinned, published);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ReorderFederationFaqsRequest(
        @NotEmpty List<Long> orderedIds
) {
    public ReorderFederationFaqsCommand toCommand() {
        return new ReorderFederationFaqsCommand(orderedIds);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFederationFaqCategoryRequest(
        @NotBlank @Size(max = 50) String name
) {
    public CreateFederationFaqCategoryCommand toCommand() {
        return new CreateFederationFaqCategoryCommand(name);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateFederationFaqCategoryRequest(
        @NotBlank @Size(max = 50) String name,
        int sortOrder
) {
    public UpdateFederationFaqCategoryCommand toCommand(Long categoryId) {
        return new UpdateFederationFaqCategoryCommand(categoryId, name, sortOrder);
    }
}
```

- [ ] **Step 2: AdminFederationFaqResponse**

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaq;
import java.time.LocalDateTime;

public record AdminFederationFaqResponse(
        Long id,
        Long categoryId,
        String categoryName,
        String question,
        String answer,
        boolean pinned,
        boolean published,
        int sortOrder,
        long viewCount,
        LocalDateTime updatedAt
) {
    public static AdminFederationFaqResponse from(FederationFaq faq, String categoryName) {
        return new AdminFederationFaqResponse(
                faq.getId(), faq.getCategoryId(), categoryName,
                faq.getQuestion(), faq.getAnswer(), faq.isPinned(), faq.isPublished(),
                faq.getSortOrder(), faq.getViewCount(), faq.getUpdatedAt());
    }
}
```

- [ ] **Step 3: AdminFederationFaqApi** (AdminNoticeApi 패턴 — @SecurityRequirement 포함)

```java
package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.CreateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.request.ReorderFederationFaqsRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationFaqResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "총동연 FAQ(관리)", description = "총동연 전용 FAQ 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFederationFaqApi {

    @Operation(summary = "FAQ 관리 목록", description = "비공개 포함. published/categoryId/keyword 필터.")
    @GetMapping("/admin/federation/faqs")
    ResponseEntity<ApiResponse<PageResponse<AdminFederationFaqResponse>>> getAdminFaqs(
            @RequestParam(required = false) Boolean published,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "FAQ 생성", description = "정렬순서는 맨 뒤 자동 배치.")
    @PostMapping("/admin/federation/faqs")
    ResponseEntity<ApiResponse<Long>> createFaq(
            @Valid @RequestBody CreateFederationFaqRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "FAQ 수정")
    @PatchMapping("/admin/federation/faqs/{faqId}")
    ResponseEntity<ApiResponse<Void>> updateFaq(
            @PathVariable Long faqId,
            @Valid @RequestBody UpdateFederationFaqRequest request
    );

    @Operation(summary = "FAQ 삭제 (soft delete)")
    @DeleteMapping("/admin/federation/faqs/{faqId}")
    ResponseEntity<ApiResponse<Void>> deleteFaq(@PathVariable Long faqId);

    @Operation(summary = "FAQ 정렬 전체 교체", description = "orderedIds 순서가 새 정렬. 현재 전체 id 집합과 일치해야 한다.")
    @PutMapping("/admin/federation/faqs/order")
    ResponseEntity<ApiResponse<Void>> reorderFaqs(@Valid @RequestBody ReorderFederationFaqsRequest request);

    @Operation(summary = "FAQ 카테고리 생성", description = "정렬순서는 맨 뒤 자동 배치. 이름 중복 시 409.")
    @PostMapping("/admin/federation/faq-categories")
    ResponseEntity<ApiResponse<Long>> createCategory(
            @Valid @RequestBody CreateFederationFaqCategoryRequest request
    );

    @Operation(summary = "FAQ 카테고리 수정 (이름·정렬순서)")
    @PatchMapping("/admin/federation/faq-categories/{categoryId}")
    ResponseEntity<ApiResponse<Void>> updateCategory(
            @PathVariable Long categoryId,
            @Valid @RequestBody UpdateFederationFaqCategoryRequest request
    );
}
```

- [ ] **Step 4: AdminFederationFaqController**

```java
package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.AdminFederationFaqApi;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.request.ReorderFederationFaqsRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationFaqResponse;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.FederationFaqService;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFederationFaqController implements AdminFederationFaqApi {

    private final FederationFaqService federationFaqService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFederationFaqResponse>>> getAdminFaqs(
            @RequestParam(required = false) Boolean published,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            Pageable pageable
    ) {
        FederationFaqAdminSearchCondition condition =
                new FederationFaqAdminSearchCondition(published, categoryId, keyword);
        Page<FederationFaq> faqPage = federationFaqService.searchForAdmin(condition, pageable);
        Map<Long, String> categoryNames = faqPage.isEmpty() ? Map.of() : categoryNameMap();
        Page<AdminFederationFaqResponse> responsePage = faqPage.map(
                faq -> AdminFederationFaqResponse.from(faq, categoryNames.get(faq.getCategoryId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(responsePage)));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createFaq(
            @Valid @RequestBody CreateFederationFaqRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long faqId = federationFaqService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(faqId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateFaq(
            @PathVariable Long faqId, @Valid @RequestBody UpdateFederationFaqRequest request) {
        federationFaqService.update(request.toCommand(faqId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteFaq(@PathVariable Long faqId) {
        federationFaqService.delete(faqId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> reorderFaqs(@Valid @RequestBody ReorderFederationFaqsRequest request) {
        federationFaqService.reorder(request.toCommand());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createCategory(
            @Valid @RequestBody CreateFederationFaqCategoryRequest request) {
        Long createdCategoryId = federationFaqService.createCategory(request.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(createdCategoryId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateCategory(
            @PathVariable Long categoryId, @Valid @RequestBody UpdateFederationFaqCategoryRequest request) {
        federationFaqService.updateCategory(request.toCommand(categoryId));
        return ResponseEntity.noContent().build();
    }

    // 카테고리는 소량(≤10) 전체 테이블이라 전량 Map으로 이름을 해석한다 (FederationFaqController와 동일 전략).
    private Map<Long, String> categoryNameMap() {
        return federationFaqService.getCategories().stream()
                .collect(Collectors.toMap(FederationFaqCategory::getId, FederationFaqCategory::getName));
    }
}
```

- [ ] **Step 5: GREEN 확인**

Run: `cd backend && ./gradlew test --tests "*FederationFaqAdminAcceptanceTest*"`
Expected: BUILD SUCCESSFUL, 7개 전부 PASS. 이어서 공개 API 회귀: `./gradlew test --tests "*FederationFaqPublicAcceptanceTest*"` → 8/8 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/federation/
git commit -m "feat(backend): 총동연 FAQ admin CRUD·정렬·카테고리 API 구현"
```

---

### Task 6: 전체 테스트 + 리뷰 게이트

- [ ] **Step 1:** `cd backend && ./gradlew test` → BUILD SUCCESSFUL (전체 회귀)
- [ ] **Step 2:** 리뷰 디스패치 — 태스크별 spec+quality 리뷰는 실행 중 수행. 최종적으로 duing-code-reviewer(전체 diff) + **codex adversarial**(권한·reorder 동시성·중복 이름 레이스 — 리뷰 정책상 권한/데이터무결성 변경) 실행, 지적 반영.
- [ ] **Step 3:** PR 준비(푸시·생성은 사용자 지시 후). 본문에 자연스러운 문장으로: 관리 목록·CRUD·정렬 전체 교체 계약(집합 일치 검증), 카테고리 생성/수정과 중복 이름 409(사전 검증+DB 백스톱), 카테고리 삭제를 P2로 미룬 이유.

---

## Self-Review 결과

- 스펙 커버리지: §5 관리자 표의 FAQ 5행(목록/생성/수정/삭제/PUT order) + 카테고리 생성·수정(P1) 전부 태스크에 매핑. 카테고리 DELETE는 스펙 §8 P2라 의도적 제외(Out of Scope 일치). 생성 시 sortOrder 미입력·맨 뒤 자동(§5) 반영. 탈퇴 회원 표기·leftJoin은 문의(PR3) 전용 항목이라 FAQ admin엔 해당 없음.
- 타입 일관성: command 5종·request 5종·`searchForAdmin`·`findMaxSortOrder` 시그니처가 Task 1~5에서 동일. `FederationFaq.update(categoryId, question, answer, pinned, published)` — Task 2 정의와 Task 3 호출 일치.
- reorder의 `findAll()`은 @SQLRestriction으로 삭제 제외 전체 로드 — 수백 건 규모 전제(스펙 §4)라 허용. 테스트의 sortOrder 단언(자동 배치=1)은 seedFaq(sortOrder 0) 1건 후 생성이므로 max(0)+1=1로 결정적.
- 플레이스홀더 없음, 모든 코드 완전체.
