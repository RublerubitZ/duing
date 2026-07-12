# 회원가입 2-step 리팩토링 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).
>
> **구현 워커 공통 제약: `git push`·PR 생성 금지.** 커밋까지만. push/PR 은 전체 리뷰·self-check 후 사용자 확인 하에 컨트롤러가 수행.

**Goal:** 단일 회원가입 폼을 **① 휴대폰 인증 → ② 기본 정보** 2-step 마법사로 재구성한다. 백엔드 계약·검증(`signupSchema`)·상태(`signup-state`, `usePhoneVerification`)는 유지하고 `step` 상태만 추가. 설계: `docs/superpowers/specs/2026-07-10-signup-two-step-design.md`.

**Architecture:** `SignupFormPanel`(오케스트레이터 — 상태·step·handleSubmit 소유) + 신규 dumb 컴포넌트 `SignupStepIndicator`·`SignupStepVerify`·`SignupStepProfile`. 기존 `PhoneVerificationField`·`CollegeSelect`·`GradeSelect`·`TermsAgreement`·`PhoneInput` 재사용. Tasks 1~3은 순수 추가(typecheck green), Task 4가 오케스트레이터를 재배선하며 기존 인라인 폼 본문을 대체.

**Tech Stack:** Next.js 15 App Router + React 19, TanStack Query v5, Zod, Vitest + RTL.

## Global Constraints

- 작업 디렉터리 `frontend/`. 검증: `pnpm typecheck`·`pnpm lint`·포커스 테스트 `pnpm --filter @duing/web exec vitest run signup`.
- 브랜치: `feat/signup-two-step` (이미 분기·spec 커밋됨).
- 커밋: Conventional Commits 한국어(`feat(web): ...`). **Co-Authored-By/🤖 라인 금지.**
- FE 컨벤션(`frontend/CLAUDE.md`): `type`(interface 금지), `any`/`as` 금지(불가피 시 unknown+가드/zod; CollegeSelect의 기존 `as College`는 그 파일 내부이고 이 작업서 안 건드림), 서버상태 TanStack Query만, `packages/*`에 DOM API import 금지(이 작업은 apps/web만), 불필요한 `'use client'` 금지(스텝 컴포넌트는 상호작용 있어 필요), Korean 문구·테스트명, 변수명 축약 금지.
- 기존 필드·아이콘·Tailwind 클래스·검증 로직을 재사용. **목업의 AuthShell/Icon.*/TxtInput 인라인 스타일 시스템은 도입하지 않는다.**
- 각 태스크 `pnpm typecheck` green. 신규/수정 파일 EOF newline. 태스크마다 커밋 + spec/quality 리뷰.

## Out of Scope

- 만14세·마케팅 약관(백엔드 미저장), 로그인 페이지, 백엔드 변경, MO 인증 로직 자체, blur 실시간 검증 신규 도입.

---

### Task 1: `SignupStepIndicator` (신규, 순수)

**Files:** Create `apps/web/app/(auth)/signup/_components/SignupStepIndicator.tsx`, Test `apps/web/test/(auth)/signup/SignupStepIndicator.test.tsx`

**Produces:** `<SignupStepIndicator step={1|2} />`

