# Du-ing 요구사항 정의서

대구대학교 동아리 통합 플랫폼 **Du-ing(두잉)** 의 백엔드 기능 요구사항.
본 문서는 MVP 범위를 정의하며, 변경이 필요한 경우 PR 로 함께 갱신한다.

> 마지막 갱신: 2026-05-14 — MVP 4도메인(User / Club / Recruitment / Application) 정의.

---

## 1. 시스템 개요

### 1.1 목적
대구대학교 동아리의 모집·지원·관리 과정을 통합 플랫폼으로 제공해, 학생은 동아리를 쉽게 탐색·지원하고 동아리장과 총동연은 효율적으로 운영·관리한다.

### 1.2 사용자 역할

| 역할 | Enum | 권한 요약 |
|---|---|---|
| 일반 재학생 | `STUDENT` | 동아리 탐색·지원, 본인 지원 현황 확인 |
| 동아리장 | `LEADER` | 본인 동아리의 모집 공고·지원자 관리 (계정 자체는 STUDENT 와 동일하고, 권한은 `Club.leader_id` 매칭으로 검증) |
| 총동연(관리자) | `ADMIN` | 동아리 등록·승인·운영 상태 관리 |

### 1.3 MVP 범위

- User: 회원가입 · 로그인 · 내 정보 조회
- Club: 목록 · 상세 · 생성(총동연) · 운영 상태 변경
- Recruitment: 달력 조회 · 상세 · 생성(동아리장)
- Application: 지원 제출 · 내 지원 목록 · 지원자 관리(동아리장)

활동 피드(Feed), 파일/이미지 업로드, 푸시 알림 등은 MVP 이후 확장.

---

## 2. 도메인 요구사항

### 2.1 User (사용자)

**엔티티 필드**: `id`, `studentId`, `name`, `email`, `passwordHash`, `role`

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| U-1 | 회원가입 | `studentId`(7~10자리 숫자), `name`(≤50), `email`, `password`(8~72자) | 생성된 `userId` (201) | 중복 이메일 409, 중복 학번 409, 입력 검증 실패 400 |
| U-2 | 로그인 | `email`, `password` | `accessToken`, `tokenType="Bearer"`, `user` (200) | 자격 증명 실패 401 |
| U-3 | 내 정보 조회 | (JWT) | `id`, `studentId`, `name`, `email`, `role` (200) | 미인증 401 |

**비기능 요구사항**
- 비밀번호는 `BCryptPasswordEncoder` 로 해싱 후 저장 (평문 저장 금지).
- JWT 는 `HS256`, 만료 시간은 `JWT_EXPIRY_MS` 환경변수로 제어.
- 가입 시 기본 role 은 `STUDENT`. `LEADER` / `ADMIN` 승격은 별도 admin API 로만 가능(현재 미구현).

---

### 2.2 Club (동아리)

**엔티티 필드**: `id`, `name`, `category`(enum), `division`, `description`, `logoUrl`, `leaderId`(FK→User), `status`(enum)

**`ClubCategory`**: `ACADEMIC` / `CULTURE` / `ART` / `SPORTS` / `VOLUNTEER` / `RELIGION` / `HOBBY` / `OTHER`
**`ClubStatus`**: `PENDING_APPROVAL`(승인 대기) / `ACTIVE`(운영 중) / `INACTIVE`(중단)

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| C-1 | 동아리 목록 조회 | `category?`, `division?`, `keyword?`, `Pageable` | `PageResponse<ClubSummaryResponse>` (200) | — |
| C-2 | 동아리 상세 조회 | `clubId` | `ClubDetailResponse` (200) | 동아리 없음 404 |
| C-3 | 동아리 생성 (ADMIN) | `name`, `category`, `division?`, `description?`, `logoUrl?`, `leaderId` | 생성된 `clubId` (201) | 중복 이름 409, leader User 없음 404, 권한 없음 403 |
| C-4 | 동아리 상태 변경 (ADMIN) | `clubId`, `status` | 204 | 동아리 없음 404, 권한 없음 403 |

**비기능 요구사항**
- 목록 검색 `keyword` 는 `name`/`description` 부분 일치 (대소문자 무시).
- 페이지네이션 기본: `page=0, size=20, sort=name,asc`.
- 추후 `recruitmentStatus` 필터(모집 중인 동아리만) 추가 예정 — Recruitment 와 join.

---

### 2.3 Recruitment (모집 공고)

**엔티티 필드**: `id`, `clubId`(FK), `title`, `content`, `startDate`, `endDate`, `capacity`, `status`(enum)
**연관 엔티티**: `RecruitmentForm` (`recruitmentId` 1:1, `questions` JSONB)

**`RecruitmentStatus`**: `OPEN` / `CLOSED`
**실효 상태(`effectivelyOpen`)**: `status == OPEN && today <= endDate` — 조회 시점 계산.

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| R-1 | 모집 달력 조회 | `yearMonth`(yyyy-MM) | `List<RecruitmentSummaryResponse>` — 해당 월과 기간이 겹치는 공고를 `startDate` 오름차순 (200) | 입력 형식 오류 400 |
| R-2 | 모집 상세 조회 | `recruitmentId` | `RecruitmentDetailResponse` (질문 목록 포함) (200) | 공고 없음 404 |
| R-3 | 모집 공고 생성 (LEADER) | `clubId`, `title`, `content?`, `startDate`, `endDate`, `capacity`(≥1), `questions[]?` | 생성된 `recruitmentId` (201) | 동아리 없음 404, 동아리장 아님 403, 정원/기간 검증 실패 400 |

