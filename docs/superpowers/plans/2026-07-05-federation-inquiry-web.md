# 총동연 1:1 문의 프론트 (P1-PR5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 학생 문의 3페이지(/me/inquiries 목록·작성·상세) + MyPage '내 문의' 요약 블록 + admin 문의 처리 2페이지(/admin/inquiries 목록·상세). 스펙 §2·§6의 P1-PR5. 백엔드 API는 PR3(#574)으로 develop에 존재.

**Architecture:** admin/reports가 문의 처리와 1:1 전례(목록 상태 필터 탭 → 상세 → 조건부 액션 → 다이얼로그). 에러 분기는 `ApiError(status, code)` — `error.code === 'INQUIRY_DELETED'`(410)·`error.status === 409` 분기는 signup의 mapSendError 패턴. 알림 딥링크는 기존 notifications 페이지의 `toLinkRoute`가 이미 처리(내부 경로 통과) — 상세 페이지의 404 폴백만 이 PR 몫.

**핵심 UX 계약 (백엔드 PR3 정밀화 반영):**
- **답변 작성 CTA(RECEIVED)**: `PATCH status {IN_PROGRESS, version}` → 성공 시 답변 폼 오픈. **409 시 detail refetch 후 최신 version으로 자동 재시도 1회**(멱등 수렴 — 이미 IN_PROGRESS면 204 no-op), 재차 409면 배너 "문의가 수정되었습니다. 내용을 다시 확인해 주세요."
- **답변 제출 실패(409/410)**: textarea draft 절대 유실 금지 — state 유지 + 배너.
- admin 상세 410: `code==='INQUIRY_DELETED'` → "작성자가 삭제한 문의입니다" + 목록 링크. 학생 상세 404: "문의를 찾을 수 없습니다" + 목록 링크(알림 딥링크 404 폴백).

**주의(공통):** 커밋 `feat(web): ...` Conventional Commits 한국어, AI 서명·push·PR 금지(최종 게이트 후 코디네이터가 수행). pnpm은 frontend/에서, 검증 4종(lint/typecheck/build/test). type만·any/as 금지(toRoute/toLinkRoute 예외)·function 컴포넌트·cn()·서버 상태 React Query만.

---

## File Structure

```
packages/types/src/federationInquiry.ts               [생성] + index.ts 재export
packages/api/src/client.ts                            [수정] federationInquiries + admin.federationInquiries
packages/hooks/src/federationInquiryQueryKeys.ts      [생성]
packages/hooks/src/federationInquiries.ts             [생성] + index.ts export
apps/web/app/me/inquiries/page.tsx                    [생성] → _pages/MyInquiriesPage
apps/web/app/me/inquiries/new/page.tsx                [생성] → _pages/InquiryCreatePage
apps/web/app/me/inquiries/[inquiryId]/page.tsx        [생성] → _pages/InquiryDetailPage
apps/web/app/me/inquiries/_pages/{3개}.tsx            [생성]
apps/web/app/me/inquiries/_lib/inquiryLabels.ts       [생성] 상태 라벨·뱃지 맵(학생/admin 공용 후보)
apps/web/app/me/_pages/MyPage.tsx                     [수정] SECTIONS + 요약 블록
apps/web/app/me/_components/SectionInquiries.tsx      [생성] 프레젠테이셔널
apps/web/app/admin/_lib/adminSections.ts              [수정] '1:1 문의' 항목
apps/web/app/admin/inquiries/{page.tsx, [inquiryId]/page.tsx}  [생성]
apps/web/app/admin/inquiries/_pages/{AdminInquiriesListPage, AdminInquiryDetailPage}.tsx [생성]
apps/web/app/admin/inquiries/_components/AdminInquiryCloseDialog.tsx [생성]
apps/web/test/me/inquiries/{my-inquiries-page, inquiry-create, inquiry-detail}.test.tsx  [생성]
apps/web/test/admin/inquiries/admin-inquiry-detail.test.tsx    [생성]
```

---

### Task 1: 데이터 레이어

- [ ] **Step 1:** `git checkout develop && git pull && git checkout -b feat/federation-inquiry-web`
- [ ] **Step 2: `packages/types/src/federationInquiry.ts`** (+index.ts 재export)

