# 회원가입 Step 1 (휴대폰 MO 인증) 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원가입 Step 1(휴대폰 MO 인증) 화면을 "문자 한 통이면 인증 끝"이 3초 안에 읽히도록 재구성한다 — 인라인 안내 일러스트 + QR/코드 관계 정리 + 모바일 CTA 점진 노출.

**Architecture:** 신규 `SignupIllustration`(인라인 SVG)을 만들고, `SignupStepVerify`가 상태별 히어로(idle/expired=풀 히어로+일러스트, issued/waiting=컴팩트 제목, verified=없음)를 소유한다. `PhoneVerificationField`는 발급 후 UI를 데스크톱(QR 2단)·모바일(CTA 우선 점진 노출)로 재배치한다. 상태머신·폴링·프롭 시그니처·공통 폭(520)은 무변경.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind, Vitest + React Testing Library + userEvent, pnpm workspaces(`@duing/web`).

## Global Constraints

- 폼 공통 폭 **520px 유지** — `SignupFormPanel.tsx` 무변경, Step1·Step2 동일 폭(넓히지 않음).
- **배지류 없음** — `VERIFICATION`·`휴대폰 MO 인증` 배지 둘 다 넣지 않는다.
- 히어로 제목은 **단일** `문자로 코드를 보내주세요` + 초록 서브 `문자 한 통이면 본인 인증 끝`(풀 히어로에서만).
- 일러스트: **인라인 SVG**, viewBox `0 0 860 660`(폰 전체), 아트워크 색 고정, 루트에 `role="img"` + `aria-label="문자로 코드를 보내 본인 인증하는 방법 안내"`. 발급 후(issued/waiting)엔 **숨김**.
- `usePhoneVerification` 상태머신·폴링·throttle·`buildSmsDeeplink`·**PhoneVerificationField 프롭 16개 시그니처 무변경**.
- 모바일 딥링크 탭 = 문자앱 열기 + 로컬 `linkOpened=true`(노출 트리거, **폴링 시작 아님**); `[문자를 보냈어요]` = `onSent`; `[재발급]` = `onIssue(!isMobile)`.
- QR/딥링크 분기: 기존 `isMobileUserAgent(navigator.userAgent)` 유지.
- FE 규약: `type`(interface 금지), `any`/`as` 금지, Tailwind 유틸(커스텀 `tracking-tightx` 유효), 한국어 카피, 파일 EOF 개행.
- 커밋: Conventional Commits(`feat(web)`/`test(web)`), Co-Authored-By/🤖 라인 금지. **push·PR 생성 금지(구현자)**.

---

## File Structure

- **신규** `frontend/apps/web/app/(auth)/signup/_components/SignupIllustration.tsx` — 인라인 SVG 안내 일러스트(정적, 프롭 `className?`). 책임: 브랜드 안내 그림 1개.
- **신규** `frontend/apps/web/test/(auth)/signup/SignupIllustration.test.tsx`
- **수정** `frontend/apps/web/app/(auth)/signup/_components/SignupStepVerify.tsx` — 상태별 히어로 + 일러스트, `PhoneVerificationField` 위. 프롭 무변경.
- **수정** `frontend/apps/web/test/(auth)/signup/SignupStepVerify.test.tsx` — 히어로 케이스 추가.
- **수정** `frontend/apps/web/app/(auth)/signup/_components/PhoneVerificationField.tsx` — 발급 후 데스크톱 2단·모바일 점진 노출. 프롭 무변경, 로컬 `linkOpened` state만 추가.
- **수정** `frontend/apps/web/test/(auth)/signup/PhoneVerificationField.test.tsx` — 모바일 딥링크 테스트 갱신 + 점진 노출 케이스.
- **무변경** `SignupFormPanel.tsx`, `SignupStepIndicator.tsx`, `SignupStepProfile.tsx`, `PhoneInput.tsx`, `use-phone-verification.ts`, `phone-verification.ts`.

명령은 `frontend/` 에서 실행. 브랜치 `feat/signup-step1-redesign`(이미 체크아웃).

---

### Task 1: `SignupIllustration` (인라인 SVG 안내 일러스트)

