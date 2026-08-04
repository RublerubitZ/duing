# 지원현황 아카이브·모집 마감 읽기 전용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/superpowers/specs/2026-08-04-applicants-archive-closed-readonly-design.md` 구현 — 클럽 단위 지원현황 진입(`/manage/clubs/[clubId]/applicants`)·모집 전환 드롭다운·CLOSED 읽기 전용(BE 가드 4곳 + FE 표면)·closedAt 정렬.

**Architecture:** PR-A(백엔드: 가드 4곳 + 409 `RECRUITMENT_CLOSED` 계약 + closedAt 노출)와 PR-B(프론트: 진입 라우트·드롭다운·읽기 전용 표면·정렬·실패 토스트) 2트랙. 배포 순서 무관(스펙 §8 양방향 안전) — BE 가드가 진짜 방어선, FE 는 표면.

**Tech Stack:** Spring Boot 3.4 / Java 21 (마이그레이션 없음), Next.js 15 / React 19 / TanStack Query / shadcn dropdown-menu

## Global Constraints

- 스펙이 유일 기준. **읽기 전용 기준 = raw `recruitment.status === CLOSED`** (displayStatus 아님 — 마감일 경과·심사 중 모집은 전 기능 유지). "진행 중" = `status === 'OPEN' && applicationMode === 'SELF'`.
- **API 계약**: 409 Conflict + code **`RECRUITMENT_CLOSED`** (두 예외 공통, 기존 `ApplicationException` 의 `code` 필드 + `ApiResponse.error(message, code)` 인프라 — 신규 응답 스키마 금지).
- **fail-open 기준 (스펙 §6 확정 문구)**: API 응답을 아직 받지 못한 경우에만 fail-open, `Recruitment.status` 확인 즉시 읽기 전용 적용.
- 조회(목록·상세·이웃·통계)는 CLOSED 에서도 현행 유지 — 가드 추가 금지. 지원자 대면 문구에 '보류' 노출 금지.
- 구현 서브에이전트 **push·PR 생성 금지**. 커밋 Conventional+한국어, Co-Authored-By/Generated 금지. BE: `@DisplayName` 요구사항 문장·상대 날짜·변수명 축약 금지. FE: `any`/`as` 금지·`type` 만·'use client' 최소화. gradle 은 backend/, pnpm 은 frontend/ cwd, `| tail` 로 exit code 가림 금지.
- 리뷰 게이트(오케스트레이터): Task 마다 spec+quality 리뷰(fable), BE Task 는 duing-code-reviewer 추가, 권한·가드 Task(1)는 적대적 리뷰 추가.

## PR 구조

- **PR-A**: 브랜치 `feat/closed-recruitment-readonly` — `docs/applicants-archive-spec` 에서 분기(스펙·플랜 커밋 포함). Task 1~2. PR 제목: `feat(backend): 마감 모집 읽기 전용 가드·마감 시각 노출`
- **PR-B**: 브랜치 `feat/applicants-archive-entry-web` — PR-A 브랜치에 스택. Task 3~6. PR 제목: `feat(frontend): 지원현황 진입 개편 — 클럽 단위 진입·모집 전환·마감 아카이브`
- 머지: PR-A squash(브랜치 삭제 없이) → PR-B base 재지정·rebase (스택 PR 전례 준수).

---

