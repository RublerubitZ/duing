# F — 신고/제재 (Report & Moderation) 설계

> 작성일: 2026-05-20
> 도메인: `report` (신규)
> 범위: 신고 접수 · ADMIN 처리(상태 관리) — 자동 제재·통계·익명신고 제외

---

## 1. 배경 / 목적

총동연(`ADMIN`)이 부적절한 동아리·모집공고를 모니터링·조치할 수 있도록, 일반 사용자가
신고를 제출하고 ADMIN 이 검토·종결할 수 있는 최소 기능을 추가한다.

본 spec 은 **신고 접수와 처리 기록**까지만 다룬다. 제재 실행(예: Club 상태 변경)은
기존 ADMIN API(`PATCH /admin/clubs/{id}/status`)를 ADMIN 이 수동으로 호출하는 흐름을 재사용한다.

---

## 2. 스코프

### In Scope
- 신고 대상: **Club**, **Recruitment**
- 신고자: 로그인 사용자(STUDENT 이상)
- 처리자: `ADMIN` 단독
- 신고 사유: 고정 카테고리(enum) + 자유 메모(text)
- 처리 결과: `RESOLVED` / `DISMISSED`
- 중복 방지: 동일 (reporter × target) 의 PENDING 신고 1건 제한

### Out of Scope
- 자동 제재(임계치 기반 자동 상태 전이)
- User / Application answer 신고
- 익명 신고
- 신고자 / 피신고자 알림 발송
- 신고 통계 대시보드 (G 도메인)
- Recruitment 비공개·숨김 토글
- ADMIN 의 별도 제재 액션 엔티티(Sanction)

---

## 3. 도메인 모델

### 3.1 엔티티: `Report extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `reporterId` | `Long` (FK `users.id`) | NOT NULL |
| `targetType` | enum `ReportTargetType` | NOT NULL. `CLUB` / `RECRUITMENT` |
| `targetId` | `Long` | NOT NULL. FK 무결성은 애플리케이션 보장(다형 대상) |
| `reasonCode` | enum `ReportReasonCode` | NOT NULL. `SPAM` / `FRAUD` / `INAPPROPRIATE` / `IMPERSONATION` / `OTHER` |
| `detail` | `text` | nullable, ≤1000자 |
| `status` | enum `ReportStatus` | NOT NULL, default `PENDING`. `PENDING` / `RESOLVED` / `DISMISSED` |
| `actionNote` | `text` | nullable, ≤1000자. 처리 시 ADMIN 메모 |
| `handledBy` | `Long` (FK `users.id`) | nullable. 처리한 ADMIN |
| `handledAt` | `timestamp` | nullable |

`BaseEntity` 상속으로 `createdAt`, `updatedAt`, `deletedAt` 포함.

### 3.2 상태 머신

```
PENDING ──► RESOLVED   (ADMIN 조치 완료)
PENDING ──► DISMISSED  (ADMIN 무효 처리)
```

- `PENDING` 외 상태에서 PATCH 시 400.
- 종결 상태(`RESOLVED` / `DISMISSED`)에서 재변경 불가.
- soft delete 는 운영 복구용으로만 사용(공개 API 없음).

### 3.3 DB 제약 (Flyway)

새 마이그레이션 파일: `V202605201200__create_reports.sql`

- `reports` 테이블 생성(컬럼은 §3.1).
- CHECK: `char_length(detail) <= 1000`, `char_length(action_note) <= 1000`.
- **조건부 유니크 인덱스**:
  ```sql
  CREATE UNIQUE INDEX uq_reports_active_pending
    ON reports (reporter_id, target_type, target_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;
  ```
- 일반 인덱스: `(status, created_at DESC)` (ADMIN 목록 정렬), `(target_type, target_id)` (대상별 조회).

---

## 4. API

응답은 공통 표준 래퍼(`{ ok, data, message }`)를 따른다.

### RP-1. 신고 제출 — `POST /reports`
- 권한: 로그인 사용자(`STUDENT`/`LEADER`/`OFFICER`/`ADMIN`)
- Request body:
  ```json
  {
    "targetType": "CLUB",
    "targetId": 12,
    "reasonCode": "INAPPROPRIATE",
    "detail": "선택 입력 (≤1000자)"
  }
  ```
- Response: `201 Created`, `{ reportId }`
- 예외:
  - 400: 입력 검증 실패 / 셀프신고(아래 §5.2)
  - 401: 미인증
  - 404: 대상 `Club` 또는 `Recruitment` 없음
  - 409: 동일 reporter × target 의 `PENDING` 신고 존재

### RP-2. 신고 목록 조회 (ADMIN) — `GET /admin/reports`
- 권한: `ADMIN`
- Query: `status?`, `targetType?`, `Pageable`(`page`, `size`, `sort`)
- 기본 정렬: `createdAt,desc`
- Response: `PageResponse<ReportSummaryResponse>`
  - 항목: `id`, `targetType`, `targetId`, `targetLabel`(Club 이름 또는 Recruitment 제목, soft-deleted 시 `"(삭제됨)"`), `reasonCode`, `status`, `createdAt`
