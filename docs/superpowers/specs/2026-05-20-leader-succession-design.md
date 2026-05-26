# E1 — LEADER 권한 복구·승계 + 감사 로그 설계

> 작성일: 2026-05-20
> 도메인: `clubmember` 확장 (신규 도메인 아님)
> 범위: ADMIN 강제 LEADER 지정 · OFFICER 승계 요청·승인 · 권한 변경 감사 로그

---

## 1. 배경 / 목적

대구대학교 동아리 운영에서 다음 두 가지 상황이 반복적으로 발생한다.

1. LEADER 가 졸업·휴학 등으로 부재한 상태에서 동아리가 멈춰버린다.
2. LEADER 가 존재하지만 잠수해 의사결정이 막혔는데, 정상 인계 절차를 거칠 수 없다.

(1) 은 ADMIN 이 직접 LEADER 를 지정할 수 있는 강제 경로로 해결하고,
(2) 는 OFFICER 가 승계 요청을 제출해 ADMIN 의 승인을 받는 워크플로우로 해결한다.
모든 권한 변경은 감사 로그로 추적한다.

> 본 spec 은 기존 정상 인계 흐름(`POST /clubs/{clubId}/members/{memberId}/transfer-leader`),
> OFFICER ↔ MEMBER 승강(`PATCH .../role`), 탈퇴·강퇴 API 의 **동작 자체는 변경하지 않는다**.
> 해당 메서드들이 감사 로그를 추가로 기록하도록 보강만 한다.

---

## 2. 스코프

### In Scope
- OFFICER 의 승계 요청 제출 + ADMIN 의 승인/거절
- ADMIN 의 강제 LEADER 지정 (LEADER 부재 동아리 한정)
- 권한 변경 전역 감사 로그(`club_member_history`)
- ADMIN 의 감사 로그 조회 API

### Out of Scope
- 학기/연도 단위 일괄 회장단 인증 워크플로우 → 별도 도메인(중앙동아리 재인증)
- 잠수 LEADER / 요청자 / 동아리 멤버 대상 알림 발송
- 감사 로그 외부 익스포트(CSV/Excel)
- 익명 승계 요청, co-sign(이중 서명) 형태
- LEADER 재량의 OFFICER 임명 시 별도 승인 단계(현재 `PATCH .../role` 그대로)

---

## 3. 도메인 모델

### 3.1 `LeaderSuccessionRequest extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `clubId` | `Long` (FK `club.id`) | NOT NULL |
| `requesterUserId` | `Long` (FK `users.id`) | NOT NULL — 승계 의사 OFFICER |
| `reason` | `text` | NOT NULL, ≤1000자 — 잠수 증거·사유 |
| `status` | enum `SuccessionStatus` | NOT NULL, default `PENDING`. `PENDING` / `APPROVED` / `REJECTED` |
| `actionNote` | `text` | nullable, ≤1000자. 처리 시 ADMIN 메모 |
| `handledBy` | `Long` (FK `users.id`) | nullable |
| `handledAt` | `timestamp` | nullable |

BaseEntity 상속으로 `createdAt`, `updatedAt`, `deletedAt` 포함.

**상태 머신**: `PENDING → APPROVED` / `PENDING → REJECTED`. 종결 상태 재변경 불가.

**DB 제약**:
- 조건부 유니크: `(club_id) WHERE status='PENDING' AND deleted_at IS NULL` — 동아리당 PENDING 1건.
- CHECK: `char_length(reason) <= 1000`, `char_length(action_note) <= 1000`.
- CHECK: `(status='PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR (status<>'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)`.

### 3.2 `ClubMemberHistory extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `clubId` | `Long` | NOT NULL |
| `targetUserId` | `Long` | NOT NULL — 권한이 바뀐 사람 |
| `actorUserId` | `Long` | NOT NULL — 변경을 일으킨 사람 (LEADER / ADMIN / 본인) |
| `eventType` | enum `ClubMemberEventType` | NOT NULL. 아래 값 |
| `fromRole` | enum `ClubMemberRole` | nullable. 변경 전 |
| `toRole` | enum `ClubMemberRole` | nullable. 변경 후 (null = 탈퇴/추방) |
| `reason` | `text` | nullable, ≤1000자 |

**`ClubMemberEventType`**: `ROLE_CHANGED` / `LEADER_TRANSFERRED` / `LEFT` / `REMOVED` / `ADMIN_LEADER_ASSIGNED` / `SUCCESSION_APPROVED`

**DB 제약**:
- 인덱스: `(club_id, created_at DESC)` — 동아리별 이력 조회.
- 인덱스: `(target_user_id, created_at DESC)` — 사용자별 이력 조회.

### 3.3 Flyway

새 마이그레이션 파일 1개:
- `V28__create_leader_succession_and_member_history.sql` — 두 테이블 + 인덱스 + 조건부 유니크 + CHECK.

기존 마이그레이션 파일 수정 금지.

