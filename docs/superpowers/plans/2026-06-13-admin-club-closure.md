# 동아리 폐쇄 (Admin Club Closure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN)이 운영 중단(INACTIVE) 동아리를 폐쇄(soft-delete)하면, 동아리와 진행 중인 모집·지원·면접·인증·홍보·멤버십·이벤트·즐겨찾기가 한 트랜잭션으로 종료되고 모든 앱에서 사라진다.

**Architecture:** 신규 `POST /api/v1/admin/clubs/{clubId}/close` 엔드포인트 → 신규 `ClubClosureService`가 각 도메인 서비스의 `...OnClubClosure(...)` cascade 메서드를 하나의 `@Transactional` 안에서 순서대로 호출 → 마지막에 `Club` soft-delete. 하위 데이터는 각 엔티티의 기존 `@SQLDelete`/상태 전이로 정리하며, soft-delete가 없던 `ClubFavorite`에만 컬럼/어노테이션을 추가한다.

**Tech Stack:** Backend — Spring Boot 3.4 / Java 21 / JPA·QueryDSL / Flyway / RestAssured·TestContainers. Frontend — Next.js 15 App Router / React 19 / TanStack Query / Tailwind / Vitest·Testing Library.

**참고 스펙:** `docs/superpowers/specs/2026-06-13-admin-club-closure-design.md`

---

## File Structure

### Backend — 신규 파일
| 파일 | 책임 |
|---|---|
| `domain/club/service/dto/command/CloseClubCommand.java` | 폐쇄 커맨드 (clubId, actorUserId, closureReason) |
| `domain/club/controller/dto/request/CloseClubRequest.java` | 폐쇄 요청 DTO (선택 closureReason → 기본값 "동아리 폐쇄") |
| `domain/club/service/ClubClosureService.java` | 폐쇄 오케스트레이션 인터페이스 |
| `domain/club/service/GeneralClubClosureService.java` | cascade 오케스트레이션 구현 (단일 @Transactional) |
| `db/migration/V51__alter_club_favorite_add_deleted_at.sql` | club_favorite soft-delete 컬럼 |

### Backend — 수정 파일
| 파일 | 변경 |
|---|---|
| `domain/club/entity/Club.java` | `validateClosable()` 추가 |
| `domain/club/exception/ClubException.java` | `ClubNotClosableException` 추가 |
| `domain/club/api/AdminClubApi.java` | `closeClub(...)` 선언 |
| `domain/club/controller/AdminClubController.java` | `ClubClosureService` 주입 + `closeClub(...)` 구현 |
| `domain/clubmember/service/ClubMemberCommandService.java`(+General) | `removeAllOnClubClosure(...)` |
| `domain/clubmember/service/LeaderSuccessionService.java`(+General) | `cancelPendingOnClubClosure(...)` |
| `domain/recruitment/service/RecruitmentService.java`(+General) | `closeAllOnClubClosure(...)` → `List<Long>` |
| `domain/application/service/ApplicationService.java`(+General) | `rejectActiveOnClubClosure(...)` |
| `domain/application/repository/ApplicationRepository.java` | `findByRecruitmentIdInAndStatusIn(...)` |
| `domain/interview/service/InterviewRoundService.java`(+General) | `softDeleteAllOnClubClosure(...)` |
| `domain/club/service/RecertificationRequestService.java`(+General) | `rejectPendingOnClubClosure(...)` |
| `domain/club/repository/RecertificationRequestRepository.java` | `findByClubIdAndStatus(...)` (List) |
| `domain/promotion/service/PromotionService.java`(+General) | `removeAllOnClubClosure(...)` |
| `domain/promotion/repository/PromotionRepository.java` | `findAllByClubId(...)` |
| `domain/promotion/service/PromotionRequestService.java`(+General) | `rejectPendingOnClubClosure(...)` |
| `domain/promotion/repository/PromotionRequestRepository.java` | `findAllByClubIdAndStatus(...)` |
| `domain/clubevent/service/ClubEventService.java`(+General) | `removeAllOnClubClosure(...)` |
| `domain/clubevent/repository/ClubEventRepository.java` | `findAllByClubId(...)` |
| `domain/favorite/entity/ClubFavorite.java` | soft-delete 어노테이션 + `deletedAt` |
| `domain/favorite/repository/ClubFavoriteRepository.java` | `findAllByClubId(...)` |
| `domain/favorite/service/ClubFavoriteService.java`(+General) | `removeAllOnClubClosure(...)` |

### Backend — 테스트
| 파일 | 변경 |
|---|---|
| `test/.../domain/club/controller/AdminClubClosureControllerTest.java` | 신규 — 엔드포인트 계약 + 가드 + 멤버십 cascade |

### Frontend — 신규/수정
| 파일 | 변경 |
|---|---|
| `packages/types/src/club.ts` | `CloseClubPayload` 타입 |
| `packages/api/src/client.ts` | `clubs.close(...)` 타입 + 구현 |
| `packages/hooks/src/admin.ts` | `useCloseClubMutation()` |
| `apps/web/app/admin/clubs/_components/AdminClubDeleteDialog.tsx` | 신규 — 동아리명 입력 확인 다이얼로그 |
| `apps/web/app/admin/clubs/_components/AdminClubsTable.tsx` | INACTIVE 행에 폐쇄 버튼 + `onCloseClick` prop |
| `apps/web/app/admin/clubs/_pages/AdminClubsListPage.tsx` | 폐쇄 다이얼로그 상태 + mutation 배선 |
| `apps/web/test/admin/clubs/club-delete-dialog.test.tsx` | 신규 — 다이얼로그 테스트 |

---

## 진행 순서 개요