```ts
export type FederationInquiryStatus = 'RECEIVED' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';

export type FederationInquirySummary = {
  id: number;
  title: string;
  status: FederationInquiryStatus;
  createdAt: string;
  answeredAt: string | null;
};

export type FederationInquiryAnswer = {
  content: string;
  answeredAt: string;
  updatedAt: string;
};

export type FederationInquiryDetail = {
  id: number;
  title: string;
  content: string;
  status: FederationInquiryStatus;
  createdAt: string;
  closedReason: string | null;
  answer: FederationInquiryAnswer | null;
};

export type AdminFederationInquirySummary = {
  id: number;
  title: string;
  status: FederationInquiryStatus;
  authorName: string;
  authorStudentId: string;
  createdAt: string;
  answeredAt: string | null;
};

export type AdminFederationInquiryDetail = {
  id: number;
  title: string;
  content: string;
  status: FederationInquiryStatus;
  version: number;
  authorName: string;
  authorStudentId: string;
  createdAt: string;
  answeredAt: string | null;
  closedReason: string | null;
  answer: FederationInquiryAnswer | null;
};

export type CreateFederationInquiryPayload = { title: string; content: string };
export type UpdateFederationInquiryPayload = CreateFederationInquiryPayload;
export type ChangeFederationInquiryStatusPayload = {
  status: FederationInquiryStatus;
  version?: number;
  closedReason?: string;
};
export type AnswerFederationInquiryPayload = { content: string; version?: number };
export type UpdateFederationInquiryAnswerPayload = { content: string };
```

- [ ] **Step 3: client.ts** — 타입 선언+구현 양쪽(학생은 최상위, admin은 admin 안):

```ts
  federationInquiries: {
    create(payload: CreateFederationInquiryPayload): Promise<number>;          // POST federation/inquiries
    listMine(params: { status?: FederationInquiryStatus; page: number; size: number }):
      Promise<PageResponse<FederationInquirySummary>>;                          // GET me/federation-inquiries
    detail(inquiryId: number): Promise<FederationInquiryDetail>;               // GET federation/inquiries/{id}
    update(inquiryId: number, payload: UpdateFederationInquiryPayload): Promise<void>;  // PATCH
    remove(inquiryId: number): Promise<void>;                                  // DELETE
  };
  // admin 안:
    federationInquiries: {
      list(params: { status?: FederationInquiryStatus; keyword?: string; page: number; size: number }):
        Promise<PageResponse<AdminFederationInquirySummary>>;                  // GET admin/federation/inquiries
      detail(inquiryId: number): Promise<AdminFederationInquiryDetail>;
      changeStatus(inquiryId: number, payload: ChangeFederationInquiryStatusPayload): Promise<void>; // PATCH .../status
      answer(inquiryId: number, payload: AnswerFederationInquiryPayload): Promise<number>;           // POST .../answer → 201 id
      updateAnswer(inquiryId: number, payload: UpdateFederationInquiryAnswerPayload): Promise<void>; // PATCH .../answer
    };
```

구현은 cleanParams/jsonOk/jsonVoid 관례 그대로(create·answer=jsonOk<number>, 나머지 쓰기=jsonVoid).

- [ ] **Step 4: hooks** — `federationInquiryQueryKeys`(all/my(filters)/detail(id)/adminList(filters)/adminDetail(id), prefix 'federation-inquiries') + `federationInquiries.ts` 훅 10개:
  - `useMyFederationInquiriesQuery(params, enabled = true)`
  - `useFederationInquiryDetailQuery(inquiryId: number | null)` — enabled 가드 + **`retry: retryUnlessClientError`**(ApiError && status 404/410이면 재시도 안 함 — fee.ts의 retryUnlessNotFound 확장)
  - `useCreateFederationInquiryMutation()` / `useUpdateFederationInquiryMutation()`({inquiryId, payload}) / `useDeleteFederationInquiryMutation()`
  - `useAdminFederationInquiryListQuery(params)` / `useAdminFederationInquiryDetailQuery(inquiryId | null, retry 동일)`
  - `useChangeFederationInquiryStatusMutation()` / `useAnswerFederationInquiryMutation()` / `useUpdateFederationInquiryAnswerMutation()` — 전부 ({inquiryId, payload}) 객체 인자, onSuccess에서 all + adminDetail(inquiryId) invalidate
  - index.ts export
- [ ] **Step 5:** `pnpm typecheck && pnpm lint` → Commit `feat(web): 총동연 문의 타입·API 클라이언트·훅 추가`

---

### Task 2: 학생 3페이지 + MyPage 요약 블록

- [ ] **Step 1: `_lib/inquiryLabels.ts`** (me/inquiries — admin에서도 import 예정이므로 위치는 `app/_lib/federationInquiryLabels.ts`로 승격 배치):

```ts
import type { FederationInquiryStatus } from '@duing/types';

export const INQUIRY_STATUS_LABEL: Record<FederationInquiryStatus, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '답변중',
  ANSWERED: '답변완료',
  CLOSED: '종료',
};

export const INQUIRY_STATUS_BADGE_CLASS: Record<FederationInquiryStatus, string> = {
  RECEIVED: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  ANSWERED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-zinc-100 text-zinc-600',
};
```

