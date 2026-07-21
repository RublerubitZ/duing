# 시설 예약 제출 업무 UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연 시설 담당자가 학교(HWP) 제출 업무를 가장 빠르게 수행하도록 시설 예약 제출 워크플로와 예약 신청 폼의 UX를 개선한다.

**Architecture:** 기존 4탭 제출 워크플로(review·prepare·ready·archive)와 배치 상세 API를 최대한 재사용한다. 신규 백엔드는 두 개(관리자 동아리원 명단 조회, 제출 이력 복합 필터)와 정책 변경 하나(사용 인원 필수)뿐이고, 나머지는 프론트 UI/UX 변경이다.

**Tech Stack:** Spring Boot 3.4 / Java 21 (DDD·QueryDSL·RestAssured), Next.js 15 + React 19 / pnpm workspaces (App Router·TanStack Query·Vitest·MSW).

## Global Constraints

- 현재 기능 삭제 금지·현재 정책 유지(예외: 사용 인원 필수화는 사용자가 승인한 정책 변경).
- 커밋: Conventional Commits(`feat(backend): ...`), Claude attribution 라인 금지.
- 브랜치: `develop` 분기 → `develop` PR. BE→FE 의존 시 BE 머지 후 FE.
- FE: `any`/`as` 금지(전환기 테스트는 `as unknown as` + 사유 주석 예외), 서버상태는 TanStack Query, `@duing/api` 통해서만 호출, 새 색 도입 금지(DESIGN.md 토큰).
- BE: 모든 DTO는 `record`, `api/` 인터페이스 필수, 서비스 `@Transactional(readOnly)` 기본, 소프트삭제 유지.
- 검증: BE `./gradlew test`(TestContainers, Docker 필요), FE `pnpm --filter web test`/`typecheck`/`lint`. 로컬 prod 빌드는 `NEXT_PUBLIC_API_BASE_URL=https://api.duings.com` 오버라이드.

---

## PR 구성과 의존성

사용자 요청 5개 항목 → 백엔드 판단 결과 **6개 PR**(BE 3 + FE 3):

| PR | 유형 | 내용 | 요청 항목 | 의존 |
|---|---|---|---|---|
| **A** | BE | 관리자 동아리원 명단 조회 API 신설(+college 필드) | 5 | — |
| **B** | BE | 사용 인원 필수화(`@NotNull`·타입·스펙) | 3 | — |
| **C** | BE | 제출 이력 복합 필터(`ARCHIVED` = 완료+취소) | 2 | — |
| **D** | FE | 예약 신청 폼: 인원 필수 게이트 + 연락처 자동 포맷 | 3·4 | B |
| **E** | FE | 제출 이력 3/4단계 분리 + 상세·취소 버튼 간격 | 2 | C |
| **F** | FE | HWP 전사 콕핏 + 동아리원 명단 아코디언·복사 | 1·5 | A |

BE 3개(A·B·C)는 서로 무관해 병렬 가능. FE는 각자의 BE 선행 PR 머지 후. E는 D와 독립.

**요청과 실제 코드가 달랐던 점(계획 반영 완료):**
1. "제출 대기에서 CSV·상세 불가" → 실제로는 전 상태에서 열려 있음. 그래서 F는 "막힌 걸 여는 것"이 아니라 전사 전용 화면 신설.
2. "제출 대기/이력 혼재" → 이미 별도 탭. 이력 탭만 REVIEWING까지 섞어 표시(→ PR C·E로 분리).
3. "제출 버튼 항상 눌림" → 이미 목적·동아리 게이트 존재. 사용 인원만 게이트 밖(→ PR D).

---

## PR-A: 관리자 동아리원 명단 조회 API

**목표:** 총동연(ADMIN)이 `clubId`로 동아리원 명단을 [이름·학번·전공·단과대]로 조회하는 엔드포인트 신설. HWP 문서에 명단을 붙여넣기 위한 데이터 소스.

