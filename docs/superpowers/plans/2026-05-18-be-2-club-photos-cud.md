# BE-2: 활동사진 CUD 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER/OFFICER 가 자기 동아리의 활동사진을 등록·캡션 수정·드래그 정렬·삭제할 수 있는 4개 엔드포인트(POST/PATCH/PUT order/DELETE)를 추가한다.

**Architecture:** 기존 `ClubPhotoApi`(공개 GET 하나) 에 인증 필요 엔드포인트 4개 추가. `ClubPhotoController` 확장 + `ClubPhotoService` 인터페이스에 create/update/reorder/delete 메서드 추가. 권한은 `ClubAuthService.requireManager(userId, clubId)` 재사용. 파일 업로드 자체는 기존 `POST /api/v1/files` 가 처리하고, 본 API 는 `storageKey` 만 받는다. displayOrder 는 생성 시 `MAX+1`, 일괄 정렬은 페이로드의 photoId 집합이 현재 active 집합과 정확히 일치해야 한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA / PostgreSQL(TestContainers) / RestAssured / Bean Validation

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.2 a~d, §5

---

## File Map

**Create**
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateClubPhotoRequest.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubPhotoRequest.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/ReorderClubPhotosRequest.java` — `record(List<PhotoOrderItem> items)` + inner record `PhotoOrderItem(Long photoId, int displayOrder)`. 또는 컨트롤러에서 `List<PhotoOrderItem>` 직접 받음 — Bean Validation 을 위해 wrapper record 선택.
- `backend/src/main/java/com/duing/domain/club/photo/service/dto/command/CreateClubPhotoCommand.java`
- `backend/src/main/java/com/duing/domain/club/photo/service/dto/command/UpdateClubPhotoCommand.java`
- `backend/src/main/java/com/duing/domain/club/photo/service/dto/command/ReorderClubPhotosCommand.java`
- `backend/src/main/java/com/duing/domain/club/photo/exception/ClubPhotoException.java` — 부모 + inner: `NotFound` (404), `OrderMismatch` (400), `NotInClub` (400/404 — clubId·photoId 소유 일치 검증)
- `backend/src/test/java/com/duing/domain/club/photo/service/ClubPhotoCommandServiceTest.java` — 통합 테스트 (생성/캡션 수정/reorder 정상·불일치/삭제·재가입)
- `backend/src/test/java/com/duing/domain/club/controller/ClubPhotoControllerTest.java` — RestAssured (LEADER/OFFICER 201, MEMBER 403, 익명 401/403, reorder 불일치 400, 다른 동아리 photoId 404)

**Modify**
- `backend/src/main/java/com/duing/domain/club/photo/entity/ClubPhoto.java` — `updateCaption(String)` 메서드 추가 (`updateMeta` 는 displayOrder 함께 받지만 본 PR 은 책임 분리)
- `backend/src/main/java/com/duing/domain/club/photo/repository/ClubPhotoRepository.java` — `findMaxDisplayOrderByClubId(Long clubId)` (`@Query("SELECT COALESCE(MAX(p.displayOrder), -1) FROM ClubPhoto p WHERE p.club.id = :clubId")`) 추가. 페이로드 검증용 `findByClubId(Long clubId)` 추가.
- `backend/src/main/java/com/duing/domain/club/photo/service/ClubPhotoService.java` — create/updateCaption/reorder/delete 4 메서드 추가
- `backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java` — 구현
- `backend/src/main/java/com/duing/domain/club/api/ClubPhotoApi.java` — 4 엔드포인트 시그니처 추가
- `backend/src/main/java/com/duing/domain/club/controller/ClubPhotoController.java` — 4 핸들러 구현

**없음**
- 신규 마이그레이션 (V9 가 `club_photo` 테이블 정의함)
- 신규 권한 가드 (`ClubAuthService.requireManager` 재사용)

---

## Task 1: 브랜치 생성

- [ ] **Step 1: develop 동기화 + 분기**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/be-2-club-photos-cud
```

---