- **Phase 1 — 백엔드 기반**: 예외 / 커맨드·요청 DTO / `Club.validateClosable()` / 마이그레이션 / ClubFavorite soft-delete
- **Phase 2 — 도메인별 cascade 메서드**: 각 도메인 서비스에 `...OnClubClosure(...)` + 필요한 repository 쿼리
- **Phase 3 — 오케스트레이션 + 엔드포인트**: `ClubClosureService` / `AdminClubApi`·`AdminClubController`
- **Phase 4 — 백엔드 통합 테스트**: 가드 + 멤버십 cascade + 추가 cascade 검증
- **Phase 5 — 프론트엔드**: 타입 → api → hook → 다이얼로그(TDD) → 테이블 → 페이지

> 컴파일 의존성상 백엔드는 bottom-up(기반 → cascade → 서비스 → 엔드포인트 → 테스트)으로 빌드 후 통합 테스트로 검증한다. 프론트 다이얼로그는 test-first.

---

## Phase 1 — 백엔드 기반

### Task 1: `ClubNotClosableException` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/exception/ClubException.java`

- [ ] **Step 1: 예외 inner class 추가** (`RejectionReasonRequiredException` 아래)

```java
    public static class ClubNotClosableException extends ClubException {
        public ClubNotClosableException(String currentStatus) {
            super("운영 중단(INACTIVE) 상태의 동아리만 폐쇄할 수 있습니다. 현재 상태: " + currentStatus,
                    HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/exception/ClubException.java
git commit -m "feat(backend): 동아리 폐쇄 불가 예외 추가"
```

### Task 2: `Club.validateClosable()` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

- [ ] **Step 1: 메서드 추가** (`changeStatus(...)` 메서드 아래)

```java
    /** 폐쇄 가능 여부 검증. 운영 중단(INACTIVE) 상태만 허용한다. */
    public void validateClosable() {
        if (this.status != ClubStatus.INACTIVE) {
            throw new ClubException.ClubNotClosableException(this.status.name());
        }
    }
```

- [ ] **Step 2: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/entity/Club.java
git commit -m "feat(backend): Club 폐쇄 가능 상태 검증 메서드 추가"
```

### Task 3: `CloseClubCommand` / `CloseClubRequest` DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/command/CloseClubCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/CloseClubRequest.java`

- [ ] **Step 1: `CloseClubCommand` 작성**

```java
package com.duing.domain.club.service.dto.command;

public record CloseClubCommand(
        Long clubId,
        Long actorUserId,
        String closureReason
) {}
```

- [ ] **Step 2: `CloseClubRequest` 작성** (사유 미입력 시 기본값 "동아리 폐쇄")