**Files:**
- Create: `frontend/apps/web/app/(auth)/signup/_components/SignupIllustration.tsx`
- Test: `frontend/apps/web/test/(auth)/signup/SignupIllustration.test.tsx`

**Interfaces:**
- Produces: `export function SignupIllustration(props: { className?: string }): JSX.Element` — 루트 `<svg role="img" aria-label="문자로 코드를 보내 본인 인증하는 방법 안내" viewBox="0 0 860 660">`, `className` 을 루트 svg 로 전달.
- Consumes: 없음.

- [ ] **Step 1: 실패 테스트 작성**

`frontend/apps/web/test/(auth)/signup/SignupIllustration.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignupIllustration } from '@/app/(auth)/signup/_components/SignupIllustration';

describe('SignupIllustration', () => {
  it('안내 일러스트를 접근 가능한 이미지로 렌더한다', () => {
    render(<SignupIllustration />);
    expect(
      screen.getByRole('img', { name: '문자로 코드를 보내 본인 인증하는 방법 안내' }),
    ).toBeInTheDocument();
  });

  it('폰 전체가 보이도록 viewBox 높이를 660 으로 확장한다', () => {
    render(<SignupIllustration />);
    expect(screen.getByRole('img', { name: /본인 인증하는 방법/ })).toHaveAttribute(
      'viewBox',
      '0 0 860 660',
    );
  });

  it('className 을 루트 svg 에 전달한다', () => {
    render(<SignupIllustration className="max-w-[360px]" />);
    expect(screen.getByRole('img', { name: /본인 인증하는 방법/ })).toHaveClass('max-w-[360px]');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web exec vitest run SignupIllustration`
Expected: FAIL — `Cannot find module '.../SignupIllustration'`.

- [ ] **Step 3: 컴포넌트 구현**

`frontend/apps/web/app/(auth)/signup/_components/SignupIllustration.tsx` (정적, `'use client'` 불필요):
```tsx
type Props = {
  className?: string;
};

/**
 * 회원가입 Step1 안내 일러스트. `public/duing-signup.svg` 아트워크를 인라인.
 * viewBox 높이를 660 으로 확장해 폰 하단까지 전체가 보이도록 한다.
 * 예시 수신번호(1666-3538)·코드(5WAVK4YZ)는 설명용 고정값이며 실제 값이 아니다.
 */
export function SignupIllustration({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 860 660"
      role="img"
      aria-label="문자로 코드를 보내 본인 인증하는 방법 안내"
      fontFamily="Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    >
      <defs>
        <clipPath id="signup-illus-phone">
          <rect x="210" y="30" width="470" height="620" rx="40" />
        </clipPath>
        <filter id="signup-illus-card" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="20" floodColor="#1F4A36" floodOpacity="0.16" />
        </filter>
        <filter id="signup-illus-btn" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#2E8B57" floodOpacity="0.4" />
        </filter>
      </defs>

      <g>
        <rect x="210" y="30" width="470" height="620" rx="40" fill="#FFFFFF" stroke="#E5E2DA" strokeWidth="3" />
        <g clipPath="url(#signup-illus-phone)">
          <rect x="210" y="30" width="470" height="96" fill="#F0EDE5" />
          <line x1="210" y1="126" x2="680" y2="126" stroke="#E5E2DA" strokeWidth="1" />
          <text x="445" y="90" textAnchor="middle" fontSize="21" fontWeight="700" fill="#2F3433">
            새로운 메시지
          </text>
          <text x="238" y="178" fontSize="18" fill="#6F7574">
            받는 사람 :<tspan fill="#1F4A36" fontWeight="800" dx="4">1666-3538</tspan>
          </text>
        </g>
      </g>

      <g filter="url(#signup-illus-card)">
        <rect x="40" y="300" width="660" height="182" rx="26" fill="#FFFFFF" />
      </g>
      <text x="76" y="350" fontSize="25" fontWeight="700">
        <tspan fill="#6F7574">[</tspan>
        <tspan fill="#1F4A36">두잉</tspan>
        <tspan fill="#6F7574">] 인증문자 보내기</tspan>
      </text>
      <text
        x="76"
        y="436"
        fontSize="44"
        fontWeight="700"
        fill="#2F3433"
        letterSpacing="7"
        fontFamily="'JetBrains Mono', ui-monospace, Menlo, monospace"
      >
        5WAVK4YZ
      </text>

      <circle cx="628" cy="391" r="42" fill="#E8EEE8" />
      <circle cx="628" cy="391" r="30" fill="#2E8B57" filter="url(#signup-illus-btn)" />
      <path
        d="M628 406 V376 M614 390 l14 -14 l14 14"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g filter="url(#signup-illus-card)">
        <rect x="520" y="176" width="310" height="100" rx="18" fill="#1F4A36" />
        <path d="M560 276 h32 l-16 22 z" fill="#1F4A36" />
      </g>
      <text x="675" y="214" textAnchor="middle" fontSize="23" fontWeight="500" fill="#FFFFFF">
        입력된 문자를 보내면
      </text>
      <text x="675" y="248" textAnchor="middle" fontSize="23" fill="#FFFFFF">
        <tspan fontWeight="800">본인인증</tspan>
        <tspan fontWeight="500">이 됩니다!</tspan>
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web exec vitest run SignupIllustration`
Expected: PASS (3 passed).

