# 학교 제출(Submission Batch) PR-4b 프론트 구현 계획 — 제출 목록 탭 + Batch 상세

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제출 목록 탭(Batch 페이지네이션 테이블·배지 3종·행 액션)과 Batch 상세 화면(운영 기록·Audit·완료/취소/CSV)을 구현해 학교 제출 시리즈 FE 를 완결한다.

**Architecture:** 도메인·API 무변경 — BE 구현 완료분(§5.3/5.4/5.6/5.7)의 FE 소비 계층 신설. 계약 레이어(types→client→hooks) → 파생 lib(배지 3종=completed/cancelled 상호 배타 파생) → 탭·상세 UI. 상세는 스펙 §7.3 명시대로 **별도 라우트** `submission/[batchId]`(동적 라우트 — `loading.tsx` 필수, VT 커밋 지연 함정). 완료 처리는 확인 Dialog → 스킵 0=토스트 / 스킵 있음=결과 Dialog 분기.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Tailwind, vitest+RTL. 재사용: `Pagination`(`@/components/Pagination`), `downloadBlobFile`(`@/app/_lib/downloadFile`), `SubmissionTimetable`·`SubmissionDetailSheet`·`submissionGroups.ts`·`submissionTimetable.ts`(무수정), `Dialog` 계열(BatchCreateDialog 전례).