## Task 2: ClubPhoto 엔티티에 updateCaption() 메서드 추가 (단위 테스트 우선)

**Files:**
- Test: `backend/src/test/java/com/duing/domain/club/photo/entity/ClubPhotoUpdateTest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/photo/entity/ClubPhoto.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/club/photo/entity/ClubPhotoUpdateTest.java`:

```java
package com.duing.domain.club.photo.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubPhotoUpdateTest {

    @Test
    @DisplayName("updateCaption 은 caption 만 변경하고 displayOrder 는 유지한다")
    void updatesOnlyCaption() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "분과", "설명", null);
        ClubPhoto photo = ClubPhoto.create(club, "key.jpg", "원본 캡션", 100, 100, 5);

        photo.updateCaption("변경된 캡션");

        assertThat(photo.getCaption()).isEqualTo("변경된 캡션");
        assertThat(photo.getDisplayOrder()).isEqualTo(5);
    }

    @Test
    @DisplayName("changeDisplayOrder 는 displayOrder 만 변경한다")
    void updatesOnlyDisplayOrder() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "분과", "설명", null);
        ClubPhoto photo = ClubPhoto.create(club, "key.jpg", "캡션", 100, 100, 5);

        photo.changeDisplayOrder(2);

        assertThat(photo.getDisplayOrder()).isEqualTo(2);
        assertThat(photo.getCaption()).isEqualTo("캡션");
    }
}
```

- [ ] **Step 2: 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.club.photo.entity.ClubPhotoUpdateTest"
```

Expected: 컴파일 실패 (메서드 없음).

- [ ] **Step 3: 엔티티 메서드 구현**

`backend/src/main/java/com/duing/domain/club/photo/entity/ClubPhoto.java` 의 `updateMeta` 아래에 추가:

```java
    public void updateCaption(String caption) {
        this.caption = caption;
    }

    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
```

기존 `updateMeta(...)` 메서드는 본 PR 에서 사용하지 않지만 외부 호출자가 있을 수 있으니 그대로 둔다.

- [ ] **Step 4: 테스트 통과 확인 + 커밋**

```bash
./gradlew test --tests "com.duing.domain.club.photo.entity.ClubPhotoUpdateTest"
git add backend/src/main/java/com/duing/domain/club/photo/entity/ClubPhoto.java \
        backend/src/test/java/com/duing/domain/club/photo/entity/ClubPhotoUpdateTest.java
git commit -m "feat(backend): ClubPhoto caption/displayOrder 책임 분리 메서드 추가"
```

---

## Task 3: ClubPhotoException 도메인 예외 추가

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/photo/exception/ClubPhotoException.java`

- [ ] **Step 1: 작성**

```java
package com.duing.domain.club.photo.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubPhotoException extends ApplicationException {

    protected ClubPhotoException(String message, HttpStatus status) {
        super(message, status);
    }

    public static final class NotFound extends ClubPhotoException {
        public NotFound() {
            super("활동사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class NotInClub extends ClubPhotoException {
        public NotInClub() {
            super("해당 동아리에 속한 활동사진이 아닙니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class OrderMismatch extends ClubPhotoException {
        public OrderMismatch() {
            super("정렬 페이로드의 사진 집합이 현재 동아리 활동사진과 일치하지 않습니다.",
                    HttpStatus.BAD_REQUEST);
        }
    }
}
```

- [ ] **Step 2: 컴파일 확인 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/photo/exception/ClubPhotoException.java
git commit -m "feat(backend): 활동사진 도메인 예외 추가"
```

---

## Task 4: Command/Request DTO 추가

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/photo/service/dto/command/CreateClubPhotoCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/photo/service/dto/command/UpdateClubPhotoCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/photo/service/dto/command/ReorderClubPhotosCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateClubPhotoRequest.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubPhotoRequest.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/ReorderClubPhotosRequest.java`

- [ ] **Step 1: Command 3개 작성**

`CreateClubPhotoCommand.java`:
```java
package com.duing.domain.club.photo.service.dto.command;

public record CreateClubPhotoCommand(
        Long clubId,
        Long requesterId,
        String storageKey,
        String caption,
        Integer width,
        Integer height
) {}
```

