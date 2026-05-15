# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Du-ing 전체 플로우 설계 spec (`docs/superpowers/specs/2026-05-15-duing-full-flow-design.md`) 의 Phase 0 — 데이터베이스 스키마 확장·인증 검증 강화·파일 업로드 어댑터·면접 알림 추상화·권한 헬퍼·프론트 라우트 가드까지의 **토대**를 구축한다. Phase 1 이후 모든 기능의 인프라 베이스라인.

**Architecture:** Spring-centric (Approach 1) — Spring Boot 가 단일 진입점, Supabase 는 Postgres + Storage 박스로만 사용. 데이터 변경은 Flyway 새 버전 파일(V8~V11) 추가로만, 기존 파일 수정 금지. 신규 추상화(`InterviewNotificationService`)는 `FileStorageService` 패턴 재사용.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / PostgreSQL (Supabase) / JPA + Hibernate (ddl-auto=validate) / Lombok / Next.js 15 App Router / TypeScript

---

## File Structure

### Backend — 생성

```
backend/src/main/resources/db/migration/
  V8__alter_club_add_cover_tags_sns_faqs.sql
  V9__create_club_photo_table.sql
  V10__alter_recruitment_add_mode_target_interview.sql
  V11__alter_application_add_interview_fields.sql

backend/src/main/java/com/duing/
  domain/club/entity/
    ClubSnsLink.java           (record, JSONB 매핑용)
    ClubFaq.java               (record, JSONB 매핑용)
  domain/club/photo/
    entity/ClubPhoto.java
    repository/ClubPhotoRepository.java
  domain/recruitment/entity/
    ApplicationMode.java
    TargetRole.java
  domain/clubmember/service/
    ClubAuthService.java
  global/file/
    SupabaseStorageFileStorageService.java
  global/notification/
    InterviewNotificationService.java
    NoopInterviewNotificationService.java
  global/file/controller/
    FileApi.java               (Swagger 인터페이스)
    FileController.java
    dto/FileUploadResponse.java

backend/src/test/java/com/duing/
  domain/user/controller/dto/request/SignupRequestEmailValidationTest.java
  domain/clubmember/service/ClubAuthServiceTest.java
  global/notification/NoopInterviewNotificationServiceTest.java
```

### Backend — 수정

```
backend/src/main/java/com/duing/domain/club/entity/Club.java
  - 필드 추가: coverUrl, tags(List<String>), snsLinks(List<ClubSnsLink>), faqs(List<ClubFaq>)
  - create() 시그니처는 변경하지 않음 (Phase 3 의 update API 에서 신규 필드 사용)

backend/src/main/java/com/duing/domain/application/entity/Application.java
  - 필드 추가: interviewAt(LocalDateTime), interviewLocation(String)
  - updateStatus() 의 SUBMITTED 역전이 금지 로직은 유지 (Phase 2 에서 5단계 전이 로직으로 교체)

backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java
  - enum 값 추가: UNDER_REVIEW, INTERVIEW_PENDING

backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java
  - 필드 추가: applicationMode, externalFormUrl, useInterview, targetRole
  - create() 는 기존 시그니처 유지, 신규 필드는 모두 default 값으로 초기화 (SELF / false / MEMBER)

backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java
  - email 검증 정규식 추가 (학교 도메인)

backend/src/main/resources/application.yml
  - file.storage.provider 프로필 분기 (supabase | local)
  - supabase.storage.* 설정 키 추가

backend/.env.example
  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET 추가
```

### Frontend — 생성

```
frontend/apps/web/middleware.ts
frontend/apps/web/app/(auth)/layout.tsx                    (좁은 카드형 레이아웃)
frontend/packages/api/src/auth-context.ts                  (JWT 저장/조회/삭제)
frontend/packages/api/src/auth-types.ts                    (JwtClaims, AuthUser 타입)
```

### Frontend — 수정

해당 사항 없음 (Phase 0 는 토대만).

### Docs — 수정

```
REQUIREMENTS.md   (Phase 0 변경 사항 반영: 새 필드 + 학교 도메인 검증 + 신규 컬럼)
```

---

## Important Context Notes

**테스트 인프라**
- `backend/build.gradle.kts` 에 TestContainers + RestAssured + Fixture Monkey 가 이미 추가돼 있으나, `src/test/java` 아래 작성된 테스트는 0건 (`common/fixture` 디렉터리만 빈 채 존재).
- Phase 0 의 단위 테스트(이메일 정규식·권한 헬퍼·Noop) 는 TestContainers 없이 순수 JUnit5 로 작성 가능. `./gradlew test` 가 잘 도는지 함께 검증.
- 마이그레이션 검증은 `./gradlew bootRun` 또는 `./gradlew flywayMigrate` 로 Flyway 실행 + `spring.jpa.hibernate.ddl-auto=validate` 의 통과를 본다. 별도 통합 테스트는 Phase 0 에 포함하지 않음.

**기존 칼럼 타입**
- 모든 enum 컬럼이 PG ENUM 이 아닌 `VARCHAR(N)` + `@Enumerated(EnumType.STRING)` 으로 저장돼 있다. ApplicationStatus 5단계 확장은 **앱 레이어 enum 추가만으로 충분** — 스펙 2-4 에 적힌 `ALTER TYPE` 주의사항은 본 프로젝트엔 해당 없음.

**Recruitment.title 길이**
- DB 는 `VARCHAR(200)`, 엔티티는 `length = 200`. 스펙(섹션 2-2) 의 `varchar(150)` 은 오타. 본 계획은 기존 200 을 유지한다.

**브랜치·커밋 컨벤션**
- 브랜치: `{type}/{이슈번호}-{설명}` (Phase 0 는 이슈번호 부재 시 `feat/phase0-XX-...` 로 통일)
- 커밋: 한국어, `[#이슈번호] 작업 내용` 또는 `feat(scope): 작업 내용`. 본 plan 의 각 커밋은 후자 형식.
- API 1개 = 브랜치 1개 = PR 1개 원칙(`backend/CLAUDE.md`). Phase 0 인프라 작업은 "마이그레이션+엔티티 한 쌍"을 1 PR 로 묶는다.

---

## Task 1: V8 마이그레이션 — clubs 컬럼 확장 (cover/tags/sns/faqs)

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__alter_club_add_cover_tags_sns_faqs.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 동아리 상세 페이지 노출용 보조 메타데이터 추가.
-- cover_url: 상세 페이지 헤더 이미지
-- tags:      자유 태그 (검색·필터 대상). GIN 인덱스로 다중 태그 IN 조회 최적화
-- sns_links: [{platform, url}] JSONB 배열. 표시 순서는 입력 순서를 따른다.
-- faqs:      [{question, answer, order}] JSONB 배열. 운영진이 UI 에서 통째 갱신.

