# FE#1 — 지원 흐름 면접 슬롯 스텝 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 5 는 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 지원(apply) 흐름에서 면접 슬롯 선택 스텝(Step 2)을 제거해 **모든 모집의 지원을 단일 스텝(답변 작성 → 제출)** 으로 만든다 — BE#0(지원 시 `interviewSlotIds` 제거)의 프론트 짝 (스펙 §3 흐름 변경·§12 FE#1·§13 제거 대상 `ApplyInterviewSlotsStep`).

**Architecture:** 신모델에서 면접 가능시간 응답은 지원 시점이 아니라 **선정 후 라운드 발송을 받고 나서** (FE#4 의 applicantPhase 화면). 따라서 apply 는 `useInterview` 와 무관하게 1 스텝. 제거 범위는 apply 전용 코드만 — `SlotPickerByDateGroup`/`useApplicantInterviewSlotsQuery` 등 공용 면접 코드는 (현재 구 API 를 가리켜 dead 상태지만) FE#4 가 신 API 로 재배선할 때 정리하므로 **이 PR 에서 건드리지 않는다** (1 PR = 1 단위 원칙). 단 `SubmitApplicationPayload.interviewSlotIds` 는 BE 계약에서 사라진 필드라 타입에서 제거한다.

**Tech Stack:** Next.js 15 (App Router) / React 19 / TanStack Query / Vitest + MSW / pnpm workspaces

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §3·§12 FE#1·§13
**리뷰 정책:** duing-code-reviewer(컨벤션 — frontend/CLAUDE.md 기준) + codex 기본

---

## 핵심 결정

1. **삭제는 apply 전용 4파일만**: `ApplyInterviewSlotsStep.tsx`·`ApplyStepHeader.tsx`(단일 스텝에선 무의미 — 사용처가 ApplyForm 뿐임을 grep 으로 확인 완료)·`useSelectedSlotIds.ts`(sessionStorage 슬롯 선택 상태)·`useSelectedSlotIds.test.ts`.
2. **공용 면접 코드는 유지**: `components/interview/*`(SlotPickerByDateGroup·ApplicantSlotItem), `useApplicantInterviewSlotsQuery`, `EditAvailabilityModal`, stepper sub-state — 구 API 기반이라 런타임 dead 지만 FE#4(지원자 응답 UI·stepper 재배선)의 재료·범위다. 여기서 지우면 FE#4 전까지 빌드가 깨진다 (EditAvailabilityModal 이 훅을 import).
3. **`SubmitApplicationPayload` 에서 `interviewSlotIds` 필드 제거** — BE#0 가 요청 DTO 에서 제거한 계약의 타입 정합. `packages/api/src/generated/schema.d.ts`(OpenAPI 생성물)는 손대지 않는다 — stale 생성 파일 수동 편집 금지, 신 API 소비 시점(FE#2+)에 재생성.
4. **ApplyForm 단순화**: step 상태·이동 함수·슬롯 쿼리·선택 상태·검증(`slotSelectionMeetsMin`) 전부 제거, payload 는 항상 `{ answers }`, 버튼은 [제출] 하나. `useInterview` 분기 자체가 사라진다 — 면접 여부는 지원 화면과 무관해졌다.
5. **테스트 재구성**: 기존 10케이스 중 Step 2 전제 7건 삭제, 잔존 3건 보정 + 신규 2건(useInterview=true 여도 단일 스텝 / **제출 payload 에 interviewSlotIds 부재** — MSW 요청 캡처 단언). 기존 setup·헬퍼·MSW 패턴 유지.
6. 커밋 1개 (응집된 단일 리팩토링), 검증 게이트는 frontend CI 와 동일: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## File Map

| 구분 | 파일 | 처리 |
|---|---|---|
| Delete | `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyInterviewSlotsStep.tsx` | Step 2 컴포넌트 |
| Delete | `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyStepHeader.tsx` | 스텝 인디케이터 |
| Delete | `frontend/apps/web/app/apply/[recruitmentId]/_hooks/useSelectedSlotIds.ts` | 슬롯 선택 sessionStorage |
| Delete | `frontend/apps/web/test/apply/useSelectedSlotIds.test.ts` | 위 훅 테스트 |
| Modify | `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyForm.tsx` | 단일 스텝화 (전문 아래) |
| Modify | `frontend/packages/types/src/application.ts` | `interviewSlotIds` 필드 제거 |
| Modify | `frontend/apps/web/test/apply/apply-page.test.tsx` | 케이스 재구성 (Task 2) |

---

### Task 1: 브랜치 생성

- [x] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b refactor/apply-slot-step-removal
```

---

### Task 2: 테스트 재구성 (RED)

**Files:**
- Modify: `frontend/apps/web/test/apply/apply-page.test.tsx`

- [x] **Step 1: 케이스 재구성** — 기존 파일을 읽고 setup·렌더 헬퍼·MSW 핸들러 패턴을 유지하면서:

**삭제 (Step 2 전제 7건):**
- `useInterview=true 면 Step 1 다음 클릭 시 Step 2 가 노출된다`
- `Step 2 에서 슬롯 0개 선택 시 제출 버튼이 disabled 다`
- `deadline 이 과거이면 picker 가 disabled 되고 안내가 보인다`
- `Step 1 → 2 → 1 이동 시 답변·선택이 보존된다`
- `slotsQuery 가 409 에러를 반환하면 에러 alert 가 노출된다 (Issue 5)`
- `운영진이 슬롯을 등록하지 않은 경우 (200 빈 배열) 별도 안내가 노출된다 (Issue 5)`
- `409 AVAILABILITY_PERIOD_CLOSED 응답 시 에러 alert 가 노출된다` (구 모델의 지원-시점 마감 — 신모델에선 지원과 무관)

**보정 (2건):**
- `useInterview=false 면 다음 버튼이 없고 제출 버튼이 바로 노출된다` → 이름을 `면접 여부와 무관하게 다음 버튼 없이 제출 버튼이 바로 노출된다` 로 바꾸고, useInterview=false·true 두 렌더 모두에서 `다음` 부재 + `제출` 존재를 단언.
- `제출 성공 시 me/applications/[id] 로 navigate 하고 sessionStorage 가 비워진다` → sessionStorage 단언 제거(훅 삭제), `다음` 클릭 단계 제거 — 답변 입력 후 바로 제출.

**신규 (1건 — 핵심 계약):**

```tsx
  it('제출 payload 에 interviewSlotIds 가 포함되지 않는다', async () => {
    // 기존 MSW submit 핸들러 패턴을 따라 request body 를 캡처한다.
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('*/recruitments/:recruitmentId/applications', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, data: 1, message: null });
      }),
    );
    // useInterview=true 모집으로 렌더 (기존 헬퍼 사용)
    // ... 답변 입력 후 제출 클릭 (기존 패턴)
    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody).not.toHaveProperty('interviewSlotIds');
    expect(capturedBody).toHaveProperty('answers');
  });
