# 회원 전용 동아리 페이지 (공지·일정) 설계

작성일: 2026-06-04
관련 도메인: ClubMember / Notice (재사용) / ClubEvent (신규)

## 배경

현재 사용자 여정은 "동아리 탐색 → 지원 → 합격" 에서 끊겨 있다. 회원이 가입 후 **무엇을 할 수 있는지** 가 비어 있어 플랫폼이 "제출 도구" 단계에 머문다. 회원 전용 페이지를 신설해 공지·일정 흐름을 통해 가입 이후의 활동 영역을 채운다.

3-tier 페이지 구조를 도입한다:

| 라우트 | 대상 | 콘텐츠 |
|---|---|---|
| `/clubs/[clubId]` (기존, 변화 없음) | 모두 (비로그인 포함) | 소개·태그·FAQ·모집 공고 |
| **`/clubs/[clubId]/member` (신규)** | 활성 회원 (MEMBER/OFFICER/LEADER) | 공지·일정 조회 + 운영진 작성/수정/삭제 |
| `/manage/clubs/[clubId]` (기존, 변화 없음) | LEADER/OFFICER | 회원 관리·모집 관리·동아리 설정 |

## 목표

1. 회원이 본인 동아리의 공지·일정을 한 화면에서 확인할 수 있다.
2. 운영진은 같은 화면에서 인라인으로 공지·일정을 작성·수정·삭제할 수 있다.
3. 공지는 기존 Notice 도메인을 재사용해 중복 스캐폴딩을 피한다.
4. 일정은 ClubEvent 도메인을 신규 도입해 향후 캘린더 통합의 기반이 된다.

## 변경 범위

본 spec 은 4개 PR 로 분리한다:

| PR | 범위 |
|---|---|
| PR 1 (백엔드) | ClubMembership 판정 API + LeaderClubNotice 컨트롤러 + Notice 서비스/리포지토리 확장 + 테스트 |
| PR 2 (백엔드) | ClubEvent 도메인 풀 스택 (entity·migration·service·controller·테스트) |
| PR 3 (프론트) | 패키지 레이어 + 회원 페이지 라우트 + 공지 탭 + 공지 작성 모달 |
| PR 4 (프론트) | 일정 탭 + 일정 작성 모달 + 가드 폴리싱 |

PR 1·2 머지 후 PR 3 시작. PR 3 머지 후 PR 4.

---

## 1. 멤버십 판정 API (신규)

### 1.1 엔드포인트

```
GET /api/v1/clubs/{clubId}/membership
인증: isAuthenticated()
```

### 1.2 판정 로직

1. `clubRepository.findById(clubId)` — 없으면 404.
2. `clubMemberRepository.findByClubIdAndUserId(clubId, userId)` — 없으면 404.
3. 있으면 200 + `MyClubMembershipResponse`.

404 가 "클럽 없음" / "멤버 아님" 두 의미를 공유하지만, 프론트 가드 입장에서는 동일하게 처리(공개 페이지로 redirect)되므로 status 통일. 메시지만 분기.

### 1.3 응답 DTO

**백엔드 record (`MyClubMembershipResponse`)**

```java
public record MyClubMembershipResponse(
        ClubMemberRole role,
        LocalDateTime joinedAt,
        ClubActionPermissions permissions
) {
    public record ClubActionPermissions(
            boolean canPostNotice,
            boolean canEditNotice,
            boolean canDeleteNotice,
            boolean canPostEvent,
            boolean canEditEvent,
            boolean canDeleteEvent
    ) {
        public static ClubActionPermissions from(ClubMemberRole role) {
            boolean isManager = role == ClubMemberRole.LEADER || role == ClubMemberRole.OFFICER;
            boolean isLeader  = role == ClubMemberRole.LEADER;
            return new ClubActionPermissions(
                    isManager, isManager, isLeader,   // notice: post/edit/delete
                    isManager, isManager, isLeader    // event:  post/edit/delete
            );
        }
    }

    public static MyClubMembershipResponse from(ClubMember member) {
        return new MyClubMembershipResponse(
                member.getRole(),
                member.getCreatedAt(),
                ClubActionPermissions.from(member.getRole())
        );
    }
}
```

