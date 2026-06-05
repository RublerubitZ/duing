# PR1 — GlobalEvent 표지 이미지 백엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GlobalEvent` 엔티티에 단일 표지 이미지 (`coverImageUrl`) 를 optional 필드로 추가하고, 공개·어드민 상세 응답에 노출 + `clearCoverImage` PATCH 시맨틱 + `FilePurpose.GLOBAL_EVENT_COVER` enum 확장 + acceptance 테스트.

**Architecture:** PR #238 의 도메인 구조 (`com.duing.domain.globalevent`) 를 확장. `Club.clearCollege` 패턴 차용해 PATCH 의 null vs 누락 vs 명시적 clear 를 `clearCoverImage: Boolean` 플래그로 명료화. 카드/목록 응답 (`GlobalEventCardResponse`, `AdminGlobalEventSummaryResponse`) 은 응답 경량화 위해 손대지 않음. 신규 컨트롤러/서비스 없음 — 기존 `FileController` 의 `/api/v1/files?purpose=GLOBAL_EVENT_COVER` 그대로 사용.

**Tech Stack:** Spring Boot 3.4 · Java 21 · JPA · Flyway · RestAssured + TestContainers.

**브랜치:** `feat/global-event-cover-image-backend` (develop 분기).

**spec 참조:** [`docs/superpowers/specs/2026-06-05-global-event-cover-image.md`](../specs/2026-06-05-global-event-cover-image.md) §1.

---

## 사전 컨벤션 (모든 task 공통)

- DTO 는 Java `record`. validation 메시지 한국어.
- 변수명 풀네임 (`coverImageUrl`, `clearCoverImage`, `event` — `c`, `e`, `flag` 금지).
- import 순서: `java → jakarta → spring → com.duing.global → com.duing.domain → lombok`.
- 커밋 메시지 Conventional Commits (`feat(backend): ...`). `[#이슈번호]` 형식 금지. Claude attribution 금지.
- 빌드 검증: 한 task 마지막 step 에서 `cd backend && ./gradlew compileJava`.

---

## File Structure (전체 PR 산출물)

**수정**
```
backend/src/main/java/com/duing/global/file/controller/dto/
└── FilePurpose.java                                    # GLOBAL_EVENT_COVER 추가

backend/src/main/java/com/duing/domain/globalevent/
├── entity/GlobalEvent.java                             # coverImageUrl 필드 + update 시그니처
├── controller/dto/request/CreateGlobalEventRequest.java
├── controller/dto/request/UpdateGlobalEventRequest.java   # + clearCoverImage
├── controller/dto/response/GlobalEventDetailResponse.java
├── controller/dto/response/AdminGlobalEventDetailResponse.java
├── service/dto/command/CreateGlobalEventCommand.java
└── service/dto/command/UpdateGlobalEventCommand.java      # + clearCoverImage

backend/src/test/java/com/duing/domain/globalevent/
└── GlobalEventAcceptanceTest.java                      # 3 케이스 추가
```

**신규**
```
backend/src/main/resources/db/migration/
└── V36__alter_global_event_add_cover_image.sql
```

---

## Task 1: 마이그레이션 + enum 확장

DB 컬럼 추가 + `FilePurpose` enum 한 줄 추가. 가장 작고 독립적인 변경.

**Files:**
- Create: `backend/src/main/resources/db/migration/V36__alter_global_event_add_cover_image.sql`
- Modify: `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- global_event 에 표지 이미지 URL 컬럼 추가 (optional)
ALTER TABLE global_event
    ADD COLUMN cover_image_url VARCHAR(500);
```

NULL 허용. 인덱스 추가 없음 (조회 조건 아님).

- [ ] **Step 2: `FilePurpose` enum 에 `GLOBAL_EVENT_COVER` 추가**

`Read` 로 현재 `FilePurpose.java` 확인 후 마지막 enum 값 (`PROMOTION_BANNER`) 다음에 추가:

