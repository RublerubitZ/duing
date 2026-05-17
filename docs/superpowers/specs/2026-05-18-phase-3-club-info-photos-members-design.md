# Phase 3 — 운영진: 동아리 정보·활동사진·멤버 관리 설계 문서

> 작성: 2026-05-18
> 범위: `2026-05-15-duing-full-flow-design.md` Phase 3 (운영진: 정보·사진·멤버) 의 BE 7개 API · FE 3개 페이지
> 선행: Phase 0~2 머지 완료 (Club 확장 컬럼·ClubPhoto 테이블·ClubMember·`FileStorageService`·`ClubAuthService` 모두 존재)

---

## 1. 목적·성공 기준

운영진(LEADER/OFFICER)이 자기 동아리의 정보·활동사진·멤버 구성을 직접 관리하게 한다.

- LEADER 는 동아리 기본 정보(이름·소개·로고·커버·태그·SNS·FAQ)를 부분 수정할 수 있다.
- LEADER/OFFICER 는 활동사진을 업로드·캡션 수정·드래그로 순서 변경·삭제할 수 있다.
- LEADER/OFFICER 는 자기 동아리 멤버 전체를 역할별로 조회할 수 있다.
- LEADER 는 MEMBER ↔ OFFICER 승급·강등, 다른 멤버 강퇴, 회장 인계를 할 수 있다.
- 모든 멤버는 자기 동아리에서 탈퇴할 수 있다. 단 LEADER 는 회장 인계 후에만 가능.
- 회장 인계는 단일 트랜잭션에서 원자적으로 처리된다(두 LEADER 동시 존재 불가).

---

## 2. 도메인 구조

기존 DDD 컨벤션(`api/controller/service/entity/repository/exception` 분리)을 그대로 따른다.

```
backend/src/main/java/com/duing/domain/
  club/
    api/ClubApi.java                     (+) PATCH /api/v1/clubs/{clubId}
    controller/ClubController.java       (+) updateClub
    controller/dto/request/UpdateClubRequest.java                NEW
    service/ClubService.java             (+) update(...)
    service/GeneralClubService.java      (+) 구현
    service/dto/command/UpdateClubCommand.java                   NEW
    exception/
      ClubNameDuplicatedException.java                           NEW (409)
      InvalidClubFieldException.java                             NEW (400)

    api/ClubPhotoApi.java                (+) create / patch / reorder / delete
    controller/ClubPhotoController.java  (+) 4 핸들러
    controller/dto/request/
      CreateClubPhotoRequest.java                                NEW
      UpdateClubPhotoRequest.java                                NEW
      ReorderClubPhotosRequest.java                              NEW
    photo/service/ClubPhotoService.java  (+) create/update/reorder/delete
    photo/service/dto/command/*Command.java                      NEW
    photo/exception/
      ClubPhotoNotFoundException.java                            NEW (404)
      ClubPhotoOrderMismatchException.java                       NEW (400)

  clubmember/
    api/LeaderClubApi.java               (+) 이름 유지하되 멤버 관리 5개 추가
                                              (혹은 ClubMemberApi 신설 — §6 결정)
    controller/LeaderClubController.java (+) 5 핸들러
    controller/dto/
      response/ClubMemberResponse.java                           NEW
      request/UpdateMemberRoleRequest.java                       NEW
    service/
      ClubMemberQueryService.java                                NEW (목록)
      ClubMemberCommandService.java                              NEW (역할/강퇴/탈퇴/인계)
      ClubAuthService.java                 (재사용)
    service/dto/command/
      UpdateMemberRoleCommand.java                               NEW
      TransferLeaderCommand.java                                 NEW
    exception/
      CannotChangeOwnRoleException.java                          NEW (409)
      CannotRemoveSelfException.java                             NEW (409)
      CannotModifyLeaderException.java                           NEW (409)
      LeaderCannotLeaveException.java                            NEW (409)
      TransferTargetInvalidException.java                        NEW (400)
      ClubMemberNotFoundException.java                           NEW (404, 이미 있으면 재사용)
```

신규 마이그레이션은 없다. V7(ClubMember) / V8(Club 확장) / V9(ClubPhoto) 가 모두 적용된 상태를 전제로 한다.