**프론트 타입**

```ts
export type ClubMembershipRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type ClubActionPermissions = {
  canPostNotice: boolean;
  canEditNotice: boolean;
  canDeleteNotice: boolean;
  canPostEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
};

export type MyClubMembership = {
  role: ClubMembershipRole;
  joinedAt: string;
  permissions: ClubActionPermissions;
};
```

### 1.4 권한 정책 매핑 (불변)

| Role | canPost* | canEdit* | canDelete* |
|---|---|---|---|
| LEADER | true | true | **true** |
| OFFICER | true | true | **false** |
| MEMBER | false | false | false |

`*` 는 Notice/Event 양쪽 동일 적용. 미래에 두 도메인 권한이 분기되면 record 만 확장.

### 1.5 캐시

`useClubMembershipQuery(clubId)` — `staleTime: 5min`. 운영진의 mutation 이 403 으로 차단되면 onError 에서 invalidate.

---

## 2. ClubNotice (기존 Notice 재사용 + 컨트롤러 확장)

### 2.1 기존 자산 (변화 없음)

- `Notice` 엔티티 (`visibility ∈ {PUBLIC, OFFICERS_ALL, CLUB_SCOPED}`, `clubScopeRole ∈ {OFFICERS_ONLY, ALL_MEMBERS}`).
- `NoticeTargetClub` (notice ↔ club M:N).
- `NoticeRepositoryImpl.findVisibleById` — ViewerScope 의 `memberClubIds` / `officerClubIds` 기반 가시성 분기 이미 완비.
- `NoticeCategory` enum — 손대지 않음.

### 2.2 신규 컨트롤러 — `LeaderClubNoticeController`

LEADER/OFFICER 가 본인 동아리 한정 `CLUB_SCOPED + ALL_MEMBERS` 공지만 CRUD.

| ID | 기능 | 경로 | 입력 | 출력 | 예외 |
|---|---|---|---|---|---|
| CN-1 | 클럽 공지 생성 (LEADER/OFFICER) | `POST /api/v1/clubs/{clubId}/notices` | `title`, `summary?`, `content`, `coverImageUrl?`, `pinned?`(default false), `expiresAt?` | 생성된 `noticeId` (201) | 운영진 X 403, 입력 검증 400 |
| CN-2 | 클럽 공지 수정 (LEADER/OFFICER) | `PATCH /api/v1/clubs/{clubId}/notices/{noticeId}` | partial fields | 204 | 운영진 X 403, 없음 404, 다른 클럽 공지 403 |
| CN-3 | 클럽 공지 삭제 (LEADER) | `DELETE /api/v1/clubs/{clubId}/notices/{noticeId}` | — | 204 | LEADER X 403, 없음 404, 다른 클럽 공지 403 |

**서버측 강제값 (사용자 입력 무시):**

- `visibility = CLUB_SCOPED`
- `clubScopeRole = ALL_MEMBERS`
- `category = GENERAL`
- `targetClubs = [clubId]` (단일 클럽 자동 매핑)
- `notifyOnPublish` — Notice 엔티티 기본 정책 (CLUB_SCOPED 이므로 자동 알림 OFF, 기존 로직 유지)

**권한 가드 (controller 진입 즉시):**
- CN-1/2: `ClubAuthService.requireManager(currentUser.id(), clubId)`
- CN-3: `ClubAuthService.requireLeader(currentUser.id(), clubId)`

**추가 검증 (CN-2/3):**
- `notice.targetClubs CONTAINS clubId` — path 의 `clubId` 와 실제 notice 타겟 일치 여부. 다른 클럽 공지 우회 차단.

### 2.3 회원의 본 동아리 공지 조회

| ID | 기능 | 경로 | 입력 | 출력 | 예외 |
|---|---|---|---|---|---|
| CN-4 | 동아리 공지 목록 (MEMBER+) | `GET /api/v1/clubs/{clubId}/notices` | `clubId`, `page` (default 0), `size` (default 20) | `PageResponse<NoticeCardResponse>` (200) | 비-멤버 403 |

