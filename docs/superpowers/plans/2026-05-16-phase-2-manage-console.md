# Phase 2 — 운영진(LEADER/OFFICER) 운영 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영진이 콘솔에서 **모집 작성/수정/마감 → 지원자 검토·면접 → 합격 → 자동 MEMBER 등록 → 통계 확인** 사이클을 끝까지 돌릴 수 있게 한다. Phase 1 의 학생 지원 흐름과 맞물려 한 모집 공고의 라이프사이클(open → 지원 → 검토 → 면접 → 결정 → 통계) 이 닫힌다.

**Architecture:** Spring REST `/api/v1/leader/**` 네임스페이스 + Next.js App Router `(manage)` 라우트 그룹. 권한은 Phase 0 의 `ClubAuthService.assertCanManageClub(clubId, userId)` 헬퍼로 통일. 통계는 별도 service(`RecruitmentStatsService`) 로 분리하여 콘솔 응답 모델과 디커플링.

**Tech Stack:** Backend — Spring Boot 3.4 / Java 21 / JPA + QueryDSL / JUnit5 + RestAssured + Fixture Monkey. Frontend — Next.js 15 App Router / React 19 / TypeScript / React Query / Zustand / Tailwind / ky / Recharts (신규 도입, 통계 차트용).

---

## File Structure

### Backend — Flyway

```
backend/src/main/resources/db/migration/
  V13__index_applications_for_stats.sql                             NEW (recruitment_id, status 복합 + recruitment_id, created_at)
```

> Phase 0 에서 컬럼 확장은 완료됨. Phase 2 는 통계 쿼리 효율을 위한 **인덱스만** 추가. CLAUDE.md "(DB 변경 시) Flyway 마이그레이션 파일 추가" 규칙 준수. 기존 파일 수정 금지.

### Backend — 신규 / 수정

```
backend/src/main/java/com/duing/
  domain/recruitment/
    api/LeaderRecruitmentApi.java                                   MOD (2.2 PATCH /, 2.3 PATCH /close 시그니처)
    controller/LeaderRecruitmentController.java                     MOD (핸들러 추가)
    controller/dto/request/UpdateRecruitmentRequest.java            NEW
    service/RecruitmentService.java                                 MOD (update, close 시그니처)
    service/GeneralRecruitmentService.java                          MOD (update, close 구현 + 권한 게이트)
    service/dto/command/UpdateRecruitmentCommand.java               NEW
    exception/RecruitmentDomainException.java                       MOD (RecruitmentAlreadyClosedException)
    entity/Recruitment.java                                         MOD (update, close 도메인 메서드)

  domain/recruitment/stats/                                          NEW pkg
    api/LeaderRecruitmentStatsApi.java                              NEW
    controller/LeaderRecruitmentStatsController.java                NEW
    service/RecruitmentStatsService.java                            NEW
    service/GeneralRecruitmentStatsService.java                     NEW
    controller/dto/response/StatsSummaryResponse.java               NEW
    controller/dto/response/StatsDailyPointResponse.java            NEW
    controller/dto/response/StatsFunnelResponse.java                NEW
    repository/RecruitmentStatsRepository.java                      NEW (QueryDSL 집계 전용)

  domain/application/
    api/LeaderApplicationApi.java                                   MOD (GET /{id}, PATCH /interview 시그니처)
    controller/LeaderApplicationController.java                     MOD (핸들러 추가)
    controller/dto/request/UpdateApplicationInterviewRequest.java   NEW
    controller/dto/response/ApplicantDetailResponse.java            NEW (운영진용 답변 상세)
    service/ApplicationService.java                                 MOD (getApplicantDetail, updateInterview 시그니처)
    service/GeneralApplicationService.java                          MOD (구현 + InterviewNotificationService 호출)
    service/dto/command/UpdateInterviewCommand.java                 NEW
    service/dto/query/ApplicantDetailQuery.java                     NEW
    entity/Application.java                                         MOD (updateInterview 도메인 메서드)

  domain/clubmember/
    api/LeaderClubApi.java                                          NEW (GET /leader/clubs/me/managed)
    controller/LeaderClubController.java                            NEW
    controller/dto/response/ManagedClubResponse.java                NEW
    service/ClubAuthService.java                                    MOD (findManagedClubs(userId))
    repository/ClubMemberRepositoryCustom.java                      MOD (findActiveManagedClubsByUser)
    repository/ClubMemberRepositoryImpl.java                        MOD

  global/notification/                                               (Phase 0 산출물)
    InterviewNotificationService.java                               확인 (Noop 그대로 사용)
```

### Backend — 테스트

```
backend/src/test/java/com/duing/
  domain/recruitment/
    service/RecruitmentUpdateServiceTest.java                       NEW (2.1·2.2·2.3 통합)
    stats/service/RecruitmentStatsServiceTest.java                  NEW (2.8·2.9·2.10)

  domain/application/
    service/ApplicantDetailQueryTest.java                           NEW (2.5)
    service/ApplicationStatusTransitionWithMembershipTest.java      MOD (2.6 ACCEPTED → ClubMember 멱등 검증 보강)
    service/ApplicationInterviewServiceTest.java                    NEW (2.7)

  domain/clubmember/
    service/ManagedClubsQueryTest.java                              NEW (2.11)
```

### Frontend — 수정

```
frontend/packages/types/src/
  recruitment.ts                                                    MOD (UpdateRecruitmentPayload, InterviewPayload)
  application.ts                                                    MOD (ApplicantDetail, UpdateInterviewPayload)
  stats.ts                                                          NEW
  club.ts                                                           MOD (ManagedClub)

frontend/packages/api/src/client.ts                                 MOD (leader 네임스페이스 추가)
frontend/packages/hooks/src/recruitments.ts                         MOD (useUpdateRecruitment, useCloseRecruitment)
frontend/packages/hooks/src/applications.ts                         MOD (useApplicantDetail, useUpdateApplicationStatus, useUpdateInterview)
frontend/packages/hooks/src/stats.ts                                NEW (useRecruitmentStatsSummary/Daily/Funnel)
frontend/packages/hooks/src/clubs.ts                                MOD (useManagedClubs)
```

### Frontend — 페이지 신규

> 운영 콘솔 URL prefix 는 **`/manage/clubs/[clubId]/...`** (plain 디렉터리, 라우트 그룹 `(manage)` 금지). 이유: 그룹은 URL 에 영향 없어 `(manage)/clubs/[clubId]` 가 Phase 1 공개 라우트 `/clubs/[clubId]` 와 충돌. plain `manage/` 로 두어야 URL 이 분리된다.