### Task 1: BE 읽기 전용 가드 5곳 + 409 계약

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java` — 신규 inner 예외 + **베이스에 `(message, HttpStatus, String)` 패스스루 ctor 추가** (현재 2-arg 만 — RecruitmentException.java:8-10)
- Modify: `backend/src/main/java/com/duing/domain/application/exception/ApplicationDomainException.java` — 신규 inner 예외 + **동일하게 3-arg 패스스루 ctor 추가** (현재 2-arg 만 — ApplicationDomainException.java:8-10, 문서 리뷰 확인)
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` — `updateStatus`(requireManager 직후, :349-352 부근)·`withdraw`(기존 상태 가드 앞, :264-267 부근 — recruitment lazy 로드 1회 발생·무해)
- Modify: `backend/src/main/java/com/duing/domain/applicationEvaluation/service/GeneralApplicationEvaluationService.java` — **upsert(:29-33 부근)와 `deleteMine`(:48-55 부근) 두 곳** (deleteMine 은 문서 리뷰가 발견한 UI 도달 가능 파괴적 쓰기 — 스펙 §1-3 차단 표 편입)
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewRoundService.java` — `createRound` 의 recruitment 검증 지점(:95-98 부근)
- Test: `application/service/GeneralApplicationServiceTest`·`ApplicationBulkStatusServiceTest`·`LeaderApplicationEvaluationControllerTest`(upsert·deleteMine 양쪽)·`interview/controller/LeaderInterviewRoundCreateControllerTest`

**Interfaces:**
- Produces: 409 + code `RECRUITMENT_CLOSED` 계약 (Task 6 의 FE 토스트 분기가 소비), 예외 2종.

- [ ] **Step 1: 실패 테스트 작성** — 가드 5곳 각각: CLOSED 모집에서 409 (+ 응답 code `RECRUITMENT_CLOSED` — 컨트롤러 경유 테스트 최소 1건에서 body 단언), OPEN(마감일 경과 포함 — endDate 를 과거 상대 날짜로) 정상 동작, CLOSED 에서 조회·통계 정상. 벌크는 CLOSED 모집 건이 `failures[]` 로 떨어지는 부분 실패 케이스.

```java
@Test
@DisplayName("마감된 모집의 지원서는 상태를 변경할 수 없고 409 로 거절된다")
void closedRecruitmentRejectsStatusUpdate() {
    // recruitment.close(now) 처리된 픽스처 → updateStatus 호출
    assertThatThrownBy(() -> applicationService.updateStatus(command))
        .isInstanceOf(RecruitmentException.ClosedRecruitmentReadOnlyException.class);
}
```

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew test --tests '*GeneralApplicationServiceTest*'` FAIL (예외 심볼 부재 컴파일 실패 포함)
- [ ] **Step 3: 예외 2종 구현**

```java
// RecruitmentException.java — 베이스에 code 패스스루가 없으면 protected RecruitmentException(String, HttpStatus, String) 추가
public static class ClosedRecruitmentReadOnlyException extends RecruitmentException {
    public ClosedRecruitmentReadOnlyException() {
        super("마감된 모집은 조회만 가능합니다.", HttpStatus.CONFLICT, "RECRUITMENT_CLOSED");
    }
}

// ApplicationDomainException.java
public static class CannotWithdrawClosedRecruitmentException extends ApplicationDomainException {
    public CannotWithdrawClosedRecruitmentException() {
        super("마감된 모집의 지원은 철회할 수 없어요.", HttpStatus.CONFLICT, "RECRUITMENT_CLOSED");
    }
}
```

- [ ] **Step 4: 가드 5곳 삽입**:

```java
// ① updateStatus — clubAuthService.requireManager(...) 직후
// ② evaluation upsert — application→recruitment 로드 직후 (운영진 권한 확인 뒤)
// ③ evaluation deleteMine — 동일 지점
// ④ createRound — recruitment 존재·소속 검증 지점
if (recruitment.getStatus() == RecruitmentStatus.CLOSED) {
    throw new RecruitmentException.ClosedRecruitmentReadOnlyException();
}

// ⑤ withdraw — 기존 상태(SUBMITTED·ON_HOLD) 가드보다 앞 (마감이 상태보다 우선 안내, lazy SELECT 1회 무해)
if (application.getRecruitment().getStatus() == RecruitmentStatus.CLOSED) {
    throw new ApplicationDomainException.CannotWithdrawClosedRecruitmentException();
}
```

- [ ] **Step 5: 쓰기 경로 전수 확인 (스펙 §4 의무)** — leader/지원자 API 중 지원서·평가·면접 라운드 생성에 도달하는 쓰기 엔드포인트를 grep 으로 전수 나열하고, 위 5곳 밖의 경로 중 **스펙이 Out of Scope 로 명명한 것**(면접 라운드 내부 쓰기, 지원자 면접 가능시간 제출 `PUT /applications/{id}/interview-availability`)을 리포트에 대조 기록. 명명되지 않은 신규 경로가 나오면 BLOCKED 로 보고. `updateStatus` 벌크 경유 자동 커버 확인.
- [ ] **Step 6: `cd backend && ./gradlew test` 전체 그린 확인**
- [ ] **Step 7: Commit** — `feat(backend): 마감 모집 읽기 전용 가드 — 상태 변경·평가·라운드 생성·철회 차단`