**필터 (서비스 내부):**
- `notice.deleted_at IS NULL`
- `notice IN (NoticeTargetClub WHERE clubId=?)`
- `notice.visibility = CLUB_SCOPED`
- `notice.clubScopeRole = ALL_MEMBERS`
- `notice.expiresAt IS NULL OR notice.expiresAt > now()`

**정렬: 서버 강제 `pinned DESC, createdAt DESC`. `sort` 파라미터 미수용** (page, size 만 받음). Pageable.sort 무시.

### 2.4 상세 조회 — 기존 엔드포인트 재사용

`GET /api/v1/notices/{noticeId}` 그대로 사용. `NoticeRepositoryImpl.findVisibleById` 의 CLUB_SCOPED 분기가 이미 정확:
- A동아리 회원이 B동아리 공지 호출 → `noticeTargetClub.clubId IN memberClubIds` 매치 실패 → `Optional.empty()` → 403.
- ADMIN 은 분기 우회로 200.

본 spec 에서는 이 동작에 대한 회귀 보호 테스트만 추가 (§5.1 참조). production 코드 변경 없음.

### 2.5 파일 변경 (백엔드)

```
backend/src/main/java/com/duing/domain/notice/
├── api/LeaderClubNoticeApi.java                    [신규]
├── controller/LeaderClubNoticeController.java      [신규]
├── controller/dto/request/
│   ├── CreateClubNoticeRequest.java                [신규]
│   └── UpdateClubNoticeRequest.java                [신규]
├── service/NoticeService.java                      [수정] createForClub / updateForClub / deleteForClub / findClubScopedForMember 추가
├── service/dto/command/
│   ├── CreateClubNoticeCommand.java                [신규]
│   └── UpdateClubNoticeCommand.java                [신규]
└── repository/NoticeRepositoryCustom.java          [수정] findClubScopedForMember (pinned DESC, createdAt DESC 강제)

backend/src/main/java/com/duing/domain/clubmember/
├── api/ClubMembershipApi.java                       [신규]
├── controller/ClubMembershipController.java         [신규]
├── controller/dto/response/MyClubMembershipResponse.java   [신규]
└── service/ClubAuthService.java                     [수정] resolveMembership(userId, clubId) 추가
```

DB 변경 0건 (Flyway 마이그레이션 불필요).

---

## 3. ClubEvent 도메인 (신규)

### 3.1 엔티티 스키마

```sql
CREATE TABLE club_event (
  id           BIGSERIAL    PRIMARY KEY,
  club_id      BIGINT       NOT NULL REFERENCES club(id),
  title        VARCHAR(120) NOT NULL,
  description  TEXT,
  start_at     TIMESTAMP    NOT NULL,
  end_at       TIMESTAMP    NOT NULL,
  location     VARCHAR(200),
  created_by   BIGINT       NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP    NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMP,
  CONSTRAINT club_event_chk_period CHECK (end_at >= start_at)
);
CREATE INDEX idx_club_event_club_start ON club_event(club_id, start_at) WHERE deleted_at IS NULL;
```

`BaseEntity` 상속, soft delete (`@SQLDelete` + `@SQLRestriction`).

### 3.2 필드 정책

- `title` (≤120) — 공백 트림 후 `min 1`.
- `description` (≤2000) — 선택.
- `startAt`, `endAt` — `endAt >= startAt` (DB CHECK + 엔티티 검증). 종일 이벤트는 `00:00 ~ 23:59` 로 표현(별도 `allDay` 플래그 미도입).
- `location` (≤200) — 자유 텍스트, 선택.
- `createdBy` — 작성자 userId (감사 목적, 응답 노출은 향후 정책).

### 3.3 API