```java
public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover"),
    PROMOTION_BANNER("promotion/banner"),
    GLOBAL_EVENT_COVER("global-event/cover");   // 추가

    private final String directory;

    FilePurpose(String directory) {
        this.directory = directory;
    }

    public String directory() {
        return directory;
    }
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/resources/db/migration/V36__alter_global_event_add_cover_image.sql \
        backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java
git commit -m "feat(backend): GlobalEvent cover_image_url 컬럼 + FilePurpose.GLOBAL_EVENT_COVER 추가"
```

---

## Task 2: 엔티티 확장 (`coverImageUrl` 필드 + `update` 시그니처)

`Club.clearCollege` 패턴을 따라 PATCH 시 null vs 누락 vs 명시적 clear 를 별도 `Boolean clearCoverImage` 인자로 구분.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/globalevent/entity/GlobalEvent.java`

- [ ] **Step 1: `Read` 로 현재 엔티티 확인**

`backend/src/main/java/com/duing/domain/globalevent/entity/GlobalEvent.java` 전체 확인. 특히 `@Builder` 생성자, `create()` 정적 팩토리, `update()` 시그니처 파악.

- [ ] **Step 2: `coverImageUrl` 필드 + 생성자 + create 시그니처 확장**

`linkUrl` 필드 선언 다음에 추가:

```java
@Column(name = "link_url", length = 500)             private String linkUrl;
@Column(name = "cover_image_url", length = 500)      private String coverImageUrl;   // 추가
@Enumerated(EnumType.STRING)
@Column(nullable = false, length = 30)               private GlobalEventCategory category;
```

`@Builder` 생성자 시그니처에 `coverImageUrl` 인자 추가 (`linkUrl` 다음, `category` 앞):

```java
@Builder(access = AccessLevel.PRIVATE)
private GlobalEvent(String title, String description,
                    LocalDateTime startAt, LocalDateTime endAt,
                    String location, String linkUrl,
                    String coverImageUrl,            // 추가
                    GlobalEventCategory category, Long createdBy) {
    validateTitle(title);
    validatePeriod(startAt, endAt);
    this.title = title.trim();
    this.description = description;
    this.startAt = startAt;
    this.endAt = endAt;
    this.location = location;
    this.linkUrl = linkUrl;
    this.coverImageUrl = coverImageUrl;              // 추가
    this.category = category;
    this.createdBy = createdBy;
}
```

`create()` 정적 팩토리 시그니처도 동일하게 확장:

```java
public static GlobalEvent create(String title, String description,
                                 LocalDateTime startAt, LocalDateTime endAt,
                                 String location, String linkUrl,
                                 String coverImageUrl,
                                 GlobalEventCategory category, Long createdBy) {
    return GlobalEvent.builder()
            .title(title).description(description)
            .startAt(startAt).endAt(endAt)
            .location(location).linkUrl(linkUrl)
            .coverImageUrl(coverImageUrl)
            .category(category).createdBy(createdBy)
            .build();
}
```

- [ ] **Step 3: `update()` 메서드에 `coverImageUrl` + `clearCoverImage` 추가**

기존 `update(...)` 시그니처를 다음으로 교체:

```java
public void update(String title, String description,
                   LocalDateTime startAt, LocalDateTime endAt,
                   String location, String linkUrl,
                   GlobalEventCategory category,
                   String coverImageUrl, Boolean clearCoverImage) {
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

    // clearCoverImage 가 우선 평가 — true 면 null 로 제거.
    // 그 외에는 coverImageUrl 이 non-null 일 때만 교체. 둘 다 누락 → 유지.
    if (Boolean.TRUE.equals(clearCoverImage)) {
        this.coverImageUrl = null;
    } else if (coverImageUrl != null) {
        this.coverImageUrl = coverImageUrl;
    }
}
```

- [ ] **Step 4: 컴파일 확인 (이 시점에 service/DTO 호출자가 깨질 수 있음 — 의도)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava 2>&1 | tail -20
```
Expected: `GeneralGlobalEventService` 의 `GlobalEvent.create(...)` 와 `event.update(...)` 호출 부분에서 에러 발생. Task 3 에서 Command DTO 와 함께 갱신.

- [ ] **Step 5: 임시 빌드 통과 — 호출자 임시 시그니처 맞춤**