### Task 2: closedAt 응답 노출

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentSummaryQuery.java` + 대응 `RecruitmentSummaryResponse` — `closedAt`(nullable) **마지막 필드로 추가만**
- Test: 모집 목록 응답 테스트 (closedAt null·값 케이스)

**Interfaces:**
- Produces: `GET /clubs/{clubId}/recruitments` 응답에 `closedAt: string | null` (ISO datetime) — Task 3 이 소비. 기존 14필드 순서 불변.

- [ ] **Step 1: 실패 테스트** — CLOSED 모집(close 처리)의 목록 응답에 closedAt 존재, 레거시 케이스(closedAt null 직접 세팅)는 null 반환
- [ ] **Step 2: 구현** — Query·Response record 마지막에 필드 추가. **positional record 다계층 동기화 함정 주의**: Query 생성 지점 전수를 컴파일 에러로 잡되, 리포지토리 프로젝션(QueryDSL constructor projection 이면 컴파일로 안 잡힘)을 grep 으로 재확인.
- [ ] **Step 3: `./gradlew test` 그린 → Commit** — `feat(backend): 모집 요약 응답에 마감 시각 노출 — 아카이브 정렬 데이터`

---

### Task 3: FE 기반 — closedAt 타입·정렬 유틸·지난 모집 표 링크

**Files:**
- Modify: `frontend/packages/types/src/recruitment.ts` — `RecruitmentSummary` 에 `closedAt: string | null` 추가
- Modify: `frontend/packages/api/src/generated/schema.d.ts` — BE 로컬 기동 가능하면 `pnpm gen:api`, 불가하면 closedAt 1필드 수동 동기화 + 커밋 본문에 재생성 필요 명시 (전례 준수)
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/_lib/sortPastRecruitments.ts` (3개 라우트 소비 — 라우트 상위 승격, 문서 리뷰 반영)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/PastRecruitmentsTable.tsx` — "지원자" 링크 추가(자체 폼 행만)·정렬 적용·마감일 표기(closedAt 있으면 KST 시각, 없으면 기존 표기)
- Test: 정렬 유틸 단위 테스트, `apps/web/test/manage/recruitments/PastRecruitmentsTable.test.tsx`

**Interfaces:**
- Produces: `sortPastRecruitments(recruitments: RecruitmentSummary[]): RecruitmentSummary[]` — Task 4·5 가 소비.

- [ ] **Step 1: 정렬 유틸 실패 테스트** — 스펙 §5 종료 시점 키: 기간 모집 `min(closedAt 날짜부, endDate)` (lazy-close 스큐·조기 마감 양방향 케이스), 상시모집 closedAt, 레거시(둘 다 null) startDate 폴백, 원본 불변(사본 정렬)

```ts
// 종료 시점 키 (스펙 §5): closedAt 은 스탬프 시점이라 lazy-close 스큐가 있다 —
// 기간 모집은 min(closedAt 날짜부, endDate), 상시모집은 closedAt, 레거시는 startDate.
export function recruitmentClosedSortKey(recruitment: RecruitmentSummary): string {
  const closedDate = recruitment.closedAt?.slice(0, 10) ?? null; // KST 벽시계 문자열 — Date 파싱 금지
  if (recruitment.endDate !== null) {
    if (closedDate !== null && closedDate < recruitment.endDate) return closedDate; // 조기 마감
    return recruitment.endDate;
  }
  return closedDate ?? recruitment.startDate;
}

