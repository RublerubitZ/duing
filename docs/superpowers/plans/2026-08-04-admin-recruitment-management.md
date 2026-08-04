# 관리자 모집 관리(Admin Recruitment Management) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN) 전용 모집 콘솔 — 전 동아리 모집 목록/상세, 강제 마감(+감사), SELF 지원자·지원서 열람(+열람 감사), EXTERNAL 가입 링크 현황(읽기 전용).

**Architecture:** 스펙 SoT: `docs/superpowers/specs/2026-08-04-admin-recruitment-management-design.md`. BE 2개 PR(조회 / 마감·감사·지원자) → FE 2개 PR(콘솔 / 지원자 화면), develop 순차 스택. 감사는 신규 테이블 없이 `club_audit_event`(V102) 확장. 기존 서비스 메서드는 운영진 가드(`requireManager`)를 내장하므로 재사용 경계는 **리포지토리·쿼리 DTO·공개 팩토리**다.

**Tech Stack:** Spring Boot 3.4 / QueryDSL / Flyway / RestAssured+TestContainers · Next.js 15 / React Query / vitest+RTL

## Global Constraints

- **push·PR 생성 금지 — 커밋만.** 커밋 메시지에 Co-Authored-By/Generated 어트리뷰션 금지. Conventional Commits 한국어.
- 사용자 대면 문구 전부 한국어. DTO는 record. 매핑 어노테이션(`@GetMapping` 등)은 `*Api` 인터페이스에만, `@PreAuthorize("hasRole('ADMIN')")`+`@RequestMapping("/api/v1")`은 컨트롤러에만.
- 서비스: 클래스 `@Transactional(readOnly = true)` 기본 + 쓰기 메서드만 `@Transactional` 오버라이드. **감사 이벤트를 기록하는 조회(지원서 상세)는 쓰기 트랜잭션**(readOnly에서 INSERT는 실PG 500 — 레포 기지 함정).
- 시각은 주입 `Clock`(seoulClock)으로 `LocalDateTime.now(clock)` / `LocalDate.now(clock)`. 응답 경계 타임스탬프는 `TimeMapper.seoulWallClockToInstant`로 `Instant` 변환(TIMEZONE.md).
- 테스트: TestContainers(Docker 필요), 날짜는 상대값만(하드코딩 미래 절대날짜 금지), `@DisplayName`은 요구사항 문장. 신규 테이블 없음 → `IntegrationTestBase` TRUNCATE 목록·RLS 갱신 불필요(`club_audit_event` 이미 포함).
- FE 3단 배선: `packages/types`(recruitment.ts에 추가) → `packages/api/src/client.ts` **타입 선언부+구현부 두 곳** → `packages/hooks`(+barrel `index.ts` **명시 named export**).
- 검색어는 URL에 싣지 않는다(referrer 유출 — AdminUsersPage 전례). 다이얼로그 에러는 호출자 소유(`errorMessage` prop), 성공 시 target null로 닫기.
- 빌드 cwd: `cd backend && ./gradlew test` / `cd frontend && pnpm test`. `| tail` 금지 — 출력에서 BUILD SUCCESSFUL/통과 수 확인.
- 운영진(leader)·학생 경로 회귀 0 — 기존 테스트 전체 초록이 경계.
- 리뷰 게이트: 태스크마다 duing-code-reviewer + 적대적 리뷰(권한 경계·마이그레이션·API contract 해당) 디스패치.