`GeneralGlobalEventService` 의 `create()` 호출에 `null` 임시 인자 삽입 (Task 3 에서 정식으로 Command 에서 받음):

```java
GlobalEvent event = GlobalEvent.create(
        command.title(), command.description(),
        command.startAt(), command.endAt(),
        command.location(), command.linkUrl(),
        null,                                  // TODO: Task 3 에서 command.coverImageUrl()
        command.category(), command.createdBy()
);
```

`update()` 호출도 동일하게:

```java
event.update(command.title(), command.description(),
        command.startAt(), command.endAt(),
        command.location(), command.linkUrl(),
        command.category(),
        null, null);                           // TODO: Task 3 에서 command.coverImageUrl(), command.clearCoverImage()
```

> ⚠️ **이 임시 patch 는 Task 3 에서 즉시 정식화** — 커밋 메시지에 임시 표시. 단일 PR 안에서 진행이라 안전.

- [ ] **Step 6: 컴파일 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/entity/GlobalEvent.java \
        backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java
git commit -m "feat(backend): GlobalEvent.coverImageUrl 필드 + clearCoverImage PATCH 시맨틱"
```

---

## Task 3: Command DTO + Request DTO 확장

`CreateGlobalEventCommand` / `UpdateGlobalEventCommand` 에 `coverImageUrl` (Update 는 `clearCoverImage` 도) 추가. Request DTO 도 동일하게 + validation. Service 의 임시 `null` 인자를 정식 command 값으로 교체.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/globalevent/service/dto/command/CreateGlobalEventCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/globalevent/service/dto/command/UpdateGlobalEventCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/request/CreateGlobalEventRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/request/UpdateGlobalEventRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java`

- [ ] **Step 1: `CreateGlobalEventCommand` 에 `coverImageUrl` 추가**

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
        String coverImageUrl,           // 추가
        GlobalEventCategory category
) {}
```

- [ ] **Step 2: `UpdateGlobalEventCommand` 에 `coverImageUrl` + `clearCoverImage` 추가**

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
        GlobalEventCategory category,
        String coverImageUrl,           // 추가
        Boolean clearCoverImage         // 추가
) {}
```

- [ ] **Step 3: `CreateGlobalEventRequest` 에 `coverImageUrl` 필드 + toCommand 시그니처 갱신**

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

        @Size(max = 500, message = "이미지 URL 은 500자 이하여야 합니다.")
        String coverImageUrl,                                         // 추가 (optional, @Pattern 미적용)

        @NotNull(message = "카테고리는 필수 입력값입니다.") GlobalEventCategory category
) {
    public CreateGlobalEventCommand toCommand(Long createdBy) {
        return new CreateGlobalEventCommand(
                createdBy, title, description, startAt, endAt,
                location, linkUrl, coverImageUrl, category
        );
    }
}
```

- [ ] **Step 4: `UpdateGlobalEventRequest` 에 `coverImageUrl` + `clearCoverImage` 필드 + toCommand 시그니처 갱신**

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
        GlobalEventCategory category,
        @Size(max = 500, message = "이미지 URL 은 500자 이하여야 합니다.")
        String coverImageUrl,                                         // 추가
        Boolean clearCoverImage                                       // 추가
) {
    public UpdateGlobalEventCommand toCommand(Long eventId) {
        return new UpdateGlobalEventCommand(
                eventId, title, description, startAt, endAt,
                location, linkUrl, category,
                coverImageUrl, clearCoverImage
        );
    }
}
```

- [ ] **Step 5: `GeneralGlobalEventService` 의 임시 null 인자 정식화**

`create()`:

```java
GlobalEvent event = GlobalEvent.create(
        command.title(), command.description(),
        command.startAt(), command.endAt(),
        command.location(), command.linkUrl(),
        command.coverImageUrl(),                          // 정식화
        command.category(), command.createdBy()
);
```

`update()`:

```java
event.update(command.title(), command.description(),
        command.startAt(), command.endAt(),
        command.location(), command.linkUrl(),
        command.category(),
        command.coverImageUrl(), command.clearCoverImage());   // 정식화
```