`UpdateClubPhotoCommand.java`:
```java
package com.duing.domain.club.photo.service.dto.command;

public record UpdateClubPhotoCommand(
        Long clubId,
        Long requesterId,
        Long photoId,
        String caption
) {}
```

`ReorderClubPhotosCommand.java`:
```java
package com.duing.domain.club.photo.service.dto.command;

import java.util.List;

public record ReorderClubPhotosCommand(
        Long clubId,
        Long requesterId,
        List<PhotoOrder> orders
) {
    public record PhotoOrder(Long photoId, int displayOrder) {}
}
```

- [ ] **Step 2: Request 3개 작성**

`CreateClubPhotoRequest.java`:
```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateClubPhotoRequest(
        @NotBlank(message = "storageKey 는 필수입니다.")
        @Size(max = 500, message = "storageKey 는 500자 이하여야 합니다.")
        String storageKey,

        @Size(max = 200, message = "캡션은 200자 이하여야 합니다.")
        String caption,

        @PositiveOrZero(message = "width 는 0 이상이어야 합니다.")
        Integer width,

        @PositiveOrZero(message = "height 는 0 이상이어야 합니다.")
        Integer height
) {
    public CreateClubPhotoCommand toCommand(Long clubId, Long requesterId) {
        return new CreateClubPhotoCommand(clubId, requesterId, storageKey, caption, width, height);
    }
}
```

`UpdateClubPhotoRequest.java`:
```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import jakarta.validation.constraints.Size;

public record UpdateClubPhotoRequest(
        @Size(max = 200, message = "캡션은 200자 이하여야 합니다.")
        String caption
) {
    public UpdateClubPhotoCommand toCommand(Long clubId, Long requesterId, Long photoId) {
        return new UpdateClubPhotoCommand(clubId, requesterId, photoId, caption);
    }
}
```

`ReorderClubPhotosRequest.java`:
```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

public record ReorderClubPhotosRequest(
        @NotEmpty(message = "정렬할 사진이 비어 있습니다.")
        @Valid
        List<PhotoOrderItem> items
) {
    public ReorderClubPhotosCommand toCommand(Long clubId, Long requesterId) {
        return new ReorderClubPhotosCommand(
                clubId,
                requesterId,
                items.stream().map(item -> new PhotoOrder(item.photoId(), item.displayOrder())).toList()
        );
    }

    public record PhotoOrderItem(
            @NotNull(message = "photoId 는 필수입니다.") Long photoId,
            @PositiveOrZero(message = "displayOrder 는 0 이상이어야 합니다.") int displayOrder
    ) {}
}
```

- [ ] **Step 3: 컴파일 확인 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/photo/service/dto/command/ \
        backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateClubPhotoRequest.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubPhotoRequest.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/request/ReorderClubPhotosRequest.java
git commit -m "feat(backend): 활동사진 CUD Command/Request DTO 추가"
```

---

## Task 5: Repository 메서드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/photo/repository/ClubPhotoRepository.java`

- [ ] **Step 1: 메서드 추가**

```java
package com.duing.domain.club.photo.repository;

import com.duing.domain.club.photo.entity.ClubPhoto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubPhotoRepository extends JpaRepository<ClubPhoto, Long> {

    List<ClubPhoto> findByClubIdOrderByDisplayOrderAsc(Long clubId);

    List<ClubPhoto> findByClubId(Long clubId);

    @Query("SELECT COALESCE(MAX(p.displayOrder), -1) FROM ClubPhoto p WHERE p.club.id = :clubId")
    int findMaxDisplayOrderByClubId(@Param("clubId") Long clubId);
}
```