```
frontend/apps/web/app/manage/
  layout.tsx                                                        NEW (가드 + 동아리 셀렉터 + 사이드 탭)
  page.tsx                                                          NEW (셀렉터 안내 또는 첫 동아리 redirect)
  _components/ManageNav.tsx                                         NEW
  _components/ManageGuard.tsx                                       NEW (managed 동아리 0개 → 안내)
  clubs/[clubId]/
    page.tsx                                                        NEW (콘솔 홈 — 활성 모집 요약)
    recruitments/
      page.tsx                                                      NEW (목록)
      new/page.tsx                                                  NEW (작성)
      _components/RecruitmentForm.tsx                               NEW (작성·수정 공용)
      _components/QuestionBuilder.tsx                               NEW (JSONB 질문 빌더)
      [recruitmentId]/page.tsx                                      NEW (상세·수정·마감)
      [recruitmentId]/applicants/
        page.tsx                                                    NEW (지원자 리스트)
        _components/ApplicantDetailModal.tsx                        NEW (답변·상태·면접 입력)
        _components/InterviewModal.tsx                              NEW (면접 일시·장소 입력)
      [recruitmentId]/stats/
        page.tsx                                                    NEW (Server) — 차트 컴포넌트만 client
        _components/SummaryCards.tsx                                NEW
        _components/DailyLineChart.tsx                              NEW ('use client')
        _components/FunnelChart.tsx                                 NEW ('use client')
```

---

## Important Context Notes

**기존 스캐폴드 활용**
- `LeaderRecruitmentController` 에 `POST /leader/clubs/{clubId}/recruitments` 가 이미 존재. Phase 2 는 같은 컨트롤러에 PATCH 두 개를 추가하는 형태로 확장.
- `LeaderApplicationController` 에 `GET /leader/recruitments/{id}/applications`, `PATCH /leader/applications/{id}/status` 가 존재. 상태 전이 도메인 검증은 Phase 1 Task 6 에서 `Application.transitionTo(newStatus, useInterview)` 로 캡슐화 완료 → **재구현 금지**, 컨트롤러 핸들러만 정비.
- `ClubAuthService` 의 `assertCanManageClub(clubId, userId)` 가 `LEADER | OFFICER` 멤버십을 검사. Phase 2 의 모든 `/leader/**` 진입점은 첫 줄에서 이 가드를 호출한다.

**권한 매트릭스 (spec §4 그대로)**
- 모집 생성·수정·마감·지원자 조회·상태 변경·면접 입력·통계 → `LEADER | OFFICER`
- 모집 작성 시 `targetRole=OFFICER` 인 경우 학생 지원 단계에서 `ClubMember(MEMBER)` 여부 가드 (Phase 1 Task 6 에서 처리됨)
- ACCEPTED → 자동 `ClubMember` 등록: `targetRole=MEMBER` 면 신규 MEMBER 행 upsert / `targetRole=OFFICER` 면 기존 MEMBER 의 role 을 OFFICER 로 승급. 두 경로 모두 **멱등** (`UNIQUE(clubId, userId) WHERE deleted_at IS NULL`)

**상태 전이 (재확인, Phase 1 산출)**
- `SUBMITTED → UNDER_REVIEW`
- `UNDER_REVIEW → INTERVIEW_PENDING` (단 `recruitment.useInterview == true`)
- `UNDER_REVIEW → ACCEPTED | REJECTED` (단 `useInterview == false`)
- `INTERVIEW_PENDING → ACCEPTED | REJECTED`
- 위반 시 400 `InvalidStatusTransitionException`

**면접 알림**
- `InterviewNotificationService` 인터페이스는 Phase 0 의 `NoopInterviewNotificationService` 가 그대로 주입된다. 2.7 `PATCH .../interview` 핸들러는 DB 업데이트 후 인터페이스 메서드만 호출하고, 실제 메일/카카오 전송은 Phase 5 에서 구현체 교체로 처리한다.

**통계 쿼리 전략**
- Summary(카드 5개)·Daily(일자 시계열)·Funnel(4단계) 모두 `Application` 테이블 단일 집계.
- daily 는 `(submitted_at::date, count)` GROUP BY. 모집 기간 `[startDate, endDate]` 의 모든 날짜를 채워 클라이언트가 비어있는 날도 0으로 렌더할 수 있도록 백엔드에서 padding 한다.
- funnel 4단계 = (제출, 서류통과=`status NOT IN (SUBMITTED)`, 면접 진입=`status IN (INTERVIEW_PENDING, ACCEPTED, REJECTED) AND useInterview=true`, 합격=`status=ACCEPTED`). 모집의 `useInterview` 가 false 면 세 번째 단계는 N/A — 응답에서 null 로 명시.

**테스트 작성 가이드 (backend/CLAUDE.md + AGENTS.md)**
- 테스트 데이터: Fixture Monkey 우선, 재사용 데이터는 `src/test/java/com/duing/common/fixture/` 의 정적 메서드.
- `@DisplayName` 은 메서드명 금지, 한국어 요구사항 문장:
  - 좋은 예: `"마감된 모집을 수정하면 RecruitmentAlreadyClosedException 이 발생한다"`, `"외부 폼 모집은 questions 없이도 생성된다"`, `"이미 합격 처리된 지원에 재합격 요청해도 ClubMember 는 1행만 유지된다"`
  - 나쁜 예: `"updateRecruitment - 마감 검증"`, `"create with EXTERNAL mode test"`
- RestAssured 통합 테스트는 `@SpringBootTest(webEnvironment = RANDOM_PORT)` + TestContainers Postgres.
- 모킹: Mockito 는 외부 의존성(`InterviewNotificationService` Noop verify) 에 한정. Repository 는 가급적 실제 사용.

**브랜치 전략 — backend/CLAUDE.md "API 1개 = 브랜치 1개 = PR 1개" 준수**
- 각 Task = 단일 브랜치 = 단일 PR. 모두 `develop` 에서 분기, `develop` 으로 PR.
- 브랜치명: `{type}/{이슈번호}-{설명}` 형식. type 은 feat/fix/chore/docs 등. 이슈번호가 없으면 PR 번호 부여 후 사후 정합.
- 의존 관계가 있는 경우 앞 브랜치 merge 후 다음 브랜치 분기:
  - 2.11(managed) → FE 2.A 진입 가드 의존
  - 2.1·2.2·2.3 → FE 2.B (모집 CRUD) 의존
  - 2.4·2.5·2.6·2.7 → FE 2.C (지원자 관리) 의존
  - 2.8·2.9·2.10 → FE 2.D (통계) 의존
