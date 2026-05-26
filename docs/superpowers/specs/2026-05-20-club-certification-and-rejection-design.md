# 동아리 인증·거절 사유·중앙동아리 플래그 — 설계

- 작성일: 2026-05-20
- 범위: 총동연 어드민 기능군 중 **C — 동아리 인증/상태 관리 보강**
- 의존: 기존 `Club` 도메인 + `/admin/clubs` 화면 (이미 동작 중)

---

## 1. 배경 / 목표

### 현재 상태 (audit 결과)
- 백엔드: `POST /admin/clubs` (생성), `PATCH /admin/clubs/{id}/status` (상태 변경), `GET /admin/clubs` (목록) 모두 동작. `ClubStatus` 에는 `PENDING_APPROVAL / ACTIVE / INACTIVE / REJECTED` 4개 값.
- 프론트: `/admin/clubs` 통합 관리 페이지에 상태 탭 필터·테이블·상태 변경 다이얼로그·등록 폼 존재.
- 갭: 거절 사유 부재, 상태 전이 가드 부재 (백엔드가 임의 전이 허용), "공식 인증(중앙동아리)" 개념 미구현, 상태 변경 감사 정보(누가 했는지) 부재, REQUIREMENTS.md 표류.

### 본 PR 목표
1. **거절 사유** 입력·저장·표시. REJECTED 상태일 때만 의미 있음. 명시적 길이 제약.
2. **상태 전이 가드** 를 도메인에서 강제 (UI 단속만으로 부족) — 현재 매트릭스 유지.
3. **중앙동아리 플래그** (`centralClub: boolean`) 추가. ADMIN 이 별도 토글로 인증 여부 관리. 공개 카드/상세에서 🏛️ 배지로 노출. **`division` 과 병행 표시 허용** (예: 중앙동아리이면서 특정 단과대 소속 표시도 가능).
4. **상태 변경 감사 필드** — `status_changed_by` (user id) + `status_changed_at` 으로 누가 언제 마지막 상태를 바꿨는지 기록 (전체 이력 X — 최신 1건만).
5. **`division` 입력 검증** — trim + 길이 제약 명시화.
6. REQUIREMENTS.md 의 C 섹션을 현 구현과 정합.

---

## 2. 데이터 모델 변경

### 2.1 `club` 테이블 (Flyway V26)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `rejection_reason` | VARCHAR(500) NULL | REJECTED 상태일 때만 채워짐. 다른 상태 전이 시 null 로 정리. DB 길이 = 백엔드 검증 길이와 정합 |
| `central_club` | BOOLEAN NOT NULL DEFAULT FALSE | 중앙동아리 여부. 인증 배지 노출 기준. `division` 과 독립 |
| `status_changed_by` | BIGINT NULL REFERENCES users(id) | 최근 상태 변경자. 기존 클럽은 backfill 없이 NULL 시작 |
| `status_changed_at` | TIMESTAMP NULL | 최근 상태 변경 시각 |

기존 `division varchar(50)` 컬럼은 그대로 유지. 본 PR 에서 길이/trim 검증만 강화.

### 2.2 `Club` 엔티티 변경
- 필드 추가: `private String rejectionReason`, `private boolean centralClub`, `private Long statusChangedBy`, `private LocalDateTime statusChangedAt`.
- `Club.create(...)` 의 디폴트: `centralClub=false`, `rejectionReason=null`, `statusChangedBy=null`, `statusChangedAt=null`.
- 신규/변경 메서드:
  - `Club#changeStatus(ClubStatus next, String reason, Long actorUserId)` — 전이 가드 호출 + reason 정규화 + 감사 필드 갱신. **기존 단일 인자 `changeStatus(ClubStatus)` 메서드는 삭제** — 호출처(`GeneralClubService.updateStatus` 1곳 + 테스트) 모두 갱신.
  - `Club#changeCentralClub(boolean next)` — 단순 setter.

### 2.3 상태 전이 가드 (도메인 불변식)