- [ ] **Step 6: 컴파일 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/service/dto/command/ \
        backend/src/main/java/com/duing/domain/globalevent/controller/dto/request/ \
        backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java
git commit -m "feat(backend): GlobalEvent Request/Command DTO 에 coverImageUrl + clearCoverImage 추가"
```

---

## Task 4: Response DTO 확장 (Detail 만)

`GlobalEventDetailResponse` (공개) + `AdminGlobalEventDetailResponse` (어드민) 에 `coverImageUrl` 추가. **`GlobalEventCardResponse` / `AdminGlobalEventSummaryResponse` 는 손대지 않음** (응답 경량화 — spec §1.4).

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/GlobalEventDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/AdminGlobalEventDetailResponse.java`

- [ ] **Step 1: `GlobalEventDetailResponse` 에 `coverImageUrl` 필드 + from 갱신**

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
        String coverImageUrl,                       // 추가
        GlobalEventCategory category
) {
    public static GlobalEventDetailResponse from(GlobalEvent event) {
        return new GlobalEventDetailResponse(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(),
                event.getCoverImageUrl(),           // 추가
                event.getCategory()
        );
    }
}
```

- [ ] **Step 2: `AdminGlobalEventDetailResponse` 에 `coverImageUrl` 필드 + from 갱신**

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
        String coverImageUrl,                       // 추가
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
                event.getLocation(), event.getLinkUrl(),
                event.getCoverImageUrl(),           // 추가
                event.getCategory(),
                new CreatorRef(creator.getId(), creator.getName()),
                event.getCreatedAt(), event.getUpdatedAt()
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Card/Summary 응답 미변경 확인 (defensive grep)**

```bash
grep -c "coverImageUrl" /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/GlobalEventCardResponse.java \
        /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/AdminGlobalEventSummaryResponse.java
```
Expected: 둘 다 `0` (응답 경량화 정책 준수).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/GlobalEventDetailResponse.java \
        backend/src/main/java/com/duing/domain/globalevent/controller/dto/response/AdminGlobalEventDetailResponse.java
git commit -m "feat(backend): GlobalEvent Detail 응답에 coverImageUrl 추가 (Card 응답 미변경)"
```

---

## Task 5: Acceptance 테스트 3 케이스 추가

기존 `GlobalEventAcceptanceTest` 의 `samplePayload(...)` 헬퍼는 `coverImageUrl` 미포함 — 그래야 기존 케이스가 cover 없는 이벤트도 생성 가능. 신규 테스트는 별도로 payload 에 coverImageUrl 명시.

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/globalevent/GlobalEventAcceptanceTest.java`

- [ ] **Step 1: 신규 테스트 케이스 3개 추가**

기존 `adminListFilter` 테스트 다음 위치에 추가:

```java
@Test
@DisplayName("ADMIN 이 coverImageUrl 을 포함해 생성하면 공개 detail 응답에 노출된다")
void createWithCoverImage() {
    LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
    Map<String, Object> body = samplePayload(start, start.plusHours(2));
    body.put("coverImageUrl", "https://storage.example.com/global-event/cover/abc.jpg");

    Long eventId = RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(ContentType.JSON).body(body)
            .when().post("/api/v1/admin/global-events")
            .then().statusCode(HttpStatus.CREATED.value())
            .body("data", notNullValue())
            .extract().jsonPath().getLong("data");

    RestAssured.given()
            .when().get("/api/v1/global-events/" + eventId)
            .then().statusCode(HttpStatus.OK.value())
            .body("data.coverImageUrl", equalTo("https://storage.example.com/global-event/cover/abc.jpg"));
}

