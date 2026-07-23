# 활동 피드(대표 활동 6) Implementation Plan — BE+FE 스택

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `club_hero_activity` 신규 도메인(BE, 별도 테이블·FK 참조)과 운영진 콘솔 "활동 피드" 화면(FE, 대표 활동 6 + 전체 활동 사진 + Sticky Preview)을 2-PR 스택으로 구현한다. 학생 화면 노출은 범위 밖.

**Architecture:** BE는 `ClubPhoto` 도메인을 정확히 클론한 구조(`domain/club/heroactivity/` 단일 트리 — photo의 query DTO 분산 배치는 따르지 않음)로 CRUD+reorder API를 만든다. 대표 활동은 **항상 기존 활동사진을 FK 참조**(`club_photo_id NOT NULL`) — 이미지 중복 저장 없음, "새 사진 업로드" 등록은 club_photo 생성 후 참조. 슬롯 모델: displayOrder 1..6 고정, 삭제 시 순서 안 당김(빈 슬롯 유지), max 6은 부분 유니크 인덱스(club_id, display_order)가 구조적으로 보장. FE는 기존 photos 라우트를 "활동 피드"로 재작성 — SectionCard 2섹션 + `hidden xl:sticky` Preview(#737/#742 선례), dnd-kit 핸들 전용 드래그+DragOverlay, hero 카드 단위 저장 + 정렬 1초 디바운스 자동저장(기존 photos 관행).

**Tech Stack:** Spring Boot 3.4/Java 21, Flyway(V92), JPA+Testcontainers(RestAssured 통합테스트) / Next.js 15, React 19, TanStack Query, dnd-kit(기설치), Vitest+MSW.

## 확정 정책 (사용자 승인 B2 + 본 플랜에서 잠근 결정)

- 대표 활동 = **기존 활동사진에서 선택**(FK). hero 슬롯의 "새 사진 업로드"도 내부적으로 club_photo 생성→참조(사진은 전체 활동 사진에도 나타남 — FE 안내 문구로 명시).
- **club_photo 수정 금지**(featured 계열 컬럼 추가 금지) — 별도 엔티티. 단, photo **삭제 가드 1건은 photo 서비스에 추가**: 대표 활동이 참조 중인 사진 삭제 → 409("대표 활동에 사용 중인 사진입니다. 대표 활동에서 먼저 해제해주세요.") — FE는 사전 안내.
- displayOrder ∈ 1..6, `UNIQUE(club_id, display_order) WHERE deleted_at IS NULL` + 같은 사진 중복 대표 방지 `UNIQUE(club_id, club_photo_id) WHERE deleted_at IS NULL`. 동시성은 DB unique가 백스톱(23505→409는 GlobalExceptionHandler DataIntegrityViolation 매핑 기존 동작).
- reorder는 photo와 달리 **연속 순열을 요구하지 않는다**(빈 슬롯 허용): payload 집합=현재 hero 전체 && displayOrder들이 1..6 범위의 서로 다른 값.
- 검증: title 1~30자 필수, description 1~80자 필수, clubPhotoId 필수(해당 클럽 소속 사진). PATCH는 부분 수정(null=미변경, 값이 오면 동일 규칙).
- 승격("대표로 지정")은 등록과 동일 연산(POST)이므로 **실기능으로 연결**한다 — 빈 슬롯에 사진 시드된 편집 폼 열기. 빈 슬롯 없으면 disabled+안내.
- 전역 "저장하기" 버튼 없음(목업과 다름): hero는 카드 단위 저장(POST/PATCH), 정렬은 디바운스 자동저장, 전체 사진은 기존 자동 동작 — 리소스별 API와 기존 photos UX에 정합.
- 권한: photo와 동일 `requireEditableClubManager`(LEADER/OFFICER, 프로필 완성 게이트 허용). GET은 public(ACTIVE 아니면 404) — photo GET 관례.

## Global Constraints

- BE: backend/CLAUDE.md 규칙 전부 — api 인터페이스 없는 컨트롤러 금지, DTO 2계층(record), `@Builder(access=PRIVATE)` 정적 팩토리, LAZY, 클래스 `@Transactional(readOnly=true)`+쓰기 오버라이드, soft delete(@SQLDelete/@SQLRestriction), 기존 마이그레이션 수정 금지, JPQL엔 `deletedAt IS NULL` 명시. 테스트는 Testcontainers 통합(컨트롤러=RestAssured+IntegrationTestBase, 서비스=@SpringBootTest+@Transactional), `@DisplayName` 한국어 요구사항 문장. **신규 테이블을 IntegrationTestBase TRUNCATE 목록에 추가(child→parent 순서: club_hero_activity를 club_photo 앞에)**.
- FE: 타입 `type`만·`any`/`as` 금지·`@/` alias·서버 상태 TanStack Query만·`ky` 직접 호출 금지(@duing/api 경유). 신기능 순서: types→api client→hooks→UI. 듀잉 토큰(slate 금지), SectionCard/ImageUploader/ConfirmDialog 재사용. dnd는 핸들 전용 listeners+`draggable={false}` 이미지 가드+DragOverlay.
- 기존 기능 삭제 금지: 사진 다중 업로드·캡션 편집(다이얼로그로 이동 허용)·삭제·드래그 정렬(1초 디바운스) 전부 보존. 사진 개수 제한 없음 유지.
- 컴포넌트 명명(사용자 지정): ActivityHeroSection / HeroActivityCard / HeroActivityEditor / ActivityPhotoGrid / ActivityPhotoCard / ActivityPreview(+ActivityPreviewHero/ActivityPreviewGrid는 같은 파일 내 export).
- hero 카드 4:5 — ImageUploader `ASPECT_CLASS`에 `'4/5': 'aspect-[4/5]'` 1줄 추가(기존 옵션 무변경).
- 그리드: 전체 사진 기본 2열/md 3열/xl 4열. hero 3열(모바일 2열).
- 커밋: Conventional Commits 한국어(`feat(backend):`/`feat(frontend):`), attribution 금지. BE 커밋도 이 형식(레포 memory 정책이 [#issue] 형식에 우선).
- 브랜치: PR-1 `feat/hero-activities-be`(develop 기반) → PR-2 `feat/hero-activities-fe`(PR-1 HEAD 스택). gradlew는 backend/에서, pnpm은 frontend/에서.

## Out of Scope (후속)

- 학생 화면(클럽 상세/홈/추천) hero 노출, 활동 게시글 연결, 대표 해제 후 일반 유지 UX(삭제=해제로 충분), hero 이미지 전용 크롭, 사진 라이트박스(관리 화면).

---

## PR-1 — Backend (`feat/hero-activities-be`)

### Task 1: V92 마이그레이션 + 엔티티 + 리포지토리 + TRUNCATE 등록

**Files:**
- Create: `backend/src/main/resources/db/migration/V92__create_club_hero_activity_table.sql` (구현 시점에 `ls db/migration | sort -V | tail -1`로 최신+1 재확인 — V92가 선점됐으면 번호 올리고 파일명·플랜 언급 모두 맞출 것)
- Create: `backend/src/main/java/com/duing/domain/club/heroactivity/entity/ClubHeroActivity.java`
- Create: `backend/src/main/java/com/duing/domain/club/heroactivity/repository/ClubHeroActivityRepository.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE 목록에 `club_hero_activity` 추가 — `club_photo`보다 앞)
- Test: `backend/src/test/java/com/duing/domain/club/heroactivity/entity/ClubHeroActivityTest.java`

**Interfaces (Produces):**
- 엔티티: `ClubHeroActivity.create(Club club, ClubPhoto clubPhoto, String title, String description, int displayOrder)`, `updateContent(String title, String description)`(null=미변경), `changePhoto(ClubPhoto clubPhoto)`, `changeDisplayOrder(int displayOrder)`. BaseEntity 상속, soft delete.
- 리포지토리: `findByClubIdOrderByDisplayOrderAsc(Long clubId)`, `findByClubId(Long clubId)`, `existsByClubIdAndClubPhotoId(Long clubId, Long clubPhotoId)`, `existsByClubIdAndDisplayOrder(Long clubId, int displayOrder)`, `existsByClubPhotoId(Long clubPhotoId)` (photo 삭제 가드용 — derived query라 @SQLRestriction 자동 적용).

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 대표 활동 6 슬롯. 기존 활동사진(club_photo)을 FK 참조하는 큐레이션 — 이미지 중복 저장 없음.
-- display_order 는 1..6 슬롯 번호(노출 순서). 삭제 시 순서를 당기지 않고 빈 슬롯으로 유지한다.
-- max 6 은 부분 유니크(club_id, display_order)가 구조적으로 보장한다(범위 검증은 앱 레이어 1..6).
CREATE TABLE IF NOT EXISTS club_hero_activity (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT       NOT NULL REFERENCES club (id),
    club_photo_id BIGINT       NOT NULL REFERENCES club_photo (id),
    title         VARCHAR(30)  NOT NULL,
    description   VARCHAR(80)  NOT NULL,
    display_order INT          NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_hero_activity_slot
    ON club_hero_activity (club_id, display_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_hero_activity_photo
    ON club_hero_activity (club_id, club_photo_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 엔티티 작성** (ClubPhoto 패턴 클론 — `@SQLDelete(sql = "UPDATE club_hero_activity SET deleted_at = NOW() WHERE id = ?")` + `@SQLRestriction("deleted_at IS NULL")`, `@ManyToOne(LAZY, optional=false)` club/clubPhoto, `@Column(nullable=false, length=30/80)` title/description, `display_order` int):

```java
package com.duing.domain.club.heroactivity.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "club_hero_activity")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_hero_activity SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubHeroActivity extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_photo_id", nullable = false)
    private ClubPhoto clubPhoto;

    @Column(nullable = false, length = 30)
    private String title;

    @Column(nullable = false, length = 80)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubHeroActivity(Club club, ClubPhoto clubPhoto, String title,
                             String description, int displayOrder) {
        this.club = club;
        this.clubPhoto = clubPhoto;
        this.title = title;
        this.description = description;
        this.displayOrder = displayOrder;
    }

    public static ClubHeroActivity create(Club club, ClubPhoto clubPhoto, String title,
                                          String description, int displayOrder) {
        return ClubHeroActivity.builder().club(club).clubPhoto(clubPhoto)
                .title(title).description(description).displayOrder(displayOrder).build();
    }

    /** 부분 수정 — null 은 미변경. */
    public void updateContent(String title, String description) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
    }

    public void changePhoto(ClubPhoto clubPhoto) { this.clubPhoto = clubPhoto; }

    public void changeDisplayOrder(int displayOrder) { this.displayOrder = displayOrder; }
}
```

- [ ] **Step 3: 리포지토리 작성** (Interfaces 목록의 derived query 5종 — 전부 파생 쿼리라 JPQL 불필요)
- [ ] **Step 4: IntegrationTestBase TRUNCATE 목록에 `club_hero_activity` 추가** (club_photo 항목 바로 앞 줄)
- [ ] **Step 5: 엔티티 단위 테스트** — updateContent null 미변경/부분 변경, changePhoto, changeDisplayOrder 각 1케이스(`@DisplayName` 한국어). Run: `./gradlew test --tests '*ClubHeroActivityTest*'` (backend/) → PASS. Flyway는 전체 테스트 기동으로 간접 검증.
- [ ] **Step 6: Commit** — `feat(backend): 대표 활동(club_hero_activity) 엔티티·마이그레이션 추가`

---

### Task 2: 서비스 + 커맨드/쿼리 DTO + 예외 (TDD)

**Files:**
- Create: `domain/club/heroactivity/service/ClubHeroActivityService.java` + `GeneralClubHeroActivityService.java`
- Create: `domain/club/heroactivity/service/dto/command/` — `CreateHeroActivityCommand`, `UpdateHeroActivityCommand`, `ReorderHeroActivitiesCommand`(내부 `HeroOrder(Long heroActivityId, int displayOrder)`)
- Create: `domain/club/heroactivity/service/dto/query/HeroActivityQuery.java`
- Create: `domain/club/heroactivity/exception/ClubHeroActivityException.java`
- Test: `src/test/java/com/duing/domain/club/heroactivity/service/ClubHeroActivityServiceTest.java`

**Interfaces (Produces):**

```java
public interface ClubHeroActivityService {
    List<HeroActivityQuery> getByClubId(Long clubId);                       // public GET 용 — ACTIVE 아니면 ClubNotFound(404)
    HeroActivityQuery create(CreateHeroActivityCommand command);            // 201
    void update(UpdateHeroActivityCommand command);                         // 204 — title/description/clubPhotoId 부분 수정
    List<HeroActivityQuery> reorder(ReorderHeroActivitiesCommand command);  // 200
    void delete(Long clubId, Long requesterId, Long heroActivityId);        // 204 — 슬롯 비움(순서 안 당김)
}
```

- `HeroActivityQuery(Long id, Long clubPhotoId, String storageKey, String caption, Integer width, Integer height, String title, String description, int displayOrder)` — **storageKey를 조인 포함**(FE가 photos 재조인 불필요). `from(ClubHeroActivity)` 에서 `entity.getClubPhoto()` 접근(트랜잭션 내 LAZY 초기화).
- Commands: `CreateHeroActivityCommand(Long clubId, Long requesterId, Long clubPhotoId, String title, String description, int displayOrder)` / `UpdateHeroActivityCommand(Long clubId, Long requesterId, Long heroActivityId, Long clubPhotoId, String title, String description)`(전부 nullable=미변경) / `ReorderHeroActivitiesCommand(Long clubId, Long requesterId, List<HeroOrder> orders)`.
- 예외(`ClubHeroActivityException extends ApplicationException`, ClubPhotoException 패턴): `NotFound`(404 "대표 활동을 찾을 수 없습니다."), `NotInClub`(404), `SlotOutOfRange`(400 "대표 활동 순서는 1~6 사이여야 합니다."), `SlotOccupied`(409 "이미 사용 중인 대표 활동 슬롯입니다."), `PhotoAlreadyFeatured`(409 "이미 대표 활동으로 등록된 사진입니다."), `OrderMismatch`(400 "정렬 페이로드가 현재 대표 활동 집합과 일치하지 않습니다.").

**서비스 핵심 로직** (GeneralClubPhotoService 골격 클론 — `requireEditableClubManager` 선두, 클래스 readOnly+쓰기 @Transactional):
- `create`: 권한 → club 조회 → **photo를 findPhotoInClub(같은 클럽 소속 검증, ClubPhotoException.NotFound/NotInClub 재사용 대신 자체 조회: `clubPhotoRepository.findById` + club 비교 → 불일치 시 자체 `NotInClub` 사용은 photo 예외와 혼동되니 `ClubHeroActivityException.PhotoNotFound`(404 "참조할 활동사진을 찾을 수 없습니다.") 하나로 통합)** → `displayOrder` 1..6 아니면 `SlotOutOfRange` → `existsByClubIdAndDisplayOrder` → `SlotOccupied` → `existsByClubIdAndClubPhotoId` → `PhotoAlreadyFeatured` → save.
- `update`: 권한 → hero 조회(`NotFound`/club 불일치 `NotInClub`) → clubPhotoId 오면 사진 조회·클럽 검증·`PhotoAlreadyFeatured`(자기 자신 제외: 기존 참조와 동일 사진이면 통과) 후 `changePhoto` → `updateContent(title, description)`.
- `reorder`: 권한 → 현재 hero 전체 조회 → payload id 집합 == 현재 집합(`OrderMismatch`) → displayOrder 전부 1..6 범위(`SlotOutOfRange`)·중복 없음(`OrderMismatch`) → **유니크 충돌 회피를 위해 2-pass 적용**: 1차로 전원 `changeDisplayOrder(-index)` 음수 임시값 후 flush 없이… (주: 부분 유니크 인덱스는 커밋 시점 검사가 아니라 문장 단위라 swap 시 충돌 가능 — `saveAndFlush` 없이 dirty checking 일괄이면 Hibernate가 UPDATE 순서를 보장하지 않으므로, 안전하게 `clubHeroActivityRepository.flush()`를 사이에 두고 1차 음수 전환→2차 목표값 적용) → 정렬 재조회 반환.
- `delete`: 권한 → hero 조회·클럽 검증 → `repository.delete(entity)` (soft).

- [ ] **Step 1: 실패하는 서비스 통합 테스트 작성** (`@Import(TestcontainersConfiguration.class)` `@SpringBootTest` `@Transactional`, ClubPhotoCommandServiceTest의 saveUser/saveActiveClub/리더 멤버 헬퍼 패턴 클론). 케이스(각 `@DisplayName` 한국어 문장):
  1. 리더가 사진+제목+설명+슬롯3으로 생성하면 storageKey 조인 포함 쿼리가 반환된다
  2. 슬롯 범위 밖(0, 7) 생성은 SlotOutOfRange
  3. 점유된 슬롯 생성은 SlotOccupied
  4. 같은 사진 중복 등록은 PhotoAlreadyFeatured
  5. 타 클럽 사진 참조는 PhotoNotFound
  6. update로 제목만 바꾸면 설명은 유지된다(부분 수정)
  7. update로 사진 교체 시 같은 클럽 검증·중복 검증이 적용된다(자기 사진 재지정은 허용)
  8. reorder로 1↔2 스왑이 성공한다(유니크 충돌 없이) — **2-pass 검증 핵심 케이스**
  9. reorder 페이로드 집합 불일치는 OrderMismatch, 범위 밖은 SlotOutOfRange
  10. delete 후 남은 슬롯 순서가 당겨지지 않는다(2번 삭제 → 1,3번 displayOrder 유지)
  11. 비관리자(MEMBER) 호출은 AccessDeniedException
- [ ] **Step 2: RED 확인** — Run: `./gradlew test --tests '*ClubHeroActivityServiceTest*'` → FAIL(클래스 부재 컴파일 에러)
- [ ] **Step 3: 구현** (위 계약·로직대로. reorder 2-pass의 flush는 `clubHeroActivityRepository.flush()` 사용)
- [ ] **Step 4: GREEN + 회귀** — Run: `./gradlew test --tests '*ClubHeroActivity*' --tests '*ClubPhoto*'` → 전체 PASS
- [ ] **Step 5: Commit** — `feat(backend): 대표 활동 서비스 — 슬롯 검증·부분 수정·2-pass 정렬`

---

### Task 3: API 인터페이스 + 컨트롤러 + HTTP DTO (TDD)

**Files:**
- Create: `domain/club/api/ClubHeroActivityApi.java`, `domain/club/controller/ClubHeroActivityController.java`
- Create: `controller/dto/request/` — `CreateHeroActivityRequest`, `UpdateHeroActivityRequest`, `ReorderHeroActivitiesRequest`(내부 `HeroOrderItem`)
- Create: `controller/dto/response/HeroActivityResponse.java`
- Test: `src/test/java/com/duing/domain/club/controller/ClubHeroActivityControllerTest.java`

**Interfaces (Produces — FE 계약):** base `/api/v1`, ClubPhotoApi 패턴 클론(태그 "대표 활동").

| Method | Path | Body | Res |
|---|---|---|---|
| GET | `/clubs/{clubId}/hero-activities` | — | 200 `ApiResponse<List<HeroActivityResponse>>` (public, ACTIVE 아니면 404) |
| POST | `/clubs/{clubId}/hero-activities` | `{clubPhotoId, title, description, displayOrder}` | 201 `ApiResponse<HeroActivityResponse>` |
| PATCH | `/clubs/{clubId}/hero-activities/{heroActivityId}` | `{clubPhotoId?, title?, description?}` | 204 |
| PUT | `/clubs/{clubId}/hero-activities/order` | `{items: [{heroActivityId, displayOrder}]}` | 200 `ApiResponse<List<HeroActivityResponse>>` |
| DELETE | `/clubs/{clubId}/hero-activities/{heroActivityId}` | — | 204 |

`HeroActivityResponse(Long id, Long clubPhotoId, String storageKey, String caption, Integer width, Integer height, String title, String description, int displayOrder)` = `from(HeroActivityQuery)`.

Bean Validation: Create — `@NotNull clubPhotoId`, `@NotBlank @Size(max=30) title`("제목은 30자 이하여야 합니다." 등 한국어 메시지), `@NotBlank @Size(max=80) description`, `@Min(1) @Max(6) displayOrder`. Update — `@Size(max=30)`/`@Size(max=80)`(nullable). Reorder — `@NotEmpty @Valid items`, item `@NotNull heroActivityId`, `@Min(1) @Max(6) displayOrder`. 전 요청 `toCommand(clubId, requesterId[, heroActivityId])`.

- [ ] **Step 1: 실패하는 컨트롤러 통합 테스트** (ClubPhotoControllerTest 클론 — RestAssured, JWT, leader/officer/member 시드). 케이스:
  1. OFFICER POST 201 + `data.storageKey`/`data.displayOrder` 검증
  2. 제목 누락/31자/설명 81자 → 400
  3. displayOrder 0·7 → 400, 점유 슬롯 → 409, 중복 사진 → 409
  4. PATCH 제목만 204 → GET으로 설명 유지 확인
  5. PUT order 스왑 200 + 반환 정렬 검증, 집합 불일치 400
  6. DELETE 204 → GET에서 해당 슬롯 부재·잔여 순서 유지
  7. MEMBER 쓰기 403, 비로그인 401
  8. 비ACTIVE 클럽 public GET 404
- [ ] **Step 2: RED 확인** → Run: `./gradlew test --tests '*ClubHeroActivityControllerTest*'` → FAIL
- [ ] **Step 3: 구현** (Api 인터페이스 → Controller implements — 순서 규칙)
- [ ] **Step 4: GREEN** — 동일 명령 PASS
- [ ] **Step 5: Commit** — `feat(backend): 대표 활동 CRUD·정렬 API 추가`

---

### Task 4: 활동사진 삭제 가드 (참조 중 409)

**Files:**
- Modify: `domain/club/photo/exception/ClubPhotoException.java` — `ReferencedByHeroActivity`(409, "대표 활동에 사용 중인 사진입니다. 대표 활동에서 먼저 해제해주세요.") 추가
- Modify: `domain/club/photo/service/GeneralClubPhotoService.java` — `delete()`에서 `clubHeroActivityRepository.existsByClubPhotoId(photoId)` → 409. 의존성 주입 추가.
- Test: `ClubPhotoCommandServiceTest`에 케이스 추가(대표 참조 사진 삭제 409 / 대표 해제 후 삭제 성공 / 미참조 사진 삭제는 기존대로)

- [ ] **Step 1: RED** — 참조 중 삭제 케이스 작성 → FAIL(현재는 삭제됨)
- [ ] **Step 2: 구현 → GREEN** — Run: `./gradlew test --tests '*ClubPhoto*' --tests '*ClubHeroActivity*'` PASS
- [ ] **Step 3: Commit** — `feat(backend): 대표 활동 참조 사진 삭제 가드 추가`

---

### Task 5: BE 전체 검증

- [ ] Run: `./gradlew test` (backend/) → BUILD SUCCESSFUL (출력을 `| tail`로 자르지 말 것)
- [ ] Commit 없음. 실패 시 해당 Task 복귀.

---

## PR-2 — Frontend (`feat/hero-activities-fe`, PR-1 HEAD에서 분기)

### Task 6: types + api client + hooks

**Files:**
- Modify: `frontend/packages/types/src/club.ts` — 추가:

```ts
export type ClubHeroActivity = {
  id: number;
  clubPhotoId: number;
  storageKey: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  title: string;
  description: string;
  displayOrder: number; // 1..6 슬롯 번호
};