```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.CloseClubCommand;
import jakarta.validation.constraints.Size;

public record CloseClubRequest(
        @Size(max = 500, message = "폐쇄 사유는 500자 이하여야 합니다.")
        String closureReason
) {
    private static final String DEFAULT_REASON = "동아리 폐쇄";

    public CloseClubCommand toCommand(Long clubId, Long actorUserId) {
        String normalized = (closureReason == null || closureReason.isBlank())
                ? DEFAULT_REASON
                : closureReason.strip();
        return new CloseClubCommand(clubId, actorUserId, normalized);
    }
}
```

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/command/CloseClubCommand.java backend/src/main/java/com/duing/domain/club/controller/dto/request/CloseClubRequest.java
git commit -m "feat(backend): 동아리 폐쇄 커맨드·요청 DTO 추가"
```

### Task 4: `club_favorite` soft-delete 마이그레이션 + 엔티티

**Files:**
- Create: `backend/src/main/resources/db/migration/V51__alter_club_favorite_add_deleted_at.sql`
- Modify: `backend/src/main/java/com/duing/domain/favorite/entity/ClubFavorite.java`

> 최신 마이그레이션은 `V50`. 다른 PR이 먼저 머지되면 다음 번호로 조정한다.

- [ ] **Step 1: 마이그레이션 작성**

```sql
ALTER TABLE club_favorite ADD COLUMN deleted_at TIMESTAMP;
```

- [ ] **Step 2: `ClubFavorite`에 soft-delete 추가** — import + 클래스 어노테이션 + 필드

import 추가:
```java
import jakarta.persistence.Column;
import java.time.LocalDateTime;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
```

클래스 선언 위 어노테이션 추가 (`@Table(...)` 아래, `@NoArgsConstructor` 위 또는 인접):
```java
@SQLDelete(sql = "UPDATE club_favorite SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
```

필드 추가 (`createdAt` 필드 아래):
```java
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;
```

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V51__alter_club_favorite_add_deleted_at.sql backend/src/main/java/com/duing/domain/favorite/entity/ClubFavorite.java
git commit -m "feat(backend): 즐겨찾기 soft-delete 지원 추가"
```

---

## Phase 2 — 도메인별 cascade 메서드

> 각 cascade 메서드는 리더/매니저 권한검사를 거치지 않는다(ADMIN 폐쇄 컨텍스트). 엔티티 상태 전이 또는 `@SQLDelete` soft-delete만 수행한다.

### Task 5: ClubMember 일괄 제거 cascade

**Files:**
- Modify: `backend/.../domain/clubmember/service/ClubMemberCommandService.java`
- Modify: `backend/.../domain/clubmember/service/GeneralClubMemberCommandService.java`

- [ ] **Step 1: 인터페이스에 메서드 추가** (`ClubMemberCommandService`)

```java
    void removeAllOnClubClosure(Long clubId, Long actorUserId, String reason);
```

- [ ] **Step 2: 구현 추가** (`GeneralClubMemberCommandService`) — 기존 `findAllByClubIdOrderedByRoleAndJoinedAt`(JOIN FETCH user) + 행별 history 기록 + 일괄 soft-delete

```java
    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId, Long actorUserId, String reason) {
        List<ClubMember> members = clubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId);
        for (ClubMember member : members) {
            historyRecorder.record(
                    clubId, member.getUser().getId(), actorUserId,
                    ClubMemberEventType.REMOVED, member.getRole(), null, reason);
        }
        clubMemberRepository.deleteAll(members);
    }
```

`import java.util.List;` 누락 시 추가.

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberCommandService.java backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java
git commit -m "feat(backend): 폐쇄 시 전 멤버 제거 cascade 추가"
```

### Task 6: 동아리장 위임요청 종료 cascade

**Files:**
- Modify: `backend/.../domain/clubmember/service/LeaderSuccessionService.java`
- Modify: `backend/.../domain/clubmember/service/GeneralLeaderSuccessionService.java`

- [ ] **Step 1: 인터페이스에 메서드 추가** (`LeaderSuccessionService`)

```java
    void cancelPendingOnClubClosure(Long clubId, Long actorAdminId, String reason);
```

- [ ] **Step 2: 구현 추가** (`GeneralLeaderSuccessionService`) — club당 PENDING 요청은 유니크하므로 Optional 처리

```java
    @Override
    @Transactional
    public void cancelPendingOnClubClosure(Long clubId, Long actorAdminId, String reason) {
        requestRepository.findByClubIdAndStatus(clubId, SuccessionStatus.PENDING)
                .ifPresent(request -> request.process(actorAdminId, SuccessionStatus.REJECTED, reason));
    }
```

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/service/LeaderSuccessionService.java backend/src/main/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionService.java
git commit -m "feat(backend): 폐쇄 시 위임요청 종료 cascade 추가"
```

### Task 7: 모집 일괄 마감 cascade (모집 id 목록 반환)

**Files:**
- Modify: `backend/.../domain/recruitment/service/RecruitmentService.java`
- Modify: `backend/.../domain/recruitment/service/GeneralRecruitmentService.java`

- [ ] **Step 1: 인터페이스에 메서드 추가** (`RecruitmentService`)

```java
    java.util.List<Long> closeAllOnClubClosure(Long clubId);
```

- [ ] **Step 2: 구현 추가** (`GeneralRecruitmentService`) — 전체 모집 조회 후 OPEN 만 close(), 전체 id 반환

```java
    @Override
    @Transactional
    public List<Long> closeAllOnClubClosure(Long clubId) {
        List<Recruitment> recruitments =
                recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(clubId);
        for (Recruitment recruitment : recruitments) {
            if (recruitment.getStatus() == RecruitmentStatus.OPEN) {
                recruitment.close();
            }
        }
        return recruitments.stream().map(Recruitment::getId).toList();
    }
```

`import java.util.List;`, `import com.duing.domain.recruitment.entity.RecruitmentStatus;` 누락 시 추가.

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/recruitment/service/RecruitmentService.java backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java
git commit -m "feat(backend): 폐쇄 시 모집 일괄 마감 cascade 추가"
```

### Task 8: 활성 지원서 일괄 거절 cascade

**Files:**
- Modify: `backend/.../domain/application/repository/ApplicationRepository.java`
- Modify: `backend/.../domain/application/service/ApplicationService.java`
- Modify: `backend/.../domain/application/service/GeneralApplicationService.java`

> 폐쇄는 시스템 일괄 처리이므로 ApplicationStatusHistory 는 기록하지 않는다(스펙: 알림·이력 발송은 Future TODO). 상태 전이만 수행한다.

- [ ] **Step 1: repository 쿼리 추가** (`ApplicationRepository`)

```java
    @Query("SELECT a FROM Application a WHERE a.recruitment.id IN :recruitmentIds AND a.status IN :statuses")
    List<Application> findByRecruitmentIdInAndStatusIn(
            @Param("recruitmentIds") java.util.Collection<Long> recruitmentIds,
            @Param("statuses") java.util.Collection<ApplicationStatus> statuses);
```

`import` 누락 시: `com.duing.domain.application.entity.Application`, `com.duing.domain.application.entity.ApplicationStatus`, `java.util.List`, `org.springframework.data.jpa.repository.Query`, `org.springframework.data.repository.query.Param`.

- [ ] **Step 2: 인터페이스에 메서드 추가** (`ApplicationService`)

```java
    void rejectActiveOnClubClosure(java.util.List<Long> recruitmentIds);
```

- [ ] **Step 3: 구현 추가** (`GeneralApplicationService`)

```java
    @Override
    @Transactional
    public void rejectActiveOnClubClosure(List<Long> recruitmentIds) {
        if (recruitmentIds.isEmpty()) {
            return;
        }
        List<ApplicationStatus> activeStatuses = List.of(
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.INTERVIEW_PENDING);
        List<Application> applications =
                applicationRepository.findByRecruitmentIdInAndStatusIn(recruitmentIds, activeStatuses);
        for (Application application : applications) {
            application.transitionTo(
                    ApplicationStatus.REJECTED,
                    application.getRecruitment().isUseInterview());
        }
    }
```

`import java.util.List;` 누락 시 추가.

- [ ] **Step 4: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/application/
git commit -m "feat(backend): 폐쇄 시 활성 지원서 일괄 거절 cascade 추가"
```

### Task 9: 면접 라운드·일정 일괄 정리 cascade

**Files:**
- Modify: `backend/.../domain/interview/service/InterviewRoundService.java`
- Modify: `backend/.../domain/interview/service/GeneralInterviewRoundService.java`

> `InterviewRound.cancel()` 은 SCHEDULED/CANCELLED 라운드에서 예외를 던지므로, 폐쇄에서는 상태 전이 대신 **soft-delete**(`@SQLDelete`)로 라운드를 제거한다. 일정은 `softDeleteByRoundId` 로 정리한다.

- [ ] **Step 1: 인터페이스에 메서드 추가** (`InterviewRoundService`)

```java
    void softDeleteAllOnClubClosure(java.util.List<Long> recruitmentIds);
```

- [ ] **Step 2: 구현 추가** (`GeneralInterviewRoundService`)

```java
    @Override
    @Transactional
    public void softDeleteAllOnClubClosure(List<Long> recruitmentIds) {
        for (Long recruitmentId : recruitmentIds) {
            List<InterviewRound> rounds =
                    interviewRoundRepository.findByRecruitmentIdOrderByCreatedAtDesc(recruitmentId);
            for (InterviewRound round : rounds) {
                interviewScheduleRepository.softDeleteByRoundId(round.getId());
                interviewRoundRepository.delete(round);
            }
        }
    }
```

`import java.util.List;`, `import com.duing.domain.interview.entity.InterviewRound;` 누락 시 추가.

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/interview/service/InterviewRoundService.java backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewRoundService.java
git commit -m "feat(backend): 폐쇄 시 면접 라운드·일정 정리 cascade 추가"
```

### Task 10: 인증요청 일괄 거절 cascade (라운드는 미종료)

**Files:**
- Modify: `backend/.../domain/club/repository/RecertificationRequestRepository.java`
- Modify: `backend/.../domain/club/service/RecertificationRequestService.java`
- Modify: `backend/.../domain/club/service/GeneralRecertificationRequestService.java`

- [ ] **Step 1: repository 쿼리 추가** (`RecertificationRequestRepository`) — clubId 기준 List

```java
    java.util.List<RecertificationRequest> findByClubIdAndStatus(Long clubId, RecertificationStatus status);
```

- [ ] **Step 2: 인터페이스에 메서드 추가** (`RecertificationRequestService`)

```java
    void rejectPendingOnClubClosure(Long clubId, Long actorAdminId, String reason);
```

- [ ] **Step 3: 구현 추가** (`GeneralRecertificationRequestService`) — 공유 라운드는 닫지 않고 해당 동아리 요청만 거절

```java
    @Override
    @Transactional
    public void rejectPendingOnClubClosure(Long clubId, Long actorAdminId, String reason) {
        List<RecertificationRequest> pending =
                requestRepository.findByClubIdAndStatus(clubId, RecertificationStatus.PENDING);
        for (RecertificationRequest request : pending) {
            request.process(actorAdminId, RecertificationStatus.REJECTED, reason);
        }
    }
```

`import java.util.List;` 누락 시 추가.

- [ ] **Step 4: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepository.java backend/src/main/java/com/duing/domain/club/service/RecertificationRequestService.java backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRequestService.java
git commit -m "feat(backend): 폐쇄 시 인증요청 거절 cascade 추가"
```

### Task 11: 홍보·홍보요청 정리 cascade

**Files:**
- Modify: `backend/.../domain/promotion/repository/PromotionRepository.java`
- Modify: `backend/.../domain/promotion/repository/PromotionRequestRepository.java`
- Modify: `backend/.../domain/promotion/service/PromotionService.java` (+ `GeneralPromotionService`)
- Modify: `backend/.../domain/promotion/service/PromotionRequestService.java` (+ `GeneralPromotionRequestService`)

- [ ] **Step 1: repository 쿼리 추가**

`PromotionRepository`:
```java
    java.util.List<Promotion> findAllByClubId(Long clubId);
```

`PromotionRequestRepository`:
```java
    java.util.List<PromotionRequest> findAllByClubIdAndStatus(Long clubId, PromotionRequestStatus status);
```

- [ ] **Step 2: Promotion soft-delete cascade** — `PromotionService` 인터페이스 + `GeneralPromotionService`

인터페이스:
```java
    void removeAllOnClubClosure(Long clubId);
```
구현:
```java
    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        promotionRepository.deleteAll(promotionRepository.findAllByClubId(clubId));
    }
```

- [ ] **Step 3: PromotionRequest 거절 cascade** — `PromotionRequestService` 인터페이스 + `GeneralPromotionRequestService`

인터페이스:
```java
    void rejectPendingOnClubClosure(Long clubId, Long actorAdminId, String reason);
```
구현 (주입된 PromotionRequestRepository 필드명에 맞춰 `requestRepository` 부분 수정):
```java
    @Override
    @Transactional
    public void rejectPendingOnClubClosure(Long clubId, Long actorAdminId, String reason) {
        List<PromotionRequest> pending =
                requestRepository.findAllByClubIdAndStatus(clubId, PromotionRequestStatus.PENDING);
        for (PromotionRequest request : pending) {
            request.process(actorAdminId, PromotionRequestStatus.REJECTED, reason);
        }
    }
```

`import java.util.List;` 및 엔티티/enum import 누락 시 추가.

- [ ] **Step 4: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/promotion/
git commit -m "feat(backend): 폐쇄 시 홍보·홍보요청 정리 cascade 추가"
```

### Task 12: 동아리 이벤트 정리 cascade

**Files:**
- Modify: `backend/.../domain/clubevent/repository/ClubEventRepository.java`
- Modify: `backend/.../domain/clubevent/service/ClubEventService.java` (+ `GeneralClubEventService`)

- [ ] **Step 1: repository 쿼리 추가** (`ClubEventRepository`)

```java
    java.util.List<ClubEvent> findAllByClubId(Long clubId);
```

- [ ] **Step 2: 인터페이스 + 구현 추가**

`ClubEventService`:
```java
    void removeAllOnClubClosure(Long clubId);
```
`GeneralClubEventService`:
```java
    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        eventRepository.deleteAll(eventRepository.findAllByClubId(clubId));
    }
