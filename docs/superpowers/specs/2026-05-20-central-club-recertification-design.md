# CC — 중앙동아리 연간 재인증 설계

> 작성일: 2026-05-20
> 도메인: `club` 확장 (신규 도메인 아님)
> 범위: ADMIN 라운드 라이프사이클 · LEADER 재인증 제출 · ADMIN 검토/승인 · `lastVerifiedYear` 갱신 · 미인증(EXPIRED) 표시

---

## 1. 배경 / 목적

중앙동아리 자격은 매년 운영 실태를 재확인해야 한다. 현재는 `club.central_club` boolean 만 있어
ADMIN 이 수동으로 토글하는 구조다. 이를 연 1회 정기 재인증 절차로 체계화해
**(a)** LEADER 가 정해진 라운드 안에 운영진 정보를 제출하고,
**(b)** ADMIN 이 통일된 워크플로우로 검토·승인하며,
**(c)** 시스템이 `lastVerifiedYear` 를 갱신해 미재인증 중앙동아리를 자동 노출한다.

`central_club` 자체의 자동 해제는 하지 않는다 — ADMIN 이 RC-5 리스트를 보고 기존
`PATCH /admin/clubs/{id}/central-club` (C-5) 로 수동 해제한다. 결정 부담은 사람이 진다.

---

## 2. 스코프

### In Scope
- ADMIN 의 재인증 라운드(`RecertificationRound`) 생성·종료
- LEADER 의 재인증 제출(`RecertificationRequest`) — 본인 LEADER + 중앙동아리 + OPEN 라운드만
- ADMIN 의 제출 목록·상세·처리(APPROVED/REJECTED)
- APPROVED 시 `club.last_verified_year` 갱신
- ADMIN 의 미인증 동아리(`EXPIRED`) 조회 — 현재 운영 연도 기준 계산값
- 라운드 닫힘 후에도 기존 PENDING 은 ADMIN 이 계속 처리 가능, 새 제출만 차단

### Out of Scope
- 알림(마감 임박 / 미제출 리마인더)
- 자동 `central_club` 해제(스케줄러)
- 공개 API 의 EXPIRED 배지 표시 (현재 단계는 ADMIN 콘솔만)
- 라운드 자동 일정(cron 기반 자동 OPEN)
- 운영진 명단 검토 워크플로우(LEADER/OFFICER 변경 승인 등) — 본 도메인 미포함
- 첨부 파일 업로드(증빙 자료)
- 라운드 재오픈(닫힌 라운드를 다시 OPEN 으로 복귀)

---

## 3. 도메인 모델

### 3.1 `RecertificationRound extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `year` | `int` | NOT NULL — 운영 연도(예: 2026) |
| `label` | `varchar(100)` | NOT NULL — "2026 정기 재인증" |
| `status` | enum `RoundStatus` | NOT NULL, default `OPEN`. `OPEN` / `CLOSED` |
| `openedBy` | `Long` (FK `users.id`) | NOT NULL — 라운드를 연 ADMIN |
| `openedAt` | `timestamp` | NOT NULL |
| `closedBy` | `Long` (FK `users.id`) | nullable |
| `closedAt` | `timestamp` | nullable |

**DB 제약**
- 조건부 유니크: `(year) WHERE status='OPEN' AND deleted_at IS NULL` — 연도당 OPEN 라운드 1개.
- CHECK: `(status='OPEN' AND closed_by IS NULL AND closed_at IS NULL) OR (status='CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)`.
- 인덱스: `(year DESC)`.

### 3.2 `RecertificationRequest extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `roundId` | `Long` (FK `recertification_round.id`) | NOT NULL |
| `clubId` | `Long` (FK `club.id`) | NOT NULL |
| `leaderUserId` | `Long` (FK `users.id`) | NOT NULL — 제출 시점 현 LEADER |
| `contactEmail` | `varchar(255)` | NOT NULL |
| `contactPhone` | `varchar(40)` | NOT NULL |
| `operatingYear` | `int` | NOT NULL |
| `notes` | `text` | nullable, ≤2000자 |
| `status` | enum `RecertificationStatus` | NOT NULL, default `PENDING`. `PENDING` / `APPROVED` / `REJECTED` |
| `actionNote` | `text` | nullable, ≤1000자 |
| `handledBy` | `Long` (FK `users.id`) | nullable |
| `handledAt` | `timestamp` | nullable |

**DB 제약**
- 조건부 유니크: `(round_id, club_id) WHERE status='PENDING' AND deleted_at IS NULL`.
- CHECK 길이: `notes ≤ 2000`, `action_note ≤ 1000`.
- CHECK 처리 페어링: `(status='PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR (status<>'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)`.
- 인덱스: `(round_id, status, created_at DESC)`, `(club_id, created_at DESC)`.

### 3.3 Club 변경
- 새 컬럼: `last_verified_year INT` nullable. APPROVED 처리 시점에 `round.year` 로 갱신.
- 다른 컬럼·동작 변경 없음. centralClub 자체는 본 도메인이 변경하지 않는다.