export function sortPastRecruitments(recruitments: RecruitmentSummary[]): RecruitmentSummary[] {
  return [...recruitments].sort((a, b) =>
    recruitmentClosedSortKey(a) < recruitmentClosedSortKey(b) ? 1 : -1,
  );
}
```
(마감일 표기도 같은 키를 날짜로 표기 — `recruitmentClosedSortKey` 재사용, 시각 불요.)

- [ ] **Step 2: 타입·schema·표 구현 → 영역 테스트 그린** (`pnpm vitest run apps/web/test/manage/recruitments/`)
- [ ] **Step 3: Commit** — `feat(frontend): 지난 모집 정렬·지원자 링크 — 마감 시각 기반 아카이브 순서`

### Task 4: 진입 라우트 + ManageNav 활성화

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/applicants/page.tsx`
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx` — '지원자' 메뉴: 모집 컨텍스트 있으면 현행 유지, 없으면 비활성 대신 진입 라우트 링크 (EXTERNAL 힌트 분기 유지). **active 판정도 갱신** — 현재 모집 스코프 경로 기준(:84 부근)이라 진입 라우트(`…/clubs/{clubId}/applicants`)에서도 '지원자' 가 active 로 표시되게 경로 매칭 확장 (문서 리뷰 반영)
- Test: `apps/web/test/manage/applicants-entry/` 신규 + ManageNav 테스트 갱신

**Interfaces:**
- Consumes: `useClubRecruitmentsQuery`, `sortPastRecruitments`(Task 3).

- [ ] **Step 1: 실패 테스트** — ① OPEN·SELF 존재 → 최신 모집 지원현황으로 replace ② 진행 중 없음 → Empty State("현재 진행 중인 모집이 없습니다" + CTA "새 모집 등록" → `…/recruitments/new`) + 지난 모집 목록(정렬·지원자 링크) ③ OPEN 이 EXTERNAL 뿐 → 전용 문구 + CTA "모집 관리로 이동" → `…/recruitments` ④ 로딩 중 LoadingGate ⑤ **쿼리 에러 → 에러 안내+재시도 렌더** (일반 Empty State 로 떨어뜨리지 않음 — 스펙 §2-4)
- [ ] **Step 2: 구현** — client component:

```tsx
'use client';
// 진입 페이지는 자체 화면이 아니라 라우터다 — OPEN(자체 폼) 최신으로 replace, 없을 때만 Empty+아카이브 렌더 (스펙 §2)
const { data: recruitmentList, isPending } = useClubRecruitmentsQuery(clubId);
const activeSelfRecruitments = (recruitmentList ?? []).filter(
  (recruitment) => recruitment.status === 'OPEN' && recruitment.applicationMode === 'SELF',
);
useEffect(() => {
  const target = activeSelfRecruitments[0]; // BE 정렬이 OPEN 우선·startDate desc — 첫 항목이 최신
  if (target) router.replace(toRoute(`/manage/clubs/${clubId}/recruitments/${target.id}/applicants`));
}, [...]);
if (isPending || activeSelfRecruitments.length > 0) return <LoadingGate />;
const hasExternalOpenOnly = (recruitmentList ?? []).some(
  (recruitment) => recruitment.status === 'OPEN' && recruitment.applicationMode === 'EXTERNAL',
);
// CTA 분기(스펙 §2 확정): hasExternalOpenOnly ? "모집 관리로 이동" → …/recruitments : "새 모집 등록" → …/recruitments/new
// 아래에 지난 모집 목록: sortPastRecruitments(자체 폼 && status==='CLOSED') — 제목·기간·마감일·"지원자 보기" 링크
```
(모집 등록 라우트가 `…/recruitments/new` 가 아니면 실제 라우트로 — 구현 시 확인. Empty State 스타일은 기존 RecruitmentEmptyState 패턴 참고.)

- [ ] **Step 3: 영역 테스트 그린 → Commit** — `feat(frontend): 지원현황 클럽 단위 진입 — 자동 이동·Empty State·아카이브 목록`

### Task 5: 모집 전환 드롭다운

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/RecruitmentSwitcher.tsx`
- Modify: 같은 디렉터리 `page.tsx` (헤더에 스위처 배치 — clubId·recruitmentId props)
- Test: `apps/web/test/manage/applicants/recruitment-switcher.test.tsx`

**Interfaces:**
- Consumes: `useClubRecruitmentsQuery`, `sortPastRecruitments`. shadcn `@/components/ui/dropdown-menu` 재사용.