| ID | 기능 | 경로 | 입력 | 출력 | 예외 |
|---|---|---|---|---|---|
| CE-1 | 동아리 일정 목록 (MEMBER+) | `GET /api/v1/clubs/{clubId}/events` | `from?`(yyyy-MM-dd, default `today-30d`), `to?`(default `today+180d`) | `List<ClubEventCardResponse>` (`startAt` ASC) (200) | 비-멤버 403, `(to-from) > 400d` 400 |
| CE-2 | 일정 상세 (MEMBER+) | `GET /api/v1/clubs/{clubId}/events/{eventId}` | `eventId` | `ClubEventDetailResponse` (200) | 비-멤버 403, 없음 404 |
| CE-3 | 일정 생성 (LEADER/OFFICER) | `POST /api/v1/clubs/{clubId}/events` | `title`, `description?`, `startAt`, `endAt`, `location?` | 생성된 `eventId` (201) | 운영진 X 403, 기간 검증 400 |
| CE-4 | 일정 수정 (LEADER/OFFICER) | `PATCH /api/v1/clubs/{clubId}/events/{eventId}` | partial fields | 204 | 운영진 X 403, 없음 404, 기간 검증 400 |
| CE-5 | 일정 삭제 (LEADER) | `DELETE /api/v1/clubs/{clubId}/events/{eventId}` | — | 204 | LEADER X 403, 없음 404 |

**권한 가드:**
- CE-1/2: `requireMember`
- CE-3/4: `requireManager`
- CE-5: `requireLeader`

### 3.4 윈도우 정책 (CE-1)

- 둘 다 생략: `from = today - 30d`, `to = today + 180d`
- 한쪽만 생략: 생략된 쪽만 기본값 적용
- `(to - from) > 400d` → 400 (악용/실수 차단)
- 페이지네이션 미사용 (캘린더형 그룹 표시 적합성).

### 3.5 응답 DTO

```jsonc
// ClubEventCardResponse (목록)
{ "id": 12, "title": "정기 합주", "startAt": "...", "endAt": "...", "location": "동아리방 B" }

// ClubEventDetailResponse (상세)
{
  "id": 12, "clubId": 7,
  "title": "정기 합주", "description": "악기 지참",
  "startAt": "...", "endAt": "...", "location": "동아리방 B",
  "createdBy": { "id": 4, "name": "홍길동" },
  "createdAt": "...", "updatedAt": "..."
}
```

### 3.6 파일 변경 (백엔드)

```
backend/src/main/java/com/duing/domain/clubevent/
├── entity/ClubEvent.java                            [신규]
├── api/
│   ├── ClubEventReadApi.java                        [신규]
│   └── ClubEventWriteApi.java                       [신규]
├── controller/
│   ├── ClubEventReadController.java                 [신규]
│   └── ClubEventWriteController.java                [신규]
├── controller/dto/request/
│   ├── CreateClubEventRequest.java                  [신규]
│   └── UpdateClubEventRequest.java                  [신규]
├── controller/dto/response/
│   ├── ClubEventCardResponse.java                   [신규]
│   └── ClubEventDetailResponse.java                 [신규]
├── service/
│   ├── ClubEventService.java                        [신규]
│   └── GeneralClubEventService.java                 [신규]
├── service/dto/command/                             [신규 디렉터리]
├── service/dto/query/                               [신규 디렉터리]
├── repository/ClubEventRepository.java              [신규]
└── exception/ClubEventException.java                [신규]

backend/src/main/resources/db/migration/
└── V202606041200__create_club_event.sql             [신규]
```

---

## 4. 프론트엔드

### 4.1 라우트 구조

```
frontend/apps/web/app/clubs/[clubId]/member/
├── layout.tsx                                       [신규] MemberAccessGuard 래핑
├── page.tsx                                         [신규] Server Component, redirect → /member/notices
├── notices/page.tsx                                 [신규] 공지 목록
├── notices/[noticeId]/page.tsx                      [신규] 공지 상세 (기존 NoticeDetail 재사용)
├── events/page.tsx                                  [신규] 일정 목록 윈도우
├── events/[eventId]/page.tsx                        [신규] 일정 상세
└── _components/
    ├── MemberAccessGuard.tsx                        [신규] 가드 + 분기
    ├── MemberPageHeader.tsx                         [신규] 클럽명 + 탭 네비 (공지 | 일정) + "동아리 소개 보기" 링크
    ├── ClubNoticeList.tsx                           [신규]
    ├── ClubNoticeCard.tsx                           [신규]
    ├── ClubNoticeWriteButton.tsx                    [신규] permissions.canPostNotice 기반
    ├── ClubNoticeFormModal.tsx                      [신규] 생성/수정 공통
    ├── ClubEventList.tsx                            [신규]
    ├── ClubEventCard.tsx                            [신규]
    ├── ClubEventWriteButton.tsx                     [신규]
    └── ClubEventFormModal.tsx                       [신규]
```