ALTER TABLE club ADD COLUMN IF NOT EXISTS cover_url  VARCHAR(500);
ALTER TABLE club ADD COLUMN IF NOT EXISTS tags       TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE club ADD COLUMN IF NOT EXISTS sns_links  JSONB   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE club ADD COLUMN IF NOT EXISTS faqs       JSONB   NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_club_tags ON club USING GIN (tags);
```

- [ ] **Step 2: 마이그레이션 적용 + ddl-auto=validate 통과 확인**

⚠ 이 단계는 엔티티 필드 추가(Task 2) 가 끝나야 통과한다. 본 Task 1 은 SQL 만 작성·커밋하고, validate 확인은 Task 2 의 마지막 단계에서 함께 실행한다.

- [ ] **Step 3: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V8__alter_club_add_cover_tags_sns_faqs.sql
git commit -m "feat(db): club 컬럼 확장 마이그레이션 (cover/tags/sns/faqs)"
```

---

## Task 2: Club 엔티티 확장 + JSONB 매핑 record

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/entity/ClubSnsLink.java`
- Create: `backend/src/main/java/com/duing/domain/club/entity/ClubFaq.java`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

- [ ] **Step 1: JSONB 매핑용 record 2개 작성**

```java
// ClubSnsLink.java
package com.duing.domain.club.entity;

public record ClubSnsLink(String platform, String url) {
}
```

```java
// ClubFaq.java
package com.duing.domain.club.entity;

public record ClubFaq(String question, String answer, int order) {
}
```

- [ ] **Step 2: Club 엔티티에 새 필드 추가 (기존 create 시그니처는 유지)**

`backend/src/main/java/com/duing/domain/club/entity/Club.java` 의 `private ClubStatus status;` 아래에 다음을 추가하고, import 도 정렬한다.

```java
import jakarta.persistence.Column;
// 추가
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
```

필드 추가 (status 아래):

```java
@Column(name = "cover_url", length = 500)
private String coverUrl;

@JdbcTypeCode(SqlTypes.ARRAY)
@Column(name = "tags", columnDefinition = "text[]", nullable = false)
private List<String> tags = new ArrayList<>();

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "sns_links", columnDefinition = "jsonb", nullable = false)
private List<ClubSnsLink> snsLinks = new ArrayList<>();

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "faqs", columnDefinition = "jsonb", nullable = false)
private List<ClubFaq> faqs = new ArrayList<>();
```

읽기용 unmodifiable getter 추가 (필드 선언부 아래):

```java
public List<String> getTags() {
    return Collections.unmodifiableList(tags);
}

public List<ClubSnsLink> getSnsLinks() {
    return Collections.unmodifiableList(snsLinks);
}

public List<ClubFaq> getFaqs() {
    return Collections.unmodifiableList(faqs);
}
```

`@Getter` 가 클래스에 있으므로 위 3개는 명시적으로 메서드로 작성해 lombok 의 가변 리스트 반환을 막는다. `coverUrl` 은 `@Getter` 가 처리.

기존 `create()` 메서드는 손대지 않는다 (Phase 3 의 update API 에서 새 필드를 채운다).

- [ ] **Step 3: 마이그레이션 + 엔티티 validate 통과 검증**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

기대: Flyway 가 V8 을 적용하고, Hibernate `ddl-auto=validate` 가 통과해 애플리케이션이 정상 기동. `Ctrl+C` 로 종료.

실패 시: 컬럼 타입 불일치 메시지가 콘솔에 뜬다. 정의를 맞추고 재실행.

- [ ] **Step 4: 커밋**

```bash
cd backend
git add src/main/java/com/duing/domain/club/entity/Club.java \
        src/main/java/com/duing/domain/club/entity/ClubSnsLink.java \
        src/main/java/com/duing/domain/club/entity/ClubFaq.java
git commit -m "feat(club): cover/tags/sns/faqs 필드를 Club 엔티티에 매핑"
```

---

## Task 3: V9 마이그레이션 — club_photo 테이블 + ClubPhoto 엔티티·Repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V9__create_club_photo_table.sql`
- Create: `backend/src/main/java/com/duing/domain/club/photo/entity/ClubPhoto.java`
- Create: `backend/src/main/java/com/duing/domain/club/photo/repository/ClubPhotoRepository.java`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 동아리 활동사진. 표시 순서는 display_order 오름차순.
-- storage_key 는 FileStorageService 가 발급하는 식별자 (Supabase Storage 의 object path).
CREATE TABLE IF NOT EXISTS club_photo (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT       NOT NULL REFERENCES club (id),
    storage_key   VARCHAR(500) NOT NULL,
    caption       VARCHAR(200),
    width         INT,
    height        INT,
    display_order INT          NOT NULL DEFAULT 0,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_photo_club_order
    ON club_photo (club_id, display_order)
    WHERE deleted_at IS NULL;
```

- [ ] **Step 2: ClubPhoto 엔티티 작성**

```java
package com.duing.domain.club.photo.entity;

import com.duing.domain.club.entity.Club;
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

@Getter
@Entity
@Table(name = "club_photo")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_photo SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubPhoto extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(length = 200)
    private String caption;

    @Column
    private Integer width;

    @Column
    private Integer height;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubPhoto(Club club, String storageKey, String caption,
                      Integer width, Integer height, int displayOrder) {
        this.club = club;
        this.storageKey = storageKey;
        this.caption = caption;
        this.width = width;
        this.height = height;
        this.displayOrder = displayOrder;
    }

    public static ClubPhoto create(Club club, String storageKey, String caption,
                                   Integer width, Integer height, int displayOrder) {
        return ClubPhoto.builder()
                .club(club)
                .storageKey(storageKey)
                .caption(caption)
                .width(width)
                .height(height)
                .displayOrder(displayOrder)
                .build();
    }

    public void updateMeta(String caption, int displayOrder) {
        this.caption = caption;
        this.displayOrder = displayOrder;
    }
}
```

- [ ] **Step 3: Repository 작성**

```java
package com.duing.domain.club.photo.repository;

import com.duing.domain.club.photo.entity.ClubPhoto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubPhotoRepository extends JpaRepository<ClubPhoto, Long> {

    List<ClubPhoto> findByClubIdOrderByDisplayOrderAsc(Long clubId);
}
```

- [ ] **Step 4: validate 통과 검증**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

기대: V9 적용 + 정상 기동. `Ctrl+C`.

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V9__create_club_photo_table.sql \
        src/main/java/com/duing/domain/club/photo/
git commit -m "feat(club-photo): 활동사진 테이블·엔티티·리포지터리 추가"
```

