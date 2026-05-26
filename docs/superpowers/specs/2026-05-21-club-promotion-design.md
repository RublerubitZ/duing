# H — 동아리 홍보 (배너 큐레이션) 설계

> 작성일: 2026-05-21
> 도메인: `promotion` (신규)
> 범위: 동아리 LEADER/OFFICER 의 홍보 요청 제출 · ADMIN 큐레이션형 Promotion 배너 관리 · 공개 캐러셀 노출

---

## 1. 배경 / 목적

서비스 메인 영역과 동아리 홍보 배너는 ADMIN 이 직접 큐레이션한다. 동아리들은
"이런 행사·콘텐츠를 홍보하고 싶다" 는 요청을 제출하고, ADMIN 이 그 중 선별해
배너(Promotion)로 게시한다. 공지사항(Notice)이 **정보 전달** 채널이라면, 홍보는
**브랜딩/쇼케이스** 채널 — 서비스 메인의 시각적 톤을 ADMIN 이 통제한다.

요청과 배너는 **완전 분리** 한다. ACCEPTED 가 자동으로 배너 게시로 이어지지 않으며,
ADMIN 이 별도로 Promotion 을 작성한다. 요청의 제출 이미지·링크는 ADMIN 이 참고만 한다.

---

## 2. 스코프

### In Scope
- 동아리(LEADER/OFFICER)의 홍보 요청 제출(`PromotionRequest`)
- ADMIN 의 요청 검토(ACCEPTED / REJECTED)
- ADMIN 의 Promotion 배너 CRUD (생성/수정/soft delete/관리 목록)
- 공개 `GET /promotions` (비로그인 포함) — 활성 배너 캐러셀
- 동아리당 PENDING 요청 1건 제약
- Promotion 의 active 플래그 + displayOrder 수동 관리

### Out of Scope
- 알림 (요청 처리 결과, 배너 신규 게시 등)
- 조회수 / 좋아요 / 반응 / 댓글
- 자동 스케줄 노출 (activatedFrom/Until 시간 기반 활성화)
- 캐러셀 외 표현 형식 (카드뉴스, 블록 에디터, 멀티 이미지)
- ACCEPTED 시 Promotion 자동 생성 (요청·배너 완전 분리)
- 요청자(LEADER/OFFICER)의 자기 요청 조회 / 취소 API
- 요청 이미지 검증·재가공·크롭

---

## 3. 도메인 모델

### 3.1 `PromotionRequest extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `clubId` | `Long` (FK `club.id`) | NOT NULL |
| `requesterUserId` | `Long` (FK `users.id`) | NOT NULL — 제출 LEADER/OFFICER |
| `title` | `varchar(80)` | NOT NULL |
| `description` | `text` | NOT NULL, ≤2000자 |
| `suggestedBannerImageUrl` | `varchar(500)` | nullable — 프론트가 `FileStorageService` 업로드 후 받은 URL |
| `suggestedLinkUrl` | `text` | nullable, ≤2000자 |
| `status` | enum `PromotionRequestStatus` | NOT NULL, default `PENDING`. `PENDING` / `ACCEPTED` / `REJECTED` |
| `actionNote` | `text` | nullable, ≤1000자 |
| `handledBy` | `Long` (FK `users.id`) | nullable |
| `handledAt` | `timestamp` | nullable |

**상태 머신**: `PENDING → ACCEPTED` / `PENDING → REJECTED`. 종결 후 변경 불가.

**DB 제약**
- 조건부 unique: `(club_id) WHERE status='PENDING' AND deleted_at IS NULL` — 동아리당 PENDING 1건.
- CHECK 길이: `description` ≤ 2000, `action_note` ≤ 1000, `suggested_link_url` ≤ 2000.
- CHECK 처리 페어링: `(status='PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR (status<>'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)`.
- 인덱스: `(status, created_at DESC) WHERE deleted_at IS NULL`.

### 3.2 `Promotion extends BaseEntity`

| 필드 | 타입 | 제약 / 설명 |
|---|---|---|
| `id` | `Long` | PK |
| `clubId` | `Long` (FK `club.id`) | nullable — 특정 동아리 연결 또는 일반 배너 |
| `title` | `varchar(120)` | NOT NULL |
| `bannerImageUrl` | `varchar(500)` | NOT NULL |
| `linkUrl` | `text` | nullable, ≤2000자 |
| `active` | `boolean` | NOT NULL, default `false` |
| `displayOrder` | `int` | NOT NULL, default `0` |
| `createdBy` | `Long` (FK `users.id`) | NOT NULL — 작성 ADMIN |