---

## 3. API 명세

베이스: `/api/v1`. 모든 응답은 `ApiResponse<T>` 래퍼. 권한은 표 우측의 가드를 통과해야 함.

| # | Method · Path | 가드 | Status |
|---|---|---|---|
| 3.1 | `PATCH /clubs/{clubId}` | `requireLeader(clubId)` | 200 / 400 / 403 / 409 |
| 3.2a | `POST /clubs/{clubId}/photos` | `requireOfficerOrLeader(clubId)` | 201 / 400 / 403 |
| 3.2b | `PATCH /clubs/{clubId}/photos/{photoId}` | 〃 | 200 / 400 / 403 / 404 |
| 3.2c | `PUT /clubs/{clubId}/photos/order` | 〃 | 200 / 400 / 403 |
| 3.2d | `DELETE /clubs/{clubId}/photos/{photoId}` | 〃 | 204 / 403 / 404 |
| 3.3 | `GET /clubs/{clubId}/members` | 〃 | 200 / 403 |
| 3.4 | `PATCH /clubs/{clubId}/members/{memberId}/role` | `requireLeader(clubId)` | 200 / 400 / 403 / 404 / 409 |
| 3.5 | `DELETE /clubs/{clubId}/members/{memberId}` | 〃 | 204 / 403 / 404 / 409 |
| 3.6 | `DELETE /clubs/{clubId}/members/me` | 본인 인증만 (clubId 쿼리) | 204 / 404 / 409 |
| 3.7 | `POST /clubs/{clubId}/members/{memberId}/transfer-leader` | `requireLeader(clubId)` | 200 / 400 / 403 / 404 |

### 3.1 PATCH /clubs/{clubId}

Request (모든 필드 optional, null/미포함이면 변경 안 함)
```json
{
  "name": "두잉",
  "category": "ACADEMIC",
  "division": "중앙동아리",
  "description": "...",
  "logoUrl": "https://...",
  "coverUrl": "https://...",
  "tags": ["코딩", "스터디"],
  "snsLinks": [{ "platform": "INSTAGRAM", "url": "https://..." }],
  "faqs": [{ "question": "...", "answer": "...", "order": 0 }]
}
```

검증
- `name`: 1~100, unique. 충돌 시 `ClubNameDuplicatedException` (409).
- `category`: enum 8종 중 하나.
- `tags`: 최대 20개, 각 1~20자, 중복 제거.
- `snsLinks`: 최대 10개, `platform ∈ {INSTAGRAM, FACEBOOK, X, YOUTUBE, KAKAO, WEB}`, `url` 1~500 + URL 정규식.
- `faqs`: 최대 20개, `question` 1~200, `answer` 1~2000, `order` ≥ 0.

응답: `ClubDetailResponse` (기존 GET 과 동일 스키마).

### 3.2 활동사진 CUD

**3.2a POST /clubs/{clubId}/photos**
```json
{ "storageKey": "club-photos/abc.jpg", "caption": "MT 단체사진", "width": 1920, "height": 1080 }
```
- `storageKey` 필수, `caption` 0~200, `width/height` ≥ 0 정수.
- `displayOrder` 는 서버가 `MAX(displayOrder) + 1` 로 자동 부여.
- 201 + `ClubPhotoResponse`.

**3.2b PATCH /clubs/{clubId}/photos/{photoId}**
```json
{ "caption": "수정된 캡션" }
```
- caption 만 수정. displayOrder 변경은 3.2c 에서만 처리.
- photoId 가 해당 clubId 소속 아니면 404.

**3.2c PUT /clubs/{clubId}/photos/order**
```json
[
  { "photoId": 12, "displayOrder": 0 },
  { "photoId": 10, "displayOrder": 1 },
  { "photoId": 15, "displayOrder": 2 }
]
```
- 단일 트랜잭션 내 일괄 update.
- 검증: 페이로드의 photoId 집합 == 해당 club 의 active(soft-delete 제외) photoId 집합. 불일치 시 `ClubPhotoOrderMismatchException` (400). displayOrder 는 0..N-1 연속 정수 강제.
- 200 + 정렬 적용된 `List<ClubPhotoResponse>`.