탭 구성은 **공지 | 일정** 2개. 정보 탭 없음. 상단 헤더에 "동아리 소개 보기" 링크로 `/clubs/[clubId]` 이동.

`/clubs/[clubId]/member/page.tsx` 는 Server Component:

```tsx
import { redirect } from 'next/navigation';
export default async function MemberRootPage({
  params,
}: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  redirect(`/clubs/${clubId}/member/notices`);
}
```

### 4.2 패키지 레이어

```
frontend/packages/types/src/
├── clubMembership.ts                                [신규] ClubMembershipRole, ClubActionPermissions, MyClubMembership
├── clubNotice.ts                                    [신규] CreateClubNoticePayload, UpdateClubNoticePayload
└── clubEvent.ts                                     [신규] ClubEventCard, ClubEventDetail, Create/UpdateClubEventPayload

frontend/packages/schemas/src/index.ts               [수정] createClubNoticeSchema, updateClubNoticeSchema, createClubEventSchema, updateClubEventSchema

frontend/packages/api/src/client.ts                  [수정]
- clubMembership: { get(clubId): Promise<MyClubMembership> }
- clubNotices: { listForClub, create, update, remove }
- clubEvents:  { list, get, create, update, remove }

frontend/packages/hooks/src/
├── clubMembership.ts                                [신규] useClubMembershipQuery
├── clubNotices.ts                                   [신규] useClubNoticeListQuery, useCreate/Update/RemoveClubNoticeMutation
├── clubEvents.ts                                    [신규] useClubEventListQuery, useClubEventDetailQuery, mutations
└── index.ts                                         [수정]
```

### 4.3 MemberAccessGuard

`'use client'` 컴포넌트. layout.tsx 에서 children 을 래핑.

```
useClubMembershipQuery(clubId)
  → isLoading: 스켈레톤
  → error 404: useRouter().replace(`/clubs/${clubId}`) + toast("회원 전용 페이지입니다")
  → error 401: 글로벌 인터셉터 → /login
  → success: Context 로 role/permissions 하위 전달 후 children 렌더
```

`redirect()` 는 Server Component 전용이지만 회원 자격 판정에 JWT(클라이언트 storage) 가 필요해 SC 에서 못 함. 기존 `/manage/clubs/[clubId]/layout.tsx` 의 클라이언트 가드(`ManageShell`) 패턴과 일관.

### 4.4 운영진 인라인 작성 동선

회원 페이지의 공지/일정 탭에 `permissions.canPostNotice`/`canPostEvent` 가 true 면 우측 상단에 "공지 작성" / "일정 추가" 버튼 노출. 모달 → form → submit → list invalidate → 즉시 반영.

수정/삭제: 카드의 ⋯ 메뉴를 `permissions.canEdit*` / `canDelete*` 기반으로 표시. OFFICER 카드에는 "수정" 만, "삭제" 는 비노출. 최후 방어선은 백엔드 가드.

### 4.5 일정 윈도우

`ClubEventList` 기본 호출: `from`/`to` 미지정 → 백엔드 자동 default (`today-30d`, `today+180d`).

"기간 더 보기" 옵션은 본 spec 의 Out of Scope (캘린더 PR 또는 후속).

### 4.6 캐시 정책

- `clubMembership(clubId)`: `staleTime: 5min`
- `clubNoticeList(clubId, page)`: `staleTime: 30s`
- `clubEventList(clubId, from, to)`: `staleTime: 30s`
- mutation `onSuccess`: 해당 list query invalidate
- mutation `onError 403`: `clubMembership(clubId)` invalidate (권한 변경 가능성)