**DB 제약**
- CHECK: `char_length(link_url) <= 2000`.
- 인덱스: `(active, display_order ASC, created_at DESC) WHERE deleted_at IS NULL` — 공개 GET 정렬 최적화.

### 3.3 Flyway V30
- `V30__create_promotion_request_and_promotion.sql` — 두 테이블 + 인덱스 + 조건부 unique + CHECK.

---

## 4. API

응답은 표준 래퍼(`{ ok, data, message }`) + `PageResponse<T>` 사용.

### PR-1. 홍보 요청 제출 — `POST /clubs/{clubId}/promotion-requests`
- 권한: 인증 + `clubAuthService.requireManager(currentUser.id, clubId)` (LEADER 또는 OFFICER).
- Request:
  ```json
  {
    "title": "2026 신입생 환영회",
    "description": "내용 (≤2000자, 필수)",
    "suggestedBannerImageUrl": "/files/abc123.png",
    "suggestedLinkUrl": "https://..."
  }
  ```
- Response: `201`, `{ requestId }`
- 예외:
  - 400: 입력 검증 / 요청자가 LEADER·OFFICER 아님(`AccessDeniedException` → 403; 서비스단 `requireManager` 가 매핑)
  - 401: 미인증
  - 404: club 없음
  - 409: 동일 club PENDING 존재

### PR-2. 홍보 요청 목록 (ADMIN) — `GET /admin/promotion-requests`
- 권한: `ADMIN`
- Query: `status?`, `clubId?`, Pageable. 기본 정렬 `createdAt,desc`.
- Response: `PageResponse<PromotionRequestSummaryResponse>` — `id`, `club{id,name}`, `requester{id,name}`, `title`, `status`, `createdAt`.

### PR-3. 홍보 요청 상세 (ADMIN) — `GET /admin/promotion-requests/{requestId}`
- 권한: `ADMIN`
- Response: `PromotionRequestDetailResponse` — 전 필드 + `club{id,name}`, `requester{id,name}`, `handledBy{id,name}` nullable.

### PR-4. 홍보 요청 처리 (ADMIN) — `PATCH /admin/promotion-requests/{requestId}`
- 권한: `ADMIN`
- Request: `{ "status": "ACCEPTED" | "REJECTED", "actionNote": "선택 (≤1000)" }`
- 동작: `request.process(adminId, status, actionNote)`. ACCEPTED 라도 Promotion 자동 생성 없음 — ADMIN 이 PM-1 으로 별도 작성.
- Response: `204`
- 예외: 400 / 401 / 403 / 404

### PM-1. Promotion 생성 (ADMIN) — `POST /admin/promotions`
- 권한: `ADMIN`
- Request:
  ```json
  {
    "clubId": 12,
    "title": "행사 배너",
    "bannerImageUrl": "/files/banner.png",
    "linkUrl": "https://...",
    "active": true,
    "displayOrder": 10
  }
  ```
- 동작: `createdBy = currentUser.id`. `clubId` nullable.
- Response: `201`, `{ promotionId }`
- 예외: 400 / 401 / 403 / 404 (clubId 지정했는데 없음)

### PM-2. Promotion 수정 (ADMIN) — `PATCH /admin/promotions/{promotionId}`
- 권한: `ADMIN`
- Request: 전 필드 partial (`title?`, `bannerImageUrl?`, `linkUrl?`, `clubId?`, `clearClubId?`, `active?`, `displayOrder?`).
- 동작: `clearClubId=true` 면 `clubId=null`. 그 외 nullable 필드는 명시된 키만 갱신.
- Response: `204`
- 예외: 400 / 401 / 403 / 404

### PM-3. Promotion 삭제 (ADMIN) — `DELETE /admin/promotions/{promotionId}`
- 권한: `ADMIN`
- 동작: soft delete (`@SQLDelete`).
- Response: `204`

### PM-4. Promotion 관리 목록 (ADMIN) — `GET /admin/promotions`
- 권한: `ADMIN`
- Query: `active?`, `clubId?`, Pageable. 기본 정렬 `displayOrder ASC, createdAt DESC`.
- Response: `PageResponse<AdminPromotionResponse>` — 전 필드 + `club{id,name}` nullable + `createdBy{id,name}`.

### PM-5. 공개 Promotion 목록 — `GET /promotions`
- 권한: **permitAll** (비로그인 포함)
- Query: Pageable. 기본 정렬 `displayOrder ASC, createdAt DESC`.
- 필터: `active = true` (강제).
- Response: `PageResponse<PromotionCardResponse>` — `id`, `clubId`, `club{id,name}` nullable, `title`, `bannerImageUrl`, `linkUrl`, `displayOrder`, `createdAt`.
- ADMIN 전용 필드(`active`, `createdBy`, `updatedAt`) 미노출.