**브랜치:** `feat/facility-submission-batches-fe` (PR-4a `feat/facility-submission-unified-fe` HEAD 35effaeb 에서 분기 — 스택 PR. PR-4a #686 머지 전 base 는 PR-4a 브랜치, 머지 후 develop 으로 재지정+rebase — 스택 머지 절차는 원장 관례를 따른다)

---

## 스펙 대비 결정 사항 (계획 서두 명시)

1. **상세 = 별도 라우트** `/admin/facility-bookings/submission/[batchId]` — 스펙 §7.3 이 경로를 명시. PR-4a 의 `submission/page.tsx`(redirect 스텁)와 네임스페이스 충돌 없음(최종 리뷰 확인). 상세의 "목록으로" 링크는 `/admin/facility-bookings?tab=batches`.
2. **완료 처리 버튼 라벨 = `제출 완료`** — 준비 탭 Dialog 본문("'제출 목록' 탭에서 '제출 완료' 처리를 해주세요")과 일치(사용자 문구 정정 91f861a2 연동). 스펙 §7.3 의 "학교 제출 완료 처리"는 행위 서술이지 라벨이 아니다.
3. **취소 확인 Dialog 문구는 스펙 미규정 — 이 계획이 제안(사용자 계획 검토에서 확정):** 제목 `제출 목록을 취소할까요?`, 본문 `취소하면 담긴 예약이 다시 '학교에 제출할 예약'으로 돌아가요. 이 작업은 되돌릴 수 없어요.`, 확인 버튼 `제출 목록 취소`, 성공 토스트 `제출 목록이 취소되었어요.`
4. **CSV 파일명** — 목록/상세 응답에 파일명이 없으므로 BE 생성 규칙과 동일하게 FE 파생: `facility-submission-{submissionNo}.csv`(BE `FacilitySubmissionBatch` 가 `"facility-submission-" + submissionNo + ".csv"` 로 저장).
5. **목록 페이지 크기 10, facilityId 필터 UI 없음** — BE 는 facilityId 쿼리를 지원하나 v3 운영 흐름(월 1~2회·소량)에서 필터 수요 미확인. YAGNI — Out of Scope 에 명시.
6. **Audit 표시 항목** — 스펙 §7.3: action·관리자(탈퇴 시 null)·시각·detail. **IP 는 표시하지 않는다**(응답에 있지만 §7.3 표시 목록에 없음 — 감사 데이터는 백오피스 조회용).

## Global Constraints

- 커밋: Conventional Commits 한국어(`feat(frontend): ...`), Co-Authored-By/🤖 라인 금지. **push·PR 생성 금지**
- `any`·`as` 금지(관용 예외: `as const` 튜플·`(X as readonly string[]).includes` 내로잉 가드), `type` 전용, TanStack Query 내부 모킹 금지 — 훅 모듈 모킹(`vi.mock('@duing/hooks')`) 관례
- 기존 컴포넌트 무수정 재사용 기본: `SubmissionTimetable`·`submissionGroups.ts`·`submissionTimetable.ts`·`Pagination`·`downloadBlobFile`. **예외 1건(계획 명시): `SubmissionDetailSheet` 에 취소 예약 취소선 라벨(PR-2 이월) 최소 diff 허용**
- 문구(스펙 §7.3 원문 — 바이트 단위):
  - 배지 3종: `검토 중` / `제출 완료` / `취소됨`
  - 완료 확인 Dialog: 제목 `학교 제출을 완료하시겠습니까?` + 안내 3줄 `• 제출 가능한 예약은 학교 등록 완료 상태로 변경됩니다.` `• 이미 취소되었거나 상태가 변경된 예약은 자동으로 제외됩니다.` `• 완료된 제출 목록은 다시 취소할 수 없습니다.` + 확인 버튼 `제출 완료`
  - 완료 결과: 스킵 0건 → 토스트 `학교 제출이 완료되었습니다.` / 스킵 있음 → 결과 Dialog `학교 제출이 완료되었습니다. 총 {total}건 중 {confirmed}건이 학교 등록 완료되었습니다. {skipped}건은 상태가 변경되어 이번 제출에서 제외되었습니다.` + 제외 목록(예약일·동아리·**응답의 reason 라벨 그대로 — FE 재매핑 금지**)
  - 취소 Dialog: 결정 사항 3 의 제안 문구
- 신규 동적 라우트 `[batchId]` 에 **`loading.tsx` 필수**(VT "Transition was aborted" 근본 원인 — 동적 라우트 loading 부재)
- 테스트는 상대 날짜 금지 대상 아님(표시 데이터 절대 날짜는 무해 — now 비교 단언만 금지), 훅 모듈 모킹, 기존 테스트 위치 `apps/web/test/admin/facility-submission/`·`packages/api/test/`
- 검증은 `frontend/` cwd, `| tail` 금지(exit code 직접 확인)

---

## File Structure

```
packages/types/src/facilitySubmission.ts          [수정] Batch 목록/상세/완료 타입 추가
packages/api/src/client.ts                        [수정] facilitySubmission.list/detail/complete/cancel
packages/api/test/facilitySubmission.test.ts      [신설] 엔드포인트 계약 테스트
packages/hooks/src/facilitySubmissionAdmin.ts     [수정] 쿼리/뮤테이션 훅 4종
packages/hooks/src/adminQueryKeys.ts              [수정] batches/batchDetail 키
apps/web/app/admin/facility-bookings/
├ _pages/AdminFacilityBookingsPage.tsx            [수정] batches placeholder → SubmissionBatchesTab
├ _tabs/SubmissionBatchesTab.tsx                  [신설] 목록 테이블·배지·행 액션
└ submission/
  ├ _lib/submissionBatches.ts                     [신설] 배지 파생·라벨·CSV 파일명
  ├ _components/BatchCompleteDialog.tsx           [신설] 완료 확인(안내 3줄)
  ├ _components/BatchCompleteResultDialog.tsx     [신설] 스킵 결과 분기
  ├ _components/BatchCancelDialog.tsx             [신설] 취소 확인
  ├ _components/SubmissionAuditHistory.tsx        [신설] Audit 타임라인
  ├ _components/SubmissionDetailSheet.tsx         [수정·최소] 취소 예약 취소선(이월)
  └ [batchId]/
    ├ page.tsx                                    [신설] 서버 파라미터 파싱
    ├ loading.tsx                                 [신설] 동적 라우트 로딩(필수)
    └ _pages/SubmissionBatchDetailPage.tsx        [신설] 상세 조립
apps/web/test/admin/facility-submission/
├ submission-batches-tab.test.tsx                 [신설]
├ submission-batch-detail.test.tsx                [신설]
└ submission-batches-lib.test.ts                  [신설]
```

---

### Task 1: 계약 레이어 — 타입·클라이언트·훅

**Files:**
- Modify: `frontend/packages/types/src/facilitySubmission.ts`
- Modify: `frontend/packages/api/src/client.ts` (facilitySubmission 블록 — 선언부 ~634행·구현부 ~1576행 양쪽)
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts`, `frontend/packages/hooks/src/facilitySubmissionAdmin.ts`
- Test: `frontend/packages/api/test/facilitySubmission.test.ts` (신설 — `interviewRound.test.ts` 의 msw/모킹 관례를 열어 그대로 따른다)

**Interfaces (Produces — 이후 태스크가 소비하는 계약):**

```ts
// types — BE 응답 record 와 1:1 (SubmissionBatchSummaryResponse / SubmissionBatchDetailResponse / CompleteSubmissionBatchResponse)
export type SubmissionBatchSummary = {
  batchId: number;
  submissionNo: string;
  facilityId: number;
  facilityName: string | null;
  bookingCount: number;
  submittedAt: string;            // 생성 시각(LocalDateTime ISO)
  submittedByName: string | null; // 탈퇴 관리자 null
  memo: string | null;
  cancelled: boolean;
  cancelledAt: string | null;
  completed: boolean;
  completedAt: string | null;
};

export type SubmissionBatchListParams = { page: number; size: number };

export type SubmissionAuditEntry = {
  action: 'CREATED' | 'CANCELLED' | 'CSV_DOWNLOADED' | 'VIEWED' | 'COMPLETED';
  adminName: string | null; // 탈퇴 관리자 null — 렌더 계약 테스트 필수(이월)
  createdAt: string;        // BE 가 KST 환산 완료(Asia/Seoul) — FE 는 표시만
  ipAddress: string | null;
  detail: string | null;    // COMPLETED 행 = 사람이 읽는 요약 그대로 노출
};

export type SubmissionBatchDetail = {
  batch: SubmissionBatchSummary;
  bookings: SubmissionCandidateBooking[]; // 후보 조회와 동일 Booking 스키마(BE 공유 record)
  audits: SubmissionAuditEntry[];
};

export type SkippedSubmissionBooking = {
  bookingId: number;
  status: SubmissionBookingStatus;
  reason: string; // BE Formatter 한글 라벨 그대로 — FE 재매핑 금지
};

export type CompleteSubmissionBatchResult = {
  totalCount: number;
  confirmedCount: number;
  skippedCount: number;
  completedAt: string;
  skippedBookings: SkippedSubmissionBooking[];
};
```

```ts
// client.admin.facilitySubmission — 기존 3종 옆에 추가 (경로 리터럴 vs {batchId} 템플릿 구분 정확히)
// GET  .../submission?page=&size=            → ApiResponse<PageResponse<SubmissionBatchSummary>>
list(params: SubmissionBatchListParams): Promise<PageResponse<SubmissionBatchSummary>>;
// GET  .../submission/{batchId}              → {batch, bookings[], audits[]} (audit VIEWED 는 BE 부수효과)
detail(batchId: number): Promise<SubmissionBatchDetail>;
// POST .../submission/{batchId}/complete     → 200 CompleteSubmissionBatchResult (404/기취소·기완료 409)
complete(batchId: number): Promise<CompleteSubmissionBatchResult>;
// DELETE .../submission/{batchId}            → 204 (404/기취소·기완료 409)
cancel(batchId: number): Promise<void>;
```

```ts
// adminQueryKeys 추가
facilitySubmissionBatches: (params: SubmissionBatchListParams) =>
  [...adminQueryKeys.facilitySubmissionAll, 'batches', params] as const,
facilitySubmissionBatchDetail: (batchId: number) =>
  [...adminQueryKeys.facilitySubmissionAll, 'batch-detail', batchId] as const,
```

```ts
// hooks — 기존 파일 스타일(useSubmissionInvalidation 재사용) 그대로
export function useSubmissionBatchesQuery(params: SubmissionBatchListParams) { /* useQuery + list */ }
export function useSubmissionBatchDetailQuery(batchId: number) { /* useQuery + detail */ }
export function useCompleteSubmissionBatchMutation() { /* useMutation + complete, onSettled: 기존 useSubmissionInvalidation — facilitySubmissionAll prefix 라 batches/detail/candidates 전부 커버 */ }
export function useCancelSubmissionBatchMutation() { /* useMutation + cancel, onSettled 동일 */ }
```

- [ ] **Step 1:** `packages/api/test/facilitySubmission.test.ts` 작성 — `interviewRound.test.ts` 를 열어 요청 캡처 방식(모킹 fetch/ky 훅)을 복제. 케이스 4개: ① `list({page:0,size:10})` 가 `GET admin/facility-bookings/submission?page=0&size=10` 호출+PageResponse 언랩 ② `detail(7)` 이 `GET .../submission/7` ③ `complete(7)` 이 `POST .../submission/7/complete`+응답 언랩 ④ `cancel(7)` 이 `DELETE .../submission/7`(204 본문 없음 처리)
- [ ] **Step 2:** 실행 `pnpm --filter @duing/api test -- facilitySubmission` — FAIL(메서드 부재) 확인
- [ ] **Step 3:** types → client(선언+구현) → adminQueryKeys → hooks 구현. client 구현부는 기존 `candidates`/`downloadCsv` 의 `jsonOk`/에러 정규화 헬퍼 관례 그대로. 204 처리 전례는 기존 `void` 반환 메서드(예: bookings.cancel) 확인
- [ ] **Step 4:** `pnpm --filter @duing/api test -- facilitySubmission` PASS + `pnpm typecheck` GREEN
- [ ] **Step 5:** 커밋 `feat(frontend): 제출 목록 조회·완료·취소 API 계약 레이어`

### Task 2: 배지 파생·표시 lib

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionBatches.ts`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-batches-lib.test.ts`

**Interfaces (Produces):**

```ts
import type { SubmissionAuditEntry, SubmissionBatchSummary } from '@duing/types';

export type SubmissionBatchStatus = 'REVIEWING' | 'COMPLETED' | 'CANCELLED';

/** 배지 3종 파생 — cancelled/completed 는 BE 행잠금으로 상호 배타(§4.2/4.3). 취소가 우선 표기. */
export function deriveBatchStatus(batch: SubmissionBatchSummary): SubmissionBatchStatus {
  if (batch.cancelled) return 'CANCELLED';
  if (batch.completed) return 'COMPLETED';
  return 'REVIEWING';
}

export const BATCH_STATUS_META: Record<SubmissionBatchStatus, { label: string; badgeClass: string }> = {
  REVIEWING: { label: '검토 중', badgeClass: /* 기존 배지 팔레트 — SubmissionSummaryCards/submissionTimetable 의 상태 색 관례를 열어 동일 톤 지정 */ '' },
  COMPLETED: { label: '제출 완료', badgeClass: '' },
  CANCELLED: { label: '취소됨', badgeClass: '' },
};

export const AUDIT_ACTION_LABELS: Record<SubmissionAuditEntry['action'], string> = {
  CREATED: '생성',
  CANCELLED: '취소',
  CSV_DOWNLOADED: 'CSV 다운로드',
  VIEWED: '조회',
  COMPLETED: '학교 제출 완료',
};

/** BE 저장 규칙과 동일(FacilitySubmissionBatch: "facility-submission-" + submissionNo + ".csv"). */
export function submissionCsvFileName(submissionNo: string): string {
  return `facility-submission-${submissionNo}.csv`;
}
```

- [ ] **Step 1:** 유닛 테스트 작성 — ① REVIEWING(둘 다 false) ② COMPLETED ③ CANCELLED ④ cancelled+completed 동시(방어 — 취소 우선) ⑤ 라벨 3종 문구 ⑥ csv 파일명 `facility-submission-SUB-20260720-001.csv`
- [ ] **Step 2:** RED 확인 → 구현 → `pnpm --filter @duing/web test -- submission-batches-lib` PASS + typecheck
- [ ] **Step 3:** 커밋 `feat(frontend): 제출 목록 배지 파생·감사 라벨 lib`

### Task 3: 제출 목록 탭 (테이블·CSV·취소)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/BatchCancelDialog.tsx`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx` (batches placeholder 1줄 → `<SubmissionBatchesTab />`)
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx` (placeholder 단언 교체), `apps/web/test/admin/facility-submission/submission-batches-tab.test.tsx` (신설)

**Interfaces:**
- Consumes: Task 1 훅(`useSubmissionBatchesQuery`·`useCancelSubmissionBatchMutation`·`useDownloadSubmissionCsvMutation`), Task 2 lib, `Pagination`(`{page,totalPages,onChange}`), `downloadBlobFile`
- Produces: `SubmissionBatchesTab`(props 없음), `BatchCancelDialog { batch: SubmissionBatchSummary | null; isPending: boolean; onConfirm: () => void; onClose: () => void }`

**핵심 구현 규칙:**
- 테이블 컬럼: 제출번호·시설(`facilityName ?? '시설 {facilityId}'` — `submissionSections` 폴백 원칙과 동일)·예약 건수·생성일(`submittedAt.slice(0,10)`)·생성자(`submittedByName ?? '-'`)·메모(빈 값 `-`·truncate)·상태 배지·액션
- 행 액션: `제출 완료`(REVIEWING 만 — Task 4 에서 연결, 이 태스크에서는 자리만·`{/* Task 4 */}` no-op)·`CSV`(전 상태 — 완료/취소 Batch 도 허용, §5.5)·`상세`(`next/link` → `/admin/facility-bookings/submission/${batchId}`)·`취소`(REVIEWING 만)
- CSV: `downloadCsv` 뮤테이션 → `downloadBlobFile(submissionCsvFileName(batch.submissionNo), blob)`, 실패 토스트 `CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.`
- 취소: Dialog(결정 사항 3 문구) → `cancel` → 성공 토스트 `제출 목록이 취소되었어요.` → invalidate(훅 onSettled), 실패는 서버 메시지 우선(준비 탭 `submissionErrorMessage` 패턴 복제 — 함수 로컬 정의, 폴백 `제출 목록 취소에 실패했어요. 잠시 후 다시 시도해 주세요.`)
- 빈 목록: `아직 만든 제출 목록이 없어요. '학교 제출 준비' 탭에서 만들 수 있어요.`
- 페이지네이션: `useState(0)` + `Pagination` — `AdminReportsListPage.tsx` 관례 복제, size 10
- 로딩/에러: 기존 탭 관례(`LoadingGate`·에러 문구+재시도)를 `SubmissionPrepareTab` 에서 확인해 동일 적용

- [ ] **Step 1:** 탭 테스트 작성(훅 모듈 모킹) — ① 행 렌더(제출번호·배지 `검토 중`) ② 완료/취소 Batch 배지·액션 비노출(REVIEWING 전용 버튼이 완료 행에 없음) ③ CSV 클릭 → `downloadCsv({batchId})`+`downloadBlobFile` 파일명 단언(모듈 모킹) ④ 취소 플로우: 버튼→Dialog 문구→확인→`cancel` 호출+토스트 ⑤ 빈 목록 문구 ⑥ 페이지 변경 → `useSubmissionBatchesQuery({page:1,size:10})` ⑦ 상세 링크 href
- [ ] **Step 2:** RED → 구현(placeholder 교체 포함) → `pnpm --filter @duing/web test -- submission-batches-tab && pnpm --filter @duing/web test -- admin-bookings-page` PASS + typecheck
- [ ] **Step 3:** 커밋 `feat(frontend): 제출 목록 탭 — 배지·CSV·취소·페이지네이션`

### Task 4: 완료 처리 플로우 (Dialog 2종 + 행 연결)

**Files:**
- Create: `submission/_components/BatchCompleteDialog.tsx`, `submission/_components/BatchCompleteResultDialog.tsx`
- Modify: `_tabs/SubmissionBatchesTab.tsx` (`제출 완료` 액션 연결)
- Test: `submission-batches-tab.test.tsx` 확장

**Interfaces:**
- Consumes: Task 1 `useCompleteSubmissionBatchMutation`(→`CompleteSubmissionBatchResult`), Task 3 탭
- Produces: `BatchCompleteDialog { batch: SubmissionBatchSummary | null; isPending: boolean; onConfirm: () => void; onClose: () => void }`, `BatchCompleteResultDialog { result: CompleteSubmissionBatchResult | null; bookingsById: ReadonlyMap<number, SubmissionCandidateBooking> | null; onClose: () => void }` — bookingsById 는 상세 화면(Task 5)에서만 공급(제외 목록의 예약일·동아리 표기), 목록 탭은 null → bookingId·reason 만 표기

**구현 규칙:**
- 확인 Dialog: Global Constraints 의 §7.3 원문(제목+안내 3줄+확인 버튼 `제출 완료`). 펜딩 중 확인·취소 disabled + `onOpenChange` 가드(BatchCreateDialog 전례 복제)
- 완료 성공: `skippedCount === 0` → 토스트 `학교 제출이 완료되었습니다.` + Dialog 닫기 / `> 0` → 확인 Dialog 닫고 결과 Dialog 오픈(본문 = §7.3 결과 문구 + 제외 목록 `예약 #{bookingId} · {reason}`, bookingsById 있으면 `{reservationDate} {clubName ?? '동아리 ' + clubId} · {reason}`)
- **reason 은 응답 문자열 그대로 출력 — FE 매핑 테이블 금지**(스펙 계약)
- 실패: 서버 메시지 우선 토스트(409 기취소·기완료 메시지 표출), Dialog 유지

- [ ] **Step 1:** 테스트 추가 — ① `제출 완료` 클릭→Dialog 제목·안내 3줄 문구 단언 ② 확인→`complete(batchId)` 호출, 스킵 0 응답→토스트 1회·결과 Dialog 미출현 ③ 스킵 2 응답→결과 Dialog 본문 수치 문구+제외 행 `예약 #123 · 취소됨`(reason 원문) ④ 실패(Error('이미 취소된 제출 목록입니다'))→서버 메시지 토스트+확인 Dialog 유지
- [ ] **Step 2:** RED → 구현 → `pnpm --filter @duing/web test -- submission-batches-tab` PASS + typecheck
- [ ] **Step 3:** 커밋 `feat(frontend): 학교 제출 완료 처리 — 확인·결과 Dialog 분기`

### Task 5: Batch 상세 라우트

**Files:**
- Create: `submission/[batchId]/page.tsx`(서버 — `admin/clubs/[clubId]/member-history/page.tsx` 의 Next15 async params 관례 복제, 숫자 아님 → `notFound()`), `submission/[batchId]/loading.tsx`(**필수** — 기존 동적 라우트 loading 전례 복제), `submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx`, `submission/_components/SubmissionAuditHistory.tsx`
- Modify: `submission/_components/SubmissionDetailSheet.tsx` — **이월 최소 diff**: `status === 'CANCELLED'` 예약의 제목 라벨에 취소선(`line-through`)+`취소됨` 배지
- Test: `submission-batch-detail.test.tsx` (신설)

**Interfaces:**
- Consumes: Task 1 `useSubmissionBatchDetailQuery`·완료/취소/CSV 뮤테이션, Task 2 lib, Task 3/4 Dialog 3종(재사용 — props 계약 동일), `buildClubGroups`(`submissionGroups.ts`), `SubmissionTimetable`, `SubmissionDetailSheet`
- Produces: 상세 화면(후속 없음)

**구현 규칙:**
- 헤더: 제출번호(h2 — h1 은 없음·독립 페이지라 자체 h1 허용이나 기존 상세 페이지 관례를 열어 따름)·상태 배지·시설·포함 예약 수·생성일·생성자(`?? '-'`)·메모. 액션 바: `제출 완료`(REVIEWING)·`CSV`·`제출 목록 취소`(REVIEWING) — Task 3/4 Dialog·핸들러 패턴 재사용(취소 성공 시 목록으로 `router.replace('/admin/facility-bookings?tab=batches')` 가드 라우터)
- 본문: 동아리별 그룹(읽기 전용 — `buildClubGroups` 로 직접 렌더: 체크박스 없이 예약 행 나열, 행 클릭 → `SubmissionDetailSheet`. `SubmissionClubGroupList` 는 선택 UI 결합이라 재사용하지 않음) + `목록|시간표` 토글(시간표는 `SubmissionTimetable` 재사용 — `selection: 빈 Set`, `onToggleSelect: (id) => Sheet 오픈 어댑터`, `onShowDetail: Sheet 오픈`으로 전 블록 읽기 전용화)
- Audit: `SubmissionAuditHistory { audits: SubmissionAuditEntry[] }` — 시각순 목록, `AUDIT_ACTION_LABELS`·`adminName ?? '(탈퇴한 관리자)'`·`createdAt` 표시·`detail` 존재 시 부속 줄(COMPLETED 요약 그대로). IP 미표시(결정 사항 6)
- 완료 결과 Dialog 에 `bookingsById`(detail.bookings 로 Map 구성) 공급 — 제외 목록이 예약일·동아리로 표기
- 404/로딩: 쿼리 에러 시 `제출 목록을 찾을 수 없어요.` + 목록 링크

- [ ] **Step 1:** 테스트 작성 — ① 헤더(제출번호·배지·생성자 null → `-`) ② Audit 행(라벨 한글·adminName null → `(탈퇴한 관리자)`·COMPLETED detail 요약 노출) ③ 읽기 전용 그룹 행 클릭 → Sheet 오픈(취소 예약이면 취소선 라벨) ④ 완료 플로우: 스킵 응답 → 결과 Dialog 제외 목록이 `{예약일} {동아리}` 표기 ⑤ REVIEWING 아닐 때 완료/취소 버튼 비노출 ⑥ CSV 파일명 단언
- [ ] **Step 2:** RED → 구현 → `pnpm --filter @duing/web test -- submission-batch-detail && pnpm --filter @duing/web test -- submission-prepare-tab` PASS + typecheck (Sheet 수정이 준비 탭 테스트를 깨지 않는지 확인)
- [ ] **Step 3:** 커밋 `feat(frontend): 제출 목록 상세 — 운영 기록·Audit·완료/취소 액션`

### Task 6: 게이트 4종 + 실브라우저 QA + self-check

- [ ] **Step 1:** `pnpm lint` / `pnpm typecheck` / `pnpm --filter @duing/web test` / `rm -rf apps/web/.next && NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 pnpm --filter @duing/web build` — 전부 exit 0 직접 확인
- [ ] **Step 2:** 실브라우저 QA(dev :3000, 좀비 정리 절차 준수, dev-qa 임시 페이지 방식 — 종료 후 삭제·git status clean): ① 목록 탭 테이블·배지 3종·페이지네이션 ② 완료 확인 Dialog 문구·스킵 결과 Dialog(스텁 응답) ③ 취소 Dialog ④ 상세(그룹 읽기 전용·시간표·Audit·Sheet 취소선) ⑤ 모바일 375px ⑥ 상세 라우트 loading.tsx 동작. QA 후 dev 서버 종료
- [ ] **Step 3:** self-check 7항목(스펙 §7.3/§9 PR-4 대비 커버리지·문구 바이트·Out of Scope 침범 여부·reason 재매핑 금지 준수·`any`/`as`·훅 모킹 관례·git clean) 표로 리포트

---

## Out of Scope

- 목록 facilityId 필터 UI(BE 지원·수요 미확인 — YAGNI)
- `role=tab` aria-controls/tabpanel 정비(탭 셸 공통 — 별도 후속, ClubFeesPage 패턴)
- 준비 탭 Dialog 본문·실패 유지 테스트 미고정(PR-4a 이월 기록 유지)
- 다중 관리자 감사 이름 테스트(BE 이월), Export 포맷 2호 contentType 이동(포맷 2호 시점)
- PDF Export(§11 Future), 알림 연결(사용자 결정 대기)

## Self-Review 결과 (작성 후 자체 점검)

- 스펙 §7.3 전 요소 → Task 3(테이블·배지·행 액션)·4(완료 UX)·5(상세·Audit) 매핑 확인. §9 PR-4 테스트 항목(배지 3종·안내 3줄·결과 분기·Export·Audit COMPLETED 노출) 전부 테스트 Step 에 존재
- 타입 일관성: `CompleteSubmissionBatchResult`·`SubmissionBatchSummary` 이름을 Task 1 정의 그대로 Task 3~5 에서 사용. Dialog props 시그니처 3곳 동일
- 플레이스홀더 없음 — 문구·파일명·검증 명령 전부 실값. 단 배지 `badgeClass` 는 기존 팔레트 확인 후 지정(Task 2 Step 에 지시 내장 — 색상 하드코딩보다 관례 추종이 정확)