- [ ] **Step 5: 커밋**

```bash
git add "frontend/apps/web/app/(auth)/signup/_components/SignupIllustration.tsx" "frontend/apps/web/test/(auth)/signup/SignupIllustration.test.tsx"
git commit -m "feat(web): 회원가입 안내 일러스트 인라인 SVG 컴포넌트 추가"
```

---

### Task 2: `SignupStepVerify` 히어로 재구성

**Files:**
- Modify: `frontend/apps/web/app/(auth)/signup/_components/SignupStepVerify.tsx`
- Test: `frontend/apps/web/test/(auth)/signup/SignupStepVerify.test.tsx`

**Interfaces:**
- Consumes: `SignupIllustration`(Task 1). 프롭 `{ phone, onPhoneChange, verification: PhoneVerificationController, onNext }` — **무변경**.
- Produces: 상태별 히어로. idle/expired = 제목 + 서브 + 캡션 + 일러스트; issued/waiting = 제목만; verified = 히어로 없음.

- [ ] **Step 1: 실패 테스트 추가**

`SignupStepVerify.test.tsx` 의 기존 `describe` 블록 안에 아래 3개 `it` 을 추가한다(기존 2개는 유지):
```tsx
  it('idle 이면 풀 히어로(서브 문구 + 일러스트)를 보여준다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'idle' })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '문자로 코드를 보내주세요' })).toBeInTheDocument();
    expect(screen.getByText('문자 한 통이면 본인 인증 끝')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '문자로 코드를 보내 본인 인증하는 방법 안내' }),
    ).toBeInTheDocument();
  });

  it('issued 면 제목은 유지하되 일러스트·서브 문구는 숨긴다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'issued', code: '7K3M9PXQ' })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '문자로 코드를 보내주세요' })).toBeInTheDocument();
    expect(screen.queryByText('문자 한 통이면 본인 인증 끝')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /본인 인증하는 방법/ }),
    ).not.toBeInTheDocument();
  });

  it('verified 면 히어로 제목을 숨긴다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'verified', verified: true })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByRole('heading', { name: '문자로 코드를 보내주세요' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web exec vitest run SignupStepVerify`
Expected: FAIL — 현재 컴포넌트는 항상 같은 제목·설명을 렌더하고 일러스트가 없어, 위 3개가 실패(일러스트 없음, issued 에서도 서브 문구 존재 등).

- [ ] **Step 3: 컴포넌트 재구성**

