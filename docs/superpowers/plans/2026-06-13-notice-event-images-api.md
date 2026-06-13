# 단위 A — 공지 행사정보·다중 본문 이미지 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Notice`에 구조화된 행사정보(일시·장소·주최·대상)와 다중 본문 이미지(`bodyImageUrls`)를 추가하고, 공지 상세 응답에 `eventInfo`(nullable)·`bodyImageUrls`로 노출한다.

**Architecture:** 단일 `notice` 테이블에 nullable 컬럼을 평면 추가(별도 테이블·JSON 미사용). 행사 다섯 필드가 모두 null이면 응답 `eventInfo`는 `null`. 본문 이미지는 기존 `tags`의 `text[]` 패턴을 그대로 따른다. 기존 create/update 흐름(Request → Command → `Notice.create`/`update`)에 필드를 통과시키고, `Notice.create` 두 호출부(어드민·클럽)를 함께 수정한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA(Hibernate) / Flyway / PostgreSQL `text[]` / RestAssured + Testcontainers 통합 테스트.

**스펙:** `docs/superpowers/specs/2026-06-13-notice-detail-redesign-design.md` §3.

**전제:** Testcontainers 사용 — 로컬 Docker 데몬이 켜져 있어야 테스트가 돈다.

> **TDD 메모:** 마이그레이션 + 엔티티 + Command/Request DTO + Response + Service 는 서로 컴파일 의존이 묶인 하나의 수직 슬라이스라, 필드 단위 red-green 이 비현실적이다. 따라서 **슬라이스를 먼저 구현(기존 테스트는 계속 green)** 한 뒤 **새 인수 테스트(Task 4)** 로 신규 동작을 검증한다. 각 커밋 시점마다 컴파일·기존 테스트가 통과한다.

---

## 파일 구조

| 파일 | 책임 | 작업 |
|------|------|------|
| `backend/src/main/resources/db/migration/V52__add_notice_event_and_images.sql` | 행사 5컬럼 + `body_image_urls` 추가 | Create |
| `backend/.../notice/exception/NoticeException.java` | 행사 검증 실패 예외 추가 | Modify |
| `backend/.../notice/entity/Notice.java` | 행사·이미지 필드, 빌더, `create()`, `UpdatePayload`, `update()`, 검증 | Modify |
| `backend/.../notice/service/dto/command/CreateNoticeCommand.java` | 행사·이미지 필드 | Modify |
| `backend/.../notice/service/dto/command/UpdateNoticeCommand.java` | 행사·이미지·`clearEvent` 필드 | Modify |
| `backend/.../notice/controller/dto/request/CreateNoticeRequest.java` | 행사·이미지 필드 + 검증 + `toCommand` | Modify |
| `backend/.../notice/controller/dto/request/UpdateNoticeRequest.java` | 행사·이미지·`clearEvent` 필드 + `toCommand` | Modify |
| `backend/.../notice/controller/dto/response/NoticeDetailResponse.java` | `bodyImageUrls` + 중첩 `EventInfo` | Modify |
| `backend/.../notice/service/GeneralNoticeService.java` | `Notice.create` 2개 호출부(어드민·클럽) 인자 전달 | Modify |
| `backend/.../global/file/controller/dto/FilePurpose.java` | `NOTICE_BODY("notice/body")` 추가 | Modify |
| `backend/src/test/.../notice/NoticeAdminAcceptanceTest.java` | 행사·이미지 왕복/검증/clearEvent 인수 테스트 | Modify |

`NoticeController`(공개)·`AdminNoticeController` 의 `NoticeDetailResponse.from(...)` 호출은 **시그니처 무변경**(필드는 `from` 내부에서 추가) — 수정 불필요.

---

## Task 0: 작업 브랜치 생성

**Files:** 없음 (git)

- [ ] **Step 1: develop 최신화 후 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull --ff-only
git checkout -b feat/notice-event-images-api
```

Expected: `Switched to a new branch 'feat/notice-event-images-api'`

---

## Task 1: Flyway 마이그레이션 (스키마)

**Files:**
- Create: `backend/src/main/resources/db/migration/V52__add_notice_event_and_images.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`V52__add_notice_event_and_images.sql`:

```sql
ALTER TABLE notice
    ADD COLUMN event_start_at  TIMESTAMP    NULL,
    ADD COLUMN event_end_at    TIMESTAMP    NULL,
    ADD COLUMN location        VARCHAR(200) NULL,
    ADD COLUMN host            VARCHAR(200) NULL,
    ADD COLUMN audience        VARCHAR(200) NULL,
    ADD COLUMN body_image_urls TEXT[]       NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: 앱 부팅 + 기존 공지 테스트로 마이그레이션 검증**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.notice.NoticePublicAcceptanceTest"`
Expected: PASS (Flyway 가 V52 까지 적용된 상태로 부팅, 기존 동작 무변경)

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/resources/db/migration/V52__add_notice_event_and_images.sql
git commit -m "feat(backend): 공지 행사정보·본문 이미지 컬럼 추가 (V52)"
```

---

## Task 2: 수직 슬라이스 — 엔티티·DTO·서비스 배선

각 Step 은 한 파일의 완성된 변경이다. 마지막 Step 에서 컴파일 + 기존 테스트를 검증한 뒤 커밋한다.

**Files:**
- Modify: `backend/.../global/file/controller/dto/FilePurpose.java`
- Modify: `backend/.../notice/exception/NoticeException.java`
- Modify: `backend/.../notice/entity/Notice.java`
- Modify: `backend/.../notice/service/dto/command/CreateNoticeCommand.java`
- Modify: `backend/.../notice/service/dto/command/UpdateNoticeCommand.java`
- Modify: `backend/.../notice/controller/dto/request/CreateNoticeRequest.java`
- Modify: `backend/.../notice/controller/dto/request/UpdateNoticeRequest.java`
- Modify: `backend/.../notice/controller/dto/response/NoticeDetailResponse.java`
- Modify: `backend/.../notice/service/GeneralNoticeService.java`

- [ ] **Step 1: `FilePurpose` 에 NOTICE_BODY 추가**

`FilePurpose.java` — enum 상수 목록에 한 줄 추가 (`NOTICE_COVER` 다음):

```java
    NOTICE_COVER("notice/cover"),
    NOTICE_BODY("notice/body"),