**3.2d DELETE /clubs/{clubId}/photos/{photoId}**
- soft delete (`deleted_at` 채움). Storage 객체는 남김 (정리 잡은 Phase 5).
- 204.

### 3.3 GET /clubs/{clubId}/members

Response
```json
[
  { "memberId": 1, "userId": 100, "name": "김회장", "studentId": "20200001",
    "role": "LEADER", "joinedAt": "2025-03-02T10:00:00" },
  { "memberId": 7, "userId": 220, "name": "박운영", "studentId": "20210010",
    "role": "OFFICER", "joinedAt": "2025-09-01T11:30:00" },
  ...
]
```
- 정렬: `role` (LEADER → OFFICER → MEMBER) → `joinedAt ASC`.
- soft-deleted 멤버 제외.
- 페이지네이션 없음.

### 3.4 PATCH /clubs/{clubId}/members/{memberId}/role

Request
```json
{ "role": "OFFICER" }
```
- `role ∈ {OFFICER, MEMBER}`. LEADER 값은 400.
- 본인(memberId 의 userId == 호출자 userId) 거부 → `CannotChangeOwnRoleException` (409).
- 대상 현재 role 이 LEADER → `CannotModifyLeaderException` (409). (LEADER 강등은 3.7 의 부산물로만)
- 대상 현재 role == 요청 role → 200 멱등 (변경 없이 성공).
- 응답: 변경 후 `ClubMemberResponse`.

### 3.5 DELETE /clubs/{clubId}/members/{memberId}

- 본인 거부 → `CannotRemoveSelfException` (409).
- 대상 LEADER 거부 → `CannotModifyLeaderException`.
- soft delete. 진행 중 Application 은 그대로 둠 (운영진 판단 영역).
- 같은 사용자의 재가입은 허용 (UNIQUE 인덱스가 `WHERE deleted_at IS NULL` 부분 인덱스이므로 자연 허용).
- 204.

### 3.6 DELETE /clubs/{clubId}/members/me

- 호출자 본인의 ClubMember 행을 찾아 soft delete.
- 멤버 아니면 404 (`ClubMemberNotFoundException`).
- 호출자 role 이 LEADER → `LeaderCannotLeaveException` (409, 메시지: "회장은 회장 인계 후에 탈퇴할 수 있습니다").
- 진행 중 Application 은 그대로 둠.
- 204.

### 3.7 POST /clubs/{clubId}/members/{memberId}/transfer-leader

- body 없음.
- 단일 `@Transactional` 안에서:
  1. 호출자의 LEADER 행과 대상 memberId 행을 `SELECT ... FOR UPDATE` 로 잠금
     (`ClubMemberRepository.findByIdForUpdate(...)`).
  2. 대상이 같은 clubId 의 OFFICER 또는 MEMBER 이고 soft-deleted 아닌지 검증
     → 아니면 `TransferTargetInvalidException` (400).
  3. 호출자 role: LEADER → OFFICER.
  4. 대상 role: → LEADER.
- 200 + 변경 후 두 멤버 정보 `{ formerLeader: ClubMemberResponse, newLeader: ClubMemberResponse }`.
- 동시성: 두 행 잠금으로 동시 두 명에게 인계되는 경합을 막는다 (테스트로 확인).

---

## 4. 권한 매트릭스

| 동작 | LEADER | OFFICER | MEMBER | 비멤버 |
|---|---|---|---|---|
| 정보 수정 (3.1) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| 사진 CUD (3.2) | ✅ | ✅ | ❌ 403 | ❌ 403 |
| 멤버 목록 (3.3) | ✅ | ✅ | ❌ 403 | ❌ 403 |
| 역할 변경 (3.4) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| 강퇴 (3.5) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| 본인 탈퇴 (3.6) | ❌ 409 | ✅ | ✅ | ❌ 404 |
| 회장 인계 (3.7) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |

가드 구현: 기존 `ClubAuthService` 확장.
- `requireLeader(clubId, userId)` — 이미 있음, 없으면 403 `NotClubLeaderException`.
- `requireOfficerOrLeader(clubId, userId)` — 이미 있음, 없으면 403 `NotClubManagerException`.

---