---

## 4. API

응답은 표준 래퍼(`{ ok, data, message }`) + `PageResponse<T>` 사용.

### LS-1. 승계 요청 제출 — `POST /clubs/{clubId}/leader-succession-requests`
- 권한: 인증된 사용자 + 본인이 해당 `clubId` 의 `OFFICER` 여야 함.
- Request:
  ```json
  { "reason": "최근 3개월 응답 없음 (≤1000자 필수)" }
  ```
- Response: `201`, `{ requestId }`
- 예외:
  - 400: `reason` 누락/길이 / 요청자가 OFFICER 아님(LEADER·MEMBER·비멤버)
  - 401 미인증 / 404 club 없음
  - 409: 동일 club PENDING 승계 요청 존재

### LS-2. 승계 요청 목록 (ADMIN) — `GET /admin/leader-succession-requests`
- 권한: `ADMIN`
- Query: `status?`, `clubId?`, Pageable. 기본 정렬 `createdAt,desc`.
- Response: `PageResponse<SuccessionRequestSummaryResponse>`
  - 항목: `id`, `clubId`, `clubName`, `requester{id,name}`, `status`, `createdAt`

### LS-3. 승계 요청 상세 (ADMIN) — `GET /admin/leader-succession-requests/{requestId}`
- 권한: `ADMIN`
- Response: `SuccessionRequestDetailResponse` — `id`, `club{id,name}`, `requester{id,name}`,
  `currentLeader{id,name}` (없으면 null), `reason`, `status`, `actionNote`, `handledBy{id,name}` (nullable), `handledAt`, `createdAt`
- 예외: 401 / 403 / 404

### LS-4. 승계 요청 처리 (ADMIN) — `PATCH /admin/leader-succession-requests/{requestId}`
- 권한: `ADMIN`
- Request:
  ```json
  { "status": "APPROVED", "actionNote": "메모 (≤1000자)" }
  ```
  - `status ∈ { APPROVED, REJECTED }`.
- 동작:
  - `APPROVED`: 단일 트랜잭션 + `PESSIMISTIC_WRITE` 로 두 `ClubMember` 행 락 →
    1) 현 LEADER `ClubMember` → `MEMBER` 로 변경
    2) 요청자 `ClubMember` → `LEADER` 로 변경
    3) `ClubMemberHistory` 3행 기록:
       - `(target=oldLeader, from=LEADER, to=MEMBER, event=SUCCESSION_APPROVED, actor=adminId)`
       - `(target=requester, from=OFFICER, to=LEADER, event=SUCCESSION_APPROVED, actor=adminId)`
       - 메타용 1건 추가하지 않음 — 위 두 행이 사건을 완전히 표현.
    4) `LeaderSuccessionRequest` 상태/handler/handledAt 갱신.
  - `REJECTED`: 멤버 변경 없음. 요청 상태만 갱신. History 행 없음.
- Response: `204`
- 예외:
  - 400: 입력 검증 / 현재 상태가 PENDING 아님 / 요청자가 더 이상 OFFICER 아님 / LEADER 부재(=강제 지정 경로로 가야 함)
  - 401 / 403 / 404

### LH-1. ADMIN 강제 LEADER 지정 — `POST /admin/clubs/{clubId}/leader`
- 권한: `ADMIN`
- 사전 조건: 해당 `clubId` 에 현재 `LEADER` 인 `ClubMember` 가 존재하지 않아야 함.
- Request:
  ```json
  { "newLeaderUserId": 12, "reason": "전 회장 졸업 (≤1000자 필수)" }
  ```
- 동작: 단일 트랜잭션 →
  1) `newLeaderUserId` 의 `ClubMember` 존재 검증 (없으면 404). 역할 무관.
  2) LEADER 존재 재검증 (락) — 존재하면 400.
  3) 해당 `ClubMember` → `LEADER` 로 변경.
  4) `ClubMemberHistory` 1행: `(target=newLeader, from=기존역할, to=LEADER, event=ADMIN_LEADER_ASSIGNED, actor=adminId, reason=…)`
- Response: `204`
- 예외:
  - 400: `reason` / `newLeaderUserId` 검증 / LEADER 가 이미 존재
  - 401 / 403 / 404 (club 또는 후보 ClubMember 없음)

### LH-2. 권한 변경 이력 조회 (ADMIN) — `GET /admin/clubs/{clubId}/member-history`
- 권한: `ADMIN`
- Query: Pageable. 기본 정렬 `createdAt,desc`.
- Response: `PageResponse<ClubMemberHistoryResponse>`
  - 항목: `id`, `eventType`, `target{id,name}`, `actor{id,name}`, `fromRole`, `toRole`, `reason`, `createdAt`
- 예외: 401 / 403 / 404 (club 없음)

---

## 5. 기존 코드 보강 (감사 로그 자동 기록)

`GeneralClubMemberCommandService` 의 다음 메서드들에 **history insert** 한 줄을 추가 (동작 변경 없음, 추가만):