- Task 0(V13 인덱스) 와 Task 10(타입/API/훅) 은 후속 task 들의 공통 의존이므로 가장 먼저 머지.
- 브랜치명 예시:
  - `feat/{n}-phase2-stats-index` (Task 0)
  - `feat/{n}-phase2-managed-clubs-api` (Task 1, 2.11)
  - `feat/{n}-phase2-recruitment-create-extension` (Task 2, 2.1)
  - … 이하 동일

**컨벤션 체크리스트 — CLAUDE.md / AGENTS.md 매핑**

Backend (backend/CLAUDE.md + backend/AGENTS.md):
- [ ] DB 변경은 새 Flyway 파일만 (V13 본 plan에 포함). 기존 파일 수정 금지.
- [ ] 작업 순서: Flyway → `api/` 인터페이스 → Controller → Service + command/query DTO → Repository → 테스트.
- [ ] DTO 는 Java `record`. 매핑은 `Request#toCommand()` / `Response#from(Query)`.
- [ ] 변수명 풀네임. `dto`, `r`, `e` 같은 축약 금지. 예: `Recruitment recruitment`, `CreateRecruitmentCommand createCommand`.
- [ ] Service: `@Transactional(readOnly = true)` 클래스 기본 + 쓰기 메서드만 `@Transactional` 오버라이드.
- [ ] HTTP 상태: POST 201 / GET 200 / PUT·PATCH·DELETE 204.
- [ ] Bean Validation 메시지는 한국어. 예: `@NotBlank(message = "모집 제목은 필수 입력값입니다.")`.
- [ ] Soft delete: 모든 쿼리에서 `@SQLRestriction` 또는 명시적 `deleted_at IS NULL`. 물리 삭제 금지.
- [ ] URL 컨벤션: 운영진 전용은 `/api/v1/leader/...` prefix.
- [ ] 권한: Global 만 `@PreAuthorize`. Club-scoped 는 `ClubAuthService.assertCanManageClub(clubId, currentUserId)` 서비스 레이어 가드.
- [ ] QueryDSL 구현체는 `{Domain}RepositoryCustom` 인터페이스를 구현. 단순 단건 조회는 Spring Data 메서드.
- [ ] 모든 연관관계 `FetchType.LAZY`.
- [ ] 테스트: RestAssured + Fixture Monkey, 데이터는 Fixture Monkey 또는 `src/test/java/com/duing/common/fixture/`.
- [ ] `@DisplayName` 은 한국어 요구사항 문장. 예: `"마감된 모집을 수정하면 RecruitmentAlreadyClosedException 이 발생한다"`.

Frontend (frontend/CLAUDE.md + frontend/AGENTS.md):
- [ ] 타입은 `type` (`interface` 금지). `any`/`as` 금지. 불가피하면 `unknown` + 타입 가드 또는 Zod parse.
- [ ] HTTP 는 `@duing/api` 의 `DuingApiClient` 로만 호출. ky/fetch 직접 호출 금지.
- [ ] 작업 순서: `packages/types` → `packages/api/src/client.ts` → `packages/hooks` → 라우트 페이지.
- [ ] Query Key 는 도메인별 `queryKeys` 객체 (예: `recruitmentQueryKeys`, `applicationQueryKeys`, `statsQueryKeys`). 문자열 키 직접 사용 금지.
- [ ] 훅 네이밍: 조회 `use{Domain}{Action}Query`, 변경 `use{Domain}{Action}Mutation`.
- [ ] Mutation `onSuccess` 에서 좁은 범위 invalidate (`detail`/`list` 우선, `all` 회피).
- [ ] 서버 상태는 React Query 만. Zustand/useState 로 서버 상태 보관 금지.
- [ ] `useEffect` 데이터 패칭 금지.
- [ ] 컴포넌트는 `function` 키워드, 일반 함수는 화살표. 조건부 className 은 `cn()` 유틸.
- [ ] `'use client'` 는 파일 최상단(import 위). Server Component 가능한 곳에서 무분별 추가 금지 — 본 plan 의 stats 페이지가 패턴(page=Server, 차트=Client).
- [ ] 위치: 한 라우트 전용은 `app/manage/.../_components/`, 두 곳 이상은 `apps/web/components/` 또는 `packages/*` 로 승격.
- [ ] `packages/*` 코드에 DOM API(`window`, `document`) 또는 RN 전용 API 직접 import 금지.

---

## Task 0: 통계 쿼리용 인덱스 Flyway 추가 (V13)

> 통계 3종(Task 7~9)이 `applications` 를 `recruitment_id, status` 또는 `recruitment_id, created_at` 으로 반복 집계한다. 인덱스 부재 시 모집당 N 행 풀스캔 → P95 악화. 본 Task 에서 별도 PR 로 인덱스만 선반영해 통계 서비스 PR 들이 즉시 측정 가능한 상태로 가게 한다.

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__index_applications_for_stats.sql`

**SQL (참고):**
```sql
-- 통계 카드(상태 분포) · funnel 계산용
CREATE INDEX IF NOT EXISTS idx_application_recruitment_status
    ON application (recruitment_id, status)
    WHERE deleted_at IS NULL;

-- daily 시계열용 (created_at = submitted_at)
CREATE INDEX IF NOT EXISTS idx_application_recruitment_created
    ON application (recruitment_id, created_at)
    WHERE deleted_at IS NULL;
```

**Acceptance:**
- `./gradlew bootRun --args='--spring.profiles.active=local'` 부팅 시 V13 가 정상 적용 (`flyway_schema_history` 확인).
- 기존 V1~V12 파일 무수정.
- 인덱스명 prefix `idx_application_` 는 기존 컨벤션 일치(`V6__add_unique_index_application_recruitment_user.sql` 참고).

**Implementation notes:**
- 테이블명이 `application` 인지 `applications` 인지 V5 확인 후 매칭 (마이그레이션 누락 방지).
- 부분 인덱스로 soft delete 행 제외. 통계 쿼리는 `deleted_at IS NULL` 조건 동일 적용.

---

## Task 1: ClubAuthService.findManagedClubs + GET /api/v1/leader/clubs/me/managed (2.11)

> 콘솔 진입 시 가장 먼저 호출되는 API. 가드 판정 + 셀렉터에 사용.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/api/LeaderClubApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/LeaderClubController.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ManagedClubResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java` — `List<ManagedClubQuery> findManagedClubs(Long userId)`
- Modify: `backend/.../clubmember/repository/ClubMemberRepositoryCustom.java` / `ClubMemberRepositoryImpl.java`
- Create: `backend/src/test/java/com/duing/domain/clubmember/service/ManagedClubsQueryTest.java`