## 5. 예외 매핑 (GlobalExceptionHandler)

| 예외 | HTTP | 코드(`ApiResponse.code`) |
|---|---|---|
| `ClubNameDuplicatedException` | 409 | `CLUB_NAME_DUPLICATED` |
| `InvalidClubFieldException` | 400 | `INVALID_CLUB_FIELD` |
| `ClubPhotoNotFoundException` | 404 | `CLUB_PHOTO_NOT_FOUND` |
| `ClubPhotoOrderMismatchException` | 400 | `CLUB_PHOTO_ORDER_MISMATCH` |
| `CannotChangeOwnRoleException` | 409 | `CANNOT_CHANGE_OWN_ROLE` |
| `CannotRemoveSelfException` | 409 | `CANNOT_REMOVE_SELF` |
| `CannotModifyLeaderException` | 409 | `CANNOT_MODIFY_LEADER` |
| `LeaderCannotLeaveException` | 409 | `LEADER_CANNOT_LEAVE` |
| `TransferTargetInvalidException` | 400 | `TRANSFER_TARGET_INVALID` |
| `ClubMemberNotFoundException` | 404 | `CLUB_MEMBER_NOT_FOUND` |

---

## 6. API 인터페이스 배치 결정

`clubmember/api/LeaderClubApi` 는 현재 `GET /api/v1/clubs/me/managed` 만 가짐. 멤버 관리 5개를 같이 둘지, 분리할지:

- 결정: **`ClubMemberApi` 신설**.
  - `LeaderClubApi` 는 "내가 운영하는 동아리 목록" 의도가 명확 → 그대로 둠.
  - `ClubMemberApi` (`/clubs/{clubId}/members/...`) 가 자연스럽고 OFFICER 도 호출 가능한 3.3 까지 한 인터페이스에 모음.
  - `LeaderClubController` 는 `getManagedClubs` 만 유지. 새 핸들러들은 `ClubMemberController` 로.

---

## 7. 테스트 전략

### 단위/슬라이스
- `ClubControllerTest` (@WebMvcTest): 3.1 권한·검증·성공 경로.
- `ClubPhotoControllerTest`: 3.2 a~d 권한·검증.
- `ClubMemberControllerTest`: 3.3~3.7 권한·검증.

### 통합 (`@SpringBootTest` + Testcontainers Postgres)
- `ClubServiceIntegrationTest`: name 중복 시 409, 부분 갱신만 적용.
- `ClubPhotoServiceIntegrationTest`:
  - reorder 페이로드 누락 → 400, 정상 → 트랜잭션 내 일괄 갱신.
  - soft delete 후 동일 storageKey 재업로드 가능.
- `ClubMemberCommandServiceIntegrationTest`:
  - 본인 강퇴 거부, LEADER 강퇴 거부.
  - 강퇴 후 동일 user 재가입 (`ClubMember` 신규 row 생성) 가능.
  - LEADER 탈퇴 거부.
  - **`transfer-leader` 동시성**: 두 스레드가 동일 LEADER 권한으로 서로 다른 대상에 인계 시 한 트랜잭션만 성공, 다른 하나는 직렬화·재검증 후 적절히 실패. (CountDownLatch + 두 Executor 로 재현.)

### 픽스처
- `ClubMemberFixture.createTeam(club)` → LEADER 1, OFFICER 2, MEMBER 3 반환.
- `ClubPhotoFixture.createPhotos(club, n)`.

---

## 8. Frontend (Next.js 15 App Router, pnpm workspaces)

전제: `(manage)` 레이아웃·진입 가드(Phase 2.A)는 이미 존재. 모든 페이지는 `(manage)/clubs/[clubId]/...` 하위.

### 8.A 동아리 정보 수정 — `/manage/clubs/[clubId]/info`

- 컴포넌트: `ClubInfoForm`
  - 필드: name, 한줄소개(description 1줄), 카테고리(select), 분과(division), 로고/커버(파일 업로드 후 URL), 태그(chip input, 20개 제한), SNS(repeater, platform select + url), FAQ(repeater + 드래그 정렬).
  - LEADER 외(OFFICER 가 우회 진입) read-only 모드.
