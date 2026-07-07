# 총동연 FAQ 공개 API (P1-PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연 FAQ 도메인의 DB(V73) + 공개 조회 API 3종(목록/단건/카테고리)을 구현한다 — 스펙 `docs/superpowers/specs/2026-07-04-federation-qna-design.md` §4·§5의 P1-PR1 범위.

**Architecture:** 기존 DDD 플랫 레이아웃(`domain/federation/` 신규)에 notice 도메인 패턴을 그대로 복제한다. api 인터페이스 → controller → service(인터페이스+General 구현) → repository(QueryDSL Custom/Impl) → entity. 공개 GET은 SecurityConfig **정확 경로** permitAll(와일드카드 금지 — 같은 프리픽스의 비밀문의 방어층 보존).

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / TestContainers + RestAssured

**주의(전 태스크 공통):**
- 커밋 메시지는 Conventional Commits 한국어(`feat(backend): ...`), `[#이슈]` 형식·AI 서명 라인 금지.
- gradlew는 반드시 `backend/` 디렉터리에서 실행. `| tail` 파이프 금지(exit code 가림) — 출력에서 BUILD SUCCESSFUL 직접 확인.
- 구현 서브에이전트는 push·PR 생성 금지(리뷰 후 사용자 지시로만).
- 테스트 날짜는 상대 날짜만(하드코딩 미래 절대날짜 금지).

---

## File Structure

```
backend/src/main/resources/db/migration/V73__create_federation_faq.sql   [생성] 카테고리+FAQ 테이블+시드
backend/src/main/java/com/duing/domain/federation/
├── entity/FederationFaqCategory.java                                    [생성]
├── entity/FederationFaq.java                                            [생성]
├── repository/FederationFaqCategoryRepository.java                      [생성]
├── repository/FederationFaqRepository.java                              [생성]
├── repository/FederationFaqRepositoryCustom.java                        [생성]
├── repository/FederationFaqRepositoryImpl.java                          [생성] QueryDSL
├── exception/FederationFaqException.java                                [생성]
├── service/FederationFaqService.java                                    [생성] 인터페이스
├── service/GeneralFederationFaqService.java                             [생성]
├── service/dto/query/FederationFaqSearchCondition.java                  [생성]
├── api/FederationFaqApi.java                                            [생성] Swagger 인터페이스
├── controller/FederationFaqController.java                              [생성]
└── controller/dto/response/FederationFaqResponse.java                   [생성]
                          /FederationFaqCategoryResponse.java            [생성]
backend/src/main/java/com/duing/global/config/SecurityConfig.java        [수정] L89 인근 permitAll 3경로
backend/src/test/java/com/duing/domain/federation/
└── FederationFaqPublicAcceptanceTest.java                               [생성] RestAssured 인수 테스트
```

---

### Task 1: 브랜치 준비 + Flyway V73 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V73__create_federation_faq.sql`