`ClubStatus#canTransitionTo(ClubStatus next)` 정적 메서드. 매트릭스:

| from \ to | PENDING_APPROVAL | ACTIVE | INACTIVE | REJECTED |
|---|---|---|---|---|
| PENDING_APPROVAL | ❌ | ✅ 승인 | ❌ | ✅ 거절 (reason 필수) |
| ACTIVE | ❌ | ❌ | ✅ 운영중단 | ❌ |
| INACTIVE | ❌ | ✅ 재활성 | ❌ | ❌ |
| REJECTED | ✅ 재심사 | ❌ | ❌ | ❌ |

- `same → same` 도 거부 (no-op).
- 거부된 전이 → `ClubException.InvalidClubStatusTransitionException` (400).
- `→ REJECTED` 전이 시 `reason` 이 비어 있거나 trim 후 0자 → `ClubException.RejectionReasonRequiredException` (400).
- `→ REJECTED 외` 전이 시 `rejection_reason` 은 자동 null 정리.

### 2.4 `division` / `rejectionReason` 입력 검증

요청 DTO 레벨에서 강화:
- `division`: `@Size(max=50)`, 서비스에서 `String#strip()` 후 빈 문자열이면 null 로 정규화. 양옆 공백·탭 제거.
- `rejectionReason`: `@Size(max=500)`, 서비스에서 `String#strip()` 후 0자면 null. REJECTED 전이 가드와 함께 검증.

---

## 3. 백엔드 API 변경

### 3.1 PATCH `/api/v1/admin/clubs/{clubId}/status` — 본문 확장

```json
{ "status": "REJECTED", "rejectionReason": "활동 계획서 미흡" }
```

- `rejectionReason` nullable. REJECTED 일 때 필수, 다른 상태에서 보내도 무시.
- 컨트롤러에서 `@AuthenticationPrincipal UserPrincipal` 의 `id` 를 `actorUserId` 로 service 에 전달 (감사 필드 채움).
- 응답 204.

### 3.2 PATCH `/api/v1/admin/clubs/{clubId}/central-club` — 신규

```json
{ "centralClub": true }
```

- 204 No Content.
- `@PreAuthorize("hasRole('ADMIN')")`.
- 동아리 미존재 → 404.

### 3.3 응답 확장

`AdminClubSummaryResponse`:
- `centralClub: boolean`
- `rejectionReason: string | null`
- `statusChangedAt: string | null` (ISO timestamp — 어드민에 노출)
- `statusChangedByName: string | null` (user 의 이름 조회 후 채움 — 어드민에 노출. user id 직접 노출은 안 함)

`ClubDetailResponse` (공개):
- `centralClub: boolean` 추가
- `rejectionReason` / 감사 필드는 공개 응답 미노출

### 3.4 신규 예외 (`NoticeException` 패턴 차용)
- `ClubException.InvalidClubStatusTransitionException` (400)
- `ClubException.RejectionReasonRequiredException` (400)

---

## 4. 프론트엔드 변경

### 4.1 어드민 — `/admin/clubs`

- **상태 변경 다이얼로그** (`AdminClubStatusChangeDialog`):
  - 변경 대상 상태가 `REJECTED` 이면 reason `<textarea>` 가 **required** 로 렌더 (HTML required + 빈 trim 검증). 제출 버튼은 textarea 가 비어 있는 동안 disabled.
  - 500자 카운터 표시.
  - 다른 상태로 전환 시 reason 입력 영역 비노출.
  - 백엔드 가드 위반 응답 → 토스트로 메시지 노출.
- **테이블 행** (`AdminClubsTable`):
  - `centralClub=true` 행에 🏛️ chip 노출 (이름 옆).
  - REJECTED 행에 작은 "거절 사유" expand 토글 → `rejectionReason` 표시.
  - 행별 마지막 상태 변경 정보 노출: "···에 의해 YYYY-MM-DD HH:MM 변경" (작은 글씨, 감사 노출).
  - 행별 액션에 "**중앙동아리 토글**" 추가 (별도 `AdminClubCentralClubToggleDialog` 로 확인 후 호출).