- [ ] **Step 1: 실패 테스트** — 2그룹 렌더(진행 중 = OPEN·SELF / 지난 모집 = CLOSED·SELF 정렬 + '마감' 뱃지), 현재 모집 표시, 외부 폼 모집 미노출, 항목 선택 시 해당 모집 지원현황 라우트 이동, 목록 로딩·실패 시 스위처 자체를 숨김(fail-open — 기존 화면 기능 유지)
- [ ] **Step 2: 구현** — 트리거는 현재 모집 제목 + chevron. 그룹 라벨 "진행 중"/"지난 모집". 이동은 `next/link` 또는 router push(탭 내비 VT 제외 전례 — next/link 기본).
- [ ] **Step 3: 영역 테스트 그린 → Commit** — `feat(frontend): 지원현황 모집 전환 드롭다운 — 진행 중·지난 모집 그룹`

### Task 6: 읽기 전용 표면 + 실패 토스트 + 전역 게이트

**Files:**
- Modify: `applicants/page.tsx` — CLOSED 배너("마감된 모집 — 조회 전용입니다.")·체크박스 숨김(→ BulkActionBar 자연 미노출)
- Modify: `applicants/[applicationId]/_components/ApplicantDetailPage.tsx`·`StatusActionBar.tsx` — CLOSED 면 StatusActionBar 대신 읽기 전용 안내("마감된 모집은 상태를 변경할 수 없습니다"), `EvaluationPanel` 입력 비활성+동일 안내, **`MyEvaluationCard` 평가 삭제 버튼 숨김** (스펙 §1-3 차단 표 — BE 가드 ③ 대응 표면)
- Modify: `StatusActionBar.tsx` — 단건 상태 변경 mutation `onError` 토스트: code `RECRUITMENT_CLOSED` 면 "마감된 모집은 조회만 가능합니다", 그 외 실패도 일반 실패 토스트 (조용한 실패 기존 결함 해소). packages/api 에러 정규화가 `code` 를 노출하는지 확인, 없으면 노출 추가(FE 내부 변경만)
- Test: applicants 관련 기존 테스트 + 신규 (읽기 전용 게이트·fail-open·토스트)

**Interfaces:**
- Consumes: Task 1 의 409 `RECRUITMENT_CLOSED` 계약, 각 페이지 기보유 `useRecruitmentDetailQuery`.

- [ ] **Step 1: 실패 테스트** — ① status CLOSED → 배너·체크박스 부재·StatusActionBar 안내 대체·EvaluationPanel 비활성 ② **fail-open (스펙 §6 확정 문구 기준)**: status 미확인(로딩·에러)이면 액션 노출 유지, status 확인 즉시 정책 적용 ③ OPEN(마감일 경과) → 전 기능 유지 ④ 단건 상태 변경 실패 시 토스트(RECRUITMENT_CLOSED 분기 + 일반 실패)
- [ ] **Step 2: 구현** — 게이트 조건은 `recruitmentDetail?.status === 'CLOSED'` 단일식(파생 분기 금지 — not-CLOSED 로 숨기는 역전 금지). 조회·필터·검색·통계 링크·면접 카드 링크는 유지.
- [ ] **Step 3: 전역 게이트** — `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] **Step 4: Commit** — `feat(frontend): 마감 모집 읽기 전용 표면 — 배너·액션 차단·실패 토스트`

---

## 최종 검증 체크리스트 (PR 전, 오케스트레이터)

- [ ] 스펙 §1-3 차단 표 5행 전부에 BE 테스트 존재, 조회 경로 무가드 확인
- [ ] 409 code `RECRUITMENT_CLOSED` 가 BE 응답·FE 분기 양쪽에서 동일 문자열
- [ ] fail-open 동작이 스펙 §6 확정 문구와 일치 (로딩 = 노출 유지, 확인 즉시 적용)
- [ ] CTA 분기 2종(§2)·외부 폼 제외, 그리고 **표면별 "지난 모집" 기준이 스펙 §3 명시와 일치** (표=displayStatus·심사 중 행 링크는 전 기능 / 진입·스위처=raw CLOSED)
- [ ] 실브라우저 QA 1회 (진입 자동 이동·전환·CLOSED 표면·철회 차단) — 기존 QA 셋업 재사용
- [ ] PR 본문: 쓰기 경로 전수 grep 결과·Out of Scope(§9) 명시