`frontend/apps/web/app/(auth)/signup/_components/SignupStepVerify.tsx` 전체를 아래로 교체:
```tsx
'use client';

import { PhoneVerificationField } from './PhoneVerificationField';
import { SignupIllustration } from './SignupIllustration';
import type { PhoneVerificationController } from '../_lib/use-phone-verification';

type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  verification: PhoneVerificationController;
  onNext: () => void;
};

export function SignupStepVerify({ phone, onPhoneChange, verification, onNext }: Props) {
  const { status } = verification;
  // verified 에서는 필드가 완료 배지를 보여주므로 히어로 제목을 숨긴다.
  const showHero = status !== 'verified';
  // idle/expired 에서만 서브 문구 + 일러스트까지 노출(개념 이해 순간). 발급 후엔 제목만 남긴다.
  const showFullHero = status === 'idle' || status === 'expired';

  return (
    <div className="space-y-4">
      {showHero && (
        <div>
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tightx text-ink-deep">
            문자로 코드를 보내주세요
          </h2>
          {showFullHero && (
            <>
              <p className="mt-1.5 text-sm font-semibold text-ink-soft">문자 한 통이면 본인 인증 끝</p>
              <p className="mt-1 text-sm leading-relaxed text-charcoal-2">
                수신번호로 <strong className="text-ink-deep">그대로 전송</strong>하면 발신번호로 자동 인증돼요.
                인증번호 입력은 필요 없어요.
              </p>
              <SignupIllustration className="mx-auto mt-4 w-full max-w-[360px]" />
            </>
          )}
        </div>
      )}

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

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web exec vitest run SignupStepVerify`
Expected: PASS (기존 2 + 신규 3 = 5 passed).

- [ ] **Step 5: 커밋**

```bash
git add "frontend/apps/web/app/(auth)/signup/_components/SignupStepVerify.tsx" "frontend/apps/web/test/(auth)/signup/SignupStepVerify.test.tsx"
git commit -m "feat(web): 회원가입 Step1 히어로 상태별 재구성 및 일러스트 배치"
```

---

### Task 3: `PhoneVerificationField` 발급 후 재배치 (데스크톱 QR 2단 · 모바일 점진 노출)

**Files:**
- Modify: `frontend/apps/web/app/(auth)/signup/_components/PhoneVerificationField.tsx`
- Test: `frontend/apps/web/test/(auth)/signup/PhoneVerificationField.test.tsx`

**Interfaces:**
- Consumes: `buildSmsDeeplink`, `formatSeconds`, `isIosUserAgent`, `isMobileUserAgent`(기존 `../_lib/phone-verification`), `PhoneInput`. 프롭 16개 **무변경**.
- Produces: 발급 후(issued/waiting) — 데스크톱은 QR 2단 + `[문자를 보냈어요]`/`[재발급]`; 모바일은 `[문자앱으로 코드 보내기]` 하나 → 탭 후 `[문자앱 다시 열기]` + `[문자를 보냈어요]`/`[재발급]`. 딥링크 앵커 라벨: `문자앱으로 코드 보내기`.

- [ ] **Step 1: 모바일 딥링크 테스트 갱신 + 점진 노출 케이스 작성**

`PhoneVerificationField.test.tsx` 에서 **기존 line 79 테스트**(`'모바일 UA 에서 issued 면 sms 딥링크 앵커를 노출하고 클릭 시 onSent 를 호출한다'`)를 아래 **두 테스트로 교체**한다:
```tsx
  it('모바일 UA 에서 issued 면 처음엔 [문자앱으로 코드 보내기] 하나만 노출한다', () => {
    stubUserAgent(IPHONE_UA);
    try {
      render(
        <PhoneVerificationField
          {...baseProps}
          status="issued"
          code="7K3M9PXQ"
          moNumber="16663538"
        />,
      );
      const smsLink = screen.getByRole('link', { name: '문자앱으로 코드 보내기' });
      // iOS 는 비표준 `&body=` 구분자를 쓴다(buildSmsDeeplink 의 ios 분기).
      expect(smsLink).toHaveAttribute('href', 'sms:16663538&body=7K3M9PXQ');
      // 탭 전에는 보냈어요/재발급이 숨겨져 있다.
      expect(screen.queryByRole('button', { name: '문자를 보냈어요' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /재발급/ })).not.toBeInTheDocument();
    } finally {
      restoreUserAgent();
    }
  });

  it('모바일에서 딥링크를 누르면 보냈어요·재발급이 나타나고 보냈어요가 onSent 를 호출한다', async () => {
    stubUserAgent(IPHONE_UA);
    try {
      const onSent = vi.fn();
      const user = userEvent.setup();
      render(
        <PhoneVerificationField
          {...baseProps}
          status="issued"
          code="7K3M9PXQ"
          moNumber="16663538"
          onSent={onSent}
        />,
      );
      // 딥링크 탭 = 문자앱 열기 + 버튼 노출(폴링 시작 아님, onSent 아직 호출 안 됨).
      await user.click(screen.getByRole('link', { name: '문자앱으로 코드 보내기' }));
      expect(onSent).not.toHaveBeenCalled();
      const sentButton = screen.getByRole('button', { name: '문자를 보냈어요' });
      expect(screen.getByRole('button', { name: /재발급/ })).toBeInTheDocument();
      await user.click(sentButton);
      expect(onSent).toHaveBeenCalled();
    } finally {
      restoreUserAgent();
    }
  });
```