- **등록 폼** (`AdminClubCreateForm`):
  - `centralClub` 체크박스 추가 (기본 false).
  - `division` 입력에 trim 처리·50자 제약·placeholder 예시 ("예: 컴퓨터정보공학부").

### 4.2 공개 — 카드 + 상세 헤더

`centralClub` 과 `division` **둘 다 노출 가능** (병행). 우선 순위·표시 규칙:

| centralClub | division | 노출 |
|---|---|---|
| true | "" / null | 🏛️ 중앙동아리 chip 단독 |
| true | "컴퓨터정보공학부" | 🏛️ 중앙동아리 chip + division 텍스트 (둘 다) |
| false | "" / null | 표시 없음 |
| false | "컴퓨터정보공학부" | division 텍스트 (과동아리 식별) |

- **`ClubCard`** (탐색 페이지): 위 매트릭스대로 chip + 텍스트 분기.
- **`ClubDetailHeader`** (상세 페이지): 동일 패턴, 이름 옆.
- 디자인은 chip 작게(`text-[11px] px-2 py-0.5`), division 텍스트는 chip 보다 한 단계 옅은 톤(`text-charcoal-3`).

### 4.3 타입·훅·API 클라이언트

`packages/types/src/club.ts`:
- `AdminClubSummary` 에 `centralClub: boolean`, `rejectionReason: string | null`, `statusChangedAt: string | null`, `statusChangedByName: string | null` 추가.
- `ClubDetail` / 공개용 타입에 `centralClub: boolean` 추가.

`packages/api/src/client.ts`:
- `admin.clubs.updateStatus` payload 에 `rejectionReason?: string` 추가.
- `admin.clubs.updateCentralClub(clubId: number, value: boolean): Promise<void>` 신규.

`packages/hooks/src/admin.ts`:
- 기존 `useUpdateClubStatusMutation` payload 타입 확장.
- `useUpdateClubCentralClubMutation` 신규. 두 mutation 모두 `onSuccess` 에서 `adminQueryKeys.clubsList` invalidate.

---

## 5. 권한 매트릭스

| 작업 | STUDENT | LEADER/OFFICER | ADMIN |
|---|---|---|---|
| `PATCH /admin/clubs/{id}/status` | ❌ | ❌ | ✅ |
| `PATCH /admin/clubs/{id}/central-club` | ❌ | ❌ | ✅ |
| 공개 응답에서 `centralClub` 노출 | ✅ | ✅ | ✅ |
| 공개 응답에서 `rejectionReason` / 감사 필드 노출 | ❌ | ❌ | ❌ (어드민 응답에만) |

---

## 6. 테스트 전략

### 백엔드
- **도메인**:
  - `ClubStatus#canTransitionTo` 매트릭스 전 경로 검증 (정상 4건 + 거부 12건).
  - `Club#changeStatus` — REJECTED 전이 시 reason null/빈/공백만 → 예외 / 정상 reason → 저장 / 다른 전이 시 기존 rejection_reason null 초기화.
  - `Club#changeStatus` — 감사 필드(`statusChangedBy`/`statusChangedAt`) 갱신 검증.
- **Service**: 가드 위반 시 트랜잭션 롤백, 정상 시 1쿼리 update.
- **Controller (RestAssured)**:
  - 정상 승인 → 204, `centralClub=false` 유지, 감사 필드 갱신
  - 거절 + reason → 204, GET 시 reason 노출, `statusChangedByName` 채워짐
  - 거절 + 빈 reason → 400
  - REJECTED → ACTIVE 시도 → 400
  - `central-club` 토글 → 204
  - `division` 양옆 공백 → 서버에서 trim 후 저장

### 프론트엔드
- `AdminClubStatusChangeDialog`: REJECTED 선택 시 textarea required, 빈 trim 입력으로 제출 시도 → 제출 비활성.
- `AdminClubsTable`: centralClub=true 행에 chip, REJECTED 행 expand, 감사 라인 노출.
- `ClubCard`: 4가지 분기(chip only / chip + division / division only / neither) 시각 검증.
- `AdminClubCreateForm`: division trim·길이 검증.