**Acceptance:**
- 응답: `[{ clubId, clubName, logoUrl, myRole: "LEADER"|"OFFICER", activeRecruitmentCount }]`
- 조회 조건: `club_member.user_id == JWT.userId AND role IN ('LEADER','OFFICER') AND deleted_at IS NULL AND club.deleted_at IS NULL AND club.status = 'ACTIVE'`
- 활성 모집 카운트 = `recruitment.status='OPEN' AND endDate >= today` 인 행 수. 단일 쿼리 LEFT JOIN + group 으로 N+1 회피.
- 비로그인 401, ADMIN 도 자기 멤버십 기준으로 응답 (LEADER/OFFICER 가 아니면 빈 배열).

**TDD:**
- [ ] Red: `ManagedClubsQueryTest` 추가 — MEMBER 만 가진 동아리는 결과에서 제외, LEADER+OFFICER 두 동아리면 두 행, activeRecruitmentCount 가 정확히 카운트.
- [ ] Green: QueryDSL `findActiveManagedClubsByUser(userId)` 구현 (Club ↔ ClubMember ↔ Recruitment LEFT JOIN, GROUP BY).
- [ ] Refactor: 응답 매핑은 컨트롤러 DTO 의 `from(query)` 정적 메서드로.

**Implementation notes:**
- `RecruitmentStatus.OPEN` 만 카운트하되 `endDate < today` 는 제외. 도메인 메서드 `Recruitment.effectivelyOpen(today)` 와 동일 의미. SQL 표현은 `WHERE rec.status='OPEN' AND rec.end_date >= :today`.
- `ClubAuthService` 에 `findManagedClubs` 만 추가. 권한 검증 헬퍼와 한 클래스에 묶어 관리.

---

## Task 2: 모집 공고 작성 확장 (2.1)

> 기존 POST `/leader/clubs/{clubId}/recruitments` 핸들러를 확장하여 외부폼/면접/targetRole 옵션을 받는다. Phase 0 에서 컬럼은 추가됨 — 엔티티/DTO 만 정비.

**Files:**
- Modify: `LeaderRecruitmentApi.java` — `CreateRecruitmentRequest` 필드 추가
- Modify: `LeaderRecruitmentController.java` — 검증 + 매핑
- Modify: `controller/dto/request/CreateRecruitmentRequest.java`
- Modify: `service/dto/command/CreateRecruitmentCommand.java`
- Modify: `GeneralRecruitmentService.create(...)` — 외부폼인 경우 `RecruitmentForm` 미생성, 자체폼이면 질문 배열 필수
- Modify: `Recruitment.create(...)` 정적 팩토리

**Acceptance:**
- 입력 필드 (request):
  - `title`(@NotBlank 1~150), `content?`(text), `startDate`/`endDate`(@NotNull, endDate ≥ startDate), `capacity`(@Min 1)
  - `applicationMode`(SELF|EXTERNAL, default SELF), `externalFormUrl?`(applicationMode=EXTERNAL 일 때 @URL + @NotBlank, 그 외 null 강제)
  - `useInterview`(boolean, default false)
  - `targetRole`(MEMBER|OFFICER, default MEMBER)
  - `questions[]?`(applicationMode=SELF 일 때 최소 1개, EXTERNAL 일 때 null 강제)
- 검증 실패는 400, 한국어 메시지.
- 권한 가드: 서비스 메서드 첫 줄에서 `clubAuthService.assertCanManageClub(clubId, currentUserId)` — `NotClubManagerException` (403). Global `@PreAuthorize` 미사용.
- 응답 201, body = `{ recruitmentId }`.

**TDD:**
- [ ] Red: `RecruitmentUpdateServiceTest`(또는 SubmitServiceTest 와 분리해 RecruitmentCreateServiceTest 신설) — 외부폼인데 externalFormUrl 누락 시 400, 자체폼인데 questions 누락 시 400, OFFICER 가 LEADER 동아리에서 작성 → 201.
- [ ] Green: 분기 로직은 `CreateRecruitmentCommand.validate()` (record + compact constructor) 에 캡슐화. Service 는 분기 없이 그대로 사용.
- [ ] Refactor: 외부폼/자체폼 분기 검증을 정적 팩토리에 두면 Controller 가 얇아짐.

**Implementation notes:**
- `RecruitmentForm` 1:0..1 — 외부폼 모집은 form row 자체를 INSERT 하지 않음. JPA에서 `@OneToOne` `optional=true` 인지 확인.
- `targetRole=OFFICER` 모집은 학생 지원 단계 가드(이미 Phase 1 산출)와 짝. 본 Task 에서 추가 검증 불요.

---

## Task 3: 모집 공고 수정 (2.2) + 마감 (2.3)

**Files:**
- Modify: `LeaderRecruitmentApi.java` — `PATCH /leader/recruitments/{recruitmentId}`, `PATCH /leader/recruitments/{recruitmentId}/close`
- Modify: `LeaderRecruitmentController.java`
- Create: `controller/dto/request/UpdateRecruitmentRequest.java` (모든 필드 nullable, 부분 갱신)
- Create: `service/dto/command/UpdateRecruitmentCommand.java`
- Modify: `RecruitmentService.java` / `GeneralRecruitmentService.java` — `update`, `close` 시그니처
- Modify: `Recruitment.java` — `update(UpdateRecruitmentCommand)` / `close()` 도메인 메서드
- Modify: `exception/RecruitmentDomainException.java` — `RecruitmentAlreadyClosedException` (409), `RecruitmentNotFoundException` (404 — 이미 존재할 가능성 높음, 없으면 추가)

**Acceptance — PATCH /:**
- 부분 갱신: null 이 아닌 필드만 변경. `endDate`, `capacity` 검증 동일.
- **마감된 모집(status=CLOSED) 은 수정 불가** → 409 `RecruitmentAlreadyClosedException`.
- 권한 가드: 서비스 첫 줄에서 `recruitment.getClubId()` 를 얻은 뒤 `clubAuthService.assertCanManageClub(clubId, currentUserId)` — 403 시 `NotClubManagerException`.
- 응답 204.

**Acceptance — PATCH /close:**
- `status=OPEN` 만 close 가능. 이미 CLOSED 면 409.
- 응답 204. 후속 효과: 지원자 신규 제출은 Phase 1 가드(`effectivelyOpen`)가 차단.