| 기존 메서드 | 추가 history event | from / to | actor |
|---|---|---|---|
| `updateMemberRole` | `ROLE_CHANGED` | 기존 role / 새 role | 호출 LEADER |
| `transferLeader` | `LEADER_TRANSFERRED` (2행) | LEADER→OFFICER 또는 MEMBER, 상대→LEADER | 호출 LEADER |
| `leaveClub` | `LEFT` | 기존 role / null | 본인 |
| `removeMember` | `REMOVED` | 기존 role / null | 호출 LEADER |

새 서비스 메서드:
- `approveSuccession(requestId, adminUserId)` — 위 LS-4 APPROVED 로직.
- `rejectSuccession(requestId, adminUserId, actionNote)` — 위 LS-4 REJECTED 로직.
- `assignLeaderByAdmin(clubId, newLeaderUserId, adminUserId, reason)` — 위 LH-1 로직.

감사 로그 기록은 **이벤트 리스너 X**, 각 서비스 메서드가 직접 `clubMemberHistoryRepository.save(...)` 호출.
이유: 도메인 경계 내 단순 추적이며, 추가 비동기성·재시도 정책 불필요. 트랜잭션 일관성도 같은 트랜잭션 안에서 보장.

---

## 6. 권한 / 검증 상세

### 6.1 권한 정책

| 액션 | 요구 권한 |
|---|---|
| `POST /clubs/{clubId}/leader-succession-requests` | 인증 + 해당 club 의 `OFFICER` |
| `GET /admin/leader-succession-requests*` | `ADMIN` |
| `PATCH /admin/leader-succession-requests/{id}` | `ADMIN` |
| `POST /admin/clubs/{clubId}/leader` | `ADMIN` |
| `GET /admin/clubs/{clubId}/member-history` | `ADMIN` |

`@PreAuthorize("hasRole('ADMIN')")` 컨트롤러 레벨. OFFICER 검사는 `ClubAuthService` 신규 메서드 `requireOfficer(userId, clubId)` 추가.

### 6.2 입력 검증
- `reason`: `@NotBlank`, `@Size(max = 1000)`
- `actionNote`: `@Size(max = 1000)`
- `newLeaderUserId`: `@NotNull`, `@Positive`
- 메시지는 한국어.

### 6.3 동시성
- LS-4 APPROVED: 두 ClubMember 행 `PESSIMISTIC_WRITE` (기존 `transferLeader` 패턴 재사용).
- LH-1: ClubMember(LEADER) 부재 재검증 시 `findByClubIdAndRole(clubId, LEADER) FOR UPDATE` 또는 신규 후보 ClubMember 락 후 LEADER 존재 재확인.

---

## 7. 노출 / 감사 정책
- 공개 API 에 승계 요청 / 이력 미노출. 전부 `/admin/**` 또는 본인 요청자 경로(LS-1 만 본인 제출).
- 요청자의 신원, `actionNote`, `handledBy/At` 은 ADMIN 응답에만 노출.
- ClubMemberHistory 는 모두 ADMIN 만 조회 가능.

---

## 8. 테스트 전략

DDD 컨벤션, Testcontainers + Flyway 기반.

### 서비스 단위
- 승계 요청 정상 생성 → PENDING, 본인 OFFICER 검증.
- 요청자가 LEADER → 400.
- 요청자가 MEMBER → 400.
- 동일 club PENDING 존재 시 중복 → 409.
- 처리 PENDING→APPROVED: 두 행 교환 + History 2행 기록 + 요청 종결.
- 처리 PENDING→REJECTED: 멤버 변경 없음 + History 없음 + 요청 종결.
- 종결된 요청 재PATCH → 400.
- APPROVED 시점에 요청자가 OFFICER 아님 → 400.
- ADMIN 강제 지정 정상: 후보 ClubMember(MEMBER) → LEADER, History 1행.
- ADMIN 강제 지정 시 LEADER 이미 존재 → 400.
- ADMIN 강제 지정 시 후보가 ClubMember 아님 → 404.
- 감사 로그 자동 기록: 기존 `updateMemberRole/transferLeader/leaveClub/removeMember` 호출 후 history row 존재 검증 (각 1~2건).

### 컨트롤러 / 보안
- LS-1: LEADER, MEMBER, 비멤버 호출 시 403/400.
- /admin/** : STUDENT 403.
- 미인증 401.

---

## 9. 마이그레이션 / 배포

- Flyway V28 추가. 기존 파일 수정 금지.
- 데이터 백필 없음.
- 환경변수 추가 없음.

---

## 10. 후속(Future Work)

- 승계 요청 / ADMIN 강제 지정 알림 발송 (Notification 도메인 확장).
- 감사 로그 CSV 익스포트.
- LEADER 부재 동아리 ADMIN 대시보드 위젯.
- 학기/연도 단위 일괄 인증 (중앙동아리 재인증 도메인).