---

## 7. 마이그레이션 / 호환성

### Flyway V26
```sql
ALTER TABLE club
    ADD COLUMN rejection_reason  VARCHAR(500),
    ADD COLUMN central_club      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN status_changed_by BIGINT REFERENCES users(id),
    ADD COLUMN status_changed_at TIMESTAMP;
```

기존 데이터: 모든 클럽 `central_club=false`, 감사 필드 NULL. ADMIN 이 다음 상태 변경부터 감사 필드 채움 (backfill 없음).

### 호환성
- `useUpdateClubStatusMutation` payload 가 `{ status }` → `{ status, rejectionReason? }` 로 확장 — optional 추가라 BC.
- 응답 DTO 에 필드 추가 — BC.
- **Breaking**: `Club#changeStatus(ClubStatus)` 단일 인자 메서드 → 3-arg 시그니처로 변경. 호출처(`GeneralClubService.updateStatus`) + 단위 테스트 갱신 필요.

---

## 8. REQUIREMENTS.md 갱신

C 섹션 동기:
- `ClubStatus` 에 `REJECTED` 값 명시.
- C-4 의 요청 payload 에 `rejectionReason` 옵션 명시 (REJECTED 전이 시 필수).
- C-5 신규: "중앙동아리 토글 (ADMIN)" — `PATCH /admin/clubs/{id}/central-club`.
- Club 엔티티 필드 목록에 `rejectionReason`, `centralClub`, `statusChangedBy`, `statusChangedAt` 추가.
- 권한 매트릭스 갱신.
- 상태 전이 매트릭스 부록 추가.

---

## 9. 결정사항 / 트레이드오프

- **중앙동아리 = `boolean` 플래그**: enum 으로 가지 않은 이유는 (1) 과동아리 식별을 `division` 운영 관행으로 충분 (2) DB CHECK 강제 없이 유연 (3) 기존 데이터/UI 변경 최소. 후속 운영상 학과 마스터 데이터 강제 필요성이 생기면 enum 또는 별도 테이블로 마이그레이션.
- **`centralClub` 와 `division` 병행 노출**: 중앙동아리이면서 특정 단과대 소속을 같이 표기할 케이스(예: 컴퓨터정보공학부 산하 중앙동아리) 가 운영상 존재할 수 있어, 둘을 배타가 아닌 직교 정보로 처리.
- **감사 필드는 최신 1건만**: 전체 이력(audit log) 은 별도 PR 대상. 우선 "마지막 누가 변경했나" 만 운영 추적을 만족.
- **거절 사유 비공개**: 운영 판단의 정치적 부담 회피. 동아리장 측 self-service 재신청은 별도 PR.
- **상태 전이 가드 위치**: enum 정적 메서드 (`canTransitionTo`) — 도메인 응집. Service 의 if-else 가 아니라 도메인이 자신의 불변식 보장.
- **REJECTED 전이 reason 검증 위치**: 도메인 `Club#changeStatus` 가 책임. DTO `@NotBlank` 가 아니라 도메인 메서드에서 일관 처리 — 다른 진입점이 생겨도 보장.

---

## 10. Out of Scope

- **전체 상태 변경 이력(audit log)** — `club_status_log` 테이블. 본 PR 은 최신 1건만.
- 동아리장 측 self-service 재신청 워크플로우 (거절 사유 보고 보완 후 재제출).
- bulk 일괄 승인/거절.
- 학과 마스터 데이터 / 학과별 클럽 자동 분류 (현재는 `division` 자유 텍스트).
- 인증 배지 디자인 시스템화 (현재는 chip + 이모지).
- "공식 인증" 자격 자동 평가 (회원 수 임계치 등).
- 중앙동아리 ↔ 과동아리 전환 시 별도 리뷰 프로세스 (현재는 ADMIN 토글로 즉시 적용).