---

## 5. 에러 처리 매트릭스

### 5.1 멤버십 (GET membership)

| 상황 | HTTP | 프론트 |
|---|---|---|
| 미인증 | 401 | 글로벌 인터셉터 → `/login` |
| 비-멤버 OR 클럽 없음 | 404 | redirect `/clubs/[clubId]` + toast |
| 5xx | 5xx | 페이지 전체 "정보를 불러오지 못했습니다" + 재시도 |

### 5.2 ClubNotice 작성/수정/삭제 (CN-1/2/3)

| 상황 | HTTP | 프론트 |
|---|---|---|
| 운영진 X (CN-1/2) / LEADER X (CN-3) | 403 | 모달 내 "권한이 변경된 듯합니다" + clubMembership invalidate |
| 입력 검증 실패 | 400 | 폼 필드별 에러 메시지 |
| Notice 없음 | 404 | 모달 닫고 목록 invalidate |
| 다른 클럽 공지 우회 시도 | 403 | 동일 |

### 5.3 ClubNotice 조회 (CN-4)

| 상황 | HTTP | 프론트 |
|---|---|---|
| 비-멤버 | 403 | 가드가 차단했어야 함. 도달 시 가드 재실행 + redirect. |
| 0건 | 200 + 빈 페이지 | empty state "아직 등록된 공지가 없습니다" |

### 5.4 ClubEvent (CE-1~5)

- 작성/수정: `requireManager` → 403
- 삭제: `requireLeader` → 403
- 기간 검증 실패(`endAt < startAt`): 400
- 윈도우 초과(`to - from > 400d`): 400
- 0건: empty state "등록된 일정이 없습니다"

### 5.5 ClubNotice 상세 (기존 `GET /notices/{noticeId}`)

A동아리 회원이 B동아리 공지 URL 직접 입력 → 403. 프론트는 에러 페이지 폴백.

---

## 6. 테스트 전략

### 6.1 백엔드 — 테스트 클래스

| 클래스 | 대상 | 케이스 |
|---|---|---|
| `ClubMembershipControllerTest` | GET membership | LEADER/OFFICER/MEMBER 각각의 permissions 정확성 / 비-멤버 404 / 미인증 401 / 비존재 clubId 404 |
| `LeaderClubNoticeControllerTest` | CN-1/2/3 | 작성 → 목록 노출 / OFFICER 도 수정 가능 / OFFICER 삭제 시도 → 403 / 다른 클럽 공지 우회 → 403 / category 강제 GENERAL 검증 / visibility/clubScopeRole 서버 강제 검증 |
| `ClubNoticeMemberFeedTest` | CN-4 | pinned DESC + createdAt DESC 정렬 / 만료된 공지 제외 / 다른 클럽 공지 미노출 / 비-멤버 403 |
| `ClubScopedNoticeAccessTest` (회귀 보호) | 기존 `GET /notices/{noticeId}` | A동아리 회원이 B동아리 CLUB_SCOPED+ALL_MEMBERS noticeId 호출 → 403 / B동아리 회원 호출 → 200 / OFFICERS_ONLY 를 MEMBER 가 호출 → 403 / 미인증 호출 → 401 또는 403 (실제 동작에 맞춤) / ADMIN 호출 → 200 |
| `ClubEventAcceptanceTest` | CE-1~5 | 풀 플로우 (생성→조회→수정→삭제) / 기간 검증(`endAt < startAt` 400) / 윈도우 캡(`to-from > 400d` 400) / 윈도우 기본값 적용 / OFFICER 삭제 → 403 / 비-멤버 조회 → 403 / 다른 클럽 이벤트 우회 시도 → 403 |

RestAssured + Fixture Monkey + TestContainers. `@DisplayName` 한글 문장형.

### 6.2 프론트엔드

본 spec 의 4 PR 묶음에서는 `pnpm lint && pnpm typecheck && pnpm build` 그린 보장 + 수동 동작 검증. 단위 테스트는 후속.