export type CreateHeroActivityPayload = {
  clubPhotoId: number;
  title: string;
  description: string;
  displayOrder: number;
};

export type UpdateHeroActivityPayload = {
  clubPhotoId?: number;
  title?: string;
  description?: string;
};

export type ReorderHeroActivitiesPayload = {
  items: { heroActivityId: number; displayOrder: number }[];
};
```

- Modify: `frontend/packages/api/src/client.ts` — clubs 그룹에 `heroActivities(clubId)`, `createHeroActivity(clubId, payload)`, `updateHeroActivity(clubId, heroActivityId, payload)`, `reorderHeroActivities(clubId, payload)`, `deleteHeroActivity(clubId, heroActivityId)` (photos 5종과 동일 패턴 — GET/POST 201/PATCH 204 jsonVoid/PUT/DELETE jsonVoid, 경로 `clubs/${clubId}/hero-activities...`)
- Modify: `frontend/packages/hooks/src/clubQueryKeys.ts` — `heroActivities: (clubId) => [...clubQueryKeys.all, clubId, 'hero-activities'] as const`
- Create: `frontend/packages/hooks/src/heroActivities.ts` — `useClubHeroActivitiesQuery(clubId | undefined)`(enabled 가드, photos 쿼리 패턴), `useCreateHeroActivityMutation(clubId)`/`useUpdateHeroActivityMutation(clubId)`/`useReorderHeroActivitiesMutation(clubId)`/`useDeleteHeroActivityMutation(clubId)` — 성공 시 `clubQueryKeys.heroActivities(clubId)` invalidate. create/update의 photo 신규 업로드 경로가 photos 목록도 바꾸므로 create·update 성공 시 `clubQueryKeys.photos(clubId)`도 invalidate.
- Modify: `frontend/packages/hooks/src/index.ts` export 추가
- Test: `frontend/packages/hooks/test/heroActivities.test.tsx` — MSW로 list Map 반환·create 후 두 쿼리키 invalidate 검증(recruitmentStatsSummaries 테스트의 wrapper 패턴 재사용), 2~3케이스

- [ ] TDD: RED(모듈 부재) → 구현 → `pnpm --filter @duing/hooks test -- run test/heroActivities.test.tsx` GREEN + `pnpm --filter @duing/hooks typecheck`
- [ ] Commit — `feat(frontend): 대표 활동 타입·API 클라이언트·훅 추가`

---

### Task 7: HeroActivityCard + HeroActivityEditor + ImageUploader 4:5

**Files:**
- Modify: `frontend/apps/web/app/_components/ImageUploader.tsx` — `aspectRatio` 유니온에 `'4/5'` 추가 + `ASPECT_CLASS`에 `'4/5': 'aspect-[4/5]'` (그 외 무변경)
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/HeroActivityCard.tsx`
- Create: `.../_components/HeroActivityEditor.tsx`
- Test: `frontend/apps/web/test/manage/photos/HeroActivityCard.test.tsx`