**TDD:**
- [ ] Red:
  - PATCH 로 capacity=0 → 400
  - 이미 CLOSED 인 모집 PATCH → 409
  - OFFICER 가 정상 update → 204 + 필드 반영 검증
  - close 호출 → status=CLOSED 로 전환
- [ ] Green: 도메인 메서드에 검증 캡슐화.
- [ ] Refactor: `update` 의 nullable 분기는 `Optional.ofNullable(x).ifPresent(...)` 패턴.

**Implementation notes:**
- `RecruitmentForm.questions` 수정은 본 PATCH 범위에 포함(자체폼 한정). 외부폼 ↔ 자체폼 모드 전환은 Phase 2 에서 **금지** (외부폼은 form row 자체가 없어 마이그레이션 필요). 응답 400.
- `endDate` 만 단독 수정 시 `startDate` 와의 검증은 도메인 메서드에서 현재 값 기준으로 비교.

---

## Task 4: 지원자 답변 상세 조회 (2.5)

> 운영진 답변 상세 모달 데이터. `LeaderApplicationApi` 에 핸들러 추가.

**Files:**
- Modify: `LeaderApplicationApi.java` — `GET /leader/applications/{applicationId}` 시그니처
- Modify: `LeaderApplicationController.java`
- Create: `controller/dto/response/ApplicantDetailResponse.java`
- Create: `service/dto/query/ApplicantDetailQuery.java`
- Modify: `ApplicationService.java` — `getApplicantDetail(Long applicationId, Long currentUserId)`
- Modify: `GeneralApplicationService.java`
- Create: test `ApplicantDetailQueryTest`

**Acceptance:**
- 응답: `{ applicationId, recruitmentId, recruitmentTitle, clubId, applicant: { userId, name, studentId, email }, answers: [{ questionId, question, answer }], status, interviewAt, interviewLocation, submittedAt }`
- 권한 가드: 서비스에서 application 의 recruitment → clubId 추출 후 `clubAuthService.assertCanManageClub(clubId, currentUserId)` — 403 시 `NotClubManagerException`.
- 외부폼 모집은 answers = `[]` 와 함께 응답.
- 응답 200, 없으면 404.

**TDD:**
- [ ] Red: 권한 외 사용자가 조회 → 403. 다른 동아리 OFFICER 가 접근 → 403. 정상 case → 답변 배열 매핑 검증.
- [ ] Green: 단일 쿼리로 application + recruitment + form 조인 (N+1 회피).
- [ ] Refactor: 매핑은 `ApplicantDetailResponse.from(query)`.

**Implementation notes:**
- `RecruitmentForm.questions` 와 `Application.answers` 모두 JSONB. 응답 시 questionId 키로 join 해서 `[{question, answer}]` 평탄화. order 는 RecruitmentForm 의 입력 순서 유지.
- 학생 이름·학번·이메일 노출은 운영진 동의된 명세(spec §1-2). 로그에 PII 남기지 말 것.

---

## Task 5: 지원자 상태 변경 핸들러 정비 (2.6)

> 도메인 전이 로직은 Phase 1 에 완성됨. 본 Task 는 PATCH 핸들러를 운영 콘솔에서 호출하도록 응답 컨벤션·예외 매핑·자동 ClubMember 멱등성을 재검증.

**Files:**
- Modify: `LeaderApplicationApi.java` — 응답 204 (No Content) 로 통일. backend CLAUDE.md "PATCH → 204" 컨벤션 준수.
- Modify: `LeaderApplicationController.java`
- Modify: `GeneralApplicationService.updateStatus(...)`
- 확인: ACCEPTED 시 `ClubMemberService.ensureMembership(clubId, userId, role)` 호출 — `targetRole==OFFICER` 이면 role=OFFICER 로 upsert/승급, 아니면 MEMBER
- Modify: `ApplicationStatusTransitionWithMembershipTest`

**Acceptance:**
- 입력 body: `{ status: "UNDER_REVIEW" | "INTERVIEW_PENDING" | "ACCEPTED" | "REJECTED" }`
- 부적합 전이 400. 권한 위반 403. **응답 204 (No Content)**.
- ACCEPTED 두 번 호출 → 두 번째는 멱등 (ClubMember 단 1행 유지).
- targetRole=OFFICER 모집의 합격자가 기존 MEMBER 이면 role 만 OFFICER 로 갱신 (deleted_at IS NULL 유지).

> **AGENTS.md 자동 멤버십 표 보강 안내:** backend/AGENTS.md 의 "자동 멤버십 등록" 표는 ACCEPTED → MEMBER 한 줄만 정의. Phase 2 는 spec §1-2 의 명세대로 `targetRole=OFFICER` 모집 합격 시 **OFFICER 승급** 분기를 추가한다. 본 PR 머지 시 backend/AGENTS.md 표에 이 분기를 함께 갱신한다 (PR 본문에 "AGENTS.md 동기화" 명시).

**TDD:**
- [ ] Red 보강: 합격 → 재합격 호출 시 ClubMember count 가 그대로 1. OFFICER 모집 합격 시 기존 MEMBER 행이 OFFICER 로 승급.
- [ ] Green: `ensureMembership` 멱등 메서드를 ClubMember 도메인에 둠. ON CONFLICT 가 아니라 `findByClubIdAndUserIdActive` → 분기 처리 (deleted_at IS NULL).
- [ ] Refactor: 호출 시점은 GeneralApplicationService.updateStatus 의 ACCEPTED 분기 한곳에 집중.

**Implementation notes:**
- spec §4-2 "지원" 매트릭스 그대로. `transitionTo` 가 도메인 메서드인 만큼 컨트롤러는 비즈 분기 없이 호출만.

---

## Task 6: 면접 일시·장소 입력 + 알림 훅 (2.7)

**Files:**
- Modify: `LeaderApplicationApi.java` — `PATCH /leader/applications/{applicationId}/interview`
- Modify: `LeaderApplicationController.java`
- Create: `controller/dto/request/UpdateApplicationInterviewRequest.java`
- Create: `service/dto/command/UpdateInterviewCommand.java`
- Modify: `Application.java` — `updateInterview(LocalDateTime at, String location)` 도메인 메서드
- Modify: `ApplicationService.java` / `GeneralApplicationService.java`
- 확인: `global/notification/InterviewNotificationService` 주입 (Phase 0)
- Create: test `ApplicationInterviewServiceTest`