### 3.4 상태 머신
- Round: `OPEN → CLOSED` (단방향). 종료 후 재오픈 불가 (Out of Scope).
- Request: `PENDING → APPROVED` / `PENDING → REJECTED`. 종결 후 변경 불가.

### 3.5 미인증(EXPIRED) 판정 — 계산값
`club.central_club = true AND (club.last_verified_year IS NULL OR club.last_verified_year < :operatingYear)`.
DB 컬럼이 아니다. RC-5 응답·필터에서만 계산해 노출.

### 3.6 Flyway V29
새 마이그레이션 파일 1개:
`V29__create_recertification_round_and_request.sql`
- `recertification_round` 테이블 + 인덱스
- `recertification_request` 테이블 + 인덱스
- `ALTER TABLE club ADD COLUMN last_verified_year INT`

기존 마이그레이션 수정 금지.

---

## 4. API

응답은 표준 래퍼(`{ ok, data, message }`) + `PageResponse<T>` 사용.

### RR-1. 라운드 열기 — `POST /admin/recertification-rounds`
- 권한: `ADMIN`
- Request: `{ "year": 2026, "label": "2026 정기 재인증" }`
- Response: `201`, `{ roundId }`
- 예외: 400 입력 검증 / 401 / 403 / 409 동일 `year` 에 이미 OPEN 라운드 존재

### RR-2. 라운드 닫기 — `PATCH /admin/recertification-rounds/{roundId}/close`
- 권한: `ADMIN`
- Response: `204`
- 동작: `status=CLOSED, closedBy=adminId, closedAt=now()`.
- 예외: 400 이미 CLOSED / 401 / 403 / 404

### RR-3. 라운드 목록 — `GET /admin/recertification-rounds`
- 권한: `ADMIN`
- Query: `status?`, `Pageable`. 기본 정렬 `year DESC, createdAt DESC`.
- Response: `PageResponse<RecertificationRoundResponse>` (`id`, `year`, `label`, `status`, `openedBy{id,name}`, `openedAt`, `closedBy{id,name}` nullable, `closedAt` nullable).

### RC-1. 재인증 제출 — `POST /clubs/{clubId}/recertification-requests`
- 권한: 인증 + `clubAuthService.requireLeader(currentUser.id, clubId)`.
- 사전 조건:
  - `club.centralClub == true` (아니면 400 — "중앙동아리만 재인증 대상")
  - 현재 `RecertificationRound{status=OPEN}` 가 존재해야 함 (없으면 400 — "열린 라운드 없음")
- Request:
  ```json
  {
    "contactEmail": "leader@example.com",
    "contactPhone": "010-1234-5678",
    "operatingYear": 2026,
    "notes": "선택 입력 (≤2000)"
  }
  ```
- Response: `201`, `{ requestId }`
- 예외:
  - 400: 입력 검증 / 비-중앙동아리 / OPEN 라운드 없음 / LEADER 아님(서비스 단)
  - 401 미인증
  - 404 club 없음
  - 409 동일 round×club PENDING 중복

### RC-2. 재인증 목록 (ADMIN) — `GET /admin/recertification-requests`
- 권한: `ADMIN`
- Query: `roundId?`, `status?`, `Pageable`. 기본 정렬 `createdAt DESC`.
- Response: `PageResponse<RecertificationRequestSummaryResponse>`
  - 항목: `id`, `round{id,year,label,status}`, `club{id,name}`, `leader{id,name}`, `status`, `operatingYear`, `createdAt`.

### RC-3. 재인증 상세 (ADMIN) — `GET /admin/recertification-requests/{requestId}`
- 권한: `ADMIN`
- Response: `RecertificationRequestDetailResponse`
  - 기본 필드 + `currentLeader{id,name}` (요청 시점이 아닌 **현재** LEADER, 변경 가능성 보존) + `officers: [{id, name}]` (현재 OFFICER 목록) + `recentMemberHistory: [{eventType, target, actor, fromRole, toRole, createdAt}]` (최근 10건) + `handledBy{id,name}` nullable + `actionNote` + `notes`.
- ADMIN 응답 전용 — `actionNote`, `handledBy`, `notes` 모두 노출.
- 예외: 401 / 403 / 404

### RC-4. 재인증 처리 (ADMIN) — `PATCH /admin/recertification-requests/{requestId}`
- 권한: `ADMIN`
- Request: `{ "status": "APPROVED" | "REJECTED", "actionNote": "선택 (≤1000)" }`
- 동작 (단일 트랜잭션):
  - `request.process(adminId, status, actionNote)` — 상태 머신.
  - APPROVED 시: `club.lastVerifiedYear = round.year` 갱신.
  - REJECTED 시: club 변경 없음.
- Response: `204`
- 예외: 400 잘못된 전이(PENDING 외에서) / 401 / 403 / 404

### RC-5. 미인증 동아리 조회 (ADMIN) — `GET /admin/clubs/recertification-status`
- 권한: `ADMIN`
- Query: `operatingYear` (필수), `Pageable`.
- Response: `PageResponse<CentralClubRecertificationStatusResponse>`
  - `clubId`, `clubName`, `centralClub`, `lastVerifiedYear`, `expired`(boolean = `centralClub && (lastVerifiedYear IS NULL || lastVerifiedYear < operatingYear)`).