---

## Task 4: V10 마이그레이션 — recruitment 컬럼 확장

**Files:**
- Create: `backend/src/main/resources/db/migration/V10__alter_recruitment_add_mode_target_interview.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- application_mode: SELF | EXTERNAL.  SELF 는 자체 폼(RecruitmentForm 행 존재).
-- external_form_url: EXTERNAL 일 때 필수 (CHECK 로 강제).
-- use_interview: true 면 상태 전이가 UNDER_REVIEW → INTERVIEW_PENDING → ACCEPTED/REJECTED.
-- target_role: 합격(ACCEPTED) 시 부여될 ClubMember.role. OFFICER 모집은 기존 동아리 MEMBER 만 지원 가능.

ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS application_mode   VARCHAR(20) NOT NULL DEFAULT 'SELF';
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS external_form_url  VARCHAR(500);
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS use_interview      BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS target_role        VARCHAR(20) NOT NULL DEFAULT 'MEMBER';

ALTER TABLE recruitment ADD CONSTRAINT chk_recruitment_external_url
    CHECK (application_mode = 'SELF' OR external_form_url IS NOT NULL);
```

- [ ] **Step 2: 커밋 (엔티티 작업은 Task 5 에서)**

```bash
cd backend
git add src/main/resources/db/migration/V10__alter_recruitment_add_mode_target_interview.sql
git commit -m "feat(db): recruitment 외부폼/면접/targetRole 컬럼 추가 마이그레이션"
```

---

## Task 5: Recruitment 엔티티 확장 + 신규 enum 2개

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/entity/ApplicationMode.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/entity/TargetRole.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java`

- [ ] **Step 1: 신규 enum 2개**

```java
// ApplicationMode.java
package com.duing.domain.recruitment.entity;

public enum ApplicationMode {
    SELF,
    EXTERNAL
}
```

```java
// TargetRole.java — 모집 합격 시 부여될 ClubMember.role.
// ClubMemberRole 과 별도로 둔다: 모집 단계에서 LEADER 를 직접 충원하는 시나리오는 없음.
package com.duing.domain.recruitment.entity;

import com.duing.domain.clubmember.entity.ClubMemberRole;

public enum TargetRole {
    MEMBER,
    OFFICER;

    public ClubMemberRole toClubMemberRole() {
        return switch (this) {
            case MEMBER -> ClubMemberRole.MEMBER;
            case OFFICER -> ClubMemberRole.OFFICER;
        };
    }
}
```

- [ ] **Step 2: Recruitment 엔티티에 필드·기본값 추가**

`Recruitment.java` 의 `private RecruitmentForm form;` 위에 추가:

```java
@Enumerated(EnumType.STRING)
@Column(name = "application_mode", nullable = false, length = 20)
private ApplicationMode applicationMode;

@Column(name = "external_form_url", length = 500)
private String externalFormUrl;

@Column(name = "use_interview", nullable = false)
private boolean useInterview;

@Enumerated(EnumType.STRING)
@Column(name = "target_role", nullable = false, length = 20)
private TargetRole targetRole;
```

빌더·생성자에 신규 필드 추가:

```java
@Builder(access = AccessLevel.PRIVATE)
private Recruitment(Club club, String title, String content, LocalDate startDate,
                    LocalDate endDate, int capacity, RecruitmentStatus status,
                    ApplicationMode applicationMode, String externalFormUrl,
                    boolean useInterview, TargetRole targetRole) {
    this.club = club;
    this.title = title;
    this.content = content;
    this.startDate = startDate;
    this.endDate = endDate;
    this.capacity = capacity;
    this.status = status;
    this.applicationMode = applicationMode;
    this.externalFormUrl = externalFormUrl;
    this.useInterview = useInterview;
    this.targetRole = targetRole;
}
```

기존 `create()` 시그니처는 유지 + 신규 필드는 기본값으로 초기화:

```java
public static Recruitment create(Club club, String title, String content,
                                 LocalDate startDate, LocalDate endDate, int capacity) {
    if (endDate.isBefore(startDate)) {
        throw new IllegalArgumentException("모집 종료일은 시작일보다 빠를 수 없습니다.");
    }
    if (capacity <= 0) {
        throw new IllegalArgumentException("모집 정원은 1명 이상이어야 합니다.");
    }
    return Recruitment.builder()
            .club(club)
            .title(title)
            .content(content)
            .startDate(startDate)
            .endDate(endDate)
            .capacity(capacity)
            .status(RecruitmentStatus.OPEN)
            .applicationMode(ApplicationMode.SELF)
            .externalFormUrl(null)
            .useInterview(false)
            .targetRole(TargetRole.MEMBER)
            .build();
}
```

> Phase 2 에서 외부폼·면접·targetRole 을 받는 `createWithMode(...)` 변형 메서드를 추가 예정. Phase 0 는 기본값만.

- [ ] **Step 3: validate 통과 검증**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

기대: V10 적용 + 정상 기동. `Ctrl+C`.

- [ ] **Step 4: 커밋**

```bash
cd backend
git add src/main/java/com/duing/domain/recruitment/entity/
git commit -m "feat(recruitment): 외부폼/면접/targetRole 필드를 엔티티에 매핑"
```

---

## Task 6: V11 마이그레이션 — application 면접 필드

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__alter_application_add_interview_fields.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 면접 일정 안내용.
-- INTERVIEW_PENDING 상태에서 운영진이 채우고, 학생은 본인 지원 상세에서 확인.
-- ApplicationStatus 의 UNDER_REVIEW / INTERVIEW_PENDING 값 추가는 VARCHAR 컬럼이므로 DDL 변경 불필요.
ALTER TABLE application ADD COLUMN IF NOT EXISTS interview_at       TIMESTAMP;
ALTER TABLE application ADD COLUMN IF NOT EXISTS interview_location VARCHAR(200);
```

- [ ] **Step 2: 커밋**

```bash
cd backend
git add src/main/resources/db/migration/V11__alter_application_add_interview_fields.sql
git commit -m "feat(db): application 면접 일시·장소 컬럼 추가 마이그레이션"
```

---

## Task 7: ApplicationStatus 5단계 확장 + Application 면접 필드 매핑

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java`
- Modify: `backend/src/main/java/com/duing/domain/application/entity/Application.java`

- [ ] **Step 1: ApplicationStatus enum 확장**

```java
package com.duing.domain.application.entity;