**Interfaces (Produces):**
- `HeroActivityCard({ slotNumber: number, imageUrl: string | null, title: string, description: string })` — 순수 프레젠테이션: 4:5 카드, 이미지(`draggable={false}`, 없으면 sage-mist 배경+"사진을 선택하세요"), 그라데이션 오버레이(목업 값), 좌상단 번호 배지(흰 원형, slotNumber), 상단 제목(미입력 시 흐린 "제목"), 하단 설명. Preview(Task 9)와 편집 화면이 공유하는 **단일 카드 양식**.
- `HeroActivityEditor` — 슬롯 1개의 편집 컨테이너: props `{ clubId: number, slotNumber: number, hero: ClubHeroActivity | null, dragHandle: ReactNode, onPickPhoto: () => void }`. 내부: `HeroActivityCard` + 제목 input(maxLength 30, 카운터) + 설명 textarea(maxLength 80, 카운터) + 액션 행. 상태 머신:
  - hero==null && 선택된 사진 없음: 카드 클릭/"사진 선택" 버튼 → `onPickPhoto()`(부모가 피커 열기). 입력 비활성.
  - 편집 중(신규: 부모가 pickedPhoto를 props로 시드 — `pendingPhoto?: { clubPhotoId: number; storageKey: string } | null` prop 추가): 제목/설명 입력 활성, "저장" 버튼 → 검증(사진·제목·설명 필수, 미충족 시 인라인 에러) → `useCreateHeroActivityMutation`(displayOrder=slotNumber). 성공 시 부모 콜백 `onSaved()`.
  - hero!=null: 값 시드, 변경 시 "저장"(PATCH — 바뀐 필드만), "사진 교체" → `onPickPhoto()`(부모가 교체 대상 슬롯 기억), "비우기" → ConfirmDialog("이 대표 활동을 비울까요?" — 순서는 당겨지지 않음 안내) → DELETE.
  - 에러는 mutation 에러 메시지 인라인 표시(409 문구 그대로).