```

(※ MSW 핸들러 경로·응답 envelope·렌더 헬퍼는 **기존 파일의 실제 패턴이 정답** — 위 코드는 단언 의미를 고정하는 틀이다. describe 블록명도 `ApplyForm — 2-Step UI (PR-FE4)` → `ApplyForm — 단일 스텝 지원` 으로 갱신. 미사용이 된 슬롯 MSW 핸들러·픽스처는 함께 제거.)

- [x] **Step 2: RED 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web test 2>&1 | tail -20
```
Expected: 보정·신규 케이스 FAIL (현 구현은 2-step). **커밋하지 않는다.**

---

### Task 3: 구현 (GREEN)

- [x] **Step 1: 파일 4개 삭제**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
rm "apps/web/app/apply/[recruitmentId]/_components/ApplyInterviewSlotsStep.tsx"
rm "apps/web/app/apply/[recruitmentId]/_components/ApplyStepHeader.tsx"
rm "apps/web/app/apply/[recruitmentId]/_hooks/useSelectedSlotIds.ts"
rm "apps/web/test/apply/useSelectedSlotIds.test.ts"
```

- [x] **Step 2: `ApplyForm.tsx` 전체 교체** — 헤더·자동저장·마감 알림·답변 스텝·에러·버튼 영역의 기존 마크업은 그대로, 스텝·슬롯 관련만 제거한 결과:

```tsx
'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type { DraftAnswer, RecruitmentDetail } from '@duing/types';
import { useSubmitApplicationMutation, draftQueryKeys } from '@duing/hooks';
import { useAutosaveDraft } from '../_hooks/useAutosaveDraft';
import { ApplyAnswersStep } from './ApplyAnswersStep';
import { toRoute } from '../../../_lib/route';