public enum ApplicationStatus {
    SUBMITTED,
    UNDER_REVIEW,
    INTERVIEW_PENDING,
    ACCEPTED,
    REJECTED
}
```

> 5단계 전이 검증(`SUBMITTED→UNDER_REVIEW→…`) 은 Phase 2 의 `PATCH /applications/{id}/status` 에서 구현. Phase 0 는 enum 값 추가만 한다. 기존 `updateStatus()` 의 `SUBMITTED 역전이 금지` 가드는 그대로 둔다.

- [ ] **Step 2: Application 엔티티에 면접 필드 추가**

`Application.java` 의 `private ApplicationStatus status;` 아래에 추가하고, import 에 `java.time.LocalDateTime;` 을 더한다.

```java
@Column(name = "interview_at")
private java.time.LocalDateTime interviewAt;

@Column(name = "interview_location", length = 200)
private String interviewLocation;
```

빌더에는 추가하지 않는다 (생성 시점에는 항상 null). Phase 2 에서 다음 메서드를 별도로 추가:

```java
// Phase 2 에서 추가 예정 — Phase 0 에서는 작성하지 않음.
// public void scheduleInterview(LocalDateTime at, String location) { ... }
```

- [ ] **Step 3: validate 통과 검증**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

기대: V11 적용 + 정상 기동. `Ctrl+C`.

- [ ] **Step 4: 커밋**

```bash
cd backend
git add src/main/java/com/duing/domain/application/entity/
git commit -m "feat(application): 상태 5단계 + 면접 필드 매핑"
```

---

## Task 8: SignupRequest 학교 도메인 정규식 강화 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java`
- Create: `backend/src/test/java/com/duing/domain/user/controller/dto/request/SignupRequestEmailValidationTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.domain.user.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SignupRequestEmailValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private SignupRequest withEmail(String email) {
        return new SignupRequest("20240001", "홍길동", email, "password1234");
    }

    @Test
    @DisplayName("대구대학교 도메인 이메일은 회원가입 검증을 통과한다")
    void daeguDomainEmailPassesValidation() {
        Set<ConstraintViolation<SignupRequest>> violations =
                validator.validate(withEmail("hong@daegu.ac.kr"));
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("대구대 서브도메인 이메일도 통과한다")
    void daeguSubDomainEmailPassesValidation() {
        Set<ConstraintViolation<SignupRequest>> violations =
                validator.validate(withEmail("hong@stu.daegu.ac.kr"));
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("외부 도메인 이메일은 회원가입 검증에서 거부된다")
    void externalDomainEmailFailsValidation() {
        Set<ConstraintViolation<SignupRequest>> violations =
                validator.validate(withEmail("hong@gmail.com"));
        assertThat(violations).extracting(ConstraintViolation::getMessage)
                .contains("대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다.");
    }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd backend
./gradlew test --tests SignupRequestEmailValidationTest
```

기대: `externalDomainEmailFailsValidation` 이 실패 (현재 자유 이메일을 허용하므로).

- [ ] **Step 3: SignupRequest 에 정규식 추가**

`backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java` 의 email 필드에 `@Pattern` 추가:

```java
@NotBlank(message = "이메일은 필수 입력값입니다.")
@Email(message = "올바른 이메일 형식이 아닙니다.")
@Pattern(
    regexp = "^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)*daegu\\.ac\\.kr$",
    message = "대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다."
)
@Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
String email,
```

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

```bash
cd backend
./gradlew test --tests SignupRequestEmailValidationTest
```

기대: 3개 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java \
        src/test/java/com/duing/domain/user/controller/dto/request/SignupRequestEmailValidationTest.java
git commit -m "feat(user): 회원가입 이메일을 학교 도메인(@*.daegu.ac.kr)으로 제한"
```

---

## Task 9: SupabaseStorageFileStorageService 구현체

**Files:**
- Create: `backend/src/main/java/com/duing/global/file/SupabaseStorageFileStorageService.java`
- Modify: `backend/src/main/resources/application.yml` (provider 분기 + supabase 설정 키)
- Modify: `backend/.env.example` (SUPABASE_* 변수 명시)

- [ ] **Step 1: application.yml 의 file 섹션 확장**

`application.yml` 의 `file:` 섹션을 다음으로 교체:

```yaml
file:
  upload-dir: ${FILE_UPLOAD_DIR:/tmp/duing/uploads}
  storage:
    provider: ${FILE_STORAGE_PROVIDER:local}   # local | supabase

supabase:
  storage:
    url: ${SUPABASE_URL:}
    service-role-key: ${SUPABASE_SERVICE_ROLE_KEY:}
    bucket: ${SUPABASE_STORAGE_BUCKET:duing}
```

> 기존 `LocalFileStorageService` 는 `@Profile("local")` 이라 로컬 프로필에서만 빈으로 등록된다. Supabase 구현체는 `@ConditionalOnProperty(name="file.storage.provider", havingValue="supabase")` 로 분기한다. 로컬에서 Supabase 를 테스트하려면 `FILE_STORAGE_PROVIDER=supabase` 환경변수를 설정.

- [ ] **Step 2: backend/.env.example 에 변수 명시**

`backend/.env.example` 끝에 추가:

```
# 파일 저장소 선택. local 또는 supabase
FILE_STORAGE_PROVIDER=local
# FILE_STORAGE_PROVIDER=supabase 일 때 필수
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=duing
```

- [ ] **Step 3: SupabaseStorageFileStorageService 구현**

REST `POST /storage/v1/object/{bucket}/{path}` 를 `RestTemplate` 로 호출한다 (Supabase Storage REST API). 응답이 200 이면 공개 URL `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` 를 반환.

```java
package com.duing.global.file;

import java.io.IOException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "supabase")
public class SupabaseStorageFileStorageService implements FileStorageService {

    private final String supabaseUrl;
    private final String serviceRoleKey;
    private final String bucket;
    private final RestTemplate restTemplate;

    public SupabaseStorageFileStorageService(
            @Value("${supabase.storage.url}") String supabaseUrl,
            @Value("${supabase.storage.service-role-key}") String serviceRoleKey,
            @Value("${supabase.storage.bucket}") String bucket) {
        if (!StringUtils.hasText(supabaseUrl) || !StringUtils.hasText(serviceRoleKey)) {
            throw new IllegalStateException(
                "Supabase Storage 사용 시 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
        }
        this.supabaseUrl = stripTrailingSlash(supabaseUrl);
        this.serviceRoleKey = serviceRoleKey;
        this.bucket = bucket;
        this.restTemplate = new RestTemplate();
    }

    @Override
    public String upload(MultipartFile file, String directory) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }
        String originalFilename = StringUtils.cleanPath(
                file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
        String extension = StringUtils.getFilenameExtension(originalFilename);
        String objectName = UUID.randomUUID() + (extension != null ? "." + extension : "");
        String objectPath = directory + "/" + objectName;

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceRoleKey);
        headers.add("apikey", serviceRoleKey);
        headers.setContentType(parseContentType(file.getContentType()));
        headers.add("x-upsert", "false");