```

- [ ] **Step 2: `NoticeException` 에 행사 검증 예외 추가**

`NoticeException.java` — `InvalidCoverImageUrlException` 클래스 아래에 추가:

```java
    public static class InvalidNoticeEventException extends NoticeException {
        public InvalidNoticeEventException(String reason) {
            super("공지 행사 정보가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 3: `Notice` 엔티티 — 필드 추가**

`Notice.java` — `authorId` 필드 선언 아래에 추가:

```java
    @Column(name = "event_start_at") private LocalDateTime eventStartAt;
    @Column(name = "event_end_at")   private LocalDateTime eventEndAt;
    @Column(length = 200) private String location;
    @Column(length = 200) private String host;
    @Column(length = 200) private String audience;

    @Column(name = "body_image_urls", columnDefinition = "_text", nullable = false)
    private String[] bodyImageUrls = new String[0];
```

`getTags()` 메서드 아래에 getter 추가:

```java
    public List<String> getBodyImageUrls() {
        return bodyImageUrls == null ? Collections.emptyList()
                : Collections.unmodifiableList(Arrays.asList(bodyImageUrls));
    }
```

- [ ] **Step 4: `Notice` 빌더 생성자에 인자 추가**

`Notice.java` — private `@Builder` 생성자의 파라미터 목록 끝(`Long authorId` 앞)에 추가하고, 본문에 대입:

파라미터(`... boolean notifyOnPublish, Long authorId)` 를 다음으로 교체:

```java
    private Notice(String title, String summary, String content, String coverImageUrl, String linkUrl,
                   NoticeCategory category, String[] tags, NoticeVisibility visibility,
                   NoticeClubScopeRole clubScopeRole, boolean pinned, LocalDateTime expiresAt,
                   boolean notifyOnPublish,
                   LocalDateTime eventStartAt, LocalDateTime eventEndAt,
                   String location, String host, String audience, String[] bodyImageUrls,
                   Long authorId) {
        this.title = title;
        this.summary = summary;
        this.content = content;
        this.coverImageUrl = coverImageUrl;
        this.linkUrl = linkUrl;
        this.category = category;
        this.tags = tags == null ? new String[0] : tags.clone();
        this.visibility = visibility;
        this.clubScopeRole = clubScopeRole;
        this.pinned = pinned;
        this.expiresAt = expiresAt;
        this.notifyOnPublish = notifyOnPublish;
        this.eventStartAt = eventStartAt;
        this.eventEndAt = eventEndAt;
        this.location = location;
        this.host = host;
        this.audience = audience;
        this.bodyImageUrls = bodyImageUrls == null ? new String[0] : bodyImageUrls.clone();
        this.authorId = authorId;
    }
```

- [ ] **Step 5: `Notice.create()` 시그니처·본문 수정**

`Notice.java` — `create(...)` 를 다음으로 교체:

```java
    public static Notice create(String title, String summary, String content, String coverImageUrl,
                                String linkUrl, NoticeCategory category, List<String> tags,
                                NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
                                boolean pinned, LocalDateTime expiresAt, boolean notifyOnPublish,
                                LocalDateTime eventStartAt, LocalDateTime eventEndAt,
                                String location, String host, String audience, List<String> bodyImageUrls,
                                Long authorId) {
        validateScope(visibility, clubScopeRole);
        validateEventRange(eventStartAt, eventEndAt);
        boolean normalizedNotify = (visibility != NoticeVisibility.PUBLIC) || notifyOnPublish;
        String[] tagArray = tags == null
                ? new String[0]
                : tags.stream().distinct().toArray(String[]::new);
        String[] bodyImageArray = bodyImageUrls == null
                ? new String[0]
                : bodyImageUrls.toArray(String[]::new);
        return Notice.builder()
                .title(title).summary(summary).content(content)
                .coverImageUrl(coverImageUrl).linkUrl(linkUrl)
                .category(category).tags(tagArray)
                .visibility(visibility).clubScopeRole(clubScopeRole)
                .pinned(pinned).expiresAt(expiresAt)
                .notifyOnPublish(normalizedNotify)
                .eventStartAt(eventStartAt).eventEndAt(eventEndAt)
                .location(location).host(host).audience(audience)
                .bodyImageUrls(bodyImageArray)
                .authorId(authorId)
                .build();
    }
```

- [ ] **Step 6: `UpdatePayload` 확장 + `update()` 에 행사·이미지 반영 + 검증 헬퍼**

`Notice.java` — `UpdatePayload` record 를 교체:

```java
    public record UpdatePayload(
            String title, String summary, String content, String coverImageUrl, String linkUrl,
            NoticeCategory category, List<String> tags,
            NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
            Boolean pinned, LocalDateTime expiresAt, Boolean clearExpiresAt,
            Boolean notifyOnPublish,
            LocalDateTime eventStartAt, LocalDateTime eventEndAt,
            String location, String host, String audience, Boolean clearEvent,
            List<String> bodyImageUrls
    ) {}
```

`update(...)` 메서드 본문에서, `notifyOnPublish` 처리 블록(아래 앵커)

```java
        if (payload.notifyOnPublish() != null && this.visibility == NoticeVisibility.PUBLIC) {
            this.notifyOnPublish = payload.notifyOnPublish();
        }
```

바로 다음(메서드 닫는 `}` 직전)에 추가:

```java
        boolean clearEvent = Boolean.TRUE.equals(payload.clearEvent());
        LocalDateTime nextEventStart = clearEvent ? null
                : (payload.eventStartAt() != null ? payload.eventStartAt() : this.eventStartAt);
        LocalDateTime nextEventEnd = clearEvent ? null
                : (payload.eventEndAt() != null ? payload.eventEndAt() : this.eventEndAt);
        validateEventRange(nextEventStart, nextEventEnd);
        if (clearEvent) {
            this.eventStartAt = null;
            this.eventEndAt = null;
            this.location = null;
            this.host = null;
            this.audience = null;
        } else {
            if (payload.eventStartAt() != null) this.eventStartAt = payload.eventStartAt();
            if (payload.eventEndAt() != null) this.eventEndAt = payload.eventEndAt();
            if (payload.location() != null) this.location = payload.location();
            if (payload.host() != null) this.host = payload.host();
            if (payload.audience() != null) this.audience = payload.audience();
        }
        if (payload.bodyImageUrls() != null) {
            this.bodyImageUrls = payload.bodyImageUrls().toArray(String[]::new);
        }
```

그리고 `validateScope(...)` private static 메서드 아래에 검증 헬퍼 추가:

```java
    private static void validateEventRange(LocalDateTime start, LocalDateTime end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new NoticeException.InvalidNoticeEventException("종료 일시가 시작 일시보다 빠를 수 없습니다.");
        }
    }
```

- [ ] **Step 7: `CreateNoticeCommand` 에 필드 추가**

`CreateNoticeCommand.java` — record 컴포넌트에서 `boolean notifyOnPublish,` 다음, `Long authorId` 앞에 추가:

```java
        boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        String location,
        String host,
        String audience,
        List<String> bodyImageUrls,
        Long authorId
```

- [ ] **Step 8: `UpdateNoticeCommand` 에 필드 추가**

`UpdateNoticeCommand.java` — `Boolean notifyOnPublish` 다음(마지막)에 추가:

```java
        Boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        String location,
        String host,
        String audience,
        Boolean clearEvent,
        List<String> bodyImageUrls
```

- [ ] **Step 9: `CreateNoticeRequest` 에 필드·검증·`toCommand` 반영**

`CreateNoticeRequest.java` — record 컴포넌트에서 `boolean notifyOnPublish` 다음에 추가:

```java
        boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        @Size(max = 200) String location,
        @Size(max = 200) String host,
        @Size(max = 200) String audience,
        @Size(max = 20) List<@Size(max = 500) String> bodyImageUrls
```

`toCommand(...)` 를 교체:

```java
    public CreateNoticeCommand toCommand(Long authorId) {
        return new CreateNoticeCommand(
                title, summary, content, coverImageUrl, linkUrl,
                category, tags == null ? List.of() : tags,
                visibility, clubScopeRole,
                targetClubIds == null ? List.of() : targetClubIds,
                pinned, expiresAt, notifyOnPublish,
                eventStartAt, eventEndAt, location, host, audience,
                bodyImageUrls == null ? List.of() : bodyImageUrls,
                authorId
        );
    }
```

- [ ] **Step 10: `UpdateNoticeRequest` 에 필드·`toCommand` 반영**

`UpdateNoticeRequest.java` — record 컴포넌트에서 `Boolean notifyOnPublish` 다음에 추가:

```java
        Boolean notifyOnPublish,
        LocalDateTime eventStartAt,
        LocalDateTime eventEndAt,
        @Size(max = 200) String location,
        @Size(max = 200) String host,
        @Size(max = 200) String audience,
        Boolean clearEvent,
        @Size(max = 20) List<@Size(max = 500) String> bodyImageUrls
```

`toCommand(...)` 를 교체:

```java
    public UpdateNoticeCommand toCommand(Long noticeId) {
        return new UpdateNoticeCommand(
                noticeId, title, summary, content, coverImageUrl, linkUrl,
                category, tags, visibility, clubScopeRole, targetClubIds,
                pinned, expiresAt, clearExpiresAt, notifyOnPublish,
                eventStartAt, eventEndAt, location, host, audience, clearEvent, bodyImageUrls
        );
    }
```

- [ ] **Step 11: `NoticeDetailResponse` 에 `bodyImageUrls` + 중첩 `EventInfo` 추가**

`NoticeDetailResponse.java` 전체를 교체:

```java
package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record NoticeDetailResponse(
        Long id,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        boolean pinned,
        LocalDateTime expiresAt,
        boolean notifyOnPublish,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<String> bodyImageUrls,
        EventInfo eventInfo
) {
    public record EventInfo(
            LocalDateTime startAt,
            LocalDateTime endAt,
            String location,
            String host,
            String audience
    ) {
        static EventInfo from(Notice notice) {
            if (notice.getEventStartAt() == null && notice.getEventEndAt() == null
                    && notice.getLocation() == null && notice.getHost() == null
                    && notice.getAudience() == null) {
                return null;
            }
            return new EventInfo(
                    notice.getEventStartAt(), notice.getEventEndAt(),
                    notice.getLocation(), notice.getHost(), notice.getAudience());
        }
    }

    public static NoticeDetailResponse from(Notice notice, List<Long> targetClubIds, boolean exposeAdminFields) {
        return new NoticeDetailResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(), notice.getContent(),
                notice.getCoverImageUrl(), notice.getLinkUrl(),
                notice.getCategory(), notice.getTags(),
                exposeAdminFields ? notice.getVisibility() : null,
                exposeAdminFields ? notice.getClubScopeRole() : null,
                exposeAdminFields ? targetClubIds : null,
                notice.isPinned(), notice.getExpiresAt(),
                exposeAdminFields && notice.isNotifyOnPublish(),
                notice.getCreatedAt(), notice.getUpdatedAt(),
                notice.getBodyImageUrls(),
                EventInfo.from(notice)
        );
    }
}
```

- [ ] **Step 12: `GeneralNoticeService` — 어드민 create 호출부 인자 전달**

`GeneralNoticeService.java` `create(...)` 내부의 `Notice.create(...)` 호출(현재 L48~55)을 교체:

```java
        Notice saved = noticeRepository.save(Notice.create(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.linkUrl(),
                command.category(), command.tags(),
                command.visibility(), command.clubScopeRole(),
                command.pinned(), command.expiresAt(), command.notifyOnPublish(),
                command.eventStartAt(), command.eventEndAt(),
                command.location(), command.host(), command.audience(), command.bodyImageUrls(),
                command.authorId()
        ));
```

- [ ] **Step 13: `GeneralNoticeService` — update payload 인자 전달**

`update(...)` 내부의 `found.update(new Notice.UpdatePayload(...))` 호출(현재 L82~89)을 교체:

```java
        found.update(new Notice.UpdatePayload(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.linkUrl(),
                command.category(), command.tags(),
                command.visibility(), command.clubScopeRole(),
                command.pinned(), command.expiresAt(), command.clearExpiresAt(),
                command.notifyOnPublish(),
                command.eventStartAt(), command.eventEndAt(),
                command.location(), command.host(), command.audience(), command.clearEvent(),
                command.bodyImageUrls()
        ));
```

- [ ] **Step 14: `GeneralNoticeService` — 클럽 create 호출부 인자 전달**

`createForClub(...)` 내부의 `Notice.create(...)` 호출(현재 L138~148)을 교체 (행사·이미지 없음 → null/빈 리스트):

```java
        Notice saved = noticeRepository.save(Notice.create(
                command.title(), safeSummary, command.content(),
                safeCoverImageUrl, null /* linkUrl */,
                NoticeCategory.GENERAL,
                List.of() /* tags */,
                NoticeVisibility.CLUB_SCOPED,
                NoticeClubScopeRole.ALL_MEMBERS,
                command.pinned(), command.expiresAt(), false /* notifyOnPublish */,
                null, null, null, null, null /* event */, List.of() /* bodyImageUrls */,
                command.authorId()
        ));
```

- [ ] **Step 15: 컴파일 + 기존 공지 테스트 통과 확인**

Run: `cd backend && ./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL

Run: `cd backend && ./gradlew test --tests "com.duing.domain.notice.*"`
Expected: PASS (신규 필드는 전부 optional·기본 빈값이라 기존 동작 무변경)

- [ ] **Step 16: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java
git commit -m "feat(backend): 공지 행사정보·본문 이미지 응답 노출 및 생성·수정 배선"
```

---

## Task 3: 인수 테스트 — 행사·이미지 왕복 / 검증 / clearEvent

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/notice/NoticeAdminAcceptanceTest.java`

기존 import 에 다음 **2개만** 추가한다(파일 상단 정적 import 블록). `equalTo`·`notNullValue` 는 이미 import 되어 있으므로 다시 넣지 말 것(중복 import = 컴파일 에러):

```java
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.hasSize;
```

- [ ] **Step 1: 행사·이미지 왕복 테스트 작성**

`NoticeAdminAcceptanceTest` 클래스 안(마지막 `@Test` 다음, `saveUser` 앞)에 추가:

```java
    @Test
    @DisplayName("행사정보와 본문 이미지가 담긴 공지를 작성하면 상세 응답에 eventInfo·bodyImageUrls 가 노출된다")
    void noticeWithEventAndBodyImagesIsExposedInDetail() {
        Long noticeId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "동아리 박람회",
                      "summary": "가을 박람회 안내",
                      "content": "본문",
                      "coverImageUrl": "https://example.com/cover.png",
                      "category": "FAIR",
                      "visibility": "PUBLIC",
                      "pinned": false,
                      "notifyOnPublish": false,
                      "eventStartAt": "2026-09-25T10:00:00",
                      "eventEndAt": "2026-09-27T18:00:00",
                      "location": "중앙광장 · 학생회관 1층",
                      "host": "학생자치회",
                      "audience": "재학생 누구나",
                      "bodyImageUrls": ["https://example.com/b1.png", "https://example.com/b2.png"]
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/notices/" + noticeId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.eventInfo", notNullValue())
                .body("data.eventInfo.location", equalTo("중앙광장 · 학생회관 1층"))
                .body("data.eventInfo.host", equalTo("학생자치회"))
                .body("data.eventInfo.audience", equalTo("재학생 누구나"))
                .body("data.bodyImageUrls", hasSize(2))
                .body("data.bodyImageUrls[0]", equalTo("https://example.com/b1.png"));
    }
```

- [ ] **Step 2: 행사정보 없는 공지는 eventInfo 가 null 인지 테스트 작성**

이어서 추가:

```java
    @Test
    @DisplayName("행사정보가 없는 공지는 상세 응답의 eventInfo 가 null 이고 bodyImageUrls 는 빈 배열이다")
    void noticeWithoutEventHasNullEventInfo() {
        Long noticeId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "일반 공지", "summary": "요약", "content": "본문",
                      "coverImageUrl": "https://example.com/c.png",
                      "category": "GENERAL", "visibility": "PUBLIC",
                      "pinned": false, "notifyOnPublish": false
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/notices/" + noticeId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.eventInfo", nullValue())
                .body("data.bodyImageUrls", hasSize(0));
    }
```

- [ ] **Step 3: 종료 < 시작 행사 검증 테스트 작성**

이어서 추가:

```java
    @Test
    @DisplayName("행사 종료 일시가 시작보다 빠르면 400 을 반환한다")
    void createNoticeWithReversedEventRangeReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "행사", "summary": "요약", "content": "본문",
                      "coverImageUrl": "https://example.com/c.png",
                      "category": "FESTIVAL", "visibility": "PUBLIC",
                      "pinned": false, "notifyOnPublish": false,
                      "eventStartAt": "2026-09-27T18:00:00",
                      "eventEndAt": "2026-09-25T10:00:00"
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }
```

- [ ] **Step 4: clearEvent 로 행사정보 초기화 테스트 작성**

이어서 추가:

```java
    @Test
    @DisplayName("clearEvent=true 로 수정하면 행사정보가 모두 비워진다")
    void updateWithClearEventRemovesEventInfo() {
        Long noticeId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "행사", "summary": "요약", "content": "본문",
                      "coverImageUrl": "https://example.com/c.png",
                      "category": "FESTIVAL", "visibility": "PUBLIC",
                      "pinned": false, "notifyOnPublish": false,
                      "eventStartAt": "2026-09-25T10:00:00", "location": "광장"
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"clearEvent\": true }")
            .when()
                .patch("/api/v1/admin/notices/" + noticeId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/notices/" + noticeId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.eventInfo", nullValue());
    }
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.notice.NoticeAdminAcceptanceTest"`
Expected: PASS (신규 4개 + 기존 3개)

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/notice/NoticeAdminAcceptanceTest.java
git commit -m "test(backend): 공지 행사정보·본문 이미지 왕복·검증·clearEvent 인수 테스트"
```

---

## Task 4: 전체 백엔드 테스트 회귀

**Files:** 없음

- [ ] **Step 1: 도메인 전체 회귀 확인**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (전체 통과)

> 실패 시 systematic-debugging 으로 원인 분석 후 수정. PR 생성은 **사용자 지시 전까지 금지**(메모리 정책).

---

## 완료 정의 (Definition of Done)
- `V52` 마이그레이션으로 행사 5컬럼 + `body_image_urls` 추가.
- 어드민 create/update 로 행사·이미지 입력 가능, 종료<시작 시 400.
- 공개·어드민 상세 응답에 `eventInfo`(없으면 null)·`bodyImageUrls` 노출.
- 클럽 공지 경로 정상(행사·이미지 없음).
- `./gradlew test` 전체 green. 커밋 4개(브랜치 제외), **푸시·PR 미수행**.