- [ ] **Step 2: MyInquiriesPage** (`/me/inquiries`) — 계약: 상태 필터 탭(전체+4상태, 변경 시 page 0), useMyFederationInquiriesQuery, 행(제목·상태 뱃지·작성일·답변일) → Link 상세, 우상단 "새 문의" 버튼(→ /me/inquiries/new), Empty "아직 문의 내역이 없어요" + FAQ 보기 링크(/faq) + 새 문의 CTA, Pagination(@/components), 로딩/에러 인라인. 페이지 골격은 me 하위 기존 페이지(fees 등)의 헤더/컨테이너 클래스 준용.
- [ ] **Step 3: InquiryCreatePage** (`/me/inquiries/new`) — ApplyForm 패턴: title input(maxLength 120)+content textarea(maxLength 2000, rows 10), 클라이언트 필수 검증, 제출 → `mutateAsync` → `router.push(toRoute('/me/inquiries/' + id))` + addToast('문의가 등록되었어요'). catch: `ApiError` → `error.message` 배너(role="alert" bg-coral/5 text-coral — 도배 409는 백엔드 한국어 메시지 그대로 노출). isPending 시 버튼 "등록 중…". 상단 "← 내 문의" 백링크.
- [ ] **Step 4: InquiryDetailPage** (`/me/inquiries/[inquiryId]`) — 계약:
  - useParams → Number, NaN 가드. detailQuery 404/에러 → "문의를 찾을 수 없습니다" + `/me/inquiries` 목록 링크(**알림 딥링크 404 폴백**)
  - 질문 카드: 제목+상태 뱃지+작성일+본문(텍스트 렌더, whitespace-pre-wrap)
  - 답변 카드(answer 존재 시): 작성자 표기 **"총동아리연합회" 고정**, answeredAt, 본문
  - 상태별 안내: RECEIVED → 안내문 "방학 중에는 답변이 지연될 수 있어요" / IN_PROGRESS → "총동연이 답변을 작성 중이라 수정할 수 없어요" / CLOSED && !answer → "답변 없이 종료된 문의입니다. 필요하면 새 문의를 작성해 주세요." + closedReason 노출(있으면 "종료 사유: …")
  - 액션: 수정 버튼(**RECEIVED만 노출**) → 인라인 편집 모드(제목/내용 폼으로 전환, 저장=update mutation→refetch, 취소) — 409 시 배너(상태가 바뀐 것 — refetch 유도). 삭제 버튼(**전 상태 노출**) → ConfirmDialog(title "문의를 삭제할까요?", description "받은 답변도 함께 볼 수 없게 되며 복구할 수 없습니다.") → delete → addToast('문의가 삭제되었어요') + router.replace('/me/inquiries')
- [ ] **Step 5: MyPage 요약 블록** — `SectionId`에 'inquiries', SECTIONS에 `{ id: 'inquiries', label: '내 문의' }`(지난 지원 앞), `useMyFederationInquiriesQuery({ page: 0, size: 3 })`, count는 totalElements. `SectionInquiries`(프레젠테이셔널: `{ inquiries, totalCount }` props — 최근 3건 행(제목·뱃지·날짜, Link 상세), 0건 안내+새 문의 링크, "전체 보기 →" /me/inquiries). SectionApply 스타일 준용.
- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm build`(신규 라우트 타입 생성) → Commit `feat(web): 내 문의 목록·작성·상세 페이지 추가`

---

### Task 3: admin 문의 처리 2페이지

- [ ] **Step 1: adminSections** — FAQ 관리 다음: `{ href: '/admin/inquiries', title: '1:1 문의', description: '학생 비밀문의 답변·상태 관리', group: '커뮤니티 운영' }`
- [ ] **Step 2: AdminInquiriesListPage** — AdminReportsListPage 복제: STATUS_TABS(전체+4상태), keyword draft/확정 검색, **미답변 배지**(접수 탭 라벨 옆 — `useAdminFederationInquiryListQuery({status:'RECEIVED', page:0, size:1})`의 totalElements, 0이면 미표시), 행(제목·작성자명(학번)·상태 뱃지·작성일) → 상세 Link, Pagination, 로딩/에러 인라인
- [ ] **Step 3: AdminInquiryDetailPage** (`[inquiryId]/page.tsx` → params await → 컴포넌트) — 핵심:
  - detailQuery 에러 분기: `error instanceof ApiError && error.code === 'INQUIRY_DELETED'` → "작성자가 삭제한 문의입니다" / status 404 → "문의를 찾을 수 없습니다" — 둘 다 "← 목록으로" 링크(AdminReportDetailPage 가드 패턴)
  - 문의 정보 카드: 작성자명(학번)·작성일·상태 뱃지·제목·본문. 답변 카드(있으면)
  - **RECEIVED**: 주요 버튼 "답변 작성" → `changeStatus({inquiryId, payload: {status:'IN_PROGRESS', version: detail.version}})` — onSuccess: detail refetch 후 답변 폼 오픈. **onError(ApiError 409): detail refetch → 최신 version으로 1회 자동 재시도 → 성공 시 폼 오픈 / 재차 409 → 배너 "문의가 수정되었습니다. 내용을 다시 확인해 주세요."** (재시도 로직은 mutateAsync + try/catch 순차로 명시 구현 — 암묵 재시도 금지)
  - **IN_PROGRESS**: 답변 폼 바로 노출(textarea maxLength 4000) → "답변 등록" → `answer({inquiryId, payload: {content}})`(version 미포함 — IN_PROGRESS 경로) → 성공 toast+refetch. **실패(409/410) 시 textarea state 유지** + 배너(error.message)
  - **ANSWERED**: 답변 카드 + "답변 수정" 버튼 → 편집 모드(textarea 시드=기존 답변) → updateAnswer → refetch. CLOSED면 수정 버튼 미노출
  - **종료 버튼**(RECEIVED/IN_PROGRESS/ANSWERED에서 노출): `AdminInquiryCloseDialog`(사유 input maxLength 200 선택 입력, 확인=coral) → `changeStatus({status:'CLOSED', closedReason: 사유 || undefined})` → refetch. CLOSED 상태에선 모든 액션 숨김
  - 모든 mutation 에러는 setMutationError(extractErrorMessage) 인라인 배너
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm build` → Commit `feat(web): admin 1:1 문의 처리 화면 추가`