- [ ] **Step 1-1: 실패 테스트** — `SignupStepIndicator.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignupStepIndicator } from '@/app/(auth)/signup/_components/SignupStepIndicator';

describe('SignupStepIndicator', () => {
  it('두 스텝 라벨을 항상 보여준다', () => {
    render(<SignupStepIndicator step={1} />);
    expect(screen.getByText('① 휴대폰 인증')).toBeInTheDocument();
    expect(screen.getByText('② 기본 정보')).toBeInTheDocument();
  });

  it('step=1 이면 첫 라벨만 활성(text-ink) 강조된다', () => {
    render(<SignupStepIndicator step={1} />);
    expect(screen.getByText('① 휴대폰 인증')).toHaveClass('text-ink');
    expect(screen.getByText('② 기본 정보')).not.toHaveClass('text-ink');
  });

  it('step=2 이면 두 라벨 모두 활성 강조된다', () => {
    render(<SignupStepIndicator step={2} />);
    expect(screen.getByText('① 휴대폰 인증')).toHaveClass('text-ink');
    expect(screen.getByText('② 기본 정보')).toHaveClass('text-ink');
  });
});
```
- [ ] **Step 1-2: 실패 확인** — `pnpm --filter @duing/web exec vitest run SignupStepIndicator` → 모듈 미존재 FAIL.
- [ ] **Step 1-3: 구현** — `SignupStepIndicator.tsx`:
```tsx
type Props = {
  step: 1 | 2;
};

const STEPS = [
  { index: 1, label: '① 휴대폰 인증' },
  { index: 2, label: '② 기본 정보' },
] as const;

export function SignupStepIndicator({ step }: Props) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex gap-1.5">
        {STEPS.map(({ index }) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-ink' : 'bg-line'}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs font-medium text-charcoal-3">
        {STEPS.map(({ index, label }) => (
          <span key={index} className={index <= step ? 'text-ink' : undefined}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
```
(`'use client'` 불요 — 상호작용 없는 순수 표시.)
- [ ] **Step 1-4: 통과 + 커밋**
```bash
pnpm typecheck && pnpm --filter @duing/web exec vitest run SignupStepIndicator && pnpm lint
git add -A && git commit -m "feat(web): 회원가입 스텝 인디케이터 컴포넌트 추가"
```

---

### Task 2: `SignupStepVerify` (신규 — Step 1)

**Files:** Modify `apps/web/app/(auth)/signup/_lib/use-phone-verification.ts`(컨트롤러 타입 export 추가), Create `.../\_components/SignupStepVerify.tsx`, Test `.../test/(auth)/signup/SignupStepVerify.test.tsx`

**Interfaces:**
- Produces: `export type PhoneVerificationController = ReturnType<typeof usePhoneVerification>` (hook 파일), `<SignupStepVerify phone onPhoneChange verification onNext />`
- Consumes: 기존 `PhoneVerificationField`.

- [ ] **Step 2-1: 컨트롤러 타입 export** — `use-phone-verification.ts` 파일 끝(함수 아래)에 추가:
```ts
export type PhoneVerificationController = ReturnType<typeof usePhoneVerification>;
```
(런타임 import 없이 스텝 컴포넌트가 훅 반환 형태를 타입으로 참조하기 위함. 훅 로직 무변경.)

- [ ] **Step 2-2: 실패 테스트** — `SignupStepVerify.test.tsx`. 훅 반환을 흉내낸 stub 컨트롤러로 렌더(훅 자체는 별도 테스트가 검증하므로 여기선 프레젠테이션만):
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignupStepVerify } from '@/app/(auth)/signup/_components/SignupStepVerify';
import type { PhoneVerificationController } from '@/app/(auth)/signup/_lib/use-phone-verification';

function makeController(overrides: Partial<PhoneVerificationController>): PhoneVerificationController {
  return {
    status: 'idle',
    verified: false,
    session: null,
    verificationToken: null,
    code: '',
    moNumber: '16663538',
    qrCode: null,
    remainingSeconds: 0,
    resendCooldownSeconds: 0,
    issuing: false,
    canIssue: false,
    errorMessage: null,
    stalled: false,
    issue: vi.fn(),
    markSent: vi.fn(),
    reset: vi.fn(),
    recheck: vi.fn(),
    ...overrides,
  };
}

describe('SignupStepVerify', () => {
  it('미인증 상태면 다음 버튼을 렌더하지 않는다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'idle', verified: false })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /다음/ })).not.toBeInTheDocument();
  });

  it('인증되면 다음 버튼을 노출하고 클릭 시 onNext 를 호출한다', async () => {
    const onNext = vi.fn();
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'verified', verified: true })}
        onNext={onNext}
      />,
    );
    const nextButton = screen.getByRole('button', { name: /다음/ });
    await userEvent.click(nextButton);
    expect(onNext).toHaveBeenCalledOnce();
  });
});
```
- [ ] **Step 2-3: 실패 확인** → 모듈 미존재 FAIL.
- [ ] **Step 2-4: 구현** — `SignupStepVerify.tsx`:
```tsx
'use client';