- [ ] **Step 1: develop에서 브랜치 분기**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/federation-faq-public-api   # 이슈 번호가 배정되면 feat/{번호}-federation-faq-public-api
```

- [ ] **Step 2: 최신 마이그레이션 버전 확인 (V73이 비어 있는지)**

Run: `ls backend/src/main/resources/db/migration/ | sort -t V -k2 -n | tail -3`
Expected: 마지막 파일이 `V72__add_reservation_operating_hours.sql`. V73 이상이 이미 있으면 아래 파일명·본문 주석의 번호를 다음 빈 번호로 조정한다.

- [ ] **Step 3: V73 마이그레이션 작성**

`backend/src/main/resources/db/migration/V73__create_federation_faq.sql`:

```sql
-- 총동아리연합회(총동연) FAQ. 카테고리는 enum이 아닌 테이블 — 관리 주체가 개발팀이 아닌
-- 총동연(비개발자·매년 교체)이라 무배포 개편이 요구사항. (스펙 2026-07-04-federation-qna-design §4)
CREATE TABLE federation_faq_category (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uq_federation_faq_category_name
    ON federation_faq_category (name) WHERE deleted_at IS NULL;
ALTER TABLE federation_faq_category ENABLE ROW LEVEL SECURITY;

CREATE TABLE federation_faq (
    id           BIGSERIAL PRIMARY KEY,
    category_id  BIGINT NOT NULL REFERENCES federation_faq_category (id),
    question     VARCHAR(300) NOT NULL,
    answer       TEXT NOT NULL,               -- Markdown
    is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INT NOT NULL DEFAULT 0,
    view_count   BIGINT NOT NULL DEFAULT 0,   -- 증가 로직은 P2 (POST /view)
    author_id    BIGINT NOT NULL REFERENCES users (id),
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_faq_answer_length CHECK (char_length(answer) <= 4000)
);
CREATE INDEX idx_federation_faq_public
    ON federation_faq (is_published, is_pinned DESC, sort_order, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_faq_category
    ON federation_faq (category_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_faq ENABLE ROW LEVEL SECURITY;

-- 초기 카테고리 시드 — 이름·순서는 총동연이 admin 화면(P1-PR2)에서 변경 가능.
INSERT INTO federation_faq_category (name, sort_order) VALUES
    ('동아리 등록', 0),
    ('모집·행사', 1),
    ('지원사업·예산', 2),
    ('시설 이용', 3),
    ('기타', 4);
```

- [ ] **Step 4: RLS 규정 테스트로 마이그레이션 검증**

Run: `cd backend && ./gradlew test --tests "*RowLevelSecurity*"`
Expected: BUILD SUCCESSFUL (신규 2개 테이블에 ENABLE ROW LEVEL SECURITY가 있으므로 통과. 누락 시 여기서 실패)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V73__create_federation_faq.sql
git commit -m "feat(backend): 총동연 FAQ 카테고리·FAQ 테이블 마이그레이션(V73) 추가"
```

---

### Task 2: 엔티티 2종

**Files:**
- Create: `backend/src/main/java/com/duing/domain/federation/entity/FederationFaqCategory.java`
- Create: `backend/src/main/java/com/duing/domain/federation/entity/FederationFaq.java`

- [ ] **Step 1: FederationFaqCategory 엔티티 작성**

```java
package com.duing.domain.federation.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Getter
@Table(name = "federation_faq_category")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE federation_faq_category SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationFaqCategory extends BaseEntity {

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationFaqCategory(String name, int sortOrder) {
        this.name = name;
        this.sortOrder = sortOrder;
    }

    public static FederationFaqCategory create(String name, int sortOrder) {
        return FederationFaqCategory.builder()
                .name(name)
                .sortOrder(sortOrder)
                .build();
    }
}
```

- [ ] **Step 2: FederationFaq 엔티티 작성**

카테고리는 연관관계 대신 `categoryId Long` 보관 — notice 도메인의 `owningClubId` 패턴(이름 해석은 컨트롤러에서 소량 카테고리 Map 조회).

```java
package com.duing.domain.federation.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Getter
@Table(name = "federation_faq")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE federation_faq SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationFaq extends BaseEntity {

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(nullable = false, length = 300)
    private String question;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    @Column(name = "is_pinned", nullable = false)
    private boolean pinned;

    @Column(name = "is_published", nullable = false)
    private boolean published;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationFaq(Long categoryId, String question, String answer,
                          boolean pinned, boolean published, int sortOrder, Long authorId) {
        this.categoryId = categoryId;
        this.question = question;
        this.answer = answer;
        this.pinned = pinned;
        this.published = published;
        this.sortOrder = sortOrder;
        this.viewCount = 0L;
        this.authorId = authorId;
    }

    public static FederationFaq create(Long categoryId, String question, String answer,
                                       boolean pinned, boolean published, int sortOrder, Long authorId) {
        return FederationFaq.builder()
                .categoryId(categoryId)
                .question(question)
                .answer(answer)
                .pinned(pinned)
                .published(published)
                .sortOrder(sortOrder)
                .authorId(authorId)
                .build();
    }
}
```

- [ ] **Step 3: 컴파일 확인 (QueryDSL Q클래스 생성 포함)**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL, `build/generated/.../QFederationFaq.java` 생성됨

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/federation/entity/
git commit -m "feat(backend): 총동연 FAQ 엔티티 추가"
```

---

### Task 3: 리포지토리 (JPA + QueryDSL)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqCategoryRepository.java`
- Create: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqRepository.java`
- Create: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/federation/repository/FederationFaqRepositoryImpl.java`
- Create: `backend/src/main/java/com/duing/domain/federation/service/dto/query/FederationFaqSearchCondition.java`

- [ ] **Step 1: 검색 조건 query DTO**

```java
package com.duing.domain.federation.service.dto.query;

public record FederationFaqSearchCondition(
        Long categoryId,
        String keyword
) {
}
```

- [ ] **Step 2: 카테고리 리포지토리**

```java
package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqCategory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationFaqCategoryRepository extends JpaRepository<FederationFaqCategory, Long> {

    List<FederationFaqCategory> findAllByOrderBySortOrderAscIdAsc();
}
```

- [ ] **Step 3: FAQ 리포지토리 + Custom 인터페이스**

```java
package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaq;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationFaqRepository extends JpaRepository<FederationFaq, Long>, FederationFaqRepositoryCustom {
}
```

```java
package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationFaqRepositoryCustom {

    Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable);
}
```

- [ ] **Step 4: QueryDSL 구현체**

정렬은 스펙 §5 고정: pinned DESC → sort_order ASC → id DESC. soft delete 조건은 `@SQLRestriction` 암묵 적용에 의존하지 않고 명시한다(스펙 체크리스트).

```java
package com.duing.domain.federation.repository;

import static com.duing.domain.federation.entity.QFederationFaq.federationFaq;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class FederationFaqRepositoryImpl implements FederationFaqRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable) {
        List<FederationFaq> content = queryFactory
                .selectFrom(federationFaq)
                .where(
                        federationFaq.published.isTrue(),
                        federationFaq.deletedAt.isNull(),
                        categoryIdEq(condition.categoryId()),
                        keywordContains(condition.keyword())
                )
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
                .where(
                        federationFaq.published.isTrue(),
                        federationFaq.deletedAt.isNull(),
                        categoryIdEq(condition.categoryId()),
                        keywordContains(condition.keyword())
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0 : total);
    }

    private BooleanExpression categoryIdEq(Long categoryId) {
        return categoryId != null ? federationFaq.categoryId.eq(categoryId) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        return StringUtils.hasText(keyword)
                ? federationFaq.question.containsIgnoreCase(keyword)
                        .or(federationFaq.answer.containsIgnoreCase(keyword))
                : null;
    }
}
```

- [ ] **Step 5: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/federation/repository/ backend/src/main/java/com/duing/domain/federation/service/
git commit -m "feat(backend): 총동연 FAQ 리포지토리·검색 QueryDSL 추가"
```

---

### Task 4: 예외 + 서비스

**Files:**
- Create: `backend/src/main/java/com/duing/domain/federation/exception/FederationFaqException.java`
- Create: `backend/src/main/java/com/duing/domain/federation/service/FederationFaqService.java`
- Create: `backend/src/main/java/com/duing/domain/federation/service/GeneralFederationFaqService.java`

- [ ] **Step 1: 예외 클래스 (static inner 패턴 — NoticeException 동형)**

PR1은 NotFound만 사용. Category NotFound·NotEmpty는 admin CRUD(PR2)에서 추가한다.

```java
package com.duing.domain.federation.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FederationFaqException extends ApplicationException {

    protected FederationFaqException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class FederationFaqNotFoundException extends FederationFaqException {
        private static final String MESSAGE = "FAQ를 찾을 수 없습니다.";
        public FederationFaqNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
}
```

- [ ] **Step 2: 서비스 인터페이스**

```java
package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationFaqService {

    Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable);

    FederationFaq getPublished(Long faqId);

    List<FederationFaqCategory> getCategories();
}
```

- [ ] **Step 3: General 구현체**

```java
package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.exception.FederationFaqException;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFederationFaqService implements FederationFaqService {

    private final FederationFaqRepository federationFaqRepository;
    private final FederationFaqCategoryRepository categoryRepository;

    @Override
    public Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable) {
        return federationFaqRepository.searchPublished(condition, pageable);
    }

    @Override
    public FederationFaq getPublished(Long faqId) {
        // 비공개(is_published=false)도 404 — 존재 여부를 노출하지 않는다 (스펙 §5 공개 단건).
        return federationFaqRepository.findById(faqId)
                .filter(FederationFaq::isPublished)
                .orElseThrow(FederationFaqException.FederationFaqNotFoundException::new);
    }

    @Override
    public List<FederationFaqCategory> getCategories() {
        return categoryRepository.findAllByOrderBySortOrderAscIdAsc();
    }
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/federation/exception/ backend/src/main/java/com/duing/domain/federation/service/
git commit -m "feat(backend): 총동연 FAQ 조회 서비스·예외 추가"
```

---

### Task 5: 인수 테스트 먼저 작성 (RED)

**Files:**
- Test: `backend/src/test/java/com/duing/domain/federation/FederationFaqPublicAcceptanceTest.java`

- [ ] **Step 1: 인수 테스트 작성**

admin API가 없는 PR이므로 시딩은 리포지토리 직접 저장(NoticePublicAcceptanceTest의 saveUser 패턴 준용).

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
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationFaqPublicAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long authorId;
    private Long registrationCategoryId;
    private Long facilityCategoryId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        authorId = saveUser(UserRole.ADMIN).getId();
        // V73 시드와 이름 충돌을 피하기 위해 테스트 전용 카테고리를 생성한다.
        registrationCategoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-등록" + sequence.incrementAndGet(), 10)).getId();
        facilityCategoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-시설" + sequence.incrementAndGet(), 11)).getId();
    }

    @Test
    @DisplayName("비로그인 사용자도 공개 FAQ 목록을 고정 우선 순서로 조회할 수 있다")
    void anonymousFetchesPublishedFaqsPinnedFirst() {
        seedFaq(registrationCategoryId, "일반 질문", true, 5, false);
        seedFaq(registrationCategoryId, "고정 질문", true, 9, true);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data.content[0].question", equalTo("고정 질문"))
                .body("data.content[0].pinned", equalTo(true))
                .body("data.content[0].categoryName", startsWithTestRegistration());
    }

    @Test
    @DisplayName("비공개 FAQ는 목록에서 제외되고 단건 조회는 404를 반환한다")
    void unpublishedFaqIsHiddenFromListAndDetail() {
        Long hiddenFaqId = seedFaq(registrationCategoryId, "비공개 질문", false, 0, false);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.findAll { it.question == '비공개 질문' }.size()", equalTo(0));

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + hiddenFaqId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("공개 FAQ 단건은 딥링크용으로 비로그인 조회가 가능하다")
    void anonymousFetchesSinglePublishedFaq() {
        Long faqId = seedFaq(facilityCategoryId, "체육관 대여는 어떻게 하나요?", true, 0, false);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.question", equalTo("체육관 대여는 어떻게 하나요?"));
    }

    @Test
    @DisplayName("카테고리 필터와 키워드 검색이 함께 동작한다")
    void filtersByCategoryAndKeyword() {
        seedFaq(registrationCategoryId, "동아리 등록 절차", true, 0, false);
        seedFaq(facilityCategoryId, "체육관 대여 절차", true, 0, false);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs?categoryId=" + facilityCategoryId + "&keyword=대여")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1))
                .body("data.content[0].question", equalTo("체육관 대여 절차"));
    }

    @Test
    @DisplayName("카테고리 목록은 정렬순서대로 반환된다")
    void categoriesOrderedBySortOrder() {
        RestAssured.given()
            .when()
                .get("/api/v1/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                // V73 시드 첫 항목(sort_order=0)이 목록 맨 앞
                .body("data[0].name", equalTo("동아리 등록"));
    }

    @Test
    @DisplayName("같은 프리픽스의 비밀문의 경로는 익명 접근 시 401로 차단된다 — /federation/** 와일드카드 금지 잠금")
    void anonymousBlockedOnInquiryPrefix() {
        RestAssured.given()
            .when()
                .get("/api/v1/federation/inquiries/1")
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    // ---- helpers ----

    private org.hamcrest.Matcher<String> startsWithTestRegistration() {
        return org.hamcrest.Matchers.startsWith("테스트-등록");
    }

    private Long seedFaq(Long categoryId, String question, boolean published, int sortOrder, boolean pinned) {
        return faqRepository.save(FederationFaq.create(
                categoryId, question, "답변 본문입니다.", pinned, published, sortOrder, authorId)).getId();
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

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd backend && ./gradlew test --tests "*FederationFaqPublicAcceptanceTest*"`
Expected: FAIL — 컨트롤러 미구현으로 목록/단건/카테고리 테스트가 401 또는 404 (SecurityConfig 미등록 + 엔드포인트 부재). `anonymousBlockedOnInquiryPrefix`만 통과할 수 있음(anyRequest 규칙 덕).

- [ ] **Step 3: Commit (RED 상태 커밋)**

```bash
git add backend/src/test/java/com/duing/domain/federation/
git commit -m "test(backend): 총동연 FAQ 공개 API 인수 테스트 추가(RED)"
```

---

### Task 6: DTO + Api 인터페이스 + Controller + SecurityConfig (GREEN)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/federation/controller/dto/response/FederationFaqResponse.java`
- Create: `backend/src/main/java/com/duing/domain/federation/controller/dto/response/FederationFaqCategoryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/federation/api/FederationFaqApi.java`
- Create: `backend/src/main/java/com/duing/domain/federation/controller/FederationFaqController.java`
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java:89` (notices permitAll 라인 인근)

- [ ] **Step 1: 응답 DTO 2종**

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaq;

public record FederationFaqResponse(
        Long id,
        Long categoryId,
        String categoryName,
        String question,
        String answer,
        boolean pinned
) {
    public static FederationFaqResponse from(FederationFaq faq, String categoryName) {
        return new FederationFaqResponse(
                faq.getId(), faq.getCategoryId(), categoryName,
                faq.getQuestion(), faq.getAnswer(), faq.isPinned());
    }
}
```

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaqCategory;

public record FederationFaqCategoryResponse(
        Long id,
        String name,
        int sortOrder
) {
    public static FederationFaqCategoryResponse from(FederationFaqCategory category) {
        return new FederationFaqCategoryResponse(category.getId(), category.getName(), category.getSortOrder());
    }
}
```

- [ ] **Step 2: Api 인터페이스 (Contract-first)**

```java
package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.response.FederationFaqCategoryResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqResponse;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "총동연 FAQ", description = "총동아리연합회 FAQ 공개 조회 API (비로그인 접근 가능)")
public interface FederationFaqApi {

    @Operation(summary = "FAQ 목록", description = "공개(published) FAQ만 반환. 정렬: 고정 우선 → 정렬순서 → 최신순.")
    @GetMapping("/federation/faqs")
    ResponseEntity<ApiResponse<PageResponse<FederationFaqResponse>>> getFaqs(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "FAQ 단건", description = "딥링크(/faq?item={id})용. 비공개·삭제 항목은 404.")
    @GetMapping("/federation/faqs/{faqId}")
    ResponseEntity<ApiResponse<FederationFaqResponse>> getFaq(@PathVariable Long faqId);

    @Operation(summary = "FAQ 카테고리 목록", description = "정렬순서(sort_order) 오름차순.")
    @GetMapping("/federation/faq-categories")
    ResponseEntity<ApiResponse<List<FederationFaqCategoryResponse>>> getCategories();
}
```

- [ ] **Step 3: Controller**

```java
package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.FederationFaqApi;
import com.duing.domain.federation.controller.dto.response.FederationFaqCategoryResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqResponse;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.FederationFaqService;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FederationFaqController implements FederationFaqApi {

    private final FederationFaqService federationFaqService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FederationFaqResponse>>> getFaqs(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            Pageable pageable
    ) {
        FederationFaqSearchCondition condition = new FederationFaqSearchCondition(categoryId, keyword);
        Page<FederationFaq> faqPage = federationFaqService.searchPublished(condition, pageable);
        Map<Long, String> categoryNames = categoryNameMap();
        Page<FederationFaqResponse> responsePage = faqPage.map(
                faq -> FederationFaqResponse.from(faq, categoryNames.get(faq.getCategoryId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(responsePage)));
    }

    @Override
    public ResponseEntity<ApiResponse<FederationFaqResponse>> getFaq(@PathVariable Long faqId) {
        FederationFaq faq = federationFaqService.getPublished(faqId);
        return ResponseEntity.ok(ApiResponse.success(
                FederationFaqResponse.from(faq, categoryNameMap().get(faq.getCategoryId()))));
    }

    @Override
    public ResponseEntity<ApiResponse<List<FederationFaqCategoryResponse>>> getCategories() {
        List<FederationFaqCategoryResponse> categories = federationFaqService.getCategories().stream()
                .map(FederationFaqCategoryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(categories));
    }

    // 카테고리는 소량(≤10)이라 페이지마다 전체 Map 조회로 이름을 해석한다 — notice 의 clubNames 패턴.
    private Map<Long, String> categoryNameMap() {
        return federationFaqService.getCategories().stream()
                .collect(Collectors.toMap(FederationFaqCategory::getId, FederationFaqCategory::getName, (a, b) -> a));
    }
}
```

- [ ] **Step 4: SecurityConfig permitAll — 정확 경로 3개만**

`SecurityConfig.java`의 `.requestMatchers(HttpMethod.GET, "/api/v1/notices", ...)` 라인(현재 L89) 아래에 추가:

```java
                        // 총동연 FAQ 공개 GET — 정확 경로만 허용. "/api/v1/federation/**" 와일드카드 금지:
                        // 같은 프리픽스의 비밀문의(/federation/inquiries/**)가 URL 레이어 방어를 잃는다.
                        // (스펙 2026-07-04-federation-qna-design §5, 회귀 잠금: FederationFaqPublicAcceptanceTest)
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/federation/faqs",
                                "/api/v1/federation/faqs/*",
                                "/api/v1/federation/faq-categories").permitAll()
```

- [ ] **Step 5: 인수 테스트 통과 확인 (GREEN)**

Run: `cd backend && ./gradlew test --tests "*FederationFaqPublicAcceptanceTest*"`
Expected: BUILD SUCCESSFUL, 6개 테스트 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/federation/ backend/src/main/java/com/duing/global/config/SecurityConfig.java
git commit -m "feat(backend): 총동연 FAQ 공개 조회 API 3종 구현"
```

---

### Task 7: 전체 테스트 + 리뷰 게이트

- [ ] **Step 1: 백엔드 전체 테스트 (Docker 필요)**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — 특히 `RowLevelSecurityMigrationTest`(신규 테이블 RLS)와 기존 Security 관련 테스트 회귀 없음 확인. 출력에서 BUILD SUCCESSFUL 문자열을 직접 확인한다(`| tail` 금지).

- [ ] **Step 2: 리뷰 디스패치**

duing-code-reviewer + codex:review 를 이 브랜치 diff에 대해 실행한다. SecurityConfig(권한) 변경이 포함되므로 codex:adversarial-review 도 추가한다(리뷰 정책). 리뷰 지적 반영 후 재실행.

- [ ] **Step 3: PR 준비 (push·PR 생성은 사용자 지시 후)**

PR 본문(🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항)에 다음을 자연스러운 문장으로 담는다: 총동연 FAQ 공개 조회 3종과 카테고리 시드, permitAll을 정확 경로로 제한한 이유(비밀문의 방어층), 카테고리를 enum이 아닌 테이블로 둔 이유. 파일·클래스명 나열 금지.

---

## Self-Review 결과

- 스펙 커버리지: §4 V73 DDL(시드 포함) → Task 1, 엔티티 규약 → Task 2, §5 공개 API 3종·정렬·404 규칙 → Task 4·6, permitAll 정확 경로+회귀 잠금 → Task 5·6. PR1 범위 밖(§5 admin·문의·알림)은 PR2·PR3 계획에서.
- 타입 일관성: `FederationFaqSearchCondition(categoryId, keyword)` — Task 3 정의·Task 6 사용 일치. `FederationFaq.create(categoryId, question, answer, pinned, published, sortOrder, authorId)` — Task 2 정의·Task 5 시더 사용 일치(인자 순서 확인 완료).
- 플레이스홀더 없음. 모든 코드 블록은 완전한 컴파일 가능 코드.
- 주의: `User.create` 시그니처는 NoticePublicAcceptanceTest 기준 — 실행 시점에 시그니처가 바뀌었으면 해당 테스트를 다시 참조할 것.