```

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubevent/
git commit -m "feat(backend): 폐쇄 시 동아리 이벤트 정리 cascade 추가"
```

### Task 13: 즐겨찾기 정리 cascade

**Files:**
- Modify: `backend/.../domain/favorite/repository/ClubFavoriteRepository.java`
- Modify: `backend/.../domain/favorite/service/ClubFavoriteService.java` (+ `GeneralClubFavoriteService`)

- [ ] **Step 1: repository 쿼리 추가** (`ClubFavoriteRepository`)

```java
    java.util.List<ClubFavorite> findAllByClubId(Long clubId);
```

- [ ] **Step 2: 인터페이스 + 구현 추가**

`ClubFavoriteService`:
```java
    void removeAllOnClubClosure(Long clubId);
```
`GeneralClubFavoriteService`:
```java
    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        favoriteRepository.deleteAll(favoriteRepository.findAllByClubId(clubId));
    }
```

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/favorite/
git commit -m "feat(backend): 폐쇄 시 즐겨찾기 정리 cascade 추가"
```

---

## Phase 3 — 오케스트레이션 + 엔드포인트

### Task 14: `ClubClosureService` (오케스트레이션)

**Files:**
- Create: `backend/.../domain/club/service/ClubClosureService.java`
- Create: `backend/.../domain/club/service/GeneralClubClosureService.java`

- [ ] **Step 1: 인터페이스 작성**

```java
package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.command.CloseClubCommand;