**Acceptance:**
- 입력: `interviewAt`(@NotNull, 미래), `interviewLocation`(@NotBlank, ≤200)
- 사전 조건: `application.status == INTERVIEW_PENDING` (다른 상태에서 면접 입력 → 409 `InvalidInterviewStateException`)
- 권한 가드: 서비스에서 `clubAuthService.assertCanManageClub(clubId, currentUserId)`. 응답 204.
- 후속: `InterviewNotificationService.notify(application, command)` 호출 (현재 Noop). 실패해도 트랜잭션 롤백 금지 — 알림은 best-effort.

**TDD:**
- [ ] Red: status=UNDER_REVIEW 인 application 에 PATCH /interview → 409. 정상 case → 필드 반영. 알림 서비스 호출 검증 (Mockito spy/verify).
- [ ] Green: 도메인 메서드에 상태 검증 캡슐화.
- [ ] Refactor: 알림 호출은 `@TransactionalEventListener` 패턴 대신 직접 호출 — 단순화. 실패 무시는 try/catch + 로그 warn (PII 제외).

**Implementation notes:**
- `interviewAt` 의 future 검증은 `@Future` (Bean Validation). 시간 비교는 도메인이 받지 않고 DTO 검증으로 종결.
- spec §2-3 의 `InterviewNotificationService` 인터페이스 시그니처 확인 후 매개변수 조정.

---

## Task 7: 운영진 통계 — Summary (2.8)

**Files:**
- Create: `domain/recruitment/stats/api/LeaderRecruitmentStatsApi.java`
- Create: `controller/LeaderRecruitmentStatsController.java`
- Create: `controller/dto/response/StatsSummaryResponse.java`
- Create: `service/RecruitmentStatsService.java` / `GeneralRecruitmentStatsService.java`
- Create: `repository/RecruitmentStatsRepository.java` (QueryDSL 집계)
- Create: test `RecruitmentStatsServiceTest` (summary 부분)

**Acceptance:**
- Endpoint: `GET /leader/recruitments/{recruitmentId}/stats/summary`
- 응답: `{ total, submitted, underReview, interviewPending, accepted, rejected, capacity, ratio }` — ratio = accepted/capacity, capacity 0 가드.
- 권한 가드: 서비스에서 `clubAuthService.assertCanManageClub(clubId, currentUserId)` — 403. 모집 없음 404. 응답 200.

**TDD:**
- [ ] Red: 7건 지원(상태 분포 다양) 시드 후 카운트 정확 검증.
- [ ] Green: 단일 GROUP BY status 쿼리 → 결과 5칸으로 채움 (없는 status 는 0).
- [ ] Refactor: 응답 DTO `from(query)`.

**Implementation notes:**
- `Application` 의 soft delete (deleted_at IS NULL) 반드시 적용. 외부폼 모집도 동일 응답 — answers 만 비어있을 뿐.

---

## Task 8: 운영진 통계 — Daily 추이 (2.9)

**Files:**
- Modify: 위 stats 패키지에 `StatsDailyPointResponse` 추가, Service/Repository 메서드 추가
- Test 보강

**Acceptance:**
- Endpoint: `GET /leader/recruitments/{recruitmentId}/stats/daily`
- 응답: `[{ date: "yyyy-MM-dd", submittedCount }]` — 모집 기간 `[startDate, endDate]` 전 일자 padded.
- 기간 외 호출 시 빈 배열.

**TDD:**
- [ ] Red: 5일 기간에 2일만 제출 → 응답 길이 5, 빈 날 0.
- [ ] Green: SQL `GROUP BY DATE(submitted_at)` + 코드에서 stream 으로 padding.
- [ ] Refactor: padding 헬퍼는 service 내 private static.

**Implementation notes:**
- `submitted_at` = `Application.createdAt`. 컬럼 별도 추가 X (BaseEntity).
- 타임존: DB 가 UTC 라 가정. 표시 일자는 한국 기준이라 `DATE(submitted_at AT TIME ZONE 'Asia/Seoul')`. 명시 필요.

---

## Task 9: 운영진 통계 — Funnel (2.10)

**Files:**
- 위와 동일 패키지에 `StatsFunnelResponse` 추가, Service/Repository 메서드 추가

**Acceptance:**
- Endpoint: `GET /leader/recruitments/{recruitmentId}/stats/funnel`
- 응답: `{ submitted, documentPassed, interviewEntered, accepted }`
  - submitted = 전체 count
  - documentPassed = `status != SUBMITTED` (검토 진입)
  - interviewEntered = `status IN (INTERVIEW_PENDING, ACCEPTED, REJECTED) AND useInterview = true`
  - accepted = `status = ACCEPTED`
- `useInterview = false` 면 `interviewEntered = null` (UI 가 N/A 처리)

**TDD:**
- [ ] Red: useInterview=false 모집 → interviewEntered null.
- [ ] Green: 단일 쿼리(COUNT FILTER).

**Implementation notes:**
- Postgres 한정 `COUNT(*) FILTER (WHERE ...)` 활용 시 QueryDSL 직접 지원 안 됨 → `NumberExpression.case().when(...).then(1).otherwise(0).sum()` 패턴 또는 native query. 단순한 쪽 채택.

---

## Task 10: 프론트 타입·API·훅 (2.A 준비)

> FE 페이지 작업 전 type/api/hook 한 PR로 묶음. Phase 1 의 Task 8 패턴.

**Files (modify/new):**
- `packages/types/src/recruitment.ts` — `UpdateRecruitmentPayload`, `CloseResponse(void)`
- `packages/types/src/application.ts` — `ApplicantDetail`, `UpdateInterviewPayload`, `UpdateApplicationStatusPayload`
- `packages/types/src/stats.ts` (NEW) — `StatsSummary`, `StatsDailyPoint`, `StatsFunnel`
- `packages/types/src/club.ts` — `ManagedClub`
- `packages/api/src/client.ts` — leader 네임스페이스:
  - `clubs.me.managed()`
  - `recruitments.update(id, payload)`, `recruitments.close(id)`
  - `applications.detail(id)`, `applications.updateStatus(id, payload)`, `applications.updateInterview(id, payload)`
  - `stats.summary(recruitmentId)`, `stats.daily(recruitmentId)`, `stats.funnel(recruitmentId)`