같은 파일의 **데스크톱 QR 테스트**(line 118 부근)에서 없어야 하는 딥링크 라벨을 새 라벨로 바꾼다:
```tsx
      // 데스크톱에서는 sms 딥링크 앵커가 없어야 한다.
      expect(screen.queryByRole('link', { name: '문자앱으로 코드 보내기' })).not.toBeInTheDocument();
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web exec vitest run PhoneVerificationField`
Expected: FAIL — 현재 컴포넌트는 모바일에서 딥링크 라벨이 `문자 앱으로 보내기`이고, 딥링크 클릭이 `onSent`를 호출하며, 발급 즉시 `[문자를 보냈어요]`가 보이므로 신규 케이스가 실패.

- [ ] **Step 3: 컴포넌트 재구성**

`frontend/apps/web/app/(auth)/signup/_components/PhoneVerificationField.tsx` 전체를 아래로 교체(프롭 `type Props`·`formatMoNumber` 는 기존과 동일, import 에 `useEffect`·`useState` 추가):
```tsx
'use client';

import { useEffect, useState } from 'react';
import { buildSmsDeeplink, formatSeconds, isIosUserAgent, isMobileUserAgent } from '../_lib/phone-verification';
import type { PhoneVerificationFieldStatus } from '../_lib/use-phone-verification';
import { PhoneInput } from './PhoneInput';

type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  status: PhoneVerificationFieldStatus;
  code: string;
  moNumber: string;
  qrCode: string | null;
  remainingSeconds: number;
  resendCooldownSeconds: number;
  issuing: boolean;
  canIssue: boolean;
  errorMessage: string | null;
  stalled: boolean;
  onIssue: (includeQr: boolean) => void;
  onSent: () => void;
  onReset: () => void;
  onRecheck: () => void;
};

/** moNumber(8자리 숫자 문자열)를 "1666-3538" 형태로 표시한다. 형식이 다르면 원본을 그대로 보여준다. */
function formatMoNumber(rawNumber: string): string {
  if (!/^\d{8}$/.test(rawNumber)) return rawNumber;
  return `${rawNumber.slice(0, 4)}-${rawNumber.slice(4)}`;
}

export function PhoneVerificationField({
  phone,
  onPhoneChange,
  status,
  code,
  moNumber,
  qrCode,
  remainingSeconds,
  resendCooldownSeconds,
  issuing,
  canIssue,
  errorMessage,
  stalled,
  onIssue,
  onSent,
  onReset,
  onRecheck,
}: Props) {
  const isMobile = typeof navigator !== 'undefined' && isMobileUserAgent(navigator.userAgent);
  const isIos = typeof navigator !== 'undefined' && isIosUserAgent(navigator.userAgent);

  const verified = status === 'verified';
  const showIssuedFields = status === 'issued' || status === 'waiting';

  // 모바일 점진 노출: 딥링크(문자앱 열기)를 한 번 눌러야 [문자를 보냈어요]·[재발급]이 나타난다.
  const [linkOpened, setLinkOpened] = useState(false);
  // 새 코드가 발급되면(재발급 포함) 처음 상태로 되돌린다.
  useEffect(() => {
    setLinkOpened(false);
  }, [code]);

  function handleCopyCode() {
    void navigator.clipboard.writeText(code);
  }

  // 대기 안내(확인 중 / stall + 지금 확인) — 데스크톱·모바일 공용.
  const waitingNotice =
    status === 'waiting' ? (
      stalled ? (
        <>
          <p className="mt-3 text-xs text-coral" aria-live="polite">
            아직 확인되지 않았어요. 문자에 코드만 담아 그대로 보냈는지 확인하고, 문자 도착 후 아래 [지금 확인]을 누르거나, 계속 안 되면 재발급하세요.
          </p>
          <button type="button" onClick={onRecheck} className="btn btn-sm mt-2">
            지금 확인
          </button>
        </>
      ) : (
        <p className="mt-3 text-xs text-charcoal-3" aria-live="polite">
          확인 중…
        </p>
      )
    ) : null;

  // [문자를 보냈어요] + [재발급] 액션 행 (데스크톱 상시 / 모바일 탭 후).
  const actionRow = (
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={onSent} className="btn btn-primary flex-1">
        문자를 보냈어요
      </button>
      <button
        type="button"
        disabled={!canIssue}
        onClick={() => onIssue(!isMobile)}
        className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
      >
        재발급{resendCooldownSeconds > 0 ? ` (${resendCooldownSeconds}s)` : ''}
      </button>
    </div>
  );

  return (
    <div>
      {errorMessage && (
        <p role="alert" className="mb-3 rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          {errorMessage}
        </p>
      )}

      {status === 'idle' && (
        <div>
          <label htmlFor="signup-phone" className="mb-1.5 block text-sm font-medium text-charcoal">
            휴대폰 번호
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <PhoneInput value={phone} onChange={onPhoneChange} />
            </div>
            <button
              type="button"
              disabled={!canIssue}
              onClick={() => onIssue(!isMobile)}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              {issuing ? '발급 중…' : '인증 시작'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-charcoal-3">번호로 인증코드를 문자 전송해 주세요</p>
        </div>
      )}

      {showIssuedFields && !isMobile && (
        // 데스크톱: QR 메인 2단
        <div>
          <div className="grid grid-cols-[168px_1fr] items-center gap-5 rounded-md border border-line bg-paper p-4">
            <div className="text-center">
              {qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrCode} alt="문자 전송 QR" className="mx-auto h-40 w-40 rounded-lg border border-line" />
              ) : (
                <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg border border-line bg-graysoft px-3 text-center text-xs text-charcoal-3">
                  QR을 표시할 수 없어요. 아래 수신번호로 코드를 그대로 문자로 보내주세요.
                </div>
              )}
              <p className="mt-2 text-xs font-semibold text-ink">① QR 촬영</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-3">수신번호 {formatMoNumber(moNumber)}</p>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="font-mono text-2xl font-bold tracking-wide text-ink">{code}</span>
                <button type="button" onClick={handleCopyCode} className="btn btn-sm shrink-0 whitespace-nowrap">
                  코드 복사
                </button>
              </div>
              <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
              <p className="mt-2 text-xs text-charcoal-3">
                ② 문자앱에서 → ③ 그대로 전송 → <span className="font-semibold text-ink-soft">✓ 자동 인증</span>
              </p>
            </div>
          </div>
          {actionRow}
          <p className="mt-2 text-xs text-charcoal-3">
            메시지를 수정 없이 그대로 보내주세요 · 요금제에 따라 문자 요금이 발생할 수 있어요
          </p>
          {waitingNotice}
        </div>
      )}

      {showIssuedFields && isMobile && (
        // 모바일: CTA 우선 점진 노출
        <div>
          <div className="rounded-md border border-line bg-paper p-4 text-center">
            <p className="text-xs text-charcoal-3">수신번호 {formatMoNumber(moNumber)} · 코드</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-wide text-ink">{code}</p>
            <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
          </div>

          {!linkOpened ? (
            <>
              <a
                href={buildSmsDeeplink(moNumber, code, isIos)}
                onClick={() => setLinkOpened(true)}
                className="btn btn-primary btn-big mt-3 flex w-full items-center justify-center"
              >
                문자앱으로 코드 보내기
              </a>
              <p className="mt-2 text-xs text-charcoal-3">
                버튼을 누르면 문자 앱이 열리고 수신번호·코드가 자동으로 채워져요. 그대로 보내면 끝!
              </p>
            </>
          ) : (
            <>
              <a
                href={buildSmsDeeplink(moNumber, code, isIos)}
                onClick={() => setLinkOpened(true)}
                className="btn btn-secondary mt-3 flex w-full items-center justify-center"
              >
                문자앱 다시 열기
              </a>
              {actionRow}
              <p className="mt-2 text-xs text-charcoal-3">
                문자를 보낸 뒤 [문자를 보냈어요]를 눌러주세요 · 수정 없이 그대로 전송해야 인증돼요
              </p>
            </>
          )}
          {waitingNotice}
        </div>
      )}

      {verified && (
        <div>
          <p className="text-sm font-medium text-emerald-600">✓ 이 번호로 인증됐어요</p>
          <p className="mt-1 text-sm text-charcoal-3">{phone}</p>
        </div>
      )}

      {status === 'expired' && (
        <div>
          <p className="text-sm text-charcoal-3">시간이 초과됐어요. 다시 인증해주세요.</p>
          <button type="button" onClick={onReset} className="btn btn-primary mt-2">
            다시 인증
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web exec vitest run PhoneVerificationField`
Expected: PASS — 갱신된 모바일 케이스 2개 포함 전부 통과(데스크톱 케이스는 기본 UA=비모바일이라 그대로 유지).