public interface ClubClosureService {
    void close(CloseClubCommand command);
}
```

- [ ] **Step 2: 구현 작성** — 단일 `@Transactional` 안에서 순서대로 cascade 후 Club soft-delete

```java
package com.duing.domain.club.service;

import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.clubevent.service.ClubEventService;
import com.duing.domain.clubmember.service.ClubMemberCommandService;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
import com.duing.domain.favorite.service.ClubFavoriteService;
import com.duing.domain.interview.service.InterviewRoundService;
import com.duing.domain.promotion.service.PromotionRequestService;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.domain.recruitment.service.RecruitmentService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubClosureService implements ClubClosureService {

    private final ClubRepository clubRepository;
    private final ClubMemberCommandService clubMemberCommandService;
    private final LeaderSuccessionService leaderSuccessionService;
    private final RecruitmentService recruitmentService;
    private final ApplicationService applicationService;
    private final InterviewRoundService interviewRoundService;
    private final RecertificationRequestService recertificationRequestService;
    private final PromotionService promotionService;
    private final PromotionRequestService promotionRequestService;
    private final ClubEventService clubEventService;
    private final ClubFavoriteService clubFavoriteService;

    @Override
    @Transactional
    public void close(CloseClubCommand command) {
        Long clubId = command.clubId();
        Long actor = command.actorUserId();
        String reason = command.closureReason();

        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.validateClosable();

        // 1. 멤버십 · 위임
        clubMemberCommandService.removeAllOnClubClosure(clubId, actor, reason);
        leaderSuccessionService.cancelPendingOnClubClosure(clubId, actor, reason);

        // 2. 모집 → 지원 → 면접 (모집 id 체인)
        List<Long> recruitmentIds = recruitmentService.closeAllOnClubClosure(clubId);
        applicationService.rejectActiveOnClubClosure(recruitmentIds);
        interviewRoundService.softDeleteAllOnClubClosure(recruitmentIds);

        // 3. 인증 · 홍보 · 이벤트 · 즐겨찾기
        recertificationRequestService.rejectPendingOnClubClosure(clubId, actor, reason);
        promotionService.removeAllOnClubClosure(clubId);
        promotionRequestService.rejectPendingOnClubClosure(clubId, actor, reason);
        clubEventService.removeAllOnClubClosure(clubId);
        clubFavoriteService.removeAllOnClubClosure(clubId);

        // 4. 동아리 soft-delete
        clubRepository.delete(club);
    }
}
```

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

> Spring 순환참조 오류 발생 시(예: 어떤 서비스가 간접적으로 ClubClosureService 의존) 해당 주입에 `@Lazy` 를 추가한다. 현재 의존 그래프상 발생 가능성은 낮다.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/service/ClubClosureService.java backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java
git commit -m "feat(backend): 동아리 폐쇄 cascade 오케스트레이션 서비스 추가"
```

### Task 15: 엔드포인트 — `AdminClubApi` + `AdminClubController`

**Files:**
- Modify: `backend/.../domain/club/api/AdminClubApi.java`
- Modify: `backend/.../domain/club/controller/AdminClubController.java`

- [ ] **Step 1: `AdminClubApi` 에 선언 추가** (`updateClubStatus` 선언 인접)

```java
    @Operation(summary = "동아리 폐쇄",
            description = "운영 중단(INACTIVE) 동아리를 폐쇄(soft-delete)하고 진행 중인 모집·지원·면접·인증·홍보·멤버십·이벤트·즐겨찾기를 자동 종료한다.")
    @PostMapping("/admin/clubs/{clubId}/close")
    ResponseEntity<ApiResponse<Void>> closeClub(
            @PathVariable Long clubId,
            @Valid @RequestBody(required = false) CloseClubRequest closeClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

import 추가: `com.duing.domain.club.controller.dto.request.CloseClubRequest`, `org.springframework.web.bind.annotation.PostMapping` (없으면).

- [ ] **Step 2: `AdminClubController` 에 `ClubClosureService` 주입 + 구현**

필드 추가 (`private final ClubService clubService;` 아래):
```java
    private final ClubClosureService clubClosureService;