- 테스트: 카드 렌더(번호·제목·설명·플레이스홀더), 신규 저장 검증(제목 비우고 저장 → 에러·mutation 미호출), 저장 성공 mutateAsync 페이로드(displayOrder=slotNumber) — 뮤테이션 훅은 부분 mock(기존 관례).

- [ ] TDD → `pnpm --filter @duing/web test -- run test/manage/photos/HeroActivityCard.test.tsx` GREEN
- [ ] Commit — `feat(frontend): 대표 활동 카드·슬롯 에디터 추가`

---

### Task 8: ActivityHeroSection (6슬롯 + dnd + PhotoPickerDialog)

**Files:**
- Create: `.../_components/PhotoPickerDialog.tsx` — `{ open, photos: ClubPhoto[], usedPhotoIds: number[], busy?: boolean, onPick: (photo: ClubPhoto) => void, onUploadNew: (file: File) => void, onClose: () => void }`: Dialog(기존 `@/components/ui/dialog`) 안에 전체 사진 그리드(이미 대표로 쓰인 사진은 딤+뱃지 "사용 중"·클릭 불가) + "새 사진 업로드" 파일 버튼(validateImageFile 선검증 → 부모가 업로드+photo 생성 처리).
- Create: `.../_components/ActivityHeroSection.tsx`
- Test: `frontend/apps/web/test/manage/photos/ActivityHeroSection.test.tsx`

