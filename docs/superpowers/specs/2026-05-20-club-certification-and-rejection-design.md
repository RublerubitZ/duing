# 동아리 인증·거절 사유·중앙동아리 플래그 — 설계

- 작성일: 2026-05-20
- 범위: 총동연 어드민 기능군 중 **C — 동아리 인증/상태 관리 보강**
- 의존: 기존 `Club` 도메인 + `/admin/clubs` 화면 (이미 동작 중)

---

## 1. 배경 / 목표

### 현재 상태 (audit 결과)
- 백엔드: `POST /admin/clubs` (생성), `PATCH /admin/clubs/{id}/status` (상태 변경), `GET /admin/clubs` (목록) 모두 동작. `ClubStatus` 에는 `PENDING_APPROVAL / ACTIVE / INACTIVE / REJECTED` 4개 값.
- 프론트: `/admin/clubs` 통합 관리 페이지에 상태 탭 필터·테이블·상태 변경 다이얼로그·등록 폼 존재.
- 갭: 거절 사유 부재, 상태 전이 가드 부재 (백엔드가 임의 전이 허용), "공식 인증(중앙동아리)" 개념 미구현, REQUIREMENTS.md 표류.

### 본 PR 목표
1. **거절 사유** 입력·저장·표시. REJECTED 상태일 때만 의미 있음.
2. **상태 전이 가드** 를 도메인에서 강제 (UI 단속만으로 부족).
3. **중앙동아리 플래그** (`centralClub: boolean`) 추가. 등록 흐름은 기존과 동일하되 ADMIN 이 별도 토글로 인증 여부를 관리. 공개 카드/상세에서 🏛️ 배지로 노출. 과동아리는 기존 `division` 필드에 학과명을 입력하는 방식으로 운영 관행 처리 (DB 강제 제약 없음).
4. REQUIREMENTS.md 의 C 섹션을 현 구현과 정합.

---

## 2. 데이터 모델 변경

### 2.1 `club` 테이블 (Flyway V26)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `rejection_reason` | TEXT NULL | REJECTED 상태일 때만 채워짐. 다른 상태에선 null 로 정리 |
| `central_club` | BOOLEAN NOT NULL DEFAULT FALSE | 중앙동아리 여부. 인증 배지 노출 기준 |

기존 컬럼·인덱스·`@SQLDelete` 패턴 그대로 유지. `division` 필드(이미 존재, varchar(50)) 도 그대로 — 과동아리는 학과명 입력 관행.

### 2.2 `Club` 엔티티 변경
- 필드 2개 추가: `private String rejectionReason`, `private boolean centralClub`.
- `Club.create(...)` 의 디폴트: `centralClub=false`, `rejectionReason=null`.
- 새 메서드:
  - `Club#changeStatus(ClubStatus next, String reason)` — 거절 사유 동시 처리. 기존 단일 인자 메서드는 **삭제** (호출처 모두 갱신).
  - `Club#changeCentralClub(boolean next)` — 단순 setter.

### 2.3 상태 전이 가드 (도메인 불변식)

`ClubStatus#canTransitionTo(ClubStatus next)` 정적 메서드로 표현. 매트릭스:

| from \ to | PENDING_APPROVAL | ACTIVE | INACTIVE | REJECTED |
|---|---|---|---|---|
| PENDING_APPROVAL | ❌ | ✅ 승인 | ❌ | ✅ 거절 (reason 필수) |
| ACTIVE | ❌ | ❌ | ✅ 운영중단 | ❌ |
| INACTIVE | ❌ | ✅ 재활성 | ❌ | ❌ |
| REJECTED | ✅ 재심사 | ❌ | ❌ | ❌ |

- `same → same` 도 거부 (no-op 요청은 클라이언트가 막음).
- 거부된 전이 요청은 `InvalidClubStatusTransitionException` (400).
- `→ REJECTED` 전이 시 `reason` 이 비어 있으면 `ClubRejectionReasonRequiredException` (400).
- `→ REJECTED 외` 전이 시 기존 `rejection_reason` 은 null 로 정리 (재심사 들어가면 사유 카드 비움).

---

## 3. 백엔드 API 변경

### 3.1 PATCH `/api/v1/admin/clubs/{clubId}/status` — 본문 확장