**근거:** 기존 `GET /clubs/{clubId}/members`는 club LEADER/OFFICER 전용(`GeneralClubMemberQueryService.java:24` `requireManager`)이라 ADMIN이 403이고, 응답 `ClubMemberResponse`에 `college`가 없다(`ClubMemberResponse.java:10-19`). 쿼리는 이미 User를 JOIN FETCH(`ClubMemberRepository.java:41-49`)하므로 college는 DTO 매핑만 추가하면 된다(#715 패턴). 권한만 새 admin 라우트로 연다.

**Files:**
- Create: `backend/.../domain/clubmember/api/AdminClubMemberApi.java`
- Create: `backend/.../domain/clubmember/controller/AdminClubMemberController.java`
- Create: `backend/.../domain/clubmember/controller/dto/response/AdminClubMemberResponse.java`
- Create: `backend/.../domain/clubmember/service/dto/query/AdminClubMemberQuery.java`
- Modify: `backend/.../domain/clubmember/service/GeneralClubMemberQueryService.java` (admin용 조회 메서드 추가, 권한 체크 없이 — 컨트롤러가 `@PreAuthorize` ADMIN 게이트)
- Modify: `backend/.../domain/clubmember/service/ClubMemberQueryService.java` (인터페이스 시그니처 추가)
- Test: `backend/.../domain/clubmember/controller/AdminClubMemberControllerTest.java`

**Interfaces:**
- Produces (FE PR-F가 소비): `GET /api/v1/admin/clubs/{clubId}/members` → `ApiResponse<List<AdminClubMemberResponse>>`
- `AdminClubMemberResponse(Long memberId, String name, String studentId, String major, College college, Grade grade, ClubMemberRole role)` — college·grade는 원값(enum), 한글 라벨은 FE.
- 서비스: `List<AdminClubMemberQuery> ClubMemberQueryService.getMembersForAdmin(Long clubId)`
- **정렬 계약(명시)**: LEADER → OFFICER → MEMBER 순, 그룹 내 가입일(createdAt) 오름차순. 리더용과 동일한 `ClubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt`(`ClubMemberRepository.java:38-49`)를 재사용해 정렬을 물려받는다. 이 순서가 HWP 명단 붙여넣기 순서이므로 계약으로 고정하고 테스트로 검증한다(A3에 정렬 케이스 추가).

**설계 노트:**
- 기존 리더용 `ClubMemberResponse`/`ClubMemberQuery`는 **건드리지 않는다**(리더 화면 회귀 방지). admin 전용 DTO를 새로 둔다 — 리더용에 college를 얹으면 요청 범위 밖 변경이 된다.
- 서비스는 기존 `ClubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId)`를 그대로 재사용(정렬·JOIN FETCH 동일). admin 메서드는 `requireManager`를 부르지 않는다 — URL·메서드 인가가 ADMIN을 보장.
- 페이지네이션 없이 전체 명단(List) 반환. 동아리 규모가 수백 이하라 페이징 불필요(리더용도 List 반환).

**Tasks:**
- Task A1: `AdminClubMemberQuery` record + `from(ClubMember)` (college 포함). 서비스 인터페이스·구현에 `getMembersForAdmin`. 단위 성격은 컨트롤러 통합테스트로 커버.
- Task A2: `AdminClubMemberResponse` record + `from(query)`, `AdminClubMemberApi`(Swagger `@Tag`·`@Operation`·`@GetMapping`), `AdminClubMemberController`(`@RequestMapping("/api/v1")` + `@PreAuthorize("hasRole('ADMIN')")`).
- Task A3: `AdminClubMemberControllerTest` — (1) ADMIN이 명단을 이름·학번·전공·단과대와 함께 받는다, (2) 동아리 비소속 ADMIN도 200(리더용과 달리 403 아님), (3) STUDENT는 403, (4) college·grade가 원값(enum name)으로 실린다, (5) 정렬이 LEADER→OFFICER→MEMBER·가입일 오름차순으로 나온다(계약 고정).

**Verification:** `./gradlew test --tests "*AdminClubMemberControllerTest"` → 4건 통과, 이어서 `./gradlew test` 전체 그린(clubmember 리더용 테스트 회귀 없음).

---

## PR-B: 사용 인원 필수화 (정책 변경)

**목표:** 시설 예약 신청 시 `attendeeCount`를 선택 → 필수로. 프론트 게이트만으로는 API 직접 호출 경로에 구멍이 남으므로 백엔드·타입·스펙까지 완결.

**근거:** 현재 `CreateFacilityBookingRequest.java:19`가 `@Positive Integer attendeeCount`(양수 검증만, null 허용). 타입 `facility.ts:121` `attendeeCount?: number`. 스펙 `docs/superpowers/specs/2026-07-13-facility-booking-design.md:500,673`이 "사용 인원(선택)"으로 명시 → 스펙 개정 포함.

**Files:**
- Modify: `backend/.../facilitybooking/controller/dto/request/CreateFacilityBookingRequest.java:19` (`@NotNull(message="사용 인원을 입력해주세요.")` 추가, `@Positive` 유지)
- Modify: `backend/.../facilitybooking/entity/FacilityBooking.java` (생성자 파라미터는 `Integer` 유지 — request 검증이 null 차단, 엔티티는 무변경 가능. 방어적으로 `Objects.requireNonNull` 추가 검토)
- Modify: `docs/superpowers/specs/2026-07-13-facility-booking-design.md:500,673` ("선택" → "필수"로 개정, 개정 사유 주석)
- Test: `backend/.../facilitybooking/controller/*` (신규 신청 통합테스트에 attendeeCount 누락 시 400 케이스 추가)

**Interfaces:**
- Produces (FE PR-D가 소비): `POST /admin`... 계약 변경 없음(경로 동일), attendeeCount 누락 시 400 Bad Request.
- 타입은 PR-D(FE)에서 `attendeeCount: number`(required)로 변경 — BE는 계약(검증)만 조인다.

**설계 노트:**
- 기존 신청 데이터(attendeeCount null 행)는 조회·표시에 영향 없음 — 검증은 **생성 시점만** 적용. 롤백 안전(V90 원칙과 동일: 신규 입력만 조인다).
- 타입 파일 변경은 FE PR-D에 두어 BE PR을 순수 계약 변경으로 유지(BE 머지가 FE 타입을 강제하지 않게).

**Tasks:**
- Task B1: 신청 통합테스트에 "attendeeCount 없이 신청하면 400" 케이스 추가(RED). 기존 신청 테스트가 attendeeCount를 안 넣고 통과했다면 그 픽스처에 값 추가(GREEN 유지).
- Task B2: `CreateFacilityBookingRequest`에 `@NotNull` 추가. 테스트 그린.
- Task B3: 스펙 문서 개정.

**Verification:** `./gradlew test --tests "*FacilityBooking*"` 그린 + 신규 400 케이스 통과, 전체 `./gradlew test` 그린.

---

## PR-C: 제출 이력 복합 필터 (ARCHIVED)

**목표:** 제출 이력 탭이 "완료 + 취소"만 한 페이지네이션 목록으로 받도록 백엔드 필터에 복합 케이스 추가. FE 클라이언트 필터링은 페이지네이션을 깨므로 서버에서 해결.

**근거:** `SubmissionBatchStatusFilter` = REVIEWING|COMPLETED|CANCELLED(단일값), `statusMatches`가 switch로 단일 상태만 처리(`FacilitySubmissionBatchRepositoryImpl.java:46-58`). "이력 = 완료+취소"를 한 번에 거를 값이 없다.

**서버 필터 필요성 재검증(확정):** 이력 탭은 `PAGE_SIZE=10` 페이지네이션이고 `totalPages`로 페이저를 렌더한다(`SubmissionBatchesTab.tsx:37,61,68,246`). FE에서 REVIEWING을 클라 필터링하면 서버가 REVIEWING 포함 10건을 반환해 화면 표시 수(≤8)와 `totalPages`(REVIEWING 포함 집계)가 어긋나 페이저가 깨진다. → 서버 필터가 유일한 정합 해법.

**Files:**
- Modify: `backend/.../facilitysubmission/service/dto/query/SubmissionBatchStatusFilter.java` (enum에 `ARCHIVED` 추가)
- Modify: `backend/.../facilitysubmission/repository/FacilitySubmissionBatchRepositoryImpl.java:50-57` (switch에 `ARCHIVED` 케이스: `cancelledAt.isNotNull().or(completedAt.isNotNull())`)
- Test: `backend/.../facilitysubmission/controller/AdminFacilitySubmissionAcceptanceTest.java` (ARCHIVED 필터 케이스 추가)

**Interfaces:**
- Produces (FE PR-E가 소비): `GET /admin/facility-bookings/submission?status=ARCHIVED` → COMPLETED·CANCELLED 배치만 페이지네이션 반환.
- FE 타입 `SubmissionBatchStatusFilter`(facilitySubmission.ts)에 `'ARCHIVED'` 추가는 PR-E에서.

**설계 노트:**
- 파생 상태 규칙(취소>완료>대기)과 정합: ARCHIVED = "취소되었거나 완료된"이므로 `cancelledAt IS NOT NULL OR completedAt IS NOT NULL`. REVIEWING(둘 다 null)만 제외된다.
- 기존 REVIEWING/COMPLETED/CANCELLED 단일 필터 동작은 불변.

**Tasks:**
- Task C1: acceptance 테스트에 "status=ARCHIVED면 완료·취소 배치만 반환하고 REVIEWING은 제외" 케이스 추가(RED).
- Task C2: enum + repository switch에 ARCHIVED 추가. 그린.

**Verification:** `./gradlew test --tests "*AdminFacilitySubmissionAcceptanceTest"` 그린, 전체 `./gradlew test` 그린.

---

## PR-D: 예약 신청 폼 — 인원 필수 게이트 + 연락처 자동 포맷 [dep: PR-B]

**목표:** (3) 사용 인원 필수 게이트 + 6개 필수항목 모두 입력 전 버튼 비활성. (4) 대표 연락처 입력 시 `010-1234-5678` 자동 포맷·숫자만·길이 검증.

**근거:** `BookingForm.tsx`가 필드·검증을 전부 보유(zod 없음, useState). `canOpenConfirm`(`:125-130`)이 이미 목적·동아리 게이트를 가짐 — 인원 조건만 추가. `formatPhone`(`app/_components/PhoneInput.tsx:8`)이 MO 인증에서 검증된 채 존재 → 재사용.

**Files:**
- Modify: `frontend/packages/types/src/facility.ts:121` (`attendeeCount?: number` → `attendeeCount: number`)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingForm.tsx` (라벨·게이트·payload·연락처 onChange)
- Test: `frontend/apps/web/test/facilities/facility-booking-page.test.tsx` (시나리오5 갱신 + 인원 필수 게이트 신규)

**Interfaces:**
- Consumes: PR-B의 400 계약(BE가 attendeeCount 필수). `formatPhone(raw: string): string` from `@/app/_components/PhoneInput`.

**설계 노트 (변경 지점 정확히):**
- 라벨 `BookingForm.tsx:258` "사용 인원 (선택)" → "사용 인원" (필수 표시).
- 게이트 `:125-130` `canOpenConfirm`에 `attendeeCount.trim().length > 0 && !attendeeInvalid` 추가. 6개 필수항목(시설·날짜·시간은 props로 이미 확정, 목적·인원·연락처가 입력값) 중 연락처는 기존 정책(클릭 시점 검증)을 유지할지 게이트에 넣을지 결정: **요청이 "모두 입력 전 비활성"이므로 연락처도 게이트에 포함**. `CONTACT_PHONE_PATTERN` 충족을 `canOpenConfirm`에 추가.
- payload `:159` optional spread 제거 → `attendeeCount: attendeeNumber` 항상 포함(타입이 required가 됨).
- 연락처 `:276-279` onChange를 `setContactPhone(formatPhone(event.target.value))`로 — 숫자만 남기고 하이픈 자동, 11자리 초과 차단(formatPhone이 slice). state에 포맷된 값 저장.
- 초기값 `:50` `authUser?.phone ?? ''`도 `formatPhone`으로 감싸 일관 표기.

**Tasks:**
- Task D1: 시나리오5(`:405-468`, attendeeCount 미포함 성공) 갱신 — 인원 입력 스텝 추가, `capturedBody`가 attendeeCount 포함하도록(RED→코드→GREEN).
- Task D2: 인원 필수 게이트 테스트 신규 — "인원 미입력이면 예약 신청 버튼 비활성, 입력하면 활성"(RED).
- Task D3: 연락처 자동 포맷 테스트 — "01012345678 입력 시 010-1234-5678 표시, 12자리 이상 잘림"(RED).
- Task D4: BookingForm 구현(라벨·게이트·payload·formatPhone). 타입 required 변경. 전체 그린.

**Verification:** `pnpm --filter web exec vitest run test/facilities/facility-booking-page.test.tsx` 그린, typecheck 0(타입 required 변경이 다른 소비처 안 깨는지 확인), 실브라우저 `/facilities` 신청 폼 QA(인원 미입력 시 비활성·연락처 포맷).

---

## PR-E: 제출 이력 3/4단계 분리 + 버튼 간격 [dep: PR-C]

**목표:** (2) 제출 이력 탭이 COMPLETED·CANCELLED만 표시(REVIEWING 제외). 상세·취소 버튼 간격·시각 계층 개선.

**근거:** 이력 탭이 `statusFilter` 없이 전체를 받음(`AdminFacilityBookingsPage.tsx:217`). 제출 대기 탭은 이미 REVIEWING 필터(`:216`). 버튼은 `SubmissionBatchesTab.tsx:221-235`에 간격 없이 인접.

**Files:**
- Modify: `frontend/packages/types/src/facilitySubmission.ts` (`SubmissionBatchStatusFilter`에 `'ARCHIVED'` 추가)
- Modify: `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx:217` (archive 탭에 `statusFilter="ARCHIVED"`)
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx:221-235` (버튼 gap·계층)
- Test: `frontend/apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx`

**Interfaces:**
- Consumes: PR-C의 `status=ARCHIVED` 필터.

**설계 노트:**
- 이력 탭이 ARCHIVED를 넘기면 서버가 완료·취소만 페이지네이션. 제출 대기 탭(REVIEWING)은 불변.
- 버튼 간격: 상세(secondary)·취소(danger) 사이 `gap` 추가, 취소를 시각적으로 낮은 위계로(ghost/outline). DESIGN.md 토큰 내에서(`gap-2`, 기존 버튼 클래스 재사용). 새 색 없음.
- REVIEWING 전용이던 완료/취소 버튼은 이력 탭엔 애초에 안 뜸(ARCHIVED엔 REVIEWING 없음) — 자연히 정합.

**Tasks:**
- Task E1: 타입에 ARCHIVED 추가. 이력 탭 statusFilter 전달.
- Task E2: submission-batches-tab 테스트 — "이력 탭(ARCHIVED)은 REVIEWING 배치를 요청/표시하지 않는다" 검증(MSW로 status 파라미터 단언).
- Task E3: 버튼 간격·위계 조정 + 스냅샷/렌더 테스트.

**Verification:** `pnpm --filter web exec vitest run test/admin/facility-submission/` 그린, 실브라우저 이력 탭 QA(REVIEWING 미표시·버튼 간격).

---

## PR-F: HWP 전사 콕핏 + 동아리원 명단 [dep: PR-A]

**목표:** (1) 제출 대기 배치를 HWP 신청서에 옮겨 쓰는 전사 전용 화면. (5) 그 안에 동아리원 명단 아코디언 + 행/전체 복사.

**근거:** 배치 상세 API가 HWP 필드 전부 보유(`SubmissionCandidateBooking`: facilityName·일시·clubName·attendeeCount·purpose·applicantName·contactPhone, `facilitySubmission.ts:11-31`). 명단은 PR-A의 `GET /admin/clubs/{clubId}/members`. 예약에 `clubId` 있음(`SubmissionCandidateBooking.clubId`).

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/page.tsx` (+ `loading.tsx`)
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/CopyField.tsx` (클릭 복사 필드)
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/ClubRosterAccordion.tsx` (동아리원 명단)
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_lib/hwpFields.ts` (HWP 양식 순서 필드 정의)
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx` (제출 대기 탭 행에 [제출 정보 보기] 진입 버튼 — REVIEWING만)
- Create: `frontend/packages/api` 메서드 + `frontend/packages/hooks` 훅 + `frontend/packages/types` 타입 (admin 동아리원 명단: `client.admin.clubs.members(clubId)`, `useAdminClubMembersQuery`, `AdminClubMember`)
- Test: `frontend/apps/web/test/admin/facility-submission/transcribe-cockpit.test.tsx`, `club-roster-accordion.test.tsx`, `copy-field.test.tsx`

**Interfaces:**
- Consumes: PR-A `GET /admin/clubs/{clubId}/members`. 배치 상세 `useSubmissionBatchDetailQuery(batchId)`.
- `AdminClubMember = { memberId: number; name: string; studentId: string; major: string; college: College; grade: Grade; role: ClubMemberRole }`
- `HWP_FIELDS: { key: string; label: string; get: (b: SubmissionCandidateBooking) => string }[]` — 양식 순서(시설명·사용일시·사용자기관·사용인원·사용목적·신청자소속·신청자성명).
- `toTabLine(b): string` (탭 구분 한 줄), `toFormBlock(b): string` (`라벨: 값` 여러 줄 — 전체 양식 복사).

**설계 노트 (예제 JSX → 프로젝트 이식):**
- 인라인 style·CSS 변수 → Tailwind 토큰. `--ink-deep`→`text-ink-deep`, `--sage-mist`→`bg-sage-mist`, `--gray-line`→`border-line` 등.
- 진입(항목 5 버튼명 확정): 제출 대기 탭(REVIEWING)의 각 배치 행에 **[제출 정보 보기]** 버튼 → `/admin/facility-bookings/submission/{batchId}/transcribe`. "작성"이 아니라 "보기" — 승인된 예약을 열람·복사하는 화면이라 실제 동작에 맞춘다. 기존 [상세] 링크는 유지(완료/취소 배치용).
- 콕핏 좌우 2열: 좌측 현재 예약 HWP 필드 세로 스택(CopyField), 우측 시설 그룹 사이드바 + 건 리스트 + 진행률. 시설별 그룹은 `groupByFac`(배치의 bookings를 facilityId로 그룹).
- **전사 진행 상태(항목 4 반영): 배치별 키로 `sessionStorage` 유지.** 키 `duing:transcribe:{batchId}` → 작성 완료한 bookingId 집합. 새로고침·실수 이탈 시 진행이 날아가면 처음부터 다시라 담당자 부담이 크다. sessionStorage(localStorage 아님)를 쓰는 이유: 이건 서버의 실제 제출 상태가 아니라 "담당자의 전사 진행 메모"라 탭을 닫으면 정리되는 게 맞다. UI에 "작성 진행은 이 브라우저 탭에서만 임시 저장됩니다" 안내를 둬 서버 상태로 오해하지 않게 한다. 저장 실패(프라이빗 모드)는 조용히 무시하고 메모리 state로 폴백.
- Enter = 작성완료·다음(입력 요소 포커스 시 무시). 이전/다음 버튼. 전체 진행률.
- CopyField: 클릭 시 `navigator.clipboard.writeText(value)` + 1.1초 체크 피드백.
- **복사 3종(항목 3 반영):** (a) 필드별 클릭 복사(CopyField), (b) "한 줄 복사" — HWP_FIELDS를 탭 구분 join(예제 JSX 방식), (c) **"전체 양식 복사"(신규)** — HWP_FIELDS를 `라벨: 값` 여러 줄로 통째 복사해 신청서 한 건을 한 번에 붙여넣는다. hwpFields.ts에 `toTabLine(booking)`·`toFormBlock(booking)` 두 포매터를 두고 순수함수로 테스트.
- **동아리원 명단(ClubRosterAccordion)**: 현재 예약의 `clubId`로 `useAdminClubMembersQuery(clubId)`. 기본 접힘, "동아리원 보기" 토글. 표시 순서 이름·학번·전공(major)·단과대(college 라벨). 행 복사(탭/슬래시 구분) + 전체 명단 복사 버튼. college는 `COLLEGE_DISPLAY_NAME`으로 라벨.
- 클립보드는 jsdom에서 mock 필요 — 테스트는 `navigator.clipboard.writeText` spy.

**Tasks:**
- Task F1: 타입(`AdminClubMember`) + client 메서드 + 훅(`useAdminClubMembersQuery`, queryKey `adminQueryKeys.clubMembers(clubId)`). API 계약 테스트.
- Task F2: `CopyField` 컴포넌트 + 테스트(클릭 시 clipboard 호출·피드백).
- Task F3: `hwpFields.ts`(HWP_FIELDS + `toTabLine`·`toFormBlock`) + `groupByFac` 유틸 + 순수함수 테스트(양식 순서·탭 한 줄·전체 양식 블록·그룹핑).
- Task F4: `ClubRosterAccordion` + 테스트(접힘 기본·펼침·행복사·전체 명단 복사·college 라벨·명단 순서가 LEADER→OFFICER→MEMBER).
- Task F5: `TranscribeCockpitPage` 조립 + 진행/Enter/이전다음 + sessionStorage 유지 + 전체 양식 복사 버튼 + 테스트(작성완료 이동·진행률·sessionStorage 복원·재로드 시 진행 유지).
- Task F6: 제출 대기 탭에 [제출 정보 보기] 진입 버튼(REVIEWING만) + 라우트/loading. 테스트.

**Verification:** `pnpm --filter web exec vitest run test/admin/facility-submission/` 그린, typecheck 0·lint 0, 실브라우저 프리뷰(로컬 BE 없어 캐시 주입 or 프리뷰 라우트)로 콕핏·복사·명단 QA 후 프리뷰 정리.

---

## Self-Review

- **Spec coverage:** 1→PR-F, 2→PR-C+E, 3→PR-B+D, 4→PR-D, 5→PR-A+F. 5개 항목 전부 태스크 대응. "버튼 간격"→E3, "복사 UX(행/전체)"→F4, "동아리원 순서 이름·학번·전공·단과대"→F4.
- **의존성 일관:** A→F, B→D, C→E. BE 셋 병렬, FE는 각 BE 머지 후.
- **정책 변경 명시:** 사용 인원 필수화는 스펙 개정 포함(B3), 사용자 승인됨.
- **타입 일관:** `AdminClubMember`(F1)·`AdminClubMemberResponse`(A2) 필드명 일치(memberId·name·studentId·major·college·grade·role). `SubmissionBatchStatusFilter` ARCHIVED가 BE(C)·FE(E) 양쪽.
- **회귀 방지:** 리더용 `ClubMemberResponse` 무변경(A), 기존 상세 페이지 유지(F), REVIEWING 단일 필터 불변(C).