@Test
@DisplayName("clearCoverImage true 로 PATCH 하면 coverImageUrl 이 null 로 제거된다")
void updateClearCoverImage() {
    LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
    Map<String, Object> body = samplePayload(start, start.plusHours(2));
    body.put("coverImageUrl", "https://storage.example.com/global-event/cover/old.jpg");

    Long eventId = RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(ContentType.JSON).body(body)
            .when().post("/api/v1/admin/global-events")
            .then().statusCode(HttpStatus.CREATED.value())
            .extract().jsonPath().getLong("data");

    Map<String, Object> patch = new HashMap<>();
    patch.put("clearCoverImage", true);

    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(ContentType.JSON).body(patch)
            .when().patch("/api/v1/admin/global-events/" + eventId)
            .then().statusCode(HttpStatus.NO_CONTENT.value());

    RestAssured.given()
            .when().get("/api/v1/global-events/" + eventId)
            .then().statusCode(HttpStatus.OK.value())
            .body("data.coverImageUrl", nullValue());
}

@Test
@DisplayName("title 만 PATCH 하면 기존 coverImageUrl 은 그대로 유지된다")
void updatePartialPreservesCoverImage() {
    LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
    Map<String, Object> body = samplePayload(start, start.plusHours(2));
    body.put("coverImageUrl", "https://storage.example.com/global-event/cover/keep.jpg");

    Long eventId = RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(ContentType.JSON).body(body)
            .when().post("/api/v1/admin/global-events")
            .then().statusCode(HttpStatus.CREATED.value())
            .extract().jsonPath().getLong("data");

    Map<String, Object> patch = new HashMap<>();
    patch.put("title", "수정된 제목");

    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(ContentType.JSON).body(patch)
            .when().patch("/api/v1/admin/global-events/" + eventId)
            .then().statusCode(HttpStatus.NO_CONTENT.value());

    RestAssured.given()
            .when().get("/api/v1/global-events/" + eventId)
            .then().statusCode(HttpStatus.OK.value())
            .body("data.title", equalTo("수정된 제목"))
            .body("data.coverImageUrl", equalTo("https://storage.example.com/global-event/cover/keep.jpg"));
}

@Test
@DisplayName("linkUrl 을 빈 문자열로 PATCH 하면 @Pattern 검증에 의해 400 을 반환한다 (현재 거동)")
void updateLinkUrlEmptyStringRejected() {
    LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
    Long eventId = createAsAdmin(start, start.plusHours(2));

    Map<String, Object> patch = new HashMap<>();
    patch.put("linkUrl", "");

    // 현재 @Pattern(regexp = "^https?://.+") 가 빈 문자열을 거부.
    // 다른 자유 텍스트 필드(description/location)는 빈 문자열로 clear 가능하지만
    // linkUrl 만 정책 불일치. coverImageUrl 처럼 clearLinkUrl 플래그 도입 필요 — 후속 spec.
    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(ContentType.JSON).body(patch)
            .when().patch("/api/v1/admin/global-events/" + eventId)
            .then().statusCode(HttpStatus.BAD_REQUEST.value());
}
```

> 마지막 케이스는 **본 PR 의 기여 외의 사전 결함을 문서화** 하는 회귀 방지 테스트. coverImageUrl 의 `clearCoverImage` 패턴이 도입됐어도 linkUrl 은 그대로 — 사용자가 "본 PR 이 linkUrl 도 고쳤다" 고 오해하지 않도록 현재 거동을 명시. 후속 spec 에서 `clearLinkUrl` 플래그 도입 또는 regex 완화 시 이 테스트가 깨지면서 의도된 변경이라는 신호가 됨.

- [ ] **Step 2: `nullValue()` import 추가**

파일 상단의 hamcrest static import 블록에 추가:

```java
import static org.hamcrest.Matchers.nullValue;
```

(다른 matcher 들과 alphabetical 정렬 유지: `equalTo`, `greaterThanOrEqualTo`, `hasSize`, `notNullValue`, `nullValue` 순서)

- [ ] **Step 3: 테스트 실행**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests com.duing.domain.globalevent.GlobalEventAcceptanceTest
```
Expected: 모든 테스트 PASS (기존 12 + 신규 3 = 15 케이스). Docker 실행 필요.