**Interfaces:**
- `ActivityHeroSection({ clubId: number, heroActivities: ClubHeroActivity[], photos: ClubPhoto[] })`. 내부:
  - 슬롯 6개 조립: `slots[i] = heroActivities.find(h => h.displayOrder === i + 1) ?? null`, 슬롯 키는 `hero?.id ?? \`empty-${i + 1}\``… **드래그 정체성**: dnd sortable items는 슬롯 배열의 stable key(`hero-{id}` | `empty-{slotNumber-고정 uid}`) — 빈 슬롯은 `useSortable disabled`, 채워진 카드만 `dragHandle`(⠿ 버튼)에 listeners. DragOverlay에 HeroActivityCard 렌더. 드롭 시 `arrayMove(slots)` 후 채워진 항목만 `{heroActivityId, displayOrder: index + 1}`로 **1초 디바운스 PUT**(PhotoGrid의 debounce·실패 롤백 패턴 클론).
  - 섹션 헤더: SectionCard number 1, title "대표 활동 6", 설명("사진 + 제목 + 한줄 설명의 통일 양식으로... 홈·동아리 소개 상단에 강조 노출됩니다. 가능하면 6개를 모두 등록하세요.") + 등록 수 `{n}/6` 표시(n=heroActivities.length).
  - 피커 상태 소유: 어떤 슬롯이 사진 선택/교체 중인지(`pickingSlot: number | null` + 교체 대상 heroId), `onPick`→신규면 HeroActivityEditor에 pendingPhoto 시드/기존이면 즉시 PATCH(clubPhotoId), `onUploadNew`→`useFileUploadMutation(PHOTO)`+`useCreatePhotoMutation` 후 동일 처리(안내: "업로드한 사진은 전체 활동 사진에도 추가돼요").
  - 승격 진입점: `promotePhoto(photo)` 함수를 export 콜백으로 노출 — page가 ActivityPhotoGrid의 "대표로 지정"과 연결(첫 빈 슬롯에 pendingPhoto 시드, 빈 슬롯 없으면 호출부에서 disabled).