```

메서드 추가:
```java
    @Override
    public ResponseEntity<ApiResponse<Void>> closeClub(
            @PathVariable Long clubId,
            @Valid @RequestBody(required = false) CloseClubRequest closeClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        CloseClubRequest body = closeClubRequest != null ? closeClubRequest : new CloseClubRequest(null);
        clubClosureService.close(body.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
```

import 추가: `com.duing.domain.club.service.ClubClosureService`, `com.duing.domain.club.controller.dto.request.CloseClubRequest`, `org.springframework.web.bind.annotation.RequestBody` (없으면).

- [ ] **Step 3: 컴파일 확인** — Run: `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java backend/src/main/java/com/duing/domain/club/controller/AdminClubController.java
git commit -m "feat(backend): 동아리 폐쇄 엔드포인트 추가"
```

---

## Phase 4 — 백엔드 통합 테스트

### Task 16: 폐쇄 엔드포인트 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/AdminClubClosureControllerTest.java`

> `AdminClubStatusAndCentralClubControllerTest` 의 패턴(헬퍼·토큰·fixture)을 그대로 따른다. 멤버십 cascade·가드·목록에서 사라짐을 검증한다. 모집/지원 등 추가 cascade 는 Step 6 에서 확장한다.

- [ ] **Step 1: 테스트 클래스 작성 (가드 + 멤버십 cascade + 목록 제거)**

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
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
class AdminClubClosureControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private User studentUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        studentUser = saveUser("학생사용자", UserRole.STUDENT);
        leaderUser = saveUser("동아리장후보", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("ADMIN 이 운영 중단(INACTIVE) 동아리를 폐쇄하면 204 가 반환되고 목록에서 사라지며 멤버십이 제거된다")
    void adminClosesInactiveClub() throws Exception {
        Club inactiveClub = saveClubWithLeader("폐쇄대상클럽", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        // 폐쇄 동아리는 ADMIN 목록 조회에서 사라진다 (@SQLRestriction)
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=폐쇄대상클럽")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(0));

        // 멤버십 soft-delete 확인
        org.junit.jupiter.api.Assertions.assertTrue(
                clubMemberRepository.findByClubIdAndUserId(inactiveClub.getId(), leaderUser.getId()).isEmpty());
    }

    @Test
    @DisplayName("ACTIVE 동아리를 폐쇄하려 하면 400 이 반환된다")
    void closingActiveClubIsRejected() throws Exception {
        Club activeClub = saveClubWithLeader("운영중클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("STUDENT 가 폐쇄 엔드포인트를 호출하면 403 이 반환된다")
    void studentCannotCloseClub() throws Exception {
        Club inactiveClub = saveClubWithLeader("학생폐쇄거부클럽", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("이미 폐쇄된(존재하지 않는) 동아리를 폐쇄하려 하면 404 가 반환된다")
    void closingMissingClubReturns404() throws Exception {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", 999999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveClubWithLeader(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }
}
```

- [ ] **Step 2: 테스트 실행 (Docker 필요)**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.controller.AdminClubClosureControllerTest"`
Expected: 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/AdminClubClosureControllerTest.java
git commit -m "test(backend): 동아리 폐쇄 엔드포인트 가드·멤버십 cascade 테스트"
```

- [ ] **Step 4: 모집·지원 cascade 검증 테스트 확장**

기존 모집 통합 테스트(예: `domain/recruitment/controller/` 하위 테스트)에서 OPEN 모집 + 활성 지원서 fixture 생성 방식을 확인한 뒤, INACTIVE 동아리에 OPEN 모집 1건 + SUBMITTED 지원서 1건을 만들고 폐쇄한다. 폐쇄 후 다음을 검증:

```java
// 폐쇄 후 — 모집은 CLOSED, 지원서는 REJECTED 로 종료된다
Recruitment closedRecruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
org.junit.jupiter.api.Assertions.assertEquals(RecruitmentStatus.CLOSED, closedRecruitment.getStatus());

Application rejected = applicationRepository.findById(applicationId).orElseThrow();
org.junit.jupiter.api.Assertions.assertEquals(ApplicationStatus.REJECTED, rejected.getStatus());
```

> fixture 시그니처(예: `Recruitment.create(...)`, 지원서 생성)는 해당 도메인의 기존 테스트를 그대로 복사해 사용한다. 이후 `./gradlew test --tests "*AdminClubClosureControllerTest"` 로 재실행해 PASS 확인 후 commit.

- [ ] **Step 5: 전체 백엔드 테스트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (기존 테스트 포함 전부 통과 — Flyway V51 정상 적용)

```bash
git commit -am "test(backend): 폐쇄 모집·지원 cascade 검증 추가"
```

---

## Phase 5 — 프론트엔드

### Task 17: `CloseClubPayload` 타입

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: 타입 추가** (`UpdateClubStatusPayload` 인근)

```ts
export type CloseClubPayload = {
  closureReason?: string;
};
```

- [ ] **Step 2: 타입체크** — Run: `cd frontend && pnpm --filter @duing/types typecheck` (또는 루트 `pnpm typecheck`) → 통과

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/types/src/club.ts
git commit -m "feat(web): 동아리 폐쇄 페이로드 타입 추가"
```

### Task 18: API client `clubs.close`

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: import 에 `CloseClubPayload` 추가** (`UpdateClubStatusPayload` import 인근, line ~78)

```ts
  CloseClubPayload,
```

- [ ] **Step 2: 타입 선언 추가** (`clubs` 타입 내 `updateCentralClub` 선언 아래, line ~194)

```ts
    close(clubId: number, payload: CloseClubPayload): Promise<void>;
```

- [ ] **Step 3: 구현 추가** (`clubs` 구현 내 `updateCentralClub` 아래, line ~515)

```ts
      close: (clubId, payload) =>
        jsonVoid(http.post(`admin/clubs/${clubId}/close`, { json: payload })),
```

- [ ] **Step 4: 타입체크** — Run: `cd frontend && pnpm --filter @duing/api typecheck` → 통과

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(web): 동아리 폐쇄 API 클라이언트 메서드 추가"
```

### Task 19: `useCloseClubMutation` 훅

**Files:**
- Modify: `frontend/packages/hooks/src/admin.ts`

- [ ] **Step 1: import 에 `CloseClubPayload` 추가** (기존 type import 블록)

```ts
  CloseClubPayload,
```

- [ ] **Step 2: 훅 추가** (`useUpdateClubStatusMutation` 아래)

```ts
export function useCloseClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: CloseClubPayload }) =>
      client.clubs.close(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}
```

- [ ] **Step 3: 타입체크** — Run: `cd frontend && pnpm --filter @duing/hooks typecheck` → 통과

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/hooks/src/admin.ts
git commit -m "feat(web): 동아리 폐쇄 mutation 훅 추가"
```

### Task 20: `AdminClubDeleteDialog` (TDD)

**Files:**
- Create: `frontend/apps/web/test/admin/clubs/club-delete-dialog.test.tsx`
- Create: `frontend/apps/web/app/admin/clubs/_components/AdminClubDeleteDialog.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClubSummary } from '@duing/types';
import { AdminClubDeleteDialog } from '../../../app/admin/clubs/_components/AdminClubDeleteDialog';

function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 1,
    name: '폐쇄 동아리',
    category: 'ACADEMIC',
    division: null,
    college: null,
    logoUrl: null,
    status: 'INACTIVE',
    tags: [],
    leaderId: null,
    leaderName: null,
    leaderStudentId: null,
    centralClub: false,
    rejectionReason: null,
    statusChangedAt: null,
    statusChangedByName: null,
    ...overrides,
  };
}

describe('AdminClubDeleteDialog', () => {
  it('동아리명이 일치하지 않으면 폐쇄 버튼이 비활성이다', () => {
    render(
      <AdminClubDeleteDialog
        club={makeClub()}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '폐쇄' })).toBeDisabled();
  });

  it('동아리명을 정확히 입력하면 폐쇄 버튼이 활성화된다', () => {
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '폐쇄 동아리' })}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), {
      target: { value: '폐쇄 동아리' },
    });
    expect(screen.getByRole('button', { name: '폐쇄' })).toBeEnabled();
  });

  it('폐쇄 확정 시 입력한 사유로 onConfirm 이 호출된다', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '폐쇄 동아리' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), {
      target: { value: '폐쇄 동아리' },
    });
    fireEvent.change(screen.getByLabelText('폐쇄 사유 (선택)'), {
      target: { value: '  활동 종료  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '폐쇄' }));
    expect(onConfirm).toHaveBeenCalledWith('활동 종료');
  });

  it('사유 없이 폐쇄하면 onConfirm 이 undefined 로 호출된다', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '폐쇄 동아리' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), {
      target: { value: '폐쇄 동아리' },
    });
    fireEvent.click(screen.getByRole('button', { name: '폐쇄' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter web test club-delete-dialog`
Expected: FAIL — `AdminClubDeleteDialog` 모듈 없음

- [ ] **Step 3: 컴포넌트 구현**

```tsx
'use client';

import { useState } from 'react';
import { cn } from '../../../_lib/cn';
import type { AdminClubSummary } from '@duing/types';

type Props = {
  club: AdminClubSummary;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (closureReason?: string) => void;
  onCancel: () => void;
};

const REASON_MAX = 500;

export function AdminClubDeleteDialog({
  club,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  const [nameInput, setNameInput] = useState('');
  const [reason, setReason] = useState('');

  const nameMatches = nameInput.trim() === club.name;
  const submitDisabled = isPending || !nameMatches;

  const handleSubmit = () => {
    if (submitDisabled) return;
    const trimmed = reason.trim();
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="club-delete-title"
      aria-describedby="club-delete-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <header className="space-y-1">
          <h2 id="club-delete-title" className="text-base font-semibold text-slate-900">
            동아리 폐쇄
          </h2>
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{club.name}</span> 을(를) 폐쇄합니다.
          </p>
        </header>

        <div id="club-delete-desc" className="space-y-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <p className="font-semibold">되돌릴 수 없습니다.</p>
          <p className="text-xs">
            멤버십·진행 중인 모집·지원·면접·인증 요청·홍보가 모두 종료되고, 동아리가 모든 화면에서 사라집니다.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">동아리명 입력 확인</span>
          <input
            type="text"
            aria-label="동아리명 입력 확인"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder={club.name}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">폐쇄하려면 동아리명을 정확히 입력하세요.</span>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">폐쇄 사유 (선택)</span>
          <textarea
            aria-label="폐쇄 사유 (선택)"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
            rows={3}
            placeholder="폐쇄 사유를 입력하세요 (선택)"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <span className="text-right block text-[11px] text-slate-400">
            {reason.length} / {REASON_MAX}
          </span>
        </label>

        {errorMessage && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50',
              'bg-rose-600 hover:bg-rose-700',
            )}
          >
            {isPending ? '처리 중…' : '폐쇄'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter web test club-delete-dialog`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/admin/clubs/_components/AdminClubDeleteDialog.tsx frontend/apps/web/test/admin/clubs/club-delete-dialog.test.tsx
git commit -m "feat(web): 동아리 폐쇄 확인 다이얼로그 추가"
```

### Task 21: 테이블에 폐쇄 버튼 추가

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/_components/AdminClubsTable.tsx`

- [ ] **Step 1: `Props` 에 `onCloseClick` 추가**

```ts
type Props = {
  clubs: ReadonlyArray<AdminClubSummary>;
  onActionClick: (club: AdminClubSummary, action: StatusAction) => void;
  onCentralClubToggleClick: (club: AdminClubSummary) => void;
  onCloseClick: (club: AdminClubSummary) => void;
};
```

함수 시그니처도 구조분해에 추가:
```ts
export function AdminClubsTable({ clubs, onActionClick, onCentralClubToggleClick, onCloseClick }: Props) {
```

- [ ] **Step 2: INACTIVE 행에 폐쇄 버튼 렌더** — 액션 버튼 `{actions.map(...)}` 블록 바로 아래에 추가

```tsx
                      {club.status === 'INACTIVE' && (
                        <button
                          type="button"
                          onClick={() => onCloseClick(club)}
                          className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          폐쇄
                        </button>
                      )}
```

- [ ] **Step 3: 타입체크** — Run: `cd frontend && pnpm --filter web typecheck`
Expected: FAIL — `AdminClubsListPage` 가 아직 `onCloseClick` 를 전달하지 않음 (다음 Task 에서 해결). 컴포넌트 자체 타입 오류는 없어야 한다.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/app/admin/clubs/_components/AdminClubsTable.tsx
git commit -m "feat(web): 동아리 목록 테이블에 폐쇄 버튼 추가"
```

### Task 22: 페이지 배선 (다이얼로그 + mutation)

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/_pages/AdminClubsListPage.tsx`

- [ ] **Step 1: import 추가**

```ts
import { useCloseClubMutation } from '@duing/hooks';
import { AdminClubDeleteDialog } from '../_components/AdminClubDeleteDialog';
```
(`@duing/hooks` 기존 import 에 `useCloseClubMutation` 를 합치고, 컴포넌트 import 한 줄 추가)

- [ ] **Step 2: 상태 + mutation 추가** (기존 `centralClub*` 상태 인근)

```ts
  const [deleteDialog, setDeleteDialog] = useState<AdminClubSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const closeMutation = useCloseClubMutation();
```

- [ ] **Step 3: 핸들러 추가** (기존 `handleCentralClub*` 핸들러 인근)

```ts
  function handleCloseClick(club: AdminClubSummary) {
    setDeleteError(null);
    setDeleteDialog(club);
  }

  function handleCloseConfirm(closureReason?: string) {
    if (!deleteDialog) return;
    setDeleteError(null);
    closeMutation.mutate(
      {
        clubId: deleteDialog.id,
        payload: { ...(closureReason !== undefined && { closureReason }) },
      },
      {
        onSuccess: () => setDeleteDialog(null),
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError ? mutationError.message : '폐쇄에 실패했습니다.';
          setDeleteError(message);
        },
      },
    );
  }

  function handleCloseCancel() {
    setDeleteDialog(null);
    setDeleteError(null);
  }
```

- [ ] **Step 4: 테이블에 `onCloseClick` 전달**

```tsx
          <AdminClubsTable
            clubs={clubsQuery.data.content}
            onActionClick={(club, action) => {
              setDialog({ club, action });
              setDialogError(null);
            }}
            onCentralClubToggleClick={handleCentralClubToggleClick}
            onCloseClick={handleCloseClick}
          />
```

- [ ] **Step 5: 다이얼로그 렌더** (기존 `centralClubDialog` 렌더 블록 아래)

```tsx
      {deleteDialog && (
        <AdminClubDeleteDialog
          club={deleteDialog}
          isPending={closeMutation.isPending}
          errorMessage={deleteError}
          onConfirm={handleCloseConfirm}
          onCancel={handleCloseCancel}
        />
      )}
```

- [ ] **Step 6: 타입체크 + 테스트 + 빌드**

Run: `cd frontend && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: 모두 통과

- [ ] **Step 7: Commit**

```bash
git add frontend/apps/web/app/admin/clubs/_pages/AdminClubsListPage.tsx
git commit -m "feat(web): 동아리 폐쇄 다이얼로그·mutation 배선"
```

---

## Phase 6 — 최종 검증

### Task 23: 전체 검증

- [ ] **Step 1: 백엔드 전체 테스트** — Run: `cd backend && ./gradlew test` → BUILD SUCCESSFUL
- [ ] **Step 2: 프론트 lint/typecheck/test/build** — Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build` → 모두 통과
- [ ] **Step 3: 수동 확인 (선택)** — 로컬 기동 후 `/admin/clubs` 에서 운영 중단 동아리에 폐쇄 버튼 노출 → 동아리명 입력 → 폐쇄 → 목록에서 사라짐 확인
- [ ] **Step 4: 스펙 self-check (PR 직전)** — Out of Scope 준수, cascade 누락 없음, 시크릿 하드코딩 없음 확인

> PR 생성은 사용자 지시 후에만. 자동 머지 금지.

---

## Self-Review (작성자 점검 결과)

- **Spec coverage:** 엔드포인트(POST /close)·INACTIVE 가드·cascade(멤버/위임/모집/지원/면접/인증/홍보/이벤트/즐겨찾기)·동아리명 입력 확인·선택 사유·ClubFavorite 마이그레이션·Future TODO(알림/복구 제외) — 모두 Task 로 매핑됨.
- **Type consistency:** cascade 메서드명 `...OnClubClosure` 일관, `closeAllOnClubClosure` 가 `List<Long>` 반환 → `rejectActiveOnClubClosure(List<Long>)`·`softDeleteAllOnClubClosure(List<Long>)` 입력으로 연결됨. `CloseClubPayload.closureReason` ↔ 백엔드 `CloseClubRequest.closureReason` 명칭 일치.
- **알려진 보정 지점:** (1) `GeneralPromotionRequestService` 의 PromotionRequestRepository 주입 필드명은 실제 코드에 맞춰 사용. (2) Task 16 Step 4 의 모집/지원 fixture 시그니처는 기존 recruitment 테스트에서 복사. (3) `Application.transitionTo(REJECTED, ...)` 가 모든 활성 상태에서 허용되는지 통합 테스트로 검증 — 비허용 전이가 있으면 해당 상태 처리 보강.