- [ ] **Step 2: 컴파일 확인 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/photo/repository/ClubPhotoRepository.java
git commit -m "feat(backend): ClubPhotoRepository 정렬·집합 조회 메서드 추가"
```

---

## Task 6: Service 인터페이스/구현 + 통합 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/photo/service/ClubPhotoService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java`
- Create: `backend/src/test/java/com/duing/domain/club/photo/service/ClubPhotoCommandServiceTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.domain.club.photo.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.exception.ClubPhotoException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubPhotoCommandServiceTest {

    @Autowired ClubPhotoService clubPhotoService;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("create 는 displayOrder 를 MAX+1 로 부여한다 (첫 사진은 0)")
    void createAssignsNextDisplayOrder() throws Exception {
        User officer = saveUser("운영진");
        Club club = saveActiveClub("두잉포토1");
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        Long firstId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), officer.getId(), "k1.jpg", "첫번째", 100, 100));
        Long secondId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), officer.getId(), "k2.jpg", "두번째", 100, 100));

        assertThat(clubPhotoRepository.findById(firstId).orElseThrow().getDisplayOrder()).isEqualTo(0);
        assertThat(clubPhotoRepository.findById(secondId).orElseThrow().getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("MEMBER 는 사진을 생성할 수 없다")
    void memberCannotCreate() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉포토2");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), memberUser.getId(), "k.jpg", null, null, null
        ))).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("updateCaption 은 caption 만 변경한다")
    void updateCaptionChangesOnlyCaption() throws Exception {
        User leader = saveUser("리더A");
        Club club = saveActiveClub("두잉포토3");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "k.jpg", "원본", 1, 1));

        clubPhotoService.updateCaption(new UpdateClubPhotoCommand(
                club.getId(), leader.getId(), photoId, "수정됨"));

        ClubPhoto reloaded = clubPhotoRepository.findById(photoId).orElseThrow();
        assertThat(reloaded.getCaption()).isEqualTo("수정됨");
        assertThat(reloaded.getDisplayOrder()).isEqualTo(0);
    }

    @Test
    @DisplayName("다른 동아리의 photoId 로 수정하면 NotInClub 이 발생한다")
    void updateRejectsForeignPhoto() throws Exception {
        User leader = saveUser("리더B");
        Club clubA = saveActiveClub("두잉포토4A");
        Club clubB = saveActiveClub("두잉포토4B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        clubMemberRepository.save(ClubMember.asLeader(clubB, leader));
        Long photoInB = clubPhotoService.create(new CreateClubPhotoCommand(
                clubB.getId(), leader.getId(), "kb.jpg", null, null, null));

        assertThatThrownBy(() -> clubPhotoService.updateCaption(new UpdateClubPhotoCommand(
                clubA.getId(), leader.getId(), photoInB, "x"
        ))).isInstanceOf(ClubPhotoException.NotInClub.class);
    }

    @Test
    @DisplayName("reorder 는 페이로드 photoId 집합이 동아리 photo 집합과 일치할 때만 성공한다")
    void reorderAppliesWhenSetsMatch() throws Exception {
        User leader = saveUser("리더C");
        Club club = saveActiveClub("두잉포토5");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null));
        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "2.jpg", null, null, null));
        Long p3 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "3.jpg", null, null, null));

        clubPhotoService.reorder(new ReorderClubPhotosCommand(
                club.getId(), leader.getId(),
                List.of(new PhotoOrder(p3, 0), new PhotoOrder(p1, 1), new PhotoOrder(p2, 2))));

        assertThat(clubPhotoRepository.findById(p3).orElseThrow().getDisplayOrder()).isEqualTo(0);
        assertThat(clubPhotoRepository.findById(p1).orElseThrow().getDisplayOrder()).isEqualTo(1);
        assertThat(clubPhotoRepository.findById(p2).orElseThrow().getDisplayOrder()).isEqualTo(2);
    }

    @Test
    @DisplayName("reorder 페이로드에 사진이 빠지면 OrderMismatch 가 발생한다")
    void reorderRejectsMissingPhoto() throws Exception {
        User leader = saveUser("리더D");
        Club club = saveActiveClub("두잉포토6");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null));
        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "2.jpg", null, null, null));

        assertThatThrownBy(() -> clubPhotoService.reorder(new ReorderClubPhotosCommand(
                club.getId(), leader.getId(),
                List.of(new PhotoOrder(p1, 0))
        ))).isInstanceOf(ClubPhotoException.OrderMismatch.class);

        // 미적용 검증
        assertThat(clubPhotoRepository.findById(p2).orElseThrow().getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("reorder displayOrder 가 0..N-1 연속이 아니면 OrderMismatch 가 발생한다")
    void reorderRejectsNonContiguousOrder() throws Exception {
        User leader = saveUser("리더E");
        Club club = saveActiveClub("두잉포토7");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null));
        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "2.jpg", null, null, null));

        assertThatThrownBy(() -> clubPhotoService.reorder(new ReorderClubPhotosCommand(
                club.getId(), leader.getId(),
                List.of(new PhotoOrder(p1, 0), new PhotoOrder(p2, 5))
        ))).isInstanceOf(ClubPhotoException.OrderMismatch.class);
    }

    @Test
    @DisplayName("delete 는 soft delete 후 list 에서 빠진다")
    void deleteRemovesFromList() throws Exception {
        User leader = saveUser("리더F");
        Club club = saveActiveClub("두잉포토8");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null));

        clubPhotoService.delete(club.getId(), leader.getId(), p1);

        assertThat(clubPhotoRepository.findByClubId(club.getId())).isEmpty();
    }

    @Test
    @DisplayName("delete 후 동일 storageKey 로 재등록 가능하다")
    void recreateAfterDelete() throws Exception {
        User leader = saveUser("리더G");
        Club club = saveActiveClub("두잉포토9");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "same.jpg", null, null, null));
        clubPhotoService.delete(club.getId(), leader.getId(), p1);

        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "same.jpg", null, null, null));

        assertThat(clubPhotoRepository.findById(p2).orElseThrow().getDisplayOrder()).isEqualTo(0);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
```