- [ ] **Step 5: 시그니처·회귀 확인 + 커밋**

Run: `pnpm --filter @duing/web exec vitest run signup`
Expected: PASS — `SignupFormPanel`·`use-phone-verification` 통합 테스트 포함 전체 그린(통합 테스트는 기본 UA=데스크톱 경로라 `[문자를 보냈어요]` 그대로 사용).

```bash
git add "frontend/apps/web/app/(auth)/signup/_components/PhoneVerificationField.tsx" "frontend/apps/web/test/(auth)/signup/PhoneVerificationField.test.tsx"
git commit -m "feat(web): 회원가입 인증 UI 데스크톱 QR 2단·모바일 CTA 점진 노출 재배치"
```

---

### Task 4: 전체 검증

**Files:** 없음(검증 전용).

- [ ] **Step 1: 타입·린트·테스트 그린**

Run(모두 `frontend/` 에서):
```bash
pnpm typecheck
pnpm --filter @duing/web exec vitest run signup
pnpm lint
```
Expected: `typecheck` 7/7 Done · vitest signup 전부 passed · lint 신규 경고 0(기존 무관 경고만).

- [ ] **Step 2: 시각 QA(로컬 :3000)**

Run: 프론트 dev 서버(:3000) 기동 후 `/signup` 에서 idle → 인증 시작 → 발급(데스크톱 QR 2단 / 모바일 CTA 점진 노출) → verified 흐름을 눈으로 확인. 사이드바(lg+) 옆 520 폭 유지·일러스트 폰 전체 노출(하단 안 잘림)·배지 없음 확인. QA 끝나면 서버 종료.