**머지 순서 규칙**: Task 2의 마이그레이션 번호는 머지 직전 develop 재확인 — FSM(#863, V103)이 먼저면 `V104__`, 우리가 먼저면 `V103__`으로 리네임하고 FSM이 V104를 쓴다(Flyway out-of-order 금지).

---

## Task 1: `feat(backend): 관리자 모집 목록·상세 조회 API` (브랜치 `feat/admin-recruitment-query`, develop 분기)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/api/AdminRecruitmentApi.java`
- Create: `.../recruitment/controller/AdminRecruitmentController.java`
- Create: `.../recruitment/controller/dto/response/AdminRecruitmentSummaryResponse.java`, `AdminRecruitmentDetailResponse.java`, `AdminJoinLinkStatusResponse.java`
- Create: `.../recruitment/service/AdminRecruitmentQueryService.java` + `GeneralAdminRecruitmentQueryService.java`
- Create: `.../recruitment/service/dto/query/AdminRecruitmentSearchCondition.java`, `AdminRecruitmentSort.java`(enum), `AdminRecruitmentRow.java`(record)
- Modify: `.../recruitment/repository/RecruitmentRepositoryCustom.java` + `RecruitmentRepositoryImpl.java` — `searchForAdmin` 추가
- Test: `backend/src/test/java/com/duing/domain/recruitment/controller/AdminRecruitmentQueryControllerTest.java`

**Interfaces (Produces):**

```java
// GET /api/v1/admin/recruitments?q=&status=&mode=&sort=LATEST
// GET /api/v1/admin/recruitments/{recruitmentId}
public enum AdminRecruitmentSort { LATEST, APPLICANTS, DEADLINE }

public record AdminRecruitmentSearchCondition(String q, RecruitmentStatus status,
        ApplicationMode mode, AdminRecruitmentSort sort) {}
// sort 생략(null) 시 LATEST — 컨트롤러에서 @RequestParam(defaultValue = "LATEST") 로 고정

// repository — count 는 EXTERNAL 포함 전 모집에 대해 leftJoin groupBy 로 산출, 응답 매핑에서 EXTERNAL 은 null 처리
public interface RecruitmentRepositoryCustom {
    List<AdminRecruitmentRow> searchForAdmin(AdminRecruitmentSearchCondition condition); // 기존 메서드에 추가
}
public record AdminRecruitmentRow(Recruitment recruitment, String clubName, long applicantCount) {}

public record AdminRecruitmentSummaryResponse(
        Long recruitmentId, Long clubId, String clubName, String title,
        ApplicationMode applicationMode, RecruitmentStatus status,
        Long applicantCount,          // EXTERNAL 이면 null (공개용 applicantCount 필드 미사용 — 토글 종속)
        LocalDate startDate, LocalDate endDate, Instant updatedAt) {}

public record AdminJoinLinkStatusResponse(
        String linkStatus,            // "ACTIVE" | "EXPIRED" | "EXHAUSTED" — 활성 코드 없으면 응답 자체가 null
        Integer generation, int maxUses, int usedCount,
        long totalRequestCount, long pendingCount,
        long enrolledCount,           // 서버 계산: usedCount - pendingCount (차감·환급 불변식).
                                      // 활성 코드 기준 누적 승인 수 — 재생성 시 리셋·탈퇴 미반영(스펙 5.3 각주)
        int joinWindowDays, Instant joinExpiresAt) {}   // code 6자리 값은 절대 미포함

public record AdminRecruitmentDetailResponse(
        Long recruitmentId, Long clubId, String clubName, String title,
        ApplicationMode applicationMode, RecruitmentStatus status,
        Long applicantCount, LocalDate startDate, LocalDate endDate, Instant updatedAt,
        String externalFormUrl,                       // SELF 면 null
        AdminJoinLinkStatusResponse joinLink) {}      // SELF·활성 코드 없음이면 null (없음="코드 없음" 표시)
```

**Requirements:**
- 컨트롤러/API 분리·어노테이션 배치는 `AdminUserApi`/`AdminUserController` 패턴 그대로 (`@Tag`, `@SecurityRequirement(name = "BearerAuth")`, 컨트롤러에 `@PreAuthorize("hasRole('ADMIN')")`).
- `searchForAdmin` QueryDSL: `select(recruitment, club.name, application.count())` + `join(recruitment.club, club)`(**fetchJoin 금지** — groupBy 병용은 레포 무전례·Hibernate 검증 리스크, clubName 은 스칼라로 뽑는다) + `leftJoin(application).on(application.recruitment.eq(recruitment).and(application.deletedAt.isNull()))` + `groupBy(recruitment.id, club.name)`.
  - `q`: `club.name` 또는 `recruitment.title` containsIgnoreCase OR (null-safe BooleanExpression — `ApplicantSearchCondition` 전례).
  - `status`/`mode`: eq 필터(널이면 미적용). 삭제 모집은 `@SQLRestriction` 암묵 제외.
  - 정렬: LATEST=`recruitment.createdAt.desc()` / APPLICANTS=`application.count().desc()` 후 createdAt desc / DEADLINE=`recruitment.endDate.asc().nullsLast()` 후 createdAt desc.
- 상세의 joinLink 조립(EXTERNAL만): `clubJoinCodeRepository.findByRecruitmentIdAndRevokedAtIsNull(recruitmentId)` 후 **`JoinCodeQuery.from(joinCode, countByJoinCodeId(...), countByJoinCodeIdAndStatus(..., PENDING))` 정적 팩토리를 그대로 호출**하고 admin 응답으로 매핑(requireManager 없이 — 인라인 재조립 금지, `GeneralJoinCodeService.findActive:100-109` 참조). linkStatus 판정은 `isUsable` 의미와 정렬: 소진(`usedCount >= maxUses`) → EXHAUSTED / 모집 OPEN → ACTIVE / CLOSED면 `getJoinExpiresAt()`이 null(closedAt 스탬프 없음 — fail-closed)이거나 경과 → EXPIRED, 기한 이내 → ACTIVE. (revoked 는 활성 조회에서 이미 제외 → 응답 null = "코드 없음".)
- 404: `RecruitmentException.RecruitmentNotFoundException` 재사용.
- 페이지네이션 없음(스펙 2.1).

**Steps:**
- [ ] RestAssured 실패 테스트 먼저: ADMIN 목록 200(전 동아리 노출·EXTERNAL applicantCount null·삭제 모집 제외), q/status/mode 필터, 3종 정렬(DEADLINE은 상시모집 맨 뒤 단언), 상세 SELF(joinLink null)/EXTERNAL(활성 코드 → linkStatus·enrolledCount·**code 필드 부재** 단언), 404, 일반 STUDENT 403·클럽 LEADER 멤버십 보유 STUDENT 403(전역 role 은 STUDENT/ADMIN 2종 — 운영진도 STUDENT 토큰), 미인증 401. 시드는 `UserFixture.admin()`/`unique()` + `jwtTokenProvider.createToken(id, role)` (AdminUrlLayerAuthorizationAcceptanceTest 패턴), 날짜는 `LocalDate.now()` 상대값.
- [ ] `cd backend && ./gradlew test --tests '*AdminRecruitmentQuery*'` — 컴파일 실패/FAIL 확인
- [ ] 구현: repository → service → response 매핑(`TimeMapper.seoulWallClockToInstant`) → controller/api
- [ ] `cd backend && ./gradlew test` — BUILD SUCCESSFUL (전체 초록 = leader 경로 회귀 0 증명)
- [ ] 커밋: `feat(backend): 관리자 모집 목록·상세 조회 API — 전 동아리 검색·정렬·가입 링크 현황`

---

## Task 2: `feat(backend): 관리자 강제 마감·감사 확장·지원자 조회 API` (브랜치 `feat/admin-recruitment-actions`, Task 1 위 스택)

**Files:**
- Create: `backend/src/main/resources/db/migration/V104__club_audit_event_admin_actions.sql` (**번호는 머지 직전 재확인** — 상단 규칙)
- Modify: `.../clubaudit/entity/ClubAuditEventType.java` — `RECRUITMENT_FORCE_CLOSED`, `APPLICATION_VIEWED` 추가
- Modify: `.../clubaudit/entity/ClubAuditEvent.java` — `applicationId`(Long)·`reason`(String, length 500) 필드 + 팩토리 2개
- Create: `.../recruitment/service/AdminRecruitmentCommandService.java` + `GeneralAdminRecruitmentCommandService.java`
- Create: `.../recruitment/controller/dto/request/ForceCloseRecruitmentRequest.java`
- Create: `.../application/api/AdminApplicationApi.java`, `.../application/controller/AdminApplicationController.java`
- Create: `.../application/controller/dto/response/AdminApplicantListResponse.java`, `AdminApplicantResponse.java`, `AdminApplicationDetailResponse.java`
- Create: `.../application/service/AdminApplicationQueryService.java` + `GeneralAdminApplicationQueryService.java`
- Modify: `.../application/repository/ApplicationRepositoryCustom.java` + `ApplicationRepositoryImpl.java` — `searchApplicantsForAdmin` 추가(기존 `searchApplicants`·`findNeighbors` **무변경**)
- Modify: `.../recruitment/api/AdminRecruitmentApi.java` + `AdminRecruitmentController.java` — close 엔드포인트 추가
- Test: `.../recruitment/controller/AdminRecruitmentForceCloseTest.java`, `.../application/controller/AdminApplicationControllerTest.java`

**Interfaces:**

```sql
-- V104__club_audit_event_admin_actions.sql
-- 관리자 모집 조치 감사(스펙 3절): 지원서 참조·사유 컬럼 추가, 이벤트 2종 등록.
ALTER TABLE club_audit_event ADD COLUMN application_id BIGINT REFERENCES application (id);
ALTER TABLE club_audit_event ADD COLUMN reason VARCHAR(500);
ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check;
ALTER TABLE club_audit_event ADD CONSTRAINT club_audit_event_event_type_check CHECK (event_type IN (
    'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
    'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED',
    'RECRUITMENT_FORCE_CLOSED', 'APPLICATION_VIEWED'));
```

```java
// ClubAuditEvent 팩토리 (기존 joinLink/joinRequest 와 동형)
public static ClubAuditEvent adminForceClose(Long clubId, Long recruitmentId, Long actorUserId, String reason)
public static ClubAuditEvent adminApplicationView(Long clubId, Long recruitmentId, Long applicationId, Long actorUserId)

// PATCH /api/v1/admin/recruitments/{recruitmentId}/close → 204
public record ForceCloseRecruitmentRequest(
        @Size(max = 500, message = "사유는 500자 이하여야 합니다.") String reason) {}

// 서비스 — close() 재사용이 전부. 별도 UPDATE·상태 분기 금지.
@Transactional
public void forceClose(Long recruitmentId, Long adminUserId, String reason) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    recruitment.close(LocalDateTime.now(clock));   // 중복 마감 409 는 close() 내부에서 발생·전파
    clubAuditEventRepository.save(ClubAuditEvent.adminForceClose(
            recruitment.getClub().getId(), recruitmentId, adminUserId, normalizeReason(reason)));
}
// normalizeReason: (reason == null || reason.isBlank()) ? null : reason.trim()
// — 공용 유틸 없음(Club.blankToNull 은 private), 이 서비스의 private static 헬퍼로 둔다

// GET /api/v1/admin/recruitments/{recruitmentId}/applications?q=&status=&sort=LATEST
public enum AdminApplicantSort { LATEST, OLDEST }   // 생략 시 LATEST — @RequestParam(defaultValue = "LATEST")
// repository — 기존 private 조건 빌더 재사용, 평가·면접 조인 없음(admin 은 myScore/interview 불필요)
List<Application> searchApplicantsForAdmin(Long recruitmentId, ApplicantSearchCondition condition, boolean oldestFirst);

public record AdminApplicantResponse(Long applicationId, String userName, String studentId,
        College college, String major, ApplicationStatus status, Instant submittedAt) {}
public record AdminApplicantListResponse(long total,
        Map<ApplicationStatus, Long> statusCounts,   // enum-agnostic — FSM 변경 자동 흡수
        List<AdminApplicantResponse> applicants) {}

// GET /api/v1/admin/applications/{applicationId}
public record AdminApplicationDetailResponse(
        Long applicationId, Long recruitmentId, String recruitmentTitle, Long clubId, String clubName,
        AdminApplicantProfile applicant, ApplicationStatus status, Instant submittedAt,
        List<AdminStatusHistoryItem> statusHistory, List<AdminQuestionAnswer> answers) {
    public record AdminApplicantProfile(String name, String studentId, College college, String major) {}
    public record AdminStatusHistoryItem(ApplicationStatus previousStatus, ApplicationStatus newStatus, Instant changedAt) {}
    public record AdminQuestionAnswer(String question, String answer) {}
}
```

**Requirements:**
- 강제 마감: 위 서비스 코드 그대로 — `close(LocalDateTime)` 시그니처가 `closedAt` 스탬프를 강제(가입 링크 기간 기준점). `RecruitmentAlreadyClosedException`(409) 전파. 감사 기록은 같은 트랜잭션.
- 지원자 목록: `ApplicantSearchCondition(status, null, q, null, null)` 재구성으로 기존 condition 재사용. statusCounts는 `RecruitmentStatsRepositoryCustom.findSummaryByRecruitmentId(recruitmentId)` 그대로(**StatsSummaryQuery 미사용** — 고정 필드 record 는 FSM 이 바꾼다). total = counts 합. **EXTERNAL 모집이면 자연히 빈 목록·빈 counts 200** — 분기 코드 금지, 테스트로 정책만 고정.
- 지원서 상세: `applicationRepository.findWithRecruitmentAndClubById(applicationId)` + `applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId)` → `ApplicantDetailQuery.fromWithHistory(application, historyRows)` → admin 응답 매핑에서 **phone·grade·평가·면접 필드 탈락**. 열람 감사 `adminApplicationView(...)` 저장 — 이 메서드는 `@Transactional`(쓰기, readOnly 금지). 목록 조회는 감사 미기록.
- 404: `ApplicationDomainException` 계열 기존 not-found 재사용.

**Steps:**
- [ ] 실패 테스트 먼저 — 강제 마감: OPEN→204+`closedAt` not null 단언 / 중복 마감 409 / reason 포함 `RECRUITMENT_FORCE_CLOSED` 이벤트 1건(reason·actor·recruitmentId) / **EXTERNAL 마감 후 활성 링크 `isUsable(now)` true 유지**(joinWindow 내) / 권한 4종(ADMIN 200·일반 STUDENT 403·클럽 LEADER 멤버십 STUDENT 403·미인증 401). 지원자: 필터·검색·정렬 asc/desc·statusCounts·EXTERNAL 빈 200 / 상세: 응답 필드(phone 부재 단언)·`APPLICATION_VIEWED` 이벤트(applicationId)·목록 조회 시 이벤트 0건 / 권한 4종(동일 구성). 상태 시드는 FSM 이후에도 살아남는 값만(SUBMITTED/ACCEPTED/REJECTED).
- [ ] `./gradlew test --tests '*AdminRecruitmentForceClose*' --tests '*AdminApplicationController*'` — FAIL 확인
- [ ] V104 마이그레이션 + 엔티티 확장 + 서비스/컨트롤러 구현
- [ ] `cd backend && ./gradlew test` — BUILD SUCCESSFUL (RowLevelSecurityMigrationTest 포함 전체 초록)
- [ ] 커밋: `feat(backend): 관리자 강제 모집 마감·지원자 조회 API — club_audit_event 감사 확장`

---

## Task 3: `feat(frontend): 관리자 모집 콘솔 — 목록·상세·강제 마감` (브랜치 `feat/admin-recruitment-console`, BE 2개 머지 후 develop 분기)

**Files:**
- Modify: `frontend/packages/types/src/recruitment.ts` — Admin 타입 추가(신규 파일·barrel 변경 불필요)
- Modify: `frontend/packages/api/src/client.ts` — `admin.recruitments` 타입 선언부+구현부(list/detail/forceClose)
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts` — `recruitmentsAll`/`recruitmentsList(params)`/`recruitmentsDetail(id)`
- Create: `frontend/packages/hooks/src/adminRecruitments.ts` + Modify: `frontend/packages/hooks/src/index.ts`(명시 export)
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts` — 엔트리 1개
- Create: `frontend/apps/web/app/admin/recruitments/page.tsx`, `_pages/AdminRecruitmentsPage.tsx`, `_components/AdminRecruitmentsTable.tsx`, `_lib/recruitmentLabels.ts`
- Create: `frontend/apps/web/app/admin/recruitments/[recruitmentId]/page.tsx`, `_pages/AdminRecruitmentDetailPage.tsx`, `_components/AdminForceCloseDialog.tsx`, `_components/AdminExternalRecruitmentPanel.tsx`
- Test: `frontend/apps/web/test/admin/recruitments/admin-recruitments-list.test.tsx`, `admin-recruitment-detail.test.tsx`, `admin-force-close-dialog.test.tsx`

**Interfaces (types → client):**

```ts
// packages/types/src/recruitment.ts 에 추가
export type AdminRecruitmentSort = 'LATEST' | 'APPLICANTS' | 'DEADLINE';
export type AdminRecruitmentSearchParams = {
  q?: string; status?: RecruitmentStatus; mode?: ApplicationMode; sort?: AdminRecruitmentSort;
};
export type AdminRecruitmentSummary = {
  recruitmentId: number; clubId: number; clubName: string; title: string;
  applicationMode: ApplicationMode; status: RecruitmentStatus;
  applicantCount: number | null;              // EXTERNAL 이면 null → "—"
  startDate: string; endDate: string | null; updatedAt: string;
};
export type AdminJoinLinkStatus = {
  linkStatus: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED';
  generation: number | null; maxUses: number; usedCount: number;
  totalRequestCount: number; pendingCount: number; enrolledCount: number;
  joinWindowDays: number; joinExpiresAt: string | null;
};
export type AdminRecruitmentDetail = AdminRecruitmentSummary & {
  externalFormUrl: string | null; joinLink: AdminJoinLinkStatus | null;
};
export type ForceCloseRecruitmentPayload = { reason?: string };

// client.ts — admin.reports 관례
recruitments: {
  list(params: AdminRecruitmentSearchParams): Promise<AdminRecruitmentSummary[]>;
  detail(recruitmentId: number): Promise<AdminRecruitmentDetail>;
  forceClose(recruitmentId: number, payload: ForceCloseRecruitmentPayload): Promise<void>;
};
// 구현: list → jsonOk(http.get('admin/recruitments', { searchParams: cleanParams(params), timeout: REQUEST_TIMEOUT_MS.search }))
//       detail → jsonOk(http.get(`admin/recruitments/${recruitmentId}`))
//       forceClose → jsonVoid(http.patch(`admin/recruitments/${recruitmentId}/close`, { json: payload }))
```

**Requirements:**
- 훅: `useAdminRecruitmentsQuery(params)` / `useAdminRecruitmentDetailQuery(recruitmentId)` / `useForceCloseRecruitmentMutation()`(onSuccess → `invalidateQueries({ queryKey: adminQueryKeys.recruitmentsAll })`) — `admin.ts`의 useQuery/useMutation 패턴 그대로.
- adminSections 엔트리: `{ href: '/admin/recruitments', title: '모집 관리', description: '전 동아리 모집 현황·강제 마감·지원자 열람', group: '동아리', icon: ClipboardList }` (pendingCountKey 없음 — `Megaphone` 은 '홍보 관리' 부모가 이미 사용 중이라 회피).
- 목록 페이지: `AdminUsersPage` 골격 재사용 — 검색 input(state, `useDebouncedValue(input.trim(), 300)`, URL 미노출), 필터 칩(status/mode)·정렬 select는 로컬 state. 테이블 컬럼: 동아리명/제목/방식/상태/지원자 수(null → "—")/기간(endDate null → "상시")/마지막 수정일. 행 클릭 → `/admin/recruitments/[id]` 이동.
- **운영 개입 배지**: `status === 'OPEN' && endDate !== null && endDate < 오늘` → "운영 개입 필요" 배지(주의 색). FE 파생 계산 전용 — 강제 마감 가능 여부는 `status === 'OPEN'`만 본다.
- 방식 라벨(`_lib/recruitmentLabels.ts`): SELF → "자체 지원", EXTERNAL → `externalFormPlatformLabel(externalFormUrl) ?? '외부 폼'` (`@/app/manage/clubs/[clubId]/recruitments/_lib/externalFormPlatform` import 재사용).
- 상세 페이지: 공통 메타 헤더(ConsoleCard) + `status === 'OPEN'`일 때만 강제 마감 버튼. 방식 분기:
  - SELF: 이번 PR에서는 메타+마감까지 (지원자 영역은 Task 4 — "지원자 관리" 자리에 placeholder 없이 섹션 자체 미렌더)
  - EXTERNAL: `AdminExternalRecruitmentPanel` — 안내 문구 **"외부 모집은 두잉에서 지원서를 관리하지 않습니다. 회원 등록은 가입 코드 → 가입 요청 → 운영진 승인 절차로 진행됩니다."** + 외부 폼 URL(플랫폼 라벨+새 탭 링크) + 요약 카드 4칸(가입 코드 상태: ACTIVE→"활성"/EXPIRED→"만료"/EXHAUSTED→"소진"/null→"코드 없음" · 가입 요청 `totalRequestCount` · 승인 대기 `pendingCount` · 회원 등록 `enrolledCount` — **전부 서버 값 표시만, FE 계산 금지**). 지원자 테이블·"0명" 렌더 금지.
- `AdminForceCloseDialog`(`AdminReportProcessDialog` 패턴 — 항상 `open`, 부모가 조건부 마운트, pending 중 ESC/outside 차단): 사유 textarea(선택, `.slice(0, 500)`+카운터, 제출 시 `.trim() || undefined`) + 방식별 영향 안내 —
  - SELF: "마감하면 더 이상 신규 지원이 불가능합니다."
  - EXTERNAL: "새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 모집 종료 후 {joinWindowDays}일까지만 사용할 수 있습니다." (joinLink 없으면 앞 문장만)
  - 409(ApiError.status === 409) → errorMessage "이미 마감된 모집입니다." / 성공 → 토스트 "모집을 마감했습니다." + target null.

**Steps:**
- [ ] 실패 테스트 먼저(vi.mock `@duing/hooks`·`next/navigation`·토스트·`useDebouncedValue` 항등 — admin-users.test.tsx 상단 관례 복사): 목록 렌더·EXTERNAL "—"·개입 배지 조건(기간 경과 OPEN만)·방식 라벨 / 상세 EXTERNAL 패널(안내 문구·카드 4칸·**joinLink null → "코드 없음" 분기**·**지원자 테이블 부재 단언**)·CLOSED면 마감 버튼 부재 / 다이얼로그(방식별 문구·사유 카운터·409 에러 표시·성공 콜백)
- [ ] `cd frontend && pnpm --filter @duing/web test -- --run admin/recruitments` — FAIL 확인 (`--filter`는 pnpm 전역 플래그·패키지명은 `@duing/web`·`--run` 없으면 watch 행)
- [ ] types → client(두 곳) → keys/hooks/barrel → adminSections → 페이지·컴포넌트 구현
- [ ] `cd frontend && pnpm test && pnpm lint && pnpm typecheck` — 전체 통과 확인
- [ ] 커밋: `feat(frontend): 관리자 모집 콘솔 — 전 동아리 목록·상세·강제 마감·외부 모집 안내`

---

## Task 4: `feat(frontend): 관리자 지원자 목록·지원서 열람 화면` (브랜치 `feat/admin-recruitment-applicants`, Task 3 위 스택)

**Files:**
- Modify: `frontend/packages/types/src/recruitment.ts` — 지원자 타입 추가
- Modify: `frontend/packages/types/src/application.ts` — **`APPLICATION_STATUSES`에 `export` 추가(1줄)** — 현재 모듈-프라이빗 const 라 미노출, 이 줄 없이는 Task 4 지시대로 import 불가
- Modify: `frontend/packages/api/src/client.ts` — `admin.recruitments.applications`/`applicationDetail` 선언+구현
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts` + `adminRecruitments.ts` + `index.ts`
- Create: `frontend/apps/web/app/admin/recruitments/[recruitmentId]/_components/AdminSelfRecruitmentPanel.tsx`, `AdminApplicantsTable.tsx`, `AdminApplicationSheet.tsx`
- Modify: `.../_pages/AdminRecruitmentDetailPage.tsx` — SELF 분기에 패널 장착
- Test: `frontend/apps/web/test/admin/recruitments/admin-self-panel.test.tsx`, `admin-application-sheet.test.tsx`

**Interfaces:**

```ts
export type AdminApplicantSort = 'LATEST' | 'OLDEST';
export type AdminApplicantSearchParams = { q?: string; status?: ApplicationStatus; sort?: AdminApplicantSort };
export type AdminApplicant = {
  applicationId: number; userName: string; studentId: string;
  college: string; major: string; status: ApplicationStatus; submittedAt: string;
};
export type AdminApplicantList = {
  total: number;
  statusCounts: Partial<Record<ApplicationStatus, number>>;   // 키 순회는 APPLICATION_STATUSES 기준
  applicants: AdminApplicant[];
};
export type AdminApplicationDetail = {
  applicationId: number; recruitmentId: number; recruitmentTitle: string; clubId: number; clubName: string;
  applicant: { name: string; studentId: string; college: string; major: string };
  status: ApplicationStatus; submittedAt: string;
  statusHistory: { previousStatus: ApplicationStatus | null; newStatus: ApplicationStatus; changedAt: string }[];
  answers: { question: string; answer: string }[];
};
// client: applications(recruitmentId, params) → jsonOk(http.get(`admin/recruitments/${recruitmentId}/applications`, { searchParams: cleanParams(params) }))
//         applicationDetail(applicationId) → jsonOk(http.get(`admin/applications/${applicationId}`))
```

**Requirements:**
- 훅: `useAdminApplicantsQuery(recruitmentId, params)` / `useAdminApplicationDetailQuery(applicationId | undefined)` — nullable id 는 sentinel(`?? -1`)+`enabled` 패턴(`packages/hooks/src/reports.ts:21` 전례). queryKey: `recruitmentsApplications(recruitmentId, params)` / `applicationsDetail(applicationId)`.
- `AdminSelfRecruitmentPanel`: 상단 요약 카드(총 지원자 `total` + 상태별 카운트 — `APPLICATION_STATUSES` 순회 × `APPLICATION_STATUS_LABEL` 공용 상수, 카운트 없으면 0 표시) → 검색 input(디바운스 300, URL 미노출) + 상태 필터 칩(전체 + enum 순회) + 정렬 select(최신순/오래된순) → `AdminApplicantsTable`(이름/학번/학부·학과/상태 뱃지/지원일 — **체크박스·일괄 처리 없음, 읽기 전용**) → 행 클릭 시 `AdminApplicationSheet` 조건부 마운트. 지원자 0명+필터 없음 → `EmptyState`.
- `AdminApplicationSheet`(`AdminUserDetailSheet` 패턴 — `Sheet open` + `onOpenChange`→`onClose`, 데이터 래퍼와 presentational `AdminApplicationSheetContent` 분리 export): 헤더에 `clubName · recruitmentTitle` 컨텍스트 표기 / 프로필(이름·학번·학부·학과·지원일) / 상태+이력 타임라인(라벨은 공용 상수) / 질문·답변 목록(답변 빈 문자열 → "미작성" 회색 표기). 수정 액션 일절 없음.
- 상태 라벨·enum 은 전부 `@duing/types`의 `APPLICATION_STATUSES`/`isApplicationStatus` + `@/app/_constants/application-status`의 `APPLICATION_STATUS_LABEL` 재사용 — FSM(#864) 변경 자동 흡수, 이 PR 에 상태 리터럴 하드코딩 금지.

**Steps:**
- [ ] 실패 테스트 먼저: 요약 카드(서버 값 그대로 렌더·0 폴백) / 필터·정렬 파라미터 전달(mock 호출 인자 단언) / 테이블 읽기 전용(체크박스 부재) / 시트(헤더 컨텍스트·프로필·답변·이력 렌더, "미작성" 폴백, onClose) — 시트 테스트는 Content 직접 렌더(전례)
- [ ] `cd frontend && pnpm --filter @duing/web test -- --run admin/recruitments` — FAIL 확인
- [ ] types → client → keys/hooks → 컴포넌트 → 상세 페이지 분기 장착
- [ ] `cd frontend && pnpm test && pnpm lint && pnpm typecheck` — 전체 통과
- [ ] 커밋: `feat(frontend): 관리자 지원자 목록·지원서 열람 — 상태 요약·검색 필터·읽기 전용 시트`

---

## Self-Review 결과 반영 메모

- 스펙 2.4의 "EXTERNAL 빈 목록 200"은 Task 2 테스트로만 고정(분기 코드 없음), FE 는 Task 3에서 EXTERNAL 시 applications 호출 자체를 안 함 — 스펙 일치.
- `StatsSummaryQuery`(underReview 고정 필드)는 의도적으로 미사용 — Task 2는 `Map<ApplicationStatus, Long>` 원본 재사용으로 FSM-agnostic.
- `buildPairedAnswers`는 private — 공개 팩토리 `ApplicantDetailQuery.fromWithHistory`가 재사용 경계(답변 페어링·EXTERNAL 빈 목록 처리 포함).
- 스펙 6의 FE "권한 없는 사용자 접근 차단"은 신규 라우트가 `app/admin/` 하위에 있는 것만으로
  `admin/layout.tsx`의 `AdminRoleGuard`+`middleware.ts` 공통 가드가 적용된다(운영 콘솔 IDOR 전수조사에서
  layout 공통화로 확정된 구조). 페이지별 가드 복붙·중복 테스트를 추가하지 않는 것이 의도된 결정.
- Quick Action(P2)·강제 재개·CSV·가입 요청 개입·페이지네이션은 스펙 Out of Scope — 이 계획에 없음이 정상.