기존 요청 본문 `{ status: ClubStatus }` 를 다음으로 확장:

```json
{ "status": "REJECTED", "rejectionReason": "활동 계획서 미흡" }
```

- `rejectionReason` 은 nullable. REJECTED 일 때만 의미. 다른 상태에서 보내도 무시.
- `rejectionReason` 최대 길이: 500자 (`@Size(max=500)`).
- 상태 전이 가드 위반 → 400 + 메시지.

### 3.2 PATCH `/api/v1/admin/clubs/{clubId}/central-club` — 신규

```json
{ "centralClub": true }
```

- 204 No Content
- `@PreAuthorize("hasRole('ADMIN')")` 보호
- 동아리 미존재 → 404 (`ClubNotFoundException`)

### 3.3 응답 확장 — `AdminClubSummaryResponse`

기존 응답에 두 필드 추가:
- `centralClub: boolean`
- `rejectionReason: string | null`

`ClubDetailResponse` (공개) 에도 `centralClub: boolean` 추가. `rejectionReason` 은 공개 응답에 노출하지 않음 (운영 사정 비공개).

### 3.4 신규 예외
- `ClubException.InvalidClubStatusTransitionException` (400)
- `ClubException.RejectionReasonRequiredException` (400)

---

## 4. 프론트엔드 변경

### 4.1 어드민 — `/admin/clubs`

- **상태 변경 다이얼로그** (`AdminClubStatusChangeDialog`):
  - 변경 대상 상태가 `REJECTED` 이면 reason `<textarea>` 필수 표시 (500자 제한, 한글 카운터).
  - 다른 상태로 전환 시 reason 입력 없음.
  - 백엔드 가드 위반 응답 → 토스트로 메시지 노출.
- **테이블 행** (`AdminClubsTable`):
  - `centralClub=true` 행에 🏛️ chip 노출 (이름 옆).
  - REJECTED 행에 작은 "거절 사유" 토글 — 클릭 시 expand 로 `rejectionReason` 표시.
  - 행별 액션 버튼에 "**중앙동아리 토글**" 추가 (별도 `AdminClubCentralClubToggleDialog` 로 확인 후 호출).
- **등록 폼** (`AdminClubCreateForm`):
  - `centralClub` 체크박스 추가 (기본 false). 생성 시 함께 전송. 단, 등록 시점엔 PENDING_APPROVAL 이므로 인증 의미는 약함 — UX 상으로는 "사전 표시" 정도. (등록 시 표시 안 해도 무방하지만, 후속 토글 부담 줄이는 차원에서 노출)

### 4.2 공개 — 카드 + 상세 헤더

- **`ClubCard`** (탐색 페이지):
  - `centralClub=true` 일 때 작은 "🏛️ 중앙동아리" chip.
  - `centralClub=false` 일 때 `division` 텍스트가 있으면 그대로 노출 (예: "컴퓨터정보공학부") — 과동아리 식별.
  - 둘 다 빈 경우 chip 없음.
- **`ClubDetailHeader`** (상세 페이지):
  - 동일한 chip/텍스트 노출. 위치는 동아리 이름 옆.

### 4.3 타입·훅·API 클라이언트

- `packages/types/src/club.ts`:
  - `Club` / `AdminClubSummary` / `ClubDetail` 타입에 `centralClub: boolean` 추가.
  - `AdminClubSummary` 에 `rejectionReason: string | null` 추가.
- `packages/api/src/client.ts`:
  - `admin.clubs.updateStatus` 의 payload 에 `rejectionReason?: string` 추가.
  - `admin.clubs.updateCentralClub(clubId, value)` 신규.
- `packages/hooks/src/admin.ts`:
  - 기존 `useUpdateClubStatusMutation` payload 타입 확장.
  - `useUpdateClubCentralClubMutation` 신규.

---

## 5. 권한 매트릭스

| 작업 | STUDENT | LEADER/OFFICER | ADMIN |
|---|---|---|---|
| `PATCH /admin/clubs/{id}/status` | ❌ | ❌ | ✅ |
| `PATCH /admin/clubs/{id}/central-club` | ❌ | ❌ | ✅ |
| 공개 응답에서 `centralClub` 노출 | ✅ | ✅ | ✅ |
| 공개 응답에서 `rejectionReason` 노출 | ❌ | ❌ | ❌ (어드민 응답에만) |