- 훅
  - `useClubDetail(clubId)` — 기존.
  - `useUpdateClub(clubId)` — `PATCH /clubs/{clubId}`, optimistic 후 `invalidateQueries(['club', clubId])`.
  - `useFileUpload()` — 기존 `POST /files` 래퍼 재사용.
- 검증: zod 스키마로 BE 검증과 동일 룰 (tags ≤ 20, sns ≤ 10, faqs ≤ 20).
- 저장 버튼: 변경된 필드만 PATCH payload 에 포함.

### 8.B 활동사진 — `/manage/clubs/[clubId]/photos`

- 컴포넌트
  - `PhotoUploader` — 멀티 select → 각 파일별 `POST /files` 순차 → `POST /photos` 호출.
  - `PhotoGrid` — dnd-kit `SortableContext`. 드래그 종료 후 1초 debounce 로 `PUT /photos/order` 호출 (실패 시 직전 순서로 롤백).
  - `PhotoCard` — 캡션 inline edit (`PATCH`), 삭제 버튼 (confirm 모달 → `DELETE`).
- 훅: `useClubPhotos`, `useCreatePhoto`, `useUpdatePhoto`, `useReorderPhotos`, `useDeletePhoto`.
- 권한: LEADER+OFFICER (`(manage)` 가드에서 통과).

### 8.C 멤버 관리 — `/manage/clubs/[clubId]/members`

- 컴포넌트
  - `MemberSection` 3개 (LEADER / OFFICER / MEMBER), 각 그룹 카운트 헤더 + 멤버 행.
  - `MemberRow`: 이름·학번·가입일 + 액션 영역.
    - LEADER 가 보는 OFFICER 행: "MEMBER로 강등" / "회장 인계" / "강퇴".
    - LEADER 가 보는 MEMBER 행: "OFFICER로 승급" / "회장 인계" / "강퇴".
    - 본인 행: "탈퇴" (LEADER 본인일 때는 비활성 + "회장 인계 후 가능" 툴팁).
    - OFFICER 가 보는 모든 행: 액션 없음 (읽기 전용).
  - `TransferLeaderDialog`: 2단계.
    1. 대상 카드 + "회장을 인계하면 본인은 OFFICER 가 됩니다. 되돌릴 수 없습니다."
    2. 동아리명 타이핑 확인 후 활성화되는 "인계" 버튼.
- 훅: `useClubMembers`, `useUpdateMemberRole`, `useRemoveMember`, `useLeaveClub`, `useTransferLeader`. 모두 성공 시 `invalidateQueries(['club-members', clubId])`. `useTransferLeader` 성공 시 추가로 사용자 권한 캐시 무효화 → `(manage)` 가드 재계산.

---

## 9. 작업 단위 (브랜치 / PR)

| # | 브랜치 | 포함 |
|---|---|---|
| BE-1 | `feat/{n}-be-club-update` | 3.1 |
| BE-2 | `feat/{n}-be-club-photos-cud` | 3.2 a~d |
| BE-3 | `feat/{n}-be-club-members-read` | 3.3 + `ClubMemberApi` 신설 + `ClubMemberQueryService` |
| BE-4 | `feat/{n}-be-club-members-mutate` | 3.4 + 3.5 + 3.6 + 3.7 + `ClubMemberCommandService` + `findByIdForUpdate` |
| FE-1 | `feat/{n}-fe-club-info-edit` | 3.A |
| FE-2 | `feat/{n}-fe-club-photos` | 3.B |
| FE-3 | `feat/{n}-fe-club-members` | 3.C |

각 PR 본문: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항. develop 분기·develop PR. 커밋 메시지 `[#이슈번호] 작업 내용`. (Claude 어트리뷰션 라인 금지.)

---

## 10. 본 스펙 범위 외 (Out of Scope)

- 강퇴/탈퇴 시 진행 중 Application 자동 처리 (그대로 둠).
- 강퇴 이력 기반 재가입 차단 (Phase 5).
- 회장 인계 시 비밀번호 재확인 (Phase 5).
- 활동사진 Storage 객체 정리 잡 (Phase 5).
- 멤버 검색·필터 UI (필요 시 FE 클라이언트 사이드로 후속 추가).