수동 검증 시나리오 (PR 3 기준):
- LEADER 로 진입 → "공지 작성" 버튼 보임 → 작성 → 목록 즉시 반영 → 카드 ⋯ 메뉴에 "수정"+"삭제" 보임.
- OFFICER 로 진입 → "공지 작성" 보임 → 카드 ⋯ 메뉴에 "수정" 만 보임 (삭제 비노출).
- MEMBER 로 진입 → "공지 작성" 비노출 → 카드 ⋯ 메뉴 자체 비노출.
- 비-멤버로 직접 URL `/clubs/{id}/member/notices` 진입 → 공개 페이지 redirect + toast.

---

## 7. Out of Scope

이번 spec 에서 다루지 않음 — 후속 PR/spec:

1. **이미지 업로드** — 공지/일정 첨부 이미지. 기존 `FileStorageService` 통합 별도.
2. **공지 알림 발송** — `CLUB_SCOPED + ALL_MEMBERS` 작성 시 자동 푸시. Notice 의 `broadcaster` 활용 가능하나 정책 정의 필요.
3. **일정 반복 (RRULE/Series)** — 단일 일정만. 정기모임 다중 등록은 LEADER 수동 반복.
4. **일정 종일 플래그** — `allDay: boolean`. 현재는 `00:00~23:59` 표현.
5. **공지 조회/읽음 표시** — read tracking 별도.
6. **공지 댓글/반응** — Phase 2+.
7. **일정 참가자 명단 (RSVP)** — 별도 도메인.
8. **모바일 반응형 폴리싱** — 데스크톱 기준.
9. **캘린더 통합** — `/calendar` 페이지의 실데이터화는 본 spec 후속(PR 5+).
10. **공지/일정 검색** — 키워드 검색.
11. **OFFICER 작성자 본인 추적/표시** — `createdBy` 는 감사용 DB 컬럼만, 프론트 미노출.
12. **`/clubs/[clubId]/member` 에서 "기간 더 보기" 윈도우 확장 UI** — 캘린더 PR 에서 처리.
13. **권한 변경 직후 캐시 즉시 동기화** — `staleTime: 5min` + onError 403 invalidate 로 회복. 실시간 push 는 후속.

---

## 8. 리스크·체크 포인트

- **회원 자격 캐시 동기화**: ADMIN/LEADER 가 회원 추방/승계하면 `staleTime: 5min` 동안 잘못된 권한 UI 가능. 다음 mutation 호출 시 백엔드 403 으로 차단되고, onError 에서 invalidate 로 회복. 명세에 명시.
- **`notice.targetClubs` 다중 클럽 케이스**: 본 spec 의 LEADER 작성 흐름은 항상 단일 클럽(`[clubId]`)으로 target 강제. 기존 ADMIN 의 다중 클럽 공지는 글로벌 피드에서 작동하며, 회원 페이지 CN-4 는 `clubId` JOIN 이므로 다중 클럽 공지가 양쪽 회원 페이지에 정상 노출됨.
- **권한 정책 변경 시 UI 동기화 비용**: 향후 정책 변경 시 `permissions` 객체 구조는 그대로 두고 백엔드 계산 로직만 바꾸면 프론트 무수정. 확장성 OK.
- **Pageable.sort 무시 정책**: CN-4 의 정렬을 서버 강제로 두기 위해 컨트롤러가 `sort` 파라미터를 받지 않는다. Swagger 문서에 명시.
- **윈도우 캡 400d 의 근거**: 1 학기(약 4개월) × 3 의 여유. ADMIN/LEADER 가 1년 이상 미래 일정을 사전 등록할 가능성을 커버하되 무제한 쿼리는 차단.
- **회원 페이지 라우트와 공개 페이지의 SSR 경계**: 회원 페이지 진입은 SSR 시점에 회원 자격 미확인 (JWT 가 클라이언트). 따라서 SSR 응답은 일단 로딩 셸을 보내고 가드가 클라이언트에서 분기. SEO 영향 없음 (회원 페이지는 비공개 콘텐츠).