import { PhoneVerificationField } from './PhoneVerificationField';
import type { PhoneVerificationController } from '../_lib/use-phone-verification';

type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  verification: PhoneVerificationController;
  onNext: () => void;
};

export function SignupStepVerify({ phone, onPhoneChange, verification, onNext }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-2xl font-bold tracking-tightx text-ink-deep">
          문자로 코드를 보내주세요
        </h2>
        <p className="text-sm leading-relaxed text-charcoal-2">
          아래 코드를 <strong className="text-ink-deep">수신번호로 그대로 전송</strong>하면 발신 번호로
          본인 인증이 완료돼요. 별도 인증번호 입력은 없어요.
        </p>
      </div>

      <PhoneVerificationField
        phone={phone}
        onPhoneChange={onPhoneChange}
        status={verification.status}
        code={verification.code}
        moNumber={verification.moNumber}
        qrCode={verification.qrCode}
        remainingSeconds={verification.remainingSeconds}
        resendCooldownSeconds={verification.resendCooldownSeconds}
        issuing={verification.issuing}
        canIssue={verification.canIssue}
        errorMessage={verification.errorMessage}
        stalled={verification.stalled}
        onIssue={verification.issue}
        onSent={verification.markSent}
        onReset={verification.reset}
        onRecheck={verification.recheck}
      />

      {verification.verified && (
        <button type="button" onClick={onNext} className="btn btn-primary btn-big w-full">
          다음 →
        </button>
      )}
    </div>
  );
}
```
- [ ] **Step 2-5: 통과 + 커밋**
```bash
pnpm typecheck && pnpm --filter @duing/web exec vitest run SignupStepVerify && pnpm lint
git add -A && git commit -m "feat(web): 회원가입 Step1 휴대폰 인증 컴포넌트 추가"
```

---

### Task 3: `SignupStepProfile` (신규 — Step 2)

**Files:** Create `.../\_components/SignupStepProfile.tsx`, Test `.../test/(auth)/signup/SignupStepProfile.test.tsx`

**Interfaces:** Produces `<SignupStepProfile state setField passwordMismatch studentIdMismatch canSubmit isSubmitting onBack />`. Consumes 기존 `CollegeSelect`·`GradeSelect`·`TermsAgreement`.

- [ ] **Step 3-1: 실패 테스트** — `SignupStepProfile.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignupStepProfile } from '@/app/(auth)/signup/_components/SignupStepProfile';
import { initialSignupState } from '@/app/(auth)/signup/_lib/signup-state';

const baseState = { ...initialSignupState, phone: '010-1234-5678' };