- [ ] **Step 3: 정리**

작업 트리 클린 확인:
```bash
git status --short
git log --oneline -4
```
Expected: 클린 · Task1~3 커밋 3개 존재.

---

## Self-Review

**1. Spec coverage** — 스펙 각 절 대응:
- §3 히어로(배지 없음·단일 제목·일러스트) → Task 2. §4.1 idle → Task 2/3. §4.2 데스크톱 QR 2단·일러스트 숨김 → Task 3(+Task 2 showFullHero=false). §4.3 모바일 점진 노출(linkOpened·CTA 강등) → Task 3. §4.4 verified/§4.5 expired → Task 3(무변경 유지). §5 일러스트(viewBox 660·role img·aria-label) → Task 1. §6 파일 → File Structure. §7 접근성(aria-label·QR alt·aria-live) → Task 1/3. §8 테스트 → 각 Task 테스트 + Task 4 회귀. §2 폭 520·사이드바 무변경 → Global Constraints(SignupFormPanel 무변경).
- 갭 없음. 모션(§5)은 **의도적 축소** — v1 은 정적 일러스트(YAGNI); reduced-motion 모션은 후속 폴리시로 남김(Out of Scope 아님, 단순 미도입).

**2. Placeholder scan** — TBD/TODO/"적절히"류 없음. 모든 코드 스텝에 완전한 코드 포함.

**3. Type consistency** — `SignupIllustration({ className?: string })` 를 Task 2 에서 `className` 프롭으로 사용(일치). `PhoneVerificationField` 프롭 16개·`PhoneVerificationController` 필드명 기존과 동일. `buildSmsDeeplink(moNumber, code, isIos)` 시그니처 기존 사용과 동일. 딥링크 라벨 `문자앱으로 코드 보내기` 를 컴포넌트·테스트 양쪽에서 동일 사용.