---

## 5. 권한 / 검증

### 5.1 권한 정책

| 액션 | 요구 권한 |
|---|---|
| PR-1 | 인증 + `requireManager` (LEADER 또는 OFFICER) |
| PR-2, PR-3, PR-4 | `ADMIN` |
| PM-1, PM-2, PM-3, PM-4 | `ADMIN` |
| PM-5 | **permitAll** |

ADMIN 경로는 컨트롤러 레벨 `@PreAuthorize("hasRole('ADMIN')")`.
LEADER/OFFICER 검증은 `ClubAuthService.requireManager` 재사용.

### 5.2 SecurityConfig 변경
다음 한 줄을 `/api/v1/notices` permitAll 규칙 옆에 추가:
```java
.requestMatchers(HttpMethod.GET, "/api/v1/promotions").permitAll()
```

### 5.3 입력 검증 (한국어 메시지)
- `title`: `@NotBlank @Size(max = 80)` (요청), `@Size(max = 120)` (Promotion)
- `description`: `@NotBlank @Size(max = 2000)`
- `suggestedBannerImageUrl` / `bannerImageUrl`: `@Size(max = 500)`. Promotion 의 `bannerImageUrl` 은 `@NotBlank`.
- `linkUrl` / `suggestedLinkUrl`: `@Size(max = 2000)`
- `displayOrder`: `@Min(0)`
- `actionNote`: `@Size(max = 1000)`

### 5.4 동시성
- PR-1 조건부 unique + 선조회 + `DataIntegrityViolationException` 캐치 → 409.
- PR-4 `findByIdForUpdate` (PESSIMISTIC_WRITE) — 동시 ADMIN 처리 경합 차단.

---

## 6. 응답 정책
- PromotionRequest: 공개 노출 없음. ADMIN 전용.
- Promotion:
  - 공개 응답(PM-5): `active`/`createdBy`/`updatedAt` 미포함. 외부 노출 최소화.
  - 관리 응답(PM-4): 전 필드 + `createdBy` 식별 정보.
- 동아리 식별 정보(`club{id,name}`)는 양쪽 응답 모두 포함 (있을 때).
- 삭제된 동아리 참조는 `(삭제됨)` 라벨 (기존 Report/Recertification 패턴).

---

## 7. 테스트 전략

DDD + Testcontainers + Flyway.

### 서비스 단위 (PromotionRequest)
- 정상 제출 → PENDING 저장.
- 비-LEADER·OFFICER 호출 → 400/403 (서비스단 AccessDeniedException 전파).
- 동일 club PENDING 존재 시 두 번째 제출 → 409.
- ACCEPTED 정상 처리 → status 변경 + handledBy/At.
- REJECTED 정상 처리 — Promotion 자동 생성 없음.
- 종결된 요청 재PATCH → 400.

### 서비스 단위 (Promotion)
- 생성 정상 — `createdBy` = adminId.
- partial 수정 (`title` 만, `clearClubId=true`, `active` 토글, `displayOrder` 재정렬).
- soft delete 후 공개 목록 미포함.
- 공개 GET — `active=true` 만 반환, displayOrder ASC 정렬 검증.

### 인수 (RestAssured)
- LEADER 가 PR-1 제출 → 201.
- STUDENT 가 PR-1 시도 → 403 (manager 아님).
- 비로그인 GET /promotions → 200.
- STUDENT 가 /admin/promotions 시도 → 403.
- 동일 club PENDING 중복 → 409.

---

## 8. 마이그레이션 / 배포

- Flyway V30 추가. 기존 파일 수정 금지.
- 데이터 백필 없음.
- 환경변수 추가 없음.
- SecurityConfig 1줄 추가 (`/api/v1/promotions` permitAll GET).

---

## 9. 후속(Future Work)

- 알림 (요청 처리 결과 LEADER 알림, Promotion 신규 게시 학생 알림).
- Promotion 자동 스케줄 (activatedFrom/Until).
- 요청자(LEADER/OFFICER)의 자기 요청 조회/취소 API.
- 공개 응답에 `viewCount` / `clickCount` (분석용).
- 카드뉴스·블록 에디터 형식 (Promotion 컨텐츠 확장).
- ACCEPTED 시 Promotion draft prefill 옵션.
- Promotion 의 동아리 카테고리/태그 필터.