describe('SignupStepProfile', () => {
  it('인증 완료 배지에 인증된 번호를 보여준다', () => {
    render(
      <SignupStepProfile
        state={baseState}
        setField={vi.fn()}
        passwordMismatch={false}
        studentIdMismatch={false}
        canSubmit={false}
        isSubmitting={false}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.getByText(/휴대폰 인증 완료/)).toBeInTheDocument();
  });

  it('이전 버튼 클릭 시 onBack 을 호출한다', async () => {
    const onBack = vi.fn();
    render(
      <SignupStepProfile
        state={baseState} setField={vi.fn()} passwordMismatch={false}
        studentIdMismatch={false} canSubmit={false} isSubmitting={false} onBack={onBack}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /이전/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('canSubmit=false 면 가입 버튼(type=submit)이 비활성이다', () => {
    render(
      <SignupStepProfile
        state={baseState} setField={vi.fn()} passwordMismatch={false}
        studentIdMismatch={false} canSubmit={false} isSubmitting={false} onBack={vi.fn()}
      />,
    );
    const submitButton = screen.getByRole('button', { name: /가입하고 두잉 시작하기/ });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  it('학번·학년·학과 필수 필드를 렌더한다', () => {
    render(
      <SignupStepProfile
        state={baseState} setField={vi.fn()} passwordMismatch={false}
        studentIdMismatch={false} canSubmit={false} isSubmitting={false} onBack={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('이름')).toBeInTheDocument();
    expect(screen.getByLabelText('학번')).toBeInTheDocument();
    expect(screen.getByLabelText('학년')).toBeInTheDocument();
  });
});
```
- [ ] **Step 3-2: 실패 확인** → 모듈 미존재 FAIL.
- [ ] **Step 3-3: 구현** — `SignupStepProfile.tsx`. 필드 JSX는 **현재 `SignupFormPanel`의 것을 그대로** 옮기되(같은 `inputCls`·`IconPerson`·라벨 htmlFor·onChange sanitize), 순서를 설계 §4대로: 이름 → 단과대학·학과 → [학번|학년] → 학번 확인 → [비밀번호|비밀번호 확인] → 약관 → [이전][가입]:
```tsx
'use client';

import { CollegeSelect } from './CollegeSelect';
import { GradeSelect } from '@/app/_components/GradeSelect';
import { TermsAgreement } from './TermsAgreement';
import type { SignupFormState } from '../_lib/signup-state';
import type { College, Grade } from '@duing/types';

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3.5 py-3 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50';

function IconPerson() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 13c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  state: SignupFormState;
  setField: (field: keyof SignupFormState, value: string | boolean) => void;
  passwordMismatch: boolean;
  studentIdMismatch: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  onBack: () => void;
};

export function SignupStepProfile({
  state,
  setField,
  passwordMismatch,
  studentIdMismatch,
  canSubmit,
  isSubmitting,
  onBack,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-2xl font-bold tracking-tightx text-ink-deep">
          어떻게 불러드릴까요?
        </h2>
        <p className="text-sm text-charcoal-2">
          대구대학교 학적 정보를 알려주세요. 가입 후 학번은 수정할 수 없어요.
        </p>
      </div>

      {/* 앞 단계 인증 완료 배지 */}
      <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3.5 py-2.5 text-sm">
        <span className="font-medium text-emerald-600">✓ 휴대폰 인증 완료</span>
        <span className="text-charcoal-3">{state.phone}</span>
      </div>

      {/* 이름 */}
      <div>
        <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-charcoal">
          이름
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3">
            <IconPerson />
          </span>
          <input
            id="signup-name"
            required
            maxLength={50}
            value={state.name}
            onChange={(changeEvent) => setField('name', changeEvent.target.value)}
            placeholder="김도윤"
            className={`${inputCls} pl-10`}
          />
        </div>
      </div>

      {/* 단과대학·학과 */}
      <div>
        <label htmlFor="signup-college" className="mb-1.5 block text-sm font-medium text-charcoal">
          단과대학·학과
        </label>
        <div className="space-y-2">
          <CollegeSelect
            value={state.college}
            onChange={(college: College) => setField('college', college)}
          />
          <input
            id="signup-major"
            required
            maxLength={50}
            value={state.major}
            onChange={(changeEvent) => setField('major', changeEvent.target.value)}
            placeholder="학과명 입력 (예: 컴퓨터정보공학부)"
            className={inputCls}
          />
        </div>
      </div>

      {/* 학번 + 학년 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="signup-student-id" className="mb-1.5 block text-sm font-medium text-charcoal">
            학번
          </label>
          <input
            id="signup-student-id"
            required
            pattern="\d{8}"
            inputMode="numeric"
            maxLength={8}
            value={state.studentId}
            onChange={(changeEvent) =>
              setField('studentId', changeEvent.target.value.replace(/\D/g, '').slice(0, 8))
            }
            placeholder="8자리 숫자"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="signup-grade" className="mb-1.5 block text-sm font-medium text-charcoal">
            학년
          </label>
          <GradeSelect
            id="signup-grade"
            value={state.grade}
            onChange={(grade: Grade) => setField('grade', grade)}
          />
        </div>
      </div>

      {/* 학번 확인 */}
      <div>
        <label htmlFor="signup-student-id-confirm" className="mb-1.5 block text-sm font-medium text-charcoal">
          학번 확인
        </label>
        <input
          id="signup-student-id-confirm"
          required
          pattern="\d{8}"
          inputMode="numeric"
          maxLength={8}
          value={state.studentIdConfirm}
          onChange={(changeEvent) =>
            setField('studentIdConfirm', changeEvent.target.value.replace(/\D/g, '').slice(0, 8))
          }
          placeholder="학번을 한 번 더 입력해주세요"
          className={inputCls}
        />
        {studentIdMismatch && (
          <p className="mt-1.5 text-xs text-coral" aria-live="polite">
            학번이 일치하지 않아요
          </p>
        )}
      </div>

      {/* 비밀번호 + 확인 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-charcoal">
            비밀번호
          </label>
          <input
            id="signup-password"
            required
            type="password"
            autoComplete="new-password"
            value={state.password}
            onChange={(changeEvent) => setField('password', changeEvent.target.value)}
            placeholder="••••••••"
            className={inputCls}
          />
          <p className="mt-1.5 text-xs text-charcoal-3">영문+숫자 8자 이상</p>
        </div>
        <div>
          <label htmlFor="signup-password-confirm" className="mb-1.5 block text-sm font-medium text-charcoal">
            비밀번호 확인
          </label>
          <input
            id="signup-password-confirm"
            required
            type="password"
            autoComplete="new-password"
            value={state.passwordConfirm}
            onChange={(changeEvent) => setField('passwordConfirm', changeEvent.target.value)}
            placeholder="••••••••"
            className={inputCls}
          />
          {passwordMismatch && (
            <p className="mt-1.5 text-xs text-coral" aria-live="polite">
              비밀번호가 일치하지 않아요
            </p>
          )}
        </div>
      </div>

      {/* 약관 */}
      <TermsAgreement
        termsOfServiceAgreed={state.termsOfServiceAgreed}
        privacyPolicyAgreed={state.privacyPolicyAgreed}
        onChangeTermsOfService={(next) => setField('termsOfServiceAgreed', next)}
        onChangePrivacyPolicy={(next) => setField('privacyPolicyAgreed', next)}
      />

      {/* 버튼 */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onBack} className="btn btn-big">
          ← 이전
        </button>
        <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-big flex-1 disabled:opacity-50">
          {isSubmitting ? '가입 중…' : '가입하고 두잉 시작하기 →'}
        </button>
      </div>
    </div>
  );
}
```
- [ ] **Step 3-4: 통과 + 커밋**
```bash
pnpm typecheck && pnpm --filter @duing/web exec vitest run SignupStepProfile && pnpm lint
git add -A && git commit -m "feat(web): 회원가입 Step2 기본정보 컴포넌트 추가"
```

---

### Task 4: `SignupFormPanel` 오케스트레이터 재배선

**Files:** Modify `apps/web/app/(auth)/signup/_components/SignupFormPanel.tsx`, Test(create) `apps/web/test/(auth)/signup/SignupFormPanel.test.tsx`

**Consumes:** Task 1~3의 `SignupStepIndicator`·`SignupStepVerify`·`SignupStepProfile`.

- [ ] **Step 4-1: 통합 실패 테스트** — `SignupFormPanel.test.tsx`. 기존 훅 테스트(`use-phone-verification.test.tsx`)의 provider/stub-client/fake-timers 패턴을 확인해 동일하게 구성(ApiClientProvider + QueryClientProvider + next/navigation mock, MSW 또는 stub client로 `startPhoneVerification`/`getPhoneVerificationStatus`/`signup` 제어). 케이스:
  - `it('처음에는 Step1(휴대폰 인증)만 보이고 기본정보 필드는 없다')` — 스텝 인디케이터 ①②, PhoneInput 존재, 이름/학번 입력 부재.
  - `it('인증 전에는 다음 버튼이 없어 Step2로 못 넘어간다')`.
  - `it('발급→문자수신 stub→VERIFIED 후 다음을 누르면 Step2(기본정보)가 보인다')` — issue→registerInbound→폴링 VERIFIED→[다음]→이름/학번/약관 노출.
  - `it('Step2에서 이전을 누르면 Step1로 돌아가고 인증 상태가 보존된다')` — [이전]→Step1이 verified 뷰(✓ + [다음])로.
  - `it('Step2에서 유효 입력 후 가입하면 signup 이 verificationToken 을 포함해 호출된다')` — 필드 채우고 약관 체크 후 [가입]→signup mutation 인자 `{studentId,name,password,grade,college,major,verificationToken,termsOfServiceAgreed,privacyPolicyAgreed}` 확인, `/login?next=/me` 이동.
  (harness 세부는 기존 훅 테스트 재사용. 시간 의존은 fake timers.)

- [ ] **Step 4-2: 실패 확인** → 신규 컴포넌트 미사용/2-step 미구현으로 FAIL.

- [ ] **Step 4-3: 구현** — `SignupFormPanel.tsx` 재작성. 상태·검증·제출은 현행 유지 + `step` 추가, 렌더를 스텝 컴포넌트로 위임. import 정리(CollegeSelect/GradeSelect/PhoneVerificationField/TermsAgreement는 이제 스텝 컴포넌트가 씀 — 패널에서 제거, IconPerson도 StepProfile로 이동). 전체:
```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, useState } from 'react';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';
import { ApiError } from '@duing/api';
import { initialSignupState, signupReducer, type SignupFormState } from '../_lib/signup-state';
import { usePhoneVerification } from '../_lib/use-phone-verification';
import { SignupStepIndicator } from './SignupStepIndicator';
import { SignupStepVerify } from './SignupStepVerify';
import { SignupStepProfile } from './SignupStepProfile';

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SignupFormPanel() {
  const router = useRouter();
  const signup = useSignupMutation();
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof SignupFormState, value: string | boolean) {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  const phoneVerification = usePhoneVerification(state.phone);

  const passwordMismatch =
    state.passwordConfirm.length > 0 && state.password !== state.passwordConfirm;
  const studentIdMismatch =
    state.studentIdConfirm.length > 0 && state.studentId !== state.studentIdConfirm;

  const canSubmit =
    state.termsOfServiceAgreed &&
    state.privacyPolicyAgreed &&
    !signup.isPending &&
    !passwordMismatch &&
    state.studentId === state.studentIdConfirm &&
    phoneVerification.verified;

  async function handleSubmit(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    // Step1 에서 Enter 등으로 form submit 이 발생해도 제출하지 않는다(전환은 [다음] 버튼 전용).
    if (step !== 2) return;
    if (passwordMismatch) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (state.studentId !== state.studentIdConfirm) {
      setError('학번이 일치하지 않습니다.');
      return;
    }
    setError(null);
    const parsed = signupSchema.safeParse({
      studentId: state.studentId,
      name: state.name,
      password: state.password,
      grade: state.grade,
      college: state.college,
      major: state.major,
      verificationToken: phoneVerification.verificationToken ?? '',
      termsOfServiceAgreed: state.termsOfServiceAgreed,
      privacyPolicyAgreed: state.privacyPolicyAgreed,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await signup.mutateAsync(parsed.data);
      router.replace('/login?next=/me');
    } catch (signupError) {
      if (signupError instanceof ApiError && signupError.code === 'PHONE_NOT_VERIFIED') {
        phoneVerification.reset();
        setStep(1);
        setError('휴대폰 인증이 만료됐어요. 다시 인증해주세요.');
        return;
      }
      setError(signupError instanceof Error ? signupError.message : '회원가입에 실패했습니다.');
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-cream">
      <nav className="flex shrink-0 items-center justify-between px-8 pt-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal">
          <IconChevronLeft />
          홈으로
        </Link>
        <button type="button" className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal">
          한국어
          <IconChevronDown />
        </button>
      </nav>

      <main className="flex flex-1 justify-center px-8 py-10">
        <div className="w-full max-w-[520px]">
          <span className="pill mb-5 inline-flex">
            <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 0l1.5 5.5L14 7l-5.5 1.5L7 14l-1.5-5.5L0 7l5.5-1.5L7 0z" fill="currentColor" />
            </svg>
            회원가입
          </span>

          <SignupStepIndicator step={step} />

          {error && (
            <div role="alert" aria-live="polite" className="mb-5 rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {step === 1 ? (
              <SignupStepVerify
                phone={state.phone}
                onPhoneChange={(phone) => setField('phone', phone)}
                verification={phoneVerification}
                onNext={() => setStep(2)}
              />
            ) : (
              <SignupStepProfile
                state={state}
                setField={setField}
                passwordMismatch={passwordMismatch}
                studentIdMismatch={studentIdMismatch}
                canSubmit={canSubmit}
                isSubmitting={signup.isPending}
                onBack={() => setStep(1)}
              />
            )}
          </form>

          <p className="mt-6 text-center text-sm text-charcoal-2">
            이미 두잉 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-charcoal underline underline-offset-2 transition-colors hover:text-ink">
              로그인
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4-4: 통과** — `pnpm typecheck && pnpm --filter @duing/web exec vitest run signup && pnpm lint` 전부 green.
- [ ] **Step 4-5: 커밋**
```bash
git add -A && git commit -m "feat(web): 회원가입을 2-step(휴대폰 인증·기본 정보)으로 재구성"
```

---

### Task 5: 최종 검증

- [ ] **Step 5-1** — `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @duing/web build` 전부 SUCCESS(출력 문자열 직접 확인, `/signup`이 여전히 렌더되는지). 
- [ ] **Step 5-2: PR 직전 self-check(7항목, 컨트롤러 수행)** — 빌드/테스트 SUCCESS·범위 vs spec 일치(누락0/요청외0: 만14세·마케팅·백엔드 미변경)·다른 측면(로그인 무관, 백엔드 계약 동일)·전 태스크 리뷰 완료·계획 self-review 재검증·커밋 규칙·EOF. **push·PR 은 보고 후 지시로만.**
- [ ] **Step 5-3: 실브라우저 시각 확인(권장)** — `/signup`에서 Step1 인증(로컬 octomo)→[다음]→Step2→[이전]→인증 보존, 스텝 인디케이터·배지·버튼 배치 육안 확인. (자동 테스트가 못 잡는 레이아웃.)

## 리뷰 체크포인트
- 태스크마다 spec 준수 + feature-dev:code-reviewer(FE 컨벤션·React 정합).
- 관전: ① Step1 [다음]이 verified일 때만 노출·onNext ② [이전] 후 인증 보존(usePhoneVerification 부모 존속) ③ handleSubmit의 `step!==2` 가드(Step1 Enter 오제출 방지) ④ Step2 [가입] type=submit·canSubmit 게이트에 phoneVerification.verified 포함 ⑤ 403 시 setStep(1) 복귀 ⑥ 기존 하위 컴포넌트 테스트 무변경·재사용.

## Self-Review
- 커버리지: spec §2 구조(4파일)→T1~T4, §3 Step1([다음] gate)→T2, §4 Step2(필드·배지·약관·버튼)→T3, §5 흐름(step·전환·뒤로·제출·403)→T4, §6 테스트→각 태스크+T4 통합. §8 결정 4가지 반영(약관2·버튼전환·학년유지·컴포넌트분리).
- 플레이스홀더: 신규 3컴포넌트+오케스트레이터 완전 코드. T4 통합 테스트는 harness를 기존 훅 테스트로 지시(케이스 문장 명시).
- 타입 일관성: `PhoneVerificationController`(T2 export)를 StepVerify가 소비, `SignupFormState`+`setField` 시그니처가 StepProfile Props와 패널 제공에 일치, `canSubmit`에 verified 포함(패널 계산·StepProfile 소비).