- `packages/hooks/src/recruitments.ts` — `useUpdateRecruitmentMutation`, `useCloseRecruitmentMutation`
- `packages/hooks/src/applications.ts` — `useApplicantDetailQuery`, `useUpdateApplicationStatusMutation`, `useUpdateInterviewMutation`
- `packages/hooks/src/stats.ts` (NEW) — `useRecruitmentStatsSummaryQuery/Daily/Funnel`
- `packages/hooks/src/clubs.ts` — `useManagedClubsQuery`
- `packages/hooks/src/statsQueryKeys.ts` (NEW), `applicationQueryKeys.ts` / `recruitmentQueryKeys.ts` / `clubQueryKeys.ts` — 도메인별 queryKeys 객체에 본 plan 추가 키 등록:
  - `clubQueryKeys.managed()`
  - `recruitmentQueryKeys.detail(recruitmentId)` (재사용)
  - `applicationQueryKeys.applicantDetail(applicationId)`, `applicationQueryKeys.applicantsOfRecruitment(recruitmentId)`
  - `statsQueryKeys.summary/daily/funnel(recruitmentId)`
  - mutation 의 `onSuccess` 는 좁은 key 만 invalidate. 예: status 변경 후 `applicationQueryKeys.applicantsOfRecruitment(recruitmentId)` 와 `statsQueryKeys.summary/funnel/daily(recruitmentId)` invalidate. `applicationQueryKeys.all` 회피.

**Acceptance:**
- `pnpm -F @duing/types build && pnpm -F @duing/api build && pnpm -F @duing/hooks build` 모두 통과.
- 뮤테이션은 invalidate 키 명시 — 예: status 변경 후 `['leader','applicants', recruitmentId]` invalidate.

**Implementation notes:**
- Phase 1 의 `client.ts` 컨벤션 (그룹: `clubs`, `recruitments`, `applications` ...) 그대로 확장. `leader` 네임스페이스를 별도로 두지 말고 기존 그룹 안의 메서드로 합친다 (URL 만 `/leader/...` 사용). 호출 측에서 화면별 권한이 명시되도록.

---

## Task 11: (manage) 진입 가드 + 레이아웃 (2.A)

**Files:**
- `app/manage/layout.tsx` (NEW)
- `app/manage/_components/ManageNav.tsx` (NEW)
- `app/manage/_components/ManageGuard.tsx` (NEW)
- `app/manage/page.tsx` (NEW — 셀렉터 리다이렉트 또는 안내)
- `middleware.ts` — `/manage/**` 라우트 가드(미로그인 → `/login?next=`)

**Acceptance:**
- 비로그인 → `/login?next=/manage` 리다이렉트 (Phase 1 의 `next` 검증 규칙 재사용).
- `useManagedClubs` 결과가 빈 배열 → "관리하는 동아리가 없습니다." 안내, 학생 메인으로 돌아가기 링크.
- 1개 이상이면 좌측 사이드바에 동아리 셀렉터 + 콘솔 탭(모집·지원자·통계). 현재 선택 동아리는 URL `clubId` 로부터 동기화.
- 콘솔 탭 5개 중 Phase 2 범위는 ②모집·③지원자·④통계. ①정보·⑤멤버 탭은 비활성(Phase 3 안내 라벨).

**Implementation notes:**
- 가드 컴포넌트는 Server Component 로 SSR 단계에서 `useManagedClubs` 결과를 보장하기 어려움 → Client Component + `'use client'`. 미들웨어가 1차 가드, 콘솔 진입 후 매니지 가능 여부는 클라이언트에서 추가 판정.
- 동아리 셀렉터 상태는 URL(`/manage/clubs/{clubId}/...`) 로만 유지. 별도 store 없음.

---

## Task 12: 모집 목록·작성·상세·수정·마감 (2.B)

**Files:**
- `app/manage/clubs/[clubId]/page.tsx` — 콘솔 홈 (활성 모집 리스트 + 신규 작성 버튼)
- `app/manage/clubs/[clubId]/recruitments/page.tsx` — 전체 모집 목록 (OPEN/CLOSED 탭)
- `app/manage/clubs/[clubId]/recruitments/new/page.tsx` — 작성 폼
- `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx` — 상세·수정·마감
- `app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx` — 작성/수정 공통 폼
- `app/manage/clubs/[clubId]/recruitments/_components/QuestionBuilder.tsx` — JSONB 질문 빌더

**Acceptance — new:**
- 필드: title / content(textarea) / startDate / endDate / capacity / applicationMode (라디오 SELF|EXTERNAL) / useInterview (체크) / targetRole (라디오 MEMBER|OFFICER) / externalFormUrl (mode=EXTERNAL 시) / questions (mode=SELF 시 빌더로 추가)
- 클라이언트 검증: zod 스키마 (`packages/schemas` 에 추가). 백엔드 검증과 동등.
- 제출 성공 → 상세 페이지 리다이렉트.

**Acceptance — 상세/수정:**
- 상세 페이지에서 "수정" 클릭 시 폼 모드 전환. PATCH 후 invalidate.
- CLOSED 모집은 수정 비활성, "이미 마감된 모집입니다" 배너.
- "마감" 버튼 (OPEN 한정) → 확인 모달 → PATCH /close.

**Implementation notes:**
- 외부폼 모드일 때 질문 빌더 영역은 숨김. 모드 전환은 작성 단계만 허용(수정 시 모드 변경 금지 — 백엔드 가드 + UI 비활성).
- 작성/수정 폼 컴포넌트 1개를 공유. props 로 mode("create" | "edit") 받아 분기.

---

## Task 13: 지원자 관리 (2.C)

**Files:**
- `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/page.tsx`
- `app/manage/.../applicants/_components/ApplicantTable.tsx`
- `app/manage/.../applicants/_components/ApplicantDetailModal.tsx`
- `app/manage/.../applicants/_components/InterviewModal.tsx`

**Acceptance — 목록:**
- 컬럼: 이름·학번·상태(badge)·지원일·면접일(있으면)·액션.
- 외부폼 모집이면 표 자체 미표시 + "외부 폼 응답은 외부 시스템에서 확인하세요" 안내.
- 상태 필터 칩(전체/제출/검토중/면접대기/합격/불합격).

**Acceptance — 상세 모달:**
- `useApplicantDetailQuery` 로 답변 + 상태 + 면접 정보 표시.
- 상태 변경: 허용된 다음 단계만 활성 버튼. 변경 시 PATCH /status, invalidate.
- INTERVIEW_PENDING 으로 진입한 행에는 면접 모달 열기 버튼. 입력 후 PATCH /interview.