> Docker 가용 안 하면 컴파일까지만 확인 (`./gradlew testClasses`) 후 DONE_WITH_CONCERNS 로 보고. 후속 환경에서 실행.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/globalevent/GlobalEventAcceptanceTest.java
git commit -m "test(backend): GlobalEvent coverImageUrl + clearCoverImage 시맨틱 검증 3 케이스"
```

---

## Task 6: 전체 빌드 + PR 준비

- [ ] **Step 1: 전체 clean build**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew clean build
```
Expected: BUILD SUCCESSFUL. Flyway V36 적용 + 모든 테스트 (기존 + 신규 3) PASS.

- [ ] **Step 2: spec / PR 체크리스트 self-review**

다음 7 개 self-check 확인:
1. spec §1.1 마이그레이션 (`cover_image_url VARCHAR(500)`, NULL 허용, 인덱스 없음) 정확한가
2. spec §1.3 PATCH semantics (필드 누락 → 유지, 값 → 교체, `clearCoverImage: true` → 제거) 3 케이스 모두 테스트 통과하는가
3. spec §1.4 응답 정책 — Detail 만 추가, Card/Summary 미변경 — Step 4 의 grep 결과로 확인됐는가
4. spec §1.5 `FilePurpose.GLOBAL_EVENT_COVER("global-event/cover")` 한 줄 추가
5. spec §1.6 Acceptance 3 케이스 (create with cover / clear / preserve) 모두 PASS
6. Conventional Commits + Claude attribution 없음
7. 기존 12 acceptance 테스트도 그대로 PASS (회귀 없음)

- [ ] **Step 3: PR 본문 안내 (수동)**

이 plan 완료 후 `feat/global-event-cover-image-backend` push + develop PR. 본문 구조:

```
## 🚀 작업 내용
GlobalEvent 에 단일 표지 이미지(coverImageUrl) optional 필드를 추가하고, Club.clearCollege 패턴을 차용해 PATCH 시 누락 / 교체 / 명시적 제거를 명료하게 구분했습니다. 캘린더 윈도우/어드민 목록 응답에는 추가하지 않아 응답 크기 부담을 피했습니다.

## 🤔 고민했던 내용
- PATCH 시 null vs 누락 구분: Java record 의 한계로 별도 clearCoverImage 플래그 도입. Club 의 clearCollege 와 일관.
- 응답 경량화: 카드는 그리드 pill 만 렌더하므로 이미지 미사용. detail 모달 진입 시 별도 fetch 가 이미 구현돼 있어 그때 받음.
- 업로드 형식/용량 검증 + Storage orphan 정리는 본 PR 범위 밖 — 후속 통합 리팩토링 spec 으로 분리.

## 💬 리뷰 중점사항
- clearCoverImage 우선 평가 순서 (true 면 coverImageUrl 무시) 의 의도
- Detail 응답 두 곳에만 필드 추가됐는지, Card/Summary 미변경 확인
- 기존 12 acceptance 테스트 회귀 없음 확인
```

---

## Out of Scope (이 plan 에서 안 함)

- 프론트엔드 wiring (별도 plan `2026-06-05-global-event-cover-image-frontend.md` 에서)
- Storage orphan 파일 정리 — spec §5.1
- 업로드 형식/용량 검증 — spec §5.6 (후속 통합 리팩토링 spec)
- `<ImageWithFallback>` 공통 컴포넌트 — spec §5.7 (후속 통합 리팩토링 spec)
- 다른 도메인 URL 입력 통합 — spec §5.9
- 다중 이미지 갤러리 — spec §5.2
- **`linkUrl` 의 clear 시맨틱 통일** — `@Pattern(regexp = "^https?://.+")` 가 빈 문자열을 거부해 다른 자유 텍스트 필드(description/location)의 "빈 문자열 = clear" 컨벤션과 정책 불일치. 본 PR 의 Task 5 마지막 케이스가 현재 거동을 회귀 방지 테스트로 명시. 통일 방안 후보: (a) `clearLinkUrl: Boolean` 플래그 도입 (`coverImageUrl` 과 동일 패턴) / (b) regex 완화 (`^(|https?://.+)$`). 어느 쪽이든 본 PR 범위 밖 — 후속 통합 리팩토링 spec 에 포함하거나 별도 micro-spec 으로 분리.