- 예외: 401 / 403

### RP-3. 신고 상세 조회 (ADMIN) — `GET /admin/reports/{id}`
- 권한: `ADMIN`
- Response: `ReportDetailResponse`
  - `id`, `reporter`(`{ id, name }`), `targetType`, `targetId`, `targetLabel`,
    `reasonCode`, `detail`, `status`, `actionNote`,
    `handledBy`(`{ id, name }` 또는 null), `handledAt`, `createdAt`
- 예외: 401 / 403 / 404

### RP-4. 신고 처리 (ADMIN) — `PATCH /admin/reports/{id}`
- 권한: `ADMIN`
- Request body:
  ```json
  { "status": "RESOLVED", "actionNote": "선택 입력 (≤1000자)" }
  ```
  - `status ∈ { RESOLVED, DISMISSED }` (PENDING 으로의 전이 불가)
- Response: `204 No Content`
- Side effects: `handledBy = currentUser.id`, `handledAt = now()`
- 예외:
  - 400: 입력 검증 실패 / 현재 상태가 `PENDING` 아님 / 잘못된 status 값
  - 401 / 403 / 404

> Note: 본 spec 은 **신고 처리 자체**만 다룬다. 처리 결과로서 Club 상태 변경이나 Recruitment
> 조치는 ADMIN 이 기존 API 를 별도로 호출한다.

---

## 5. 권한 / 검증

### 5.1 권한 정책

| 액션 | 요구 권한 |
|---|---|
| `POST /reports` | 인증된 모든 사용자 |
| `GET /admin/reports*` | `users.role == ADMIN` |
| `PATCH /admin/reports/{id}` | `users.role == ADMIN` |

`@PreAuthorize("hasRole('ADMIN')")` 로 컨트롤러 레벨 강제.

### 5.2 셀프신고 차단

신고 제출 시 다음 조건에 해당하면 400:
- `targetType == CLUB` 이고 `canManageClub(reporterId, targetId) == true`
- `targetType == RECRUITMENT` 이고 `canManageClub(reporterId, recruitment.clubId) == true`

`canManageClub` 은 기존 `ClubMember` 도메인의 `role ∈ {LEADER, OFFICER}` 검사를 재사용한다.

### 5.3 입력 검증

- `targetType`: `@NotNull`
- `targetId`: `@NotNull`, `@Positive`
- `reasonCode`: `@NotNull`
- `detail`: `@Size(max = 1000)`
- `actionNote`: `@Size(max = 1000)`
- 메시지는 한국어 (`"신고 사유 코드는 필수입니다."` 등)

---

## 6. 응답 / 감사 노출 정책

- 공개 API 에 `reports` 노출 없음. 모든 조회는 ADMIN 전용 경로(`/admin/reports/**`).
- `handledBy`, `handledAt`, `actionNote` 는 ADMIN 응답에서만 노출.
- 신고자 식별 정보(`reporter.name`)는 ADMIN 응답에만 노출 — 신고 대상자에게는 노출되지 않음.

---

## 7. 테스트 전략

DDD 컨벤션에 따라 mock DB 금지, Testcontainers + Flyway 기반.

### 서비스 단위
- 신고 정상 생성 → `PENDING` 으로 저장, `handledBy/At` null.
- 셀프신고(Club LEADER 가 본인 Club 신고) → 400.
- 셀프신고(Club OFFICER 가 본인 Club 의 Recruitment 신고) → 400.
- 존재하지 않는 `targetId` → 404.
- 동일 reporter × target PENDING 존재 시 새 신고 → 409.
- 동일 reporter × target 이 종결된 후 새 신고 → 201 (재신고 허용).
- PATCH: `PENDING → RESOLVED` 정상, `handledBy/At` 세팅.
- PATCH: 이미 종결된 신고 재PATCH → 400.
- PATCH: `status = PENDING` 으로 되돌리기 → 400.

### 컨트롤러 / 보안
- 미인증 → 401.
- STUDENT 가 `/admin/reports` 호출 → 403.
- ADMIN 가 본인 ADMIN 아닌 동아리도 자유롭게 조회/처리 가능.

### 통합
- `POST /reports` + `GET /admin/reports` 페이지네이션·필터 동작.
- soft-deleted 대상 신고 → 목록에서 `targetLabel = "(삭제됨)"` 노출.

---

## 8. 마이그레이션 / 배포 노트

- Flyway 새 파일만 추가. 기존 파일 수정 금지.
- 본 spec 도입 후 별도 데이터 백필 필요 없음(신규 도메인).
- 환경변수 추가 없음.

---

## 9. 후속(Future Work) 메모

- `Sanction` 별도 엔티티로 제재 액션 명시화 (현재는 ADMIN 수동 + 기존 Club API 재사용).
- User / Application answer 신고 추가.
- 임계치 기반 자동 INACTIVE 전이.
- 신고자/피신고자 알림 (Notification 도메인 확장).
- 익명 신고 (별도 정책 필요 — 어뷰징 위험).
- G(통계) 도메인에서 신고 집계 카드.