- [ ] **Step 2: 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.club.photo.service.ClubPhotoCommandServiceTest"
```

Expected: 컴파일 실패 (서비스 메서드 미정의).

- [ ] **Step 3: ClubPhotoService 인터페이스 확장**

```java
package com.duing.domain.club.photo.service;

import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;

public interface ClubPhotoService {
    List<ClubPhotoQuery> getPhotosByClubId(Long clubId);

    Long create(CreateClubPhotoCommand command);

    void updateCaption(UpdateClubPhotoCommand command);

    List<ClubPhotoQuery> reorder(ReorderClubPhotosCommand command);

    void delete(Long clubId, Long requesterId, Long photoId);
}
```

- [ ] **Step 4: GeneralClubPhotoService 구현**

```java
package com.duing.domain.club.photo.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.exception.ClubPhotoException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import com.duing.domain.clubmember.service.ClubAuthService;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubPhotoService implements ClubPhotoService {

    private final ClubPhotoRepository clubPhotoRepository;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;

    @Override
    public List<ClubPhotoQuery> getPhotosByClubId(Long clubId) {
        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public Long create(CreateClubPhotoCommand command) {
        clubAuthService.requireManager(command.requesterId(), command.clubId());
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        int nextOrder = clubPhotoRepository.findMaxDisplayOrderByClubId(command.clubId()) + 1;
        ClubPhoto photo = ClubPhoto.create(
                club, command.storageKey(), command.caption(),
                command.width(), command.height(), nextOrder
        );
        return clubPhotoRepository.save(photo).getId();
    }

    @Override
    @Transactional
    public void updateCaption(UpdateClubPhotoCommand command) {
        clubAuthService.requireManager(command.requesterId(), command.clubId());
        ClubPhoto photo = findPhotoInClub(command.photoId(), command.clubId());
        photo.updateCaption(command.caption());
    }

    @Override
    @Transactional
    public List<ClubPhotoQuery> reorder(ReorderClubPhotosCommand command) {
        clubAuthService.requireManager(command.requesterId(), command.clubId());

        List<ClubPhoto> current = clubPhotoRepository.findByClubId(command.clubId());
        Set<Long> currentIds = current.stream().map(ClubPhoto::getId).collect(Collectors.toSet());
        Set<Long> payloadIds = command.orders().stream()
                .map(PhotoOrder::photoId).collect(Collectors.toSet());

        if (!currentIds.equals(payloadIds)) {
            throw new ClubPhotoException.OrderMismatch();
        }

        // displayOrder 0..N-1 연속 검증
        int expected = current.size();
        Set<Integer> displayOrders = command.orders().stream()
                .map(PhotoOrder::displayOrder).collect(Collectors.toSet());
        if (displayOrders.size() != expected) {
            throw new ClubPhotoException.OrderMismatch();
        }
        for (int i = 0; i < expected; i++) {
            if (!displayOrders.contains(i)) {
                throw new ClubPhotoException.OrderMismatch();
            }
        }

        Map<Long, ClubPhoto> byId = current.stream().collect(Collectors.toMap(ClubPhoto::getId, p -> p));
        command.orders().forEach(order ->
                byId.get(order.photoId()).changeDisplayOrder(order.displayOrder()));

        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(command.clubId()).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long requesterId, Long photoId) {
        clubAuthService.requireManager(requesterId, clubId);
        ClubPhoto photo = findPhotoInClub(photoId, clubId);
        clubPhotoRepository.delete(photo);
    }

    private ClubPhoto findPhotoInClub(Long photoId, Long clubId) {
        ClubPhoto photo = clubPhotoRepository.findById(photoId)
                .orElseThrow(ClubPhotoException.NotFound::new);
        if (!photo.getClub().getId().equals(clubId)) {
            throw new ClubPhotoException.NotInClub();
        }
        return photo;
    }
}
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
./gradlew test --tests "com.duing.domain.club.photo.service.ClubPhotoCommandServiceTest"
git add backend/src/main/java/com/duing/domain/club/photo/service/ClubPhotoService.java \
        backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java \
        backend/src/test/java/com/duing/domain/club/photo/service/ClubPhotoCommandServiceTest.java
git commit -m "feat(backend): 활동사진 CUD Service 추가"
```

---

## Task 7: API 인터페이스 + Controller 핸들러 4개

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubPhotoApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubPhotoController.java`

- [ ] **Step 1: ClubPhotoApi 확장**

```java
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateClubPhotoRequest;
import com.duing.domain.club.controller.dto.request.ReorderClubPhotosRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubPhotoRequest;
import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "동아리 사진", description = "동아리 활동사진")
public interface ClubPhotoApi {

    @Operation(summary = "활동사진 목록 (공개)", description = "displayOrder 오름차순.")
    @GetMapping("/clubs/{clubId}/photos")
    ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> listPhotos(@PathVariable Long clubId);

    @Operation(summary = "활동사진 등록 (LEADER/OFFICER)",
            description = "운영진이 storageKey 와 메타데이터를 보내 사진을 등록한다. displayOrder 는 자동 부여.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/photos")
    ResponseEntity<ApiResponse<Long>> createPhoto(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubPhotoRequest createClubPhotoRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활동사진 캡션 수정 (LEADER/OFFICER)")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}/photos/{photoId}")
    ResponseEntity<ApiResponse<Void>> updatePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @Valid @RequestBody UpdateClubPhotoRequest updateClubPhotoRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활동사진 일괄 정렬 (LEADER/OFFICER)",
            description = "전체 사진의 새 displayOrder 를 한번에 보낸다. 페이로드 집합이 현재 사진 집합과 일치해야 한다.")
    @SecurityRequirement(name = "bearerAuth")
    @PutMapping("/clubs/{clubId}/photos/order")
    ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> reorderPhotos(
            @PathVariable Long clubId,
            @Valid @RequestBody ReorderClubPhotosRequest reorderClubPhotosRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활동사진 삭제 (LEADER/OFFICER)")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/photos/{photoId}")
    ResponseEntity<Void> deletePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: ClubPhotoController 확장**

```java
package com.duing.domain.club.controller;

import com.duing.domain.club.api.ClubPhotoApi;
import com.duing.domain.club.controller.dto.request.CreateClubPhotoRequest;
import com.duing.domain.club.controller.dto.request.ReorderClubPhotosRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubPhotoRequest;
import com.duing.domain.club.controller.dto.response.ClubPhotoResponse;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
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

    @Override
    public ResponseEntity<ApiResponse<Long>> createPhoto(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubPhotoRequest createClubPhotoRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long photoId = clubPhotoService.create(
                createClubPhotoRequest.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(photoId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updatePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @Valid @RequestBody UpdateClubPhotoRequest updateClubPhotoRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubPhotoService.updateCaption(
                updateClubPhotoRequest.toCommand(clubId, currentUser.id(), photoId));
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @Override
    public ResponseEntity<ApiResponse<List<ClubPhotoResponse>>> reorderPhotos(
            @PathVariable Long clubId,
            @Valid @RequestBody ReorderClubPhotosRequest reorderClubPhotosRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ClubPhotoResponse> photos = clubPhotoService.reorder(
                reorderClubPhotosRequest.toCommand(clubId, currentUser.id())).stream()
                .map(ClubPhotoResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(photos));
    }

    @Override
    public ResponseEntity<Void> deletePhoto(
            @PathVariable Long clubId,
            @PathVariable Long photoId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubPhotoService.delete(clubId, currentUser.id(), photoId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 3: 컴파일 확인 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/club/api/ClubPhotoApi.java \
        backend/src/main/java/com/duing/domain/club/controller/ClubPhotoController.java
git commit -m "feat(backend): 활동사진 CUD API/Controller 추가"
```

---

## Task 8: Controller 통합 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/ClubPhotoControllerTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ClubPhotoControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private Club club;
    private String leaderToken;
    private String officerToken;
    private String memberToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("리더");
        officerUser = saveUser("운영");
        memberUser = saveUser("일반");
        club = saveActiveClub("두잉포토컨트롤러");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    @Test
    @DisplayName("OFFICER 가 POST 하면 201 과 photoId 를 반환한다")
    void officerCreatesReturns201() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", "k.jpg", "caption", "사진"))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("MEMBER 가 POST 하면 403 을 반환한다")
    void memberCannotCreate() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", "k.jpg"))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("storageKey 가 비면 400 을 반환한다")
    void emptyStorageKeyReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", ""))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("PATCH 캡션 수정 후 GET 으로 변경이 반영된다")
    void patchUpdatesCaption() {
        ClubPhoto photo = clubPhotoRepository.save(ClubPhoto.create(club, "k.jpg", "원본", 1, 1, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("caption", "변경됨"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/photos/{photoId}", club.getId(), photo.getId())
                .then()
                    .statusCode(HttpStatus.OK.value());

        assertThat(clubPhotoRepository.findById(photo.getId()).orElseThrow().getCaption())
                .isEqualTo("변경됨");
    }

    @Test
    @DisplayName("다른 동아리의 photoId 로 PATCH 하면 404 를 반환한다")
    void patchForeignPhotoReturns404() throws Exception {
        Club otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, leaderUser));
        ClubPhoto photoInOther = clubPhotoRepository.save(
                ClubPhoto.create(otherClub, "k.jpg", null, null, null, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("caption", "x"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/photos/{photoId}", club.getId(), photoInOther.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("PUT /order 페이로드 누락 시 400 을 반환한다")
    void reorderMismatchReturns400() {
        ClubPhoto p1 = clubPhotoRepository.save(ClubPhoto.create(club, "1.jpg", null, null, null, 0));
        clubPhotoRepository.save(ClubPhoto.create(club, "2.jpg", null, null, null, 1));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("items", List.of(Map.of("photoId", p1.getId(), "displayOrder", 0))))
                .when()
                    .put("/api/v1/clubs/{clubId}/photos/order", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("DELETE 후 GET 목록에서 빠진다")
    void deleteRemovesFromList() {
        ClubPhoto photo = clubPhotoRepository.save(ClubPhoto.create(club, "k.jpg", null, null, null, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/photos/{photoId}", club.getId(), photo.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(club.getId())).isEmpty();
    }

    @Test
    @DisplayName("인증 없이 POST 하면 4xx 인증 오류를 반환한다")
    void anonymousCreateRejected() {
        int status = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", "k.jpg"))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 실행 + 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.club.controller.ClubPhotoControllerTest"
```

Expected: 8 tests, PASS.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/ClubPhotoControllerTest.java
git commit -m "test(backend): 활동사진 CUD 컨트롤러 통합 테스트 추가"
```

---

## Task 9: 전체 회귀 + 푸시 + PR

- [ ] **Step 1: 전체 테스트**

```bash
./gradlew test
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/be-2-club-photos-cud
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(backend): 활동사진 CUD API (POST/PATCH/PUT order/DELETE)" --body "$(cat <<'EOF'
## 🚀 작업 내용
LEADER/OFFICER 가 자기 동아리의 활동사진을 등록·캡션 수정·드래그 정렬·삭제할 수 있도록 4개 엔드포인트를 추가했다. 파일 자체는 기존 `POST /api/v1/files` 로 업로드한 뒤 반환된 `storageKey` 를 본 API 로 보내는 2-step 구조다. displayOrder 는 등록 시 자동으로 마지막 + 1 이 부여되고, 일괄 정렬 API 는 페이로드의 photoId 집합이 현재 사진 집합과 정확히 일치하고 displayOrder 가 0..N-1 연속 정수일 때만 적용된다.

스펙: `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.2.

## 🤔 고민했던 내용
정렬 API 를 항목별 PATCH 대신 일괄 PUT 으로 둔 이유는 드래그앤드롭 한 번에 트랜잭션이 닫혀야 중간 실패로 순서가 깨지지 않기 때문이다. 페이로드 검증을 "집합 일치 + 0..N-1 연속" 으로 엄격하게 두어, 부분 갱신이나 잘못된 인덱스가 들어와도 즉시 400 으로 차단한다.

다른 동아리에 속한 photoId 로 접근하는 시도는 `ClubPhotoException.NotInClub` 으로 404 처리해 정보 노출을 막았다. 캡션 수정과 displayOrder 변경은 엔티티 단에서도 메서드를 분리(`updateCaption`, `changeDisplayOrder`) 해 책임 경계가 호출부에서도 드러나게 했다.

## 💬 리뷰 중점사항
- displayOrder 자동 부여(MAX+1) 가 동시 등록 시 같은 값이 나올 가능성 — 본 PR 은 트랜잭션 + 단일 LEADER/OFFICER 사용을 전제로 한 단순 구현. unique 인덱스가 없으므로 향후 보강 후보.
- reorder 의 "집합 일치 + 0..N-1 연속" 두 단계 검증 의도
- soft delete 후 동일 storageKey 재등록 가능성
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] 스펙 §3.2 의 4개 엔드포인트 모두 구현 (POST/PATCH/PUT order/DELETE).
- [ ] 권한 가드: 모두 `requireManager` (LEADER+OFFICER), 테스트 커버 (MEMBER 403, 익명 401/403).
- [ ] displayOrder 자동 부여 = MAX+1 (첫 사진은 0).
- [ ] reorder: photoId 집합 불일치 → 400, displayOrder 비연속 → 400, 정상 → 200 + 정렬된 목록.
- [ ] 다른 동아리의 photoId → 404 (`NotInClub`).
- [ ] 삭제는 soft delete (BaseEntity `@SQLDelete`), Storage 객체는 그대로 둠.
- [ ] 새 Flyway 파일 0건 (V9 이미 존재).
- [ ] 커밋 메시지 `feat(backend)/test(backend): ...` 형식, 한국어, Claude 어트리뷰션 없음.

---

## Out of Scope

- Storage 객체 정리 잡 (Phase 5).
- displayOrder 동시 등록 경합의 unique index 보강 (필요 시 후속 PR).
- 사진 일괄 등록 (다중 파일 한 번에) — 본 PR 은 단건 등록만.
- 프론트엔드 (FE-2 PR).