type Props = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
  initialAnswers: DraftAnswer[];
};

export function ApplyForm({ recruitment, recruitmentId, initialAnswers }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const submit = useSubmitApplicationMutation(recruitmentId);

  const [answers, setAnswers] = useState<DraftAnswer[]>(initialAnswers);
  const [error, setError] = useState<string | null>(null);

  const autosaveStatus = useAutosaveDraft(answers, {
    recruitmentId,
    enabled: true,
  });

  const isClosedByDraft = autosaveStatus.kind === 'closed';

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  function handleAnswersChange(next: DraftAnswer[]) {
    setAnswers(next);
  }

  const submitDisabled = submit.isPending || isClosedByDraft;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      // 면접 가능시간 응답은 지원 시점이 아니라 선정 후 라운드 발송을 받고 나서 한다 (재설계 §3).
      const payload = { answers: answers.map((answer) => answer.value) };
      const applicationId = await submit.mutateAsync(payload);
      queryClient.invalidateQueries({ queryKey: draftQueryKeys.byRecruitment(recruitmentId) });
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message || '지원에 실패했습니다.');
        return;
      }
      setError(submitError instanceof Error ? submitError.message : '지원에 실패했습니다.');
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
    >
      <main className="mx-auto max-w-[760px] px-8 pb-24 pt-16">

        {/* 헤더 */}
        <header className="mb-9">
          <p className="mb-1.5 text-[13.5px] font-medium tracking-body text-ink">
            {recruitment.clubName}
          </p>
          <h1 className="mb-2.5 text-[28px] font-bold tracking-tightx text-charcoal">
            {recruitment.title}
          </h1>

          {/* 자동저장 상태 */}
          {isClosedByDraft ? (
            <span className="font-mono text-[12.5px] tracking-wide text-coral">
              모집 마감 — 임시저장 및 제출 불가
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] tracking-wide text-charcoal-3">
              {autosaveStatus.kind === 'saved' && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-soft shadow-[0_0_0_3px_rgba(46,97,73,0.18)]" />
                  마지막 저장 {formatTime(autosaveStatus.at)}
                </>
              )}
              {autosaveStatus.kind === 'saving' && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-warm opacity-80" />
                  저장 중…
                </>
              )}
              {autosaveStatus.kind === 'error' && (
                <span className="text-coral">{autosaveStatus.message}</span>
              )}
            </span>
          )}
        </header>

        {/* 구분선 */}
        <div
          className="mb-8 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #d9d4c3 20%, #d9d4c3 80%, transparent)' }}
        />

        {/* 마감 알림 */}
        {isClosedByDraft && (
          <div className="mb-6 rounded-[12px] border border-coral/20 bg-coral/5 px-4 py-3">
            <p className="text-sm text-coral">
              모집이 마감되어 더 이상 임시저장되지 않습니다. 제출도 불가합니다.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7">
          <ApplyAnswersStep
            questions={recruitment.questions}
            answers={answers}
            onChange={handleAnswersChange}
            disabled={isClosedByDraft}
          />

          {error && (
            <p
              role="alert"
              className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="submit"
              disabled={submitDisabled}
              className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-7 py-3 text-sm font-semibold text-cream shadow-[0_1px_0_rgba(0,0,0,0.04),_0_6px_16px_rgba(31,74,54,0.20)] transition-colors hover:bg-ink-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submit.isPending ? '제출 중…' : '제출'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
```

- [x] **Step 3: 타입 정리** — `frontend/packages/types/src/application.ts` 의 `SubmitApplicationPayload` 를:

```typescript
export type SubmitApplicationPayload = {
  answers: string[];
};
```

(주석 포함 `interviewSlotIds` 줄 삭제. 이 타입의 다른 사용처가 컴파일 에러를 내면 — 사용처가 apply 외에 있다는 뜻이므로 — BLOCKED 보고.)

- [x] **Step 4: GREEN 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm --filter web test 2>&1 | tail -10
```
Expected: apply 테스트 전체 PASS.

---

### Task 4: 전체 검증 + 커밋

- [x] **Step 1: CI 게이트 4종**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: 전부 성공. (typecheck 가 잡는 잔여 참조 — 예: 삭제 파일 import — 가 있으면 해당 import 만 정리.)

- [x] **Step 2: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend
git commit -m "refactor(web): 지원 흐름에서 면접 슬롯 선택 스텝 제거 — 단일 스텝화"
```

---

### Task 5: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [x] **Step 1: self-check** (EOF newline·금지 라인·계획 외 변경 — 기존 7항목 명령에서 backend 테스트 카운트 대신 frontend 게이트 4종 확인)

- [x] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin refactor/apply-slot-step-removal
gh pr create --base develop --title "refactor(web): 지원 흐름에서 면접 슬롯 선택 스텝 제거" --body "$(cat <<'EOF'
## 🚀 작업 내용

면접 재설계의 프론트 첫 PR 입니다. 지원서 작성 화면에서 면접 가능시간 선택 스텝(Step 2)을 들어냈습니다 — 신모델에서 가능시간 응답은 지원 시점이 아니라 운영진이 면접 대상으로 선정해 라운드를 발송한 뒤에 하기 때문입니다(백엔드는 이미 지원 API 에서 슬롯 필드를 제거했습니다). 이제 면접 여부와 무관하게 모든 지원은 답변 작성 → 제출의 단일 스텝입니다.

스텝 인디케이터·슬롯 선택 sessionStorage 훅·관련 테스트까지 지원 흐름 전용 코드만 제거했고, 제출 payload 타입에서도 슬롯 필드를 정리했습니다. "제출 본문에 슬롯 필드가 없다"는 계약을 요청 캡처 테스트로 고정했습니다.

## 🤔 고민했던 내용

- 공용 면접 컴포넌트(슬롯 피커 등)와 구 면접 조회 훅은 일부러 남겼습니다 — 마이페이지의 가능시간 수정 모달이 아직 import 하고 있어 지우면 빌드가 깨지고, 그 화면들의 신 API 재배선이 FE#4 의 범위라서요. 1 PR = 1 단위 원칙대로 지원 흐름만 닫았습니다.
- OpenAPI 생성 타입 파일은 stale 상태지만 수동 편집하지 않았습니다 — 신 API 를 소비하는 다음 PR 에서 재생성하는 게 맞는 순서입니다.

## 💬 리뷰 중점사항

- 지원 화면에 면접 관련 분기(useInterview)가 완전히 사라졌는지.
- 남긴 공용 코드와 지운 전용 코드의 경계가 적절한지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §3·§12 FE#1·§13
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §13 제거 대상(`ApplyInterviewSlotsStep`·`SubmitApplicationRequest.interviewSlotIds` 의 FE 짝) → Task 3, §3(응답 시점 이동) → ApplyForm 주석·PR 본문, §12 FE#1 범위(apply 만) → 핵심 결정 1·2.
- **플레이스홀더**: 없음 — 신규 테스트 1건만 "기존 패턴이 정답" 각주로 헬퍼 바인딩을 위임 (실제 파일의 setup 을 계획이 강제할 수 없는 유일 지점, 단언 의미는 고정).
- **타입 일관성**: ApplyForm 전문이 삭제 대상 import(`useApplicantInterviewSlotsQuery`·`useSelectedSlotIds`·`ApplyInterviewSlotsStep`·`ApplyStepHeader`·`useMemo`) 를 모두 제거했고 잔존 import 는 전부 사용됨. `SubmitApplicationPayload` 사용처는 mutation 훅 1곳(탐색 확인) — answers 만 전달하므로 호환.
- **주의 메모**: ① 테스트 파일의 MSW 핸들러 경로·envelope 형식·렌더 헬퍼명은 기존 파일이 정답 — 계획 스니펫은 의미 고정용. ② `pnpm test` 가 워크스페이스 전체를 돌므로 apply 외 기존 테스트가 깨지면 BLOCKED (공용 코드를 건드렸다는 신호). ③ 삭제 후 `_components`/`_hooks` 디렉터리에 잔존 파일 있는지 확인 (빈 디렉터리면 자연 소멸).