---

### Task 4: 테스트 (vitest — 훅 vi.mock 패턴)

- [ ] `test/me/inquiries/my-inquiries-page.test.tsx` — 목록 렌더(뱃지 라벨)·상태 탭 변경 시 훅 인자·Empty CTA
- [ ] `test/me/inquiries/inquiry-create.test.tsx` — 제출 시 create mutateAsync 인자·성공 시 router.push·ApiError 409 배너 노출(mutateAsync reject mock)
- [ ] `test/me/inquiries/inquiry-detail.test.tsx` — RECEIVED: 수정·삭제 노출+지연 안내 / IN_PROGRESS: 수정 미노출+작성중 안내 / CLOSED 무답변: 종료 문구+closedReason / ANSWERED: 답변 카드 "총동아리연합회" / 404: 폴백+목록 링크
- [ ] `test/admin/inquiries/admin-inquiry-detail.test.tsx` — RECEIVED: "답변 작성" 클릭 → changeStatus 호출(version 포함) / 409 → 재시도 1회(fresh version) 검증 / IN_PROGRESS: 답변 제출 → answer 호출, 실패 시 textarea 값 보존 / INQUIRY_DELETED code → 삭제 안내
- [ ] `pnpm test` 전부 PASS → Commit `test(web): 문의 학생·admin 화면 테스트 추가`

---

### Task 5: 검증 + 시각 QA + 최종 리뷰 게이트

- [ ] 검증 4종(lint/typecheck/build/test)
- [ ] 시각 QA(:3000 + 로컬 백엔드): **학생 플로우는 leader@daegu.ac.kr(STUDENT, 시드 유효)로 E2E 가능** — 작성(도배 409 포함 가능)→목록→상세→수정→삭제 왕복, /me 요약 블록, 모바일 375px(탭바 숨김 확인), FAQ 페이지 CTA→작성 흐름. admin 플로우는 계정 블록 시 스킵하고 보고(전례). QA 후 서버 정리
- [ ] FE 컨벤션 리뷰(전체 diff) + codex adversarial(비밀성: 학생 응답에 authorId/answeredBy 미노출 재확인·draft 보존·409 재시도 루프 안전성) → 지적 반영 → PR 준비

## Self-Review 결과

- 스펙 §6 학생/admin 계약 전부 매핑: 404 폴백·410 INQUIRY_DELETED 분기·version echo CTA 플로우·자동 재시도 1회(백엔드 PR3 정밀화와 페어)·draft 보존·"총동아리연합회" 고정 표기·상태별 안내 문구 4종·삭제 확인 다이얼로그 문구·MyPage 블록. PR6 범위(공지 링크·Footer·BottomNav 테스트) 미포함.
- 타입-백엔드 계약 정합: PR3 응답 DTO(Summary 5필드/Detail 7+answer/AdminSummary 7/AdminDetail 11)와 필드명 일치 — 구현자는 백엔드 dto/response 파일과 대조할 것.
- 409 자동 재시도는 명시적 mutateAsync 순차 구현(암묵 재시도 금지) — 테스트로 고정.