        byte[] body;
        try {
            body = file.getBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("파일을 읽지 못했습니다.", exception);
        }

        String endpoint = supabaseUrl + "/storage/v1/object/" + bucket + "/" + objectPath;
        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    endpoint, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new IllegalStateException(
                    "Supabase Storage 업로드 실패: " + response.getStatusCode());
            }
        } catch (RestClientException exception) {
            throw new IllegalStateException("Supabase Storage 업로드에 실패했습니다.", exception);
        }

        return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + objectPath;
    }

    @Override
    public void delete(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return;
        }
        String prefix = supabaseUrl + "/storage/v1/object/public/" + bucket + "/";
        if (!fileUrl.startsWith(prefix)) {
            log.warn("Supabase 파일이 아닌 URL 삭제 요청 무시: {}", fileUrl);
            return;
        }
        String objectPath = fileUrl.substring(prefix.length());

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceRoleKey);
        headers.add("apikey", serviceRoleKey);

        String endpoint = supabaseUrl + "/storage/v1/object/" + bucket + "/" + objectPath;
        try {
            restTemplate.exchange(endpoint, HttpMethod.DELETE, new HttpEntity<>(headers), Void.class);
        } catch (RestClientException exception) {
            log.warn("Supabase Storage 삭제 실패: {}", fileUrl, exception);
        }
    }

    private static MediaType parseContentType(String value) {
        if (value == null || value.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(value);
        } catch (Exception ignored) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
```

- [ ] **Step 4: 빈 등록 검증 — local 프로필에서 기동**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

기대: 정상 기동. `FILE_STORAGE_PROVIDER` 미설정 시 default `local` 이므로 Supabase 빈은 등록 안 됨 → 기존 동작 보존. `Ctrl+C`.

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/duing/global/file/SupabaseStorageFileStorageService.java \
        src/main/resources/application.yml \
        .env.example
git commit -m "feat(storage): Supabase Storage FileStorageService 구현체 추가"
```

---

## Task 10: POST /api/v1/files 업로드 엔드포인트

**Files:**
- Create: `backend/src/main/java/com/duing/global/file/controller/FileApi.java`
- Create: `backend/src/main/java/com/duing/global/file/controller/FileController.java`
- Create: `backend/src/main/java/com/duing/global/file/controller/dto/FileUploadResponse.java`
- Create: `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java`

- [ ] **Step 1: 응답 DTO + purpose enum**

```java
// FileUploadResponse.java
package com.duing.global.file.controller.dto;

public record FileUploadResponse(String storageKey, String url) {
}
```

```java
// FilePurpose.java — 업로드 디렉터리·검증 정책의 분기 키.
package com.duing.global.file.controller.dto;

public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo");

    private final String directory;

    FilePurpose(String directory) {
        this.directory = directory;
    }

    public String directory() {
        return directory;
    }
}
```

- [ ] **Step 2: Swagger API 인터페이스**

```java
package com.duing.global.file.controller;

import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.controller.dto.FileUploadResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "File", description = "파일 업로드 API")
public interface FileApi {

    @Operation(summary = "파일 업로드", description = "이미지 1건을 업로드하고 저장소 키와 공개 URL 을 반환한다.")
    ResponseEntity<ApiResponse<FileUploadResponse>> upload(MultipartFile file, FilePurpose purpose);
}
```

- [ ] **Step 3: Controller 구현**

```java
package com.duing.global.file.controller;

import com.duing.global.file.FileStorageService;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.controller.dto.FileUploadResponse;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController implements FileApi {

    private final FileStorageService fileStorageService;

    @Override
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam("purpose") FilePurpose purpose) {
        String url = fileStorageService.upload(file, purpose.directory());
        FileUploadResponse body = new FileUploadResponse(url, url);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(body));
    }
}
```

> `storageKey` 와 `url` 을 같은 값으로 반환하는 이유: 현재 `FileStorageService.upload` 가 URL 형태의 단일 문자열만 반환하기 때문. Phase 1 에서 ClubPhoto 가 Supabase object path 를 별도로 저장하도록 인터페이스를 `UploadResult { storageKey, url }` 로 확장하기 전까지는 동일하게 다룬다.

- [ ] **Step 4: 기동 + Swagger UI 에서 엔드포인트 확인**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

브라우저: `http://localhost:8080/swagger-ui.html` → "File" 태그에 `POST /api/v1/files` 가 보여야 한다. `Ctrl+C`.

- [ ] **Step 5: 커밋**

```bash
cd backend
git add src/main/java/com/duing/global/file/controller/
git commit -m "feat(file): POST /api/v1/files 업로드 엔드포인트 추가"
```

---

## Task 11: InterviewNotificationService 추상화 + Noop 구현 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/global/notification/InterviewNotificationService.java`
- Create: `backend/src/main/java/com/duing/global/notification/NoopInterviewNotificationService.java`
- Create: `backend/src/test/java/com/duing/global/notification/NoopInterviewNotificationServiceTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.global.notification;

import static org.assertj.core.api.Assertions.assertThatNoException;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NoopInterviewNotificationServiceTest {

    private final InterviewNotificationService service = new NoopInterviewNotificationService();

    @Test
    @DisplayName("Noop 구현은 면접 알림 호출에 예외 없이 반환한다")
    void noopDoesNotThrow() {
        assertThatNoException().isThrownBy(() ->
                service.notifyInterviewScheduled(
                        42L, "hong@daegu.ac.kr",
                        LocalDateTime.of(2026, 6, 1, 14, 0),
                        "본관 305호"));
    }
}
```

- [ ] **Step 2: 실패 확인**

```bash
cd backend
./gradlew test --tests NoopInterviewNotificationServiceTest
```

기대: 컴파일 에러 (`InterviewNotificationService` 미존재).

- [ ] **Step 3: 인터페이스 작성**

```java
package com.duing.global.notification;

import java.time.LocalDateTime;

/**
 * 면접 일정 알림 발송 추상화.
 * <p>MVP 구현체는 {@link NoopInterviewNotificationService} 가 사용된다 (로그만 남김).
 * Phase 2 이후 메일·카카오 알림톡 구현체가 추가될 예정.
 * <p>호출 시점은 운영진이 면접 일시를 저장한 직후 (PATCH /applications/{id}/interview).
 *
 * @param applicationId 지원 ID — 알림 추적·재발송용 식별자
 * @param recipientEmail 학생 이메일 — 메일 구현체에서 사용
 * @param scheduledAt 면접 일시
 * @param location 면접 장소
 */
public interface InterviewNotificationService {

    void notifyInterviewScheduled(Long applicationId, String recipientEmail,
                                  LocalDateTime scheduledAt, String location);
}
```

- [ ] **Step 4: Noop 구현**

```java
package com.duing.global.notification;

import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@ConditionalOnMissingBean(InterviewNotificationService.class)
public class NoopInterviewNotificationService implements InterviewNotificationService {

    @Override
    public void notifyInterviewScheduled(Long applicationId, String recipientEmail,
                                         LocalDateTime scheduledAt, String location) {
        log.info("[InterviewNotification:NOOP] application={}, email={}, at={}, location={}",
                applicationId, recipientEmail, scheduledAt, location);
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend
./gradlew test --tests NoopInterviewNotificationServiceTest
```

기대: PASS.

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/java/com/duing/global/notification/ \
        src/test/java/com/duing/global/notification/
git commit -m "feat(notification): InterviewNotificationService 추상화 + Noop 구현체"
```

---

## Task 12: ClubAuthService 권한 헬퍼 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java`
- Create: `backend/src/test/java/com/duing/domain/clubmember/service/ClubAuthServiceTest.java`

기존 `ClubMemberRepository.findByClubIdAndUserId` 와 `ClubMemberRole.canManageClub()` 을 재사용한다.

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.UserRole;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class ClubAuthServiceTest {

    private final ClubMemberRepository repository = mock(ClubMemberRepository.class);
    private final ClubAuthService service = new ClubAuthService(repository);

    private ClubMember memberWithRole(ClubMemberRole role) {
        ClubMember member = mock(ClubMember.class);
        when(member.getRole()).thenReturn(role);
        return member;
    }

    @Test
    @DisplayName("LEADER 멤버는 requireLeader 검증을 통과한다")
    void leaderPassesRequireLeader() {
        when(repository.findByClubIdAndUserId(1L, 10L))
                .thenReturn(Optional.of(memberWithRole(ClubMemberRole.LEADER)));
        assertThat(service.requireLeader(10L, 1L).getRole()).isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("OFFICER 는 requireLeader 검증에서 거부된다")
    void officerFailsRequireLeader() {
        when(repository.findByClubIdAndUserId(1L, 10L))
                .thenReturn(Optional.of(memberWithRole(ClubMemberRole.OFFICER)));
        assertThatThrownBy(() -> service.requireLeader(10L, 1L))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("LEADER 또는 OFFICER 는 requireManager 검증을 통과한다")
    void managerRolesPassRequireManager() {
        when(repository.findByClubIdAndUserId(1L, 10L))
                .thenReturn(Optional.of(memberWithRole(ClubMemberRole.OFFICER)));
        assertThat(service.requireManager(10L, 1L).getRole()).isEqualTo(ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("MEMBER 는 requireManager 검증에서 거부된다")
    void memberFailsRequireManager() {
        when(repository.findByClubIdAndUserId(1L, 10L))
                .thenReturn(Optional.of(memberWithRole(ClubMemberRole.MEMBER)));
        assertThatThrownBy(() -> service.requireManager(10L, 1L))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("멤버십이 없는 사용자는 requireMember 검증에서 거부된다")
    void nonMemberFailsRequireMember() {
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.requireMember(10L, 1L))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("ADMIN 글로벌 역할은 requireAdmin 검증을 통과한다")
    void adminPassesRequireAdmin() {
        service.requireAdmin(UserRole.ADMIN);   // no exception
    }

    @Test
    @DisplayName("STUDENT 글로벌 역할은 requireAdmin 검증에서 거부된다")
    void studentFailsRequireAdmin() {
        assertThatThrownBy(() -> service.requireAdmin(UserRole.STUDENT))
                .isInstanceOf(AccessDeniedException.class);
    }
}
```

- [ ] **Step 2: `ClubMemberException.NotAMember` 가 존재하는지 확인 — 없으면 추가**

```bash
cd backend
grep -n "NotAMember" src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java
```

존재하지 않으면 (기존 inner class 가 다른 이름일 경우), `ClubMemberException.java` 끝에 다음을 추가:

```java
public static final class NotAMember extends ClubMemberException {
    public NotAMember() {
        super("해당 동아리의 멤버가 아닙니다.");
    }
}
```

- [ ] **Step 3: 실패 확인**

```bash
cd backend
./gradlew test --tests ClubAuthServiceTest
```

기대: 컴파일 에러 (`ClubAuthService` 미존재).

- [ ] **Step 4: ClubAuthService 구현**

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 동아리 권한 검증의 단일 진입점.
 * Controller / 다른 Service 는 본 클래스의 require* 메서드를 호출하여 검증한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ClubAuthService {

    private final ClubMemberRepository clubMemberRepository;

    public ClubMember requireLeader(Long userId, Long clubId) {
        ClubMember member = findMembershipOrThrow(userId, clubId);
        if (!member.getRole().name().equals("LEADER")) {
            throw new AccessDeniedException("해당 동아리의 회장만 가능한 작업입니다.");
        }
        return member;
    }

    public ClubMember requireManager(Long userId, Long clubId) {
        ClubMember member = findMembershipOrThrow(userId, clubId);
        if (!member.canManageClub()) {
            throw new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다.");
        }
        return member;
    }

    public ClubMember requireMember(Long userId, Long clubId) {
        return findMembershipOrThrow(userId, clubId);
    }

    public void requireAdmin(UserRole globalRole) {
        if (globalRole != UserRole.ADMIN) {
            throw new AccessDeniedException("총동연(ADMIN) 권한이 필요합니다.");
        }
    }

    private ClubMember findMembershipOrThrow(Long userId, Long clubId) {
        return clubMemberRepository.findByClubIdAndUserId(clubId, userId)
                .orElseThrow(ClubMemberException.NotAMember::new);
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend
./gradlew test --tests ClubAuthServiceTest
```

기대: 7개 PASS.

- [ ] **Step 6: 커밋**

```bash
cd backend
git add src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java \
        src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java \
        src/test/java/com/duing/domain/clubmember/service/ClubAuthServiceTest.java
git commit -m "feat(auth): ClubAuthService 권한 헬퍼 추가"
```

---

## Task 13: 프론트엔드 인증 컨텍스트 + middleware.ts

**Files:**
- Create: `frontend/apps/web/middleware.ts`
- Create: `frontend/packages/api/src/auth-context.ts`
- Create: `frontend/packages/api/src/auth-types.ts`
- Create: `frontend/apps/web/app/(auth)/layout.tsx`

> 본 Task 는 frontend 작업 디렉터리에서 실행. 기존 `apps/web/app/` 의 `clubs/`, `recruitments/` 라우트는 `(public)` 그룹으로 옮기지 않는다 (Phase 1 에서 함께 이동). Phase 0 는 middleware 와 컨텍스트 기반만 깐다.

- [ ] **Step 1: auth-types.ts 작성**

```typescript
// frontend/packages/api/src/auth-types.ts
export type GlobalRole = "STUDENT" | "ADMIN";

export type JwtClaims = {
  sub: string;        // userId
  role: GlobalRole;
  exp: number;        // unix seconds
  iat?: number;
};

export type AuthUser = {
  id: number;
  role: GlobalRole;
};
```

- [ ] **Step 2: auth-context.ts 작성 (쿠키 기반 토큰 저장)**

```typescript
// frontend/packages/api/src/auth-context.ts
import type { AuthUser, JwtClaims } from "./auth-types";

const TOKEN_COOKIE = "duing_token";
const COOKIE_MAX_AGE_DAYS = 7;

export function setAuthToken(token: string): void {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  // SameSite=Lax 로 CSRF 1차 방어. Secure 는 운영 환경(HTTPS)에서 자동 추가하도록 별도 처리.
  document.cookie = `${TOKEN_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearAuthToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readAuthTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TOKEN_COOKIE) return rest.join("=");
  }
  return null;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    // atob 는 브라우저, Buffer 는 Edge 미들웨어. Buffer 폴리필이 없으면 atob 만.
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return claims.exp <= nowSeconds;
}

export function toAuthUser(claims: JwtClaims): AuthUser {
  return { id: Number(claims.sub), role: claims.role };
}

export const AUTH_TOKEN_COOKIE_NAME = TOKEN_COOKIE;
```

- [ ] **Step 3: middleware.ts 작성 — 라우트 가드**

```typescript
// frontend/apps/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_TOKEN_COOKIE_NAME,
  decodeJwt,
  isExpired,
} from "@duing/api/auth-context";

const STUDENT_PREFIXES = ["/apply", "/me"];
const MANAGE_PREFIX = "/manage";
const ADMIN_PREFIX = "/admin";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value ?? null;
  const claims = token ? decodeJwt(token) : null;
  const isAuthenticated = !!claims && !isExpired(claims);

  // (auth) 그룹: 이미 로그인한 사용자는 /me 로
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    if (isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/me";
      next.search = "";
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  // (student): 로그인 필요
  if (STUDENT_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/login";
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  // (manage): 로그인 필요. 동아리 단위 권한은 페이지/서버에서 ClubAuthService 로 추가 검증
  if (pathname.startsWith(MANAGE_PREFIX)) {
    if (!isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/login";
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    return NextResponse.next();
  }

  // (admin): 로그인 + role=ADMIN
  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!isAuthenticated) {
      const next = request.nextUrl.clone();
      next.pathname = "/login";
      next.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(next);
    }
    if (claims?.role !== "ADMIN") {
      const next = request.nextUrl.clone();
      next.pathname = "/403";
      next.search = "";
      return NextResponse.rewrite(next);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/apply/:path*",
    "/me/:path*",
    "/manage/:path*",
    "/admin/:path*",
  ],
};
```

- [ ] **Step 4: (auth) 레이아웃 자리잡기 (빈 페이지)**

App Router 그룹 라우트는 디렉터리만 만들고 page.tsx 가 없으면 라우트가 생기지 않는다. 본 Task 는 layout 만 추가하고, login/signup 페이지는 Phase 1 의 Task 1.E 에서 생성.

```tsx
// frontend/apps/web/app/(auth)/layout.tsx
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: packages/api export 확인**

`frontend/packages/api/src/index.ts` 가 존재하면 다음을 export 에 추가, 없으면 생성:

```typescript
export * from "./auth-context";
export * from "./auth-types";
```

`frontend/packages/api/package.json` 의 `"exports"` 또는 `"main"` 이 `src/index.ts` 를 가리키는지 확인. 다르면 기존 패턴을 따르고, `@duing/api/auth-context` 경로가 안 잡히면 import 경로를 `@duing/api` 로 변경한다.

```bash
cd frontend
cat packages/api/package.json | head -30
```

import 경로 확인 결과에 따라 middleware.ts 의 두 import 라인을 다음 중 맞는 것으로 수정:

```typescript
// 옵션 A — 서브패스 export 가능
import { AUTH_TOKEN_COOKIE_NAME, decodeJwt, isExpired } from "@duing/api/auth-context";

// 옵션 B — 단일 entry
import { AUTH_TOKEN_COOKIE_NAME, decodeJwt, isExpired } from "@duing/api";
```

- [ ] **Step 6: 빌드 + 기동 확인**

```bash
cd frontend
pnpm install   # 새 파일이 workspace 에 추가됐을 수 있음
pnpm --filter web build
pnpm --filter web dev
```

기대: 빌드 성공, `http://localhost:3000` 정상. `/me` 접근 시 `/login?next=%2Fme` 로 리다이렉트되는지 브라우저로 확인. `Ctrl+C`.

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/middleware.ts \
        frontend/apps/web/app/\(auth\)/ \
        frontend/packages/api/src/auth-context.ts \
        frontend/packages/api/src/auth-types.ts \
        frontend/packages/api/src/index.ts 2>/dev/null || true
git commit -m "feat(web): 인증 컨텍스트(JWT 쿠키) + 라우트 가드 미들웨어 추가"
```

---

## Task 14: REQUIREMENTS.md 갱신 — Phase 0 변경 반영

**Files:**
- Modify: `REQUIREMENTS.md`

- [ ] **Step 1: REQUIREMENTS.md 의 변경 이력 섹션 갱신**

`REQUIREMENTS.md` 의 "## 6. 변경 이력" 표 끝에 행 추가:

```markdown
| 2026-05-15 | MVP 재정의 (Phase 0 토대): clubs(cover_url/tags/sns_links/faqs), club_photo 테이블, recruitment(application_mode/external_form_url/use_interview/target_role), application(interview_at/interview_location), ApplicationStatus 5단계, 학교 도메인 이메일 검증, Supabase Storage 어댑터, InterviewNotificationService 추상화, ClubAuthService 권한 헬퍼. 상세는 docs/superpowers/specs/2026-05-15-duing-full-flow-design.md |
```

- [ ] **Step 2: User 도메인 비기능 요구사항에 이메일 정규식 추가**

"### 2.1 User" 의 비기능 요구사항 항목 끝에 추가:

```markdown
- 회원가입 시 `email` 은 학교 도메인 정규식 `^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*daegu\.ac\.kr$` 통과 필수. 인증 메일 발송은 Phase 2.
```

- [ ] **Step 3: Club 엔티티 필드에 신규 컬럼 명시**

"### 2.2 Club" 의 "엔티티 필드" 라인을 다음으로 교체:

```markdown
**엔티티 필드**: `id`, `name`, `category`(enum), `division`, `description`, `logoUrl`, `coverUrl`, `tags`(text[]), `snsLinks`(jsonb), `faqs`(jsonb), `status`(enum). 활동사진은 별도 `club_photo` 테이블.
```

- [ ] **Step 4: Recruitment 엔티티 필드 갱신**

"### 2.3 Recruitment" 의 "엔티티 필드" 라인을 다음으로 교체:

```markdown
**엔티티 필드**: `id`, `clubId`(FK), `title`, `content`, `startDate`, `endDate`, `capacity`, `applicationMode`(SELF|EXTERNAL), `externalFormUrl`, `useInterview`, `targetRole`(MEMBER|OFFICER), `status`(enum)
```

- [ ] **Step 5: ApplicationStatus 5단계로 갱신**

"### 2.4 Application" 의 "ApplicationStatus" 라인을 다음으로 교체:

```markdown
**`ApplicationStatus`**: `SUBMITTED` → `UNDER_REVIEW` → (`INTERVIEW_PENDING` if recruitment.useInterview) → `ACCEPTED` / `REJECTED`
```

엔티티 필드 라인에 면접 필드 추가:

```markdown
**엔티티 필드**: `id`, `recruitmentId`(FK), `userId`(FK), `answers` JSONB, `status`(enum), `interviewAt`, `interviewLocation`
```

- [ ] **Step 6: 커밋**

```bash
git add REQUIREMENTS.md
git commit -m "docs(requirements): Phase 0 데이터 모델·검증 변경 반영"
```

---

## Task 15: 전체 빌드·테스트 회귀 + 최종 push 준비

**Files:** (변경 없음)

- [ ] **Step 1: 전체 백엔드 빌드·테스트**

```bash
cd backend
./gradlew clean build
```

기대: BUILD SUCCESSFUL. 컴파일·테스트 전부 통과. (Docker 가 실행 중이 아니면 TestContainers 가 필요한 테스트는 건너뛸 수 있는데, Phase 0 신규 테스트들은 TestContainers 를 쓰지 않으므로 무관.)

- [ ] **Step 2: 전체 프론트엔드 빌드·타입체크**

```bash
cd frontend
pnpm install
pnpm --filter web build
pnpm -r typecheck
```

기대: 모든 패키지 빌드·타입체크 통과.

- [ ] **Step 3: Flyway 마이그레이션 적용 상태 확인**

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

콘솔에서 `Successfully applied 4 migrations to schema "public"` (또는 동일 의미의 메시지) 가 보여야 한다. `Ctrl+C`.

`./gradlew flywayInfo` 가 가능하면 사용:

```bash
./gradlew flywayInfo
```

기대: V8~V11 이 `Success` 상태로 표시.

- [ ] **Step 4: 커밋 그래프 확인**

```bash
git log --oneline -20
```

기대: Phase 0 의 14 개 커밋이 깔끔히 보임. PR 단위로 묶을 그룹은 다음 4 개:

1. `feat/phase0-1-club-schema` — Task 1~2 (clubs 컬럼·엔티티)
2. `feat/phase0-2-club-photo` — Task 3
3. `feat/phase0-3-recruitment-schema` — Task 4~5
4. `feat/phase0-4-application-schema` — Task 6~7
5. `feat/phase0-5-signup-email` — Task 8
6. `feat/phase0-6-supabase-storage` — Task 9~10
7. `feat/phase0-7-notification-abstraction` — Task 11
8. `feat/phase0-8-club-auth-service` — Task 12
9. `feat/phase0-9-web-middleware` — Task 13
10. `feat/phase0-10-requirements-doc` — Task 14

본 plan 은 모든 커밋을 `develop` 에 직접 누적하는 것을 가정하지 않는다. 실제 진행 시에는 위 그룹 단위로 브랜치를 따고 PR 을 올린다 (`backend/CLAUDE.md` 의 "API 1개 = 브랜치 1개 = PR 1개" 원칙을 인프라 작업 그룹에 준용).

- [ ] **Step 5: 마지막 안내 출력 — Phase 0 완료**

```bash
echo "Phase 0 완료. Phase 1 (학생 탐색·지원 흐름) 으로 진행 가능."
```

---

## Self-Review (작성자 노트)

**스펙 커버리지** — Phase 0 의 0.1~0.9 모두 매핑됨:

| Spec 항목 | 대응 Task |
|---|---|
| 0.1 clubs 컬럼 확장 + GIN | Task 1 + Task 2 |
| 0.2 club_photos 테이블 | Task 3 |
| 0.3 recruitments 컬럼 확장 + CHECK | Task 4 + Task 5 |
| 0.4 applications.status enum 확장 + 면접 필드 | Task 6 + Task 7 (PG ENUM 아닌 VARCHAR 라 DDL 단순) |
| 0.5 User email 학교 도메인 정규식 | Task 8 |
| 0.6 SupabaseStorageFileStorageService + `POST /api/v1/files` | Task 9 + Task 10 |
| 0.7 InterviewNotificationService + Noop | Task 11 |
| 0.8 ClubAuthService 권한 헬퍼 | Task 12 |
| 0.9 인증 컨텍스트 + middleware.ts | Task 13 |
| Phase 0 Done 조건 (회귀 + 업로드 라운드트립) | Task 15 |
| REQUIREMENTS.md 갱신 (스펙 7 항) | Task 14 |

**Type/시그니처 일관성**
- `InterviewNotificationService.notifyInterviewScheduled(Long, String, LocalDateTime, String)` — 스펙의 "Application, LocalDateTime, String" 시그니처보다 알림 추상화에 적합하게 ID + email 로 분리. 호출자(Phase 2 의 service) 가 Application 에서 두 값을 꺼내 전달. 본 plan 내에서 일관.
- `ClubAuthService.requireLeader(userId, clubId)` 순서는 Task 12 코드와 테스트에서 동일하게 `(userId, clubId)`.
- `FilePurpose` enum 의 값은 `LOGO/COVER/PHOTO` 로 controller(Task 10) 와 일치.

**No placeholders** — TBD/TODO 부재 확인.