**Implementation notes:**
- 상태 머신 표는 클라이언트에 상수로 — `transitions: Record<ApplicationStatus, ApplicationStatus[]>`. 백엔드와 동일 정의를 두 곳에 두므로 변경 시 동기화 필요 (테스트에서 catch).
- 본 페이지에서 PII(이름·학번·이메일) 표시되므로 우상단에 "본 정보는 합격 결정 외 용도로 사용하지 않습니다" 고지.

---

## Task 14: 통계 페이지 (2.D)

**Files:**
- `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/stats/page.tsx`
- `app/manage/.../stats/_components/SummaryCards.tsx`
- `app/manage/.../stats/_components/DailyLineChart.tsx`
- `app/manage/.../stats/_components/FunnelChart.tsx`
- `package.json` (apps/web) — `recharts` 추가

**Acceptance:**
- 카드 5개: 전체 / 검토중 / 면접대기 / 합격 / 불합격. 합격 카드에 ratio(합격/정원) 보조 표시.
- 라인 차트: 일자별 제출 추이 (Daily 응답 그대로). 빈 날 0.
- Funnel 차트: 4단계 (interviewEntered null 인 경우 3단계로 축소 표시).
- 로딩/에러 상태는 Phase 1 패턴(`불러오는 중…` / 에러 메시지) 동일.

**Implementation notes:**
- Recharts 가 SSR 시 hydration 경고를 내므로 차트 컴포넌트는 `'use client'`. 페이지는 Server Component 로 두고 차트만 클라이언트.
- 차트 데이터는 React Query 로 가져온 직후 메모이즈. 색상은 Tailwind palette 사용 (다크모드 미지원, MVP).

---

## Task 15: 전체 회귀 (백엔드 빌드/테스트 + 프론트 빌드/타입체크 + 수동 스모크)

**Acceptance:**
- `./gradlew build` 통과.
- `pnpm -F @duing/web build && pnpm -F @duing/web lint && pnpm -F @duing/web typecheck` 통과.
- 수동 스모크 (LEADER 계정 `leader@daegu.ac.kr`):
  1. `/manage` 진입 → 코딩 동아리 표시.
  2. 신규 모집 작성 (SELF + useInterview=true + targetRole=MEMBER + 질문 3개).
  3. 학생 계정 `student@daegu.ac.kr` 로 해당 모집 지원.
  4. LEADER 로 돌아와 지원자 → UNDER_REVIEW → INTERVIEW_PENDING → 면접 입력 → ACCEPTED.
  5. 통계 페이지에서 카드/일별/funnel 반영 확인.
  6. ClubMember 에 student 가 MEMBER 로 등록되었는지 DB 직접 확인 (또는 후속 멤버 API 가 없는 단계라 SQL 로 검증).

---

## Self-Review

**설계 결정**
- `Application` 도메인의 상태 전이/면접 메서드는 Phase 1·2 산출이 동일 클래스에 누적된다. MVP 규모에서는 분리 비용이 더 커 유지.
- 통계 도메인은 별도 패키지(`recruitment/stats`)로 분리해 Recruitment 핵심 도메인과 디커플링. 추후 별 도메인으로 승격하기 쉬움.
- 면접 알림 실 구현은 Phase 5 로 미룬다 — 2.7 은 인터페이스 호출만 수행하므로 Phase 0 산출 시그니처 변경 없음.
- `/manage/**` URL prefix 는 Phase 1 공개 라우트(`/clubs/[clubId]`) 와 충돌 없음을 사전 검증.
- `recharts` 의존성 추가는 본 plan 의 유일한 패키지 추가. lockfile 변경이 PR 에 포함됨을 사전 공지.

**CLAUDE.md / AGENTS.md 준수 확인**
- 루트 CLAUDE.md: 1 PR = 1 API/페이지 ✅ (총 16 PR 분할). 브랜치명 `feat/{이슈번호}-...` 컨벤션 PR 별 적용 ✅.
- backend/CLAUDE.md: DB 변경 시 Flyway 새 파일(V13) ✅. api/ → controller → service → repository 순서 ✅. DTO record ✅. 한국어 Bean Validation 메시지 ✅. `@Transactional(readOnly = true)` 기본 + 쓰기만 오버라이드 ✅. PATCH 204 ✅. Soft delete 유지 ✅. Club-scoped 권한은 `ClubAuthService` 서비스 가드 ✅. `@DisplayName` 한국어 문장 예시 ✅. Fixture Monkey 명시 ✅.
- backend/AGENTS.md: URL `/leader/...` 컨벤션 ✅. `PageResponse<T>` 는 본 plan 범위에서 List 응답이 모집당 수십~수백 수준이라 비페이지네이션 List 유지 (spec §3-6 일치) — 추후 1000+ 모집 등장 시 페이지네이션 도입.
- frontend/CLAUDE.md: `type` 사용·`any`/`as` 금지 ✅. ky 직접 호출 금지 — `@duing/api` 경유 ✅. `useEffect` 데이터 패칭 금지 ✅. `'use client'` 무분별 추가 회피 (stats 페이지 패턴) ✅.
- frontend/AGENTS.md: queryKeys 도메인 객체 ✅. 훅 네이밍 `useXxxQuery/Mutation` ✅. 컴포넌트 위치 결정(`_components/` vs `apps/web/components/`) ✅. RN 호환 위해 `packages/*` 에 DOM API import 금지 ✅.
- 일부러 비표준 채택한 항목: `recharts` 신규 도입 — frontend AGENTS.md "기술 스택" 표에 미등재. **PR 본문에 도입 사유·번들 사이즈 영향 명시 + AGENTS.md 표 동기화** 필요.

---

## 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-16 | 최초 작성. Phase 1 plan 동일 구조로 BE 11 + FE 4 task 정의. 면접 알림 Noop 유지, 통계 함께 마무리. |
| 2026-05-16 | CLAUDE.md / AGENTS.md 준수 보강 — Task 0(V13 인덱스 Flyway) 신설, 권한 가드 라인 `ClubAuthService.assertCanManageClub` 표준화, Task 5 응답 204 확정, 자동 멤버십 OFFICER 승급 분기를 AGENTS.md 동기화 대상으로 명시, 컨벤션 체크리스트 박스 + 테스트 가이드(`@DisplayName` 한국어 / Fixture Monkey) 추가, FE queryKeys 객체 패턴 명시, 라우트 prefix `app/manage/` (plain) 통일, Self-Review 에 컨벤션 준수 확인 절 추가. 총 16 task (Task 0~15). |
| 2026-05-16 | 브랜치 전략을 backend/CLAUDE.md "API 1개 = 브랜치 1개 = PR 1개" 원칙으로 정정. 초안의 단일 통합 브랜치 안은 폐기. |