- 테스트(MSW 또는 훅 부분 mock — 기존 관례 혼용): 6슬롯 렌더(3개 등록 시 "3/6"), 빈 슬롯 "사진을 선택하세요", 피커 열림·사용 중 사진 딤 처리, 드래그는 jsdom 한계로 **reorder 페이로드 계산 함수를 분리 export**(`slotsToReorderPayload(slots): items`) 하여 단위 테스트(스왑·빈 슬롯 건너뜀 케이스).

- [ ] TDD → GREEN → Commit — `feat(frontend): 대표 활동 6슬롯 섹션 — 핸들 드래그·사진 피커·승격 시드`

---

### Task 9: ActivityPhotoGrid/Card (hover 액션) + ActivityPreview

**Files:**
- Create: `.../_components/ActivityPhotoCard.tsx` — 기존 PhotoCard 대체: 정사각 이미지(`draggable={false}`), hover(+focus-within) 오버레이 액션: [대표로 지정] [캡션] [삭제] + ⠿ 드래그 핸들(listeners는 핸들에만). 캡션=소형 Dialog(input maxLength 200, 저장=기존 updatePhoto). 삭제=ConfirmDialog(+참조 중 409 에러 메시지 인라인 표시). "대표로 지정"은 `onPromote(photo)` 콜백, `promoteDisabled`(빈 슬롯 없음) 시 disabled+title 안내. 모바일(hover 불가)은 오버레이 상시 노출 대신 우하단 "⋯" 버튼 → 같은 액션(단순화: `sm:opacity-0 sm:group-hover:opacity-100 opacity-100` 상시-모바일/호버-데스크탑).
- Create: `.../_components/ActivityPhotoGrid.tsx` — 기존 PhotoGrid의 dnd·디바운스 로직 클론 + 그리드 `grid-cols-2 md:grid-cols-3 xl:grid-cols-4`, 마지막에 **사진 추가 카드**(점선 border-dashed + ＋ 아이콘 + hover 배경 전환, 클릭=파일 input 다중 — 기존 PhotoUploader 로직 흡수: validateImageFile·순차 업로드·실패 목록). SectionCard number 2 "전체 활동 사진" 래핑은 page에서.
- Create: `.../_components/ActivityPreview.tsx` — `{ clubName: string, heroActivities: ClubHeroActivity[], photos: ClubPhoto[] }`: 헤더(동아리명 · 활동) → `ActivityPreviewHero`(첫 hero를 HeroActivityCard로 크게 + swipe dots: 첫 dot 길게·나머지 6개까지, hero 없으면 빈 상태 문구 "대표 활동을 등록하면 여기에 보여요") → `ActivityPreviewGrid`(사진 3열 최대 6장 + 초과 "+N") — 세 export 한 파일. 순수 프레젠테이션(쿼리 0).
- Test: `test/manage/photos/ActivityPhotoCard.test.tsx`(액션 노출·promote disabled·삭제 확인 흐름), `test/manage/photos/ActivityPreview.test.tsx`(hero 유/무·dots 수·그리드 +N)