**비기능 요구사항**
- 모집 기간 검증: `endDate >= startDate` (DB CHECK + 엔티티 생성 시 검증).
- `capacity > 0` (DB CHECK + 엔티티 생성 시 검증).
- 동아리장 권한: `currentUser.id == club.leader_id` 매칭으로만 통과.
- 모집 자동 마감은 조회 시점 계산 (스케줄러 미사용, MVP).

---

### 2.4 Application (지원)

**엔티티 필드**: `id`, `recruitmentId`(FK), `userId`(FK), `answers` JSONB, `status`(enum)
**`ApplicationStatus`**: `SUBMITTED`(제출됨) / `ACCEPTED`(합격) / `REJECTED`(불합격)

> Application 도메인은 아직 미구현. 아래는 합의된 명세.

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| A-1 | 지원 제출 (STUDENT) | `recruitmentId`, `answers[]` | 생성된 `applicationId` (201) | 공고 없음 404, 마감 상태 400, 중복 지원 409 |
| A-2 | 내 지원 목록 조회 (STUDENT) | (JWT) | `List<ApplicationSummaryResponse>` (200) | — |
| A-3 | 지원자 목록 조회 (LEADER) | `recruitmentId` | `List<ApplicantResponse>` (200) | 동아리장 아님 403 |
| A-4 | 지원자 상태 변경 (LEADER) | `applicationId`, `status`(ACCEPTED/REJECTED) | 204 | 지원 없음 404, 동아리장 아님 403, 잘못된 상태 전이 400 |

**비기능 요구사항**
- `(recruitmentId, user_id)` 부분 유니크 인덱스(deleted_at IS NULL) — 활성 지원은 1건만.
- 지원 답변 개수 = `RecruitmentForm.questions` 길이와 동일해야 함.

---

## 3. 공통 / 비기능 요구사항

### 3.1 응답 표준

```json
// 성공
{ "ok": true, "data": <T>, "message": null }

// 실패
{ "ok": false, "data": null, "message": "에러 메시지" }
```

목록은 `PageResponse<T>` 로 래핑: `content`, `page`, `size`, `totalElements`, `totalPages`, `hasNext`.

### 3.2 HTTP 상태 컨벤션

| 상태 | 의미 |
|---|---|
| 200 | GET 성공 |
| 201 | POST 생성 성공 |
| 204 | PUT/PATCH/DELETE 성공 (응답 본문 없음) |
| 400 | 입력 검증 실패 |
| 401 | 미인증 |
| 403 | 권한 부족 |
| 404 | 리소스 없음 |
| 409 | 충돌(중복) |
| 500 | 서버 오류 |

### 3.3 보안

- 모든 비공개 API 는 `Authorization: Bearer <JWT>` 헤더 필요.
- 비밀번호·토큰 등 민감 정보는 로그에 기록 금지.
- 시크릿(`DB_PASSWORD`, `JWT_SECRET`)은 환경변수로만 주입.

### 3.4 데이터

- Soft delete: `deleted_at` 컬럼 + `@SQLDelete` + `@SQLRestriction`. 물리 삭제 금지.
- 모든 엔티티는 `BaseEntity` 상속: `id`, `createdAt`, `updatedAt`, `deletedAt`.
- 마이그레이션: Flyway. 기존 파일 수정 금지, 새 버전 파일만 추가.

### 3.5 검증

- Request DTO 의 모든 필드는 적합한 Bean Validation 어노테이션 적용.
- 메시지는 **한국어**, 사용자가 이해할 수 있는 표현.
- 예: `@NotBlank(message = "이메일은 필수 입력값입니다.")`.

### 3.6 페이지네이션

- 목록 API 는 Spring `Pageable` 을 사용 (`?page=0&size=20&sort=createdAt,desc`).
- 응답은 `PageResponse<T>` 래퍼.

---

## 4. 환경 / 인프라

| 항목 | 로컬 | 배포(TBD) |
|---|---|---|
| DB | Supabase 공유 Postgres 인스턴스 | (TBD) Supabase Production 또는 RDS |
| 파일 저장 | 로컬 디렉터리 (`/tmp/duing/uploads`) | (TBD) S3 — `S3FileStorageService` 구현체 교체 |
| 인증 | JWT (HS256) | 동일 |
| 모니터링 | Actuator `/actuator/health` | (TBD) Prometheus / Grafana |

---

## 5. 향후 확장 (Out of MVP)

- 활동 피드 (FeedPost, 이미지 업로드)
- 푸시 알림 (모집 시작·마감, 합격·불합격)
- OAuth2 소셜 로그인 (대구대학교 통합 인증)
- 통계 대시보드 (총동연용)
- 동아리장 인수인계(leaderId 변경 워크플로우)

---

## 6. 변경 이력

| 일자 | 변경 내용 |
|---|---|
| 2026-05-14 | 최초 작성. User/Club/Recruitment 구현 완료, Application 명세 확정 |