---

## 6. 테스트 전략

### 백엔드
- **도메인**: `ClubStatus#canTransitionTo` 매트릭스 전체 케이스 검증 (정상 4건 + 거부 12건).
- **`Club#changeStatus`**:
  - REJECTED 전이 시 reason null → 예외
  - REJECTED 전이 시 reason 정상 → 저장
  - 다른 전이 시 기존 rejection_reason 이 null 로 초기화
- **Service**: `updateStatus` 가 가드 위반 시 트랜잭션 롤백, 정상 시 1쿼리 update
- **Controller (RestAssured)**:
  - 정상 승인 → 204, `centralClub=false` 유지
  - 거절 + reason → 204, 응답 GET 시 reason 노출
  - REJECTED → ACTIVE 시도 → 400
  - `central-club` 토글 → 204

### 프론트엔드
- `AdminClubStatusChangeDialog`: REJECTED 선택 시 textarea 노출, 빈 reason → 제출 비활성
- `AdminClubsTable`: centralClub=true 행에 chip, REJECTED 행 expand
- `ClubCard`: chip 분기 (central / division / neither)

---

## 7. 마이그레이션 / 호환성

### Flyway V26
```sql
ALTER TABLE club
    ADD COLUMN rejection_reason TEXT,
    ADD COLUMN central_club BOOLEAN NOT NULL DEFAULT FALSE;
```

기존 데이터: 모든 클럽 `central_club=false`. ADMIN 이 추후 운영 화면에서 토글로 인증 처리.

### 호환성
- 기존 `useUpdateClubStatusMutation` 호출처는 payload 가 `{ status }` 에서 `{ status, rejectionReason? }` 로 확장 — optional 추가라 BC.
- 응답 DTO 에 필드 추가 (BC).
- 기존 `Club#changeStatus(ClubStatus)` 단일 인자 메서드 **삭제** → 호출처 모두 갱신 필요 (`GeneralClubService` 1곳 + 테스트).

---

## 8. REQUIREMENTS.md 갱신

C 섹션을 다음과 같이 동기:

- `ClubStatus` 에 `REJECTED` 값 명시 추가.
- C-4 의 요청에 `rejectionReason` 옵션 명시 (REJECTED 전이 시 필수).
- C-5 신규: "중앙동아리 토글 (ADMIN)" — `PATCH /admin/clubs/{id}/central-club`.
- 권한 매트릭스 갱신.
- 상태 전이 매트릭스 부록 추가.

---

## 9. 결정사항 / 트레이드오프

- **중앙동아리 = `boolean` 플래그**: `clubLevel: CENTRAL|DEPARTMENT` enum 으로 가지 않은 이유는 (1) 과동아리 식별을 `division` 필드 운영 관행으로 처리해도 충분 (2) DB CHECK 강제하지 않아 유연 (3) 기존 데이터/UI 변경 최소. 추후 운영상 학과 클럽 식별이 강해질 필요가 생기면 enum 으로 마이그레이션 가능.
- **거절 사유 비공개**: 운영 판단이 학생에게 직접 노출되면 정치적 부담. 동아리장 측 self-service 재신청 흐름은 별도 PR 에서 처리.
- **상태 전이 가드 위치**: enum 정적 메서드 (`canTransitionTo`) — 도메인 응집. Service 계층의 if-else 가 아니라 도메인이 자신의 불변식을 보장.

---

## 10. Out of Scope

- 상태 변경 감사 로그 (누가/언제/왜) — 별도 PR
- 동아리장 측 self-service 재신청 워크플로우 (거절 사유 보고 보완 후 재제출)
- bulk 일괄 승인/거절
- 학과별 클럽 자동 분류 / 학과 마스터 데이터 (현재는 `division` 자유 텍스트 그대로)
- 인증 배지 디자인 시스템화 (현재는 chip + 이모지)
- "공식 인증" 자격 자동 평가 (회원 수 임계치 등)
- 중앙동아리 ↔ 과동아리 전환 시 리뷰 프로세스 (현재는 토글로 즉시 적용)