- [ ] TDD → GREEN → Commit — `feat(frontend): 활동 사진 그리드 hover 액션·추가 카드·학생 미리보기 추가`

---

### Task 10: page 조립 + ManageNav 라벨

**Files:**
- Modify: `.../photos/page.tsx` 전면 재작성 — `max-w-[1240px] px-6 py-9` + 헤더(h1 "활동 피드") + `xl:grid-cols-[minmax(0,1fr)_380px]`: 좌 SectionCard①(ActivityHeroSection)+SectionCard②(ActivityPhotoGrid), 우 `hidden xl:sticky xl:top-6 xl:block`(ActivityPreview). 데이터: `useClubPhotosQuery`+`useClubHeroActivitiesQuery`+기존 `useManagedClubsQuery`(notFound 가드 유지). 승격 배선: Grid의 onPromote → HeroSection promote(첫 빈 슬롯), 빈 슬롯 없으면 disabled.
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx` — photos 항목 라벨을 "활동 피드"로(라벨 문자열만, 라우트 무변경). 관련 기존 테스트(manage-nav.test) 라벨 단언 있으면 조정.
- Test: `test/manage/photos/activity-feed-page.test.tsx` — MSW: hero 2 + photos 3 시드 → 두 섹션·3/6 아님 "2/6"·Preview에 첫 hero 제목·사진 추가 카드 존재. hero 0 → Preview 빈 상태.

- [ ] TDD → GREEN(+ `test/manage/` 회귀) → Commit — `feat(frontend): 활동 피드 화면 조립 — 2컬럼·Sticky Preview·승격 배선`

---

### Task 11: FE 전체 검증 + 실브라우저 QA

- [ ] typecheck/lint/test 전체/build(CI 동등 env) — frontend/
- [ ] 실브라우저 QA(직전 프로젝트 Task 9 절차·계정·서버 재사용 규칙 동일, 스크린샷 `.superpowers/sdd/qa3/`): ① 6슬롯+번호 배지+4:5 카드 ② 신규 등록 풀 플로우(피커→갤러리 선택→제목/설명→저장→새로고침 후 유지) ③ 검증(제목 없이 저장 → 에러) ④ 핸들 드래그 순서 변경→자동저장→새로고침 유지, 빈 슬롯 위치 유지 ⑤ 승격 버튼(사진→첫 빈 슬롯 시드) ⑥ 참조 사진 삭제 409 안내 ⑦ 캡션 다이얼로그·사진 추가 카드 업로드 ⑧ Preview 실시간 반영·xl 미만 숨김 ⑨ 반응형 그리드(2/3/4열). DB에 생성한 테스트 데이터는 화면 기능으로 삭제해 정리(hero 삭제→사진 삭제).
- [ ] Commit 없음.