- 결과는 `central_club = true` 만 반환 (필터 강제), `expired` 기준 정렬: EXPIRED 먼저, 그 다음 `lastVerifiedYear ASC`.

---

## 5. 권한 / 검증

### 5.1 권한 정책
| 액션 | 요구 권한 |
|---|---|
| RR-1, RR-2, RR-3 | `ADMIN` |
| RC-1 | 인증 + 본인이 해당 `clubId` 의 LEADER |
| RC-2, RC-3, RC-4, RC-5 | `ADMIN` |

ADMIN 경로는 컨트롤러 레벨 `@PreAuthorize("hasRole('ADMIN')")`. LEADER 검증은 `ClubAuthService.requireLeader` 재사용.

### 5.2 입력 검증 (한국어 메시지)
- `year`, `operatingYear`: `@Min(2000)`, `@Max(2100)`.
- `label`: `@NotBlank`, `@Size(max = 100)`.
- `contactEmail`: `@NotBlank`, `@Email`, `@Size(max = 255)`.
- `contactPhone`: `@NotBlank`, `@Size(max = 40)`.
- `notes`: `@Size(max = 2000)`.
- `actionNote`: `@Size(max = 1000)`.
- `status` (RC-4): `@NotNull`, 값은 `APPROVED` 또는 `REJECTED`.

### 5.3 동시성
- RR-1: `(year, OPEN)` 조건부 unique index + `DataIntegrityViolationException` 캐치 → 409.
- RC-1: `(round_id, club_id, PENDING)` 조건부 unique index + 선조회 + 위 캐치 → 409.
- RC-4: APPROVED 시 `clubRepository.findById` 후 `club.setLastVerifiedYear(round.year)` — `@Transactional` 한 단위. 동시 PATCH 가능성은 낮음(같은 request 를 두 ADMIN 이 동시 처리). 보수적으로 `requestRepository.findByIdForUpdate` 사용해 행 락.

---

## 6. 응답 / 감사 노출
- 공개 API 노출 없음 — 모든 ADMIN 경로(`/admin/recertification-rounds*`, `/admin/recertification-requests*`, `/admin/clubs/recertification-status`).
- LEADER 가 자신의 제출 상태를 조회하는 경로는 본 spec 에 포함하지 않음 (Out of Scope — 후속).
- `lastVerifiedYear` 컬럼은 club 응답에 즉시 노출하지 않는다 (현 단계 ADMIN 전용 — RC-5 응답에만 포함). 후속에서 공개 응답 추가 시 별도 결정.

---

## 7. 테스트 전략

DDD + Testcontainers + Flyway.

### 서비스 단위 (Round)
- 정상 OPEN 라운드 생성 → year/label/status=OPEN 저장.
- 동일 year OPEN 존재 시 두 번째 OPEN → 409.
- CLOSED 라운드를 다시 close 호출 → 400.
- 라운드 닫기 정상 → `status=CLOSED, closedBy/At` 세팅.

### 서비스 단위 (Request)
- 정상 제출 → PENDING 저장.
- 비-LEADER 호출 → 400 (`ClubAuthService` 에서 AccessDeniedException 전파).
- 비-중앙동아리 → 400.
- OPEN 라운드 없음 → 400.
- 동일 round×club PENDING 존재 시 두 번째 제출 → 409.
- APPROVED → `request.status=APPROVED`, `club.lastVerifiedYear = round.year`.
- REJECTED → `request.status=REJECTED`, club 변경 없음.
- 종결된 요청 재PATCH → 400.

### RC-5 통합
- 중앙동아리 A: lastVerifiedYear=null → expired=true.
- 중앙동아리 B: lastVerifiedYear=2025, operatingYear=2026 → expired=true.
- 중앙동아리 C: lastVerifiedYear=2026, operatingYear=2026 → expired=false.
- 일반동아리(centralClub=false): 결과 미포함.
- 정렬: EXPIRED 먼저.

### 인수 테스트
- LEADER 정상 제출 201.
- STUDENT 가 ADMIN 경로 호출 403.
- ADMIN APPROVED 후 RC-5 결과에서 해당 동아리 제외(현 operatingYear 기준).

---

## 8. 마이그레이션 / 배포

- Flyway V29 추가. 기존 파일 수정 금지.
- 데이터 백필: 없음. 기존 중앙동아리는 `last_verified_year = null` 로 시작 (= 첫 라운드 전까지는 EXPIRED 로 노출됨 — 의도된 동작, ADMIN 이 첫 라운드에서 정리).
- 환경변수 추가 없음.

---

## 9. 후속(Future Work)

- LEADER 가 본인 클럽의 제출 이력·상태 조회 API.
- ADMIN 의 EXPIRED 리마인더 알림.
- 라운드 마감 임박 LEADER 알림.
- 라운드 자동 OPEN (예: 매년 1월 1일).
- 라운드 재오픈.
- 공개 API 의 EXPIRED 배지 / FE 노출.
- 증빙 파일 업로드.
- 운영진(LEADER/OFFICER) 명단 검토 워크플로우.
