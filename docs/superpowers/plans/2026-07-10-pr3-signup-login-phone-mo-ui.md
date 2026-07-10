# PR3 — 프론트 학번 로그인 + 휴대폰 MO 인증 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **구현 워커 공통 제약: `git push`·PR 생성 금지.** 커밋까지만 하고 멈춘다. push/PR 은 전체 리뷰·self-check 후 사용자 확인을 받아 컨트롤러가 수행한다.

**Goal:** 프론트엔드 로그인을 이메일 → 학번(8자리)으로, 회원가입 본인확인을 이메일 인증 → 휴대폰 MO 인증 세션(발급→문자 발송→3초 폴링→VERIFIED→토큰 소비)으로 전환하고, 이메일 인증 프론트 스택·email 노출·프로필 번호 편집을 제거한다. (백엔드 PR2 는 이미 develop 에 반영된 계약을 전제.)

**Architecture:** 설계 `docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md` §14(프론트 구현 구조)·§4(UX)·§6(폴링). 백엔드 계약(배포됨): `POST /auth/login {studentId, password}`, `POST /auth/signup {studentId,name,password,grade,college,major,verificationToken,termsOfServiceAgreed,privacyPolicyAgreed}`, `POST /auth/phone-verifications {phone}` `?qr=true`(→ `{verificationToken,code,moNumber,qrCode,expiresAt,expiresInSeconds}`), `GET /auth/phone-verifications/{token}`(→ `{status,expiresInSeconds,maskedPhone}`). 이메일 인증 엔드포인트·응답의 email 은 삭제됨.

**Tech Stack:** Next.js 15 App Router + React 19, pnpm workspaces(`packages/types`·`schemas`·`api`·`hooks`, `apps/web`), TanStack Query v5, Zod, ky, Vitest.

## Global Constraints

- 작업 디렉터리: 모든 pnpm 명령은 `frontend/` 에서 실행(`cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend`). 검증 명령(루트 package.json 실제 스크립트): 전체는 `pnpm typecheck`(=`pnpm -r typecheck`)·`pnpm lint`·`pnpm test`(=`pnpm -r test -- --run`). **포커스 단위 테스트는 watch 모드를 피해 `pnpm --filter @duing/web exec vitest run <패턴>`**(스키마 패키지는 `pnpm --filter @duing/schemas exec vitest run`). `| tail` 등으로 exit code 가리지 말 것.
- 브랜치: `feat/signup-login-phone-mo-ui` (develop 에서 분기).
- 커밋: Conventional Commits 한국어(`feat(web): ...`). **Co-Authored-By / 🤖 Generated 라인 절대 금지.**
- **각 태스크는 `pnpm typecheck` 가 green 이어야 한다.** 그래서 공유 타입 필드 제거는 그 소비처를 같은 태스크에서 함께 고친다(수직 슬라이스). email 필드 제거는 Task 4·5·6 에서 소비처와 원자적으로.
- FE 컨벤션(`frontend/CLAUDE.md`): `type` 사용(`interface` 금지), `any`·`as` 금지(불가피 시 `unknown`+가드/zod), 서버상태는 TanStack Query만(useState/useEffect 패칭 금지), `@duing/api` 없이 `fetch`/`ky` 직접호출 금지, `packages/*` 에 DOM API(`window`/`document`/`navigator`) import 금지 — UA 판정 유틸은 문자열 인자로 받고 `navigator.userAgent` 는 `apps/web` 컴포넌트에서만 읽는다. 불필요한 `'use client'` 금지.
- 기존 auth 폼 패턴 유지: manual `useState`/`useReducer` + `zodSchema.safeParse()`(react-hook-form 으로 바꾸지 말 것 — 요청 외 리팩터 금지).
- 변수명 축약(`data`/`res`/`e`) 금지. 사용자 대면 문구 한국어.
- 신규/수정 파일 EOF newline. `@DisplayName` 대응은 vitest `it('...한다')` 한국어 문장.
- 각 태스크 완료 시 커밋. 태스크마다 spec 리뷰 + 코드 품질 리뷰(feature-dev:code-reviewer) 통과 후 다음 진행.

## Out of Scope (이 PR 에서 하지 않는 것)

- `/forgot-password` 페이지·비밀번호 재설정, 설정 내 **번호 변경 재인증** 다이얼로그, MO 세션 `purpose` 노출(전부 PR4). 로그인 폼의 "비밀번호를 잊으셨나요?" 링크는 이미 존재하지 않는 페이지를 가리키는 **기존 죽은 링크**라 그대로 두고 PR4 에서 페이지를 만든다(PR3 가 새로 깨는 게 아님).
- `PasswordChangeDialog`(현재 세션 비번 변경 — 무관, 불가침).
- 백엔드(PR2 로 완료), 메일 인프라 제거(PR5).
- 조직 연락처 email(`Club.contactEmail`, `SubmitRecertificationRequest.contactEmail` 등) — 개인 로그인 email 과 무관, 불가침.
- QR 자체 생성 라이브러리 도입(백엔드가 `qrCode` data URL 제공).

## 배포 선행(코드 외, 체크리스트로만)

- 실기기 딥링크/QR QA: iOS Safari·iOS Chrome·Android Chrome·삼성인터넷·카카오톡 인앱에서 `sms:` body 프리필 + QR 스캔 확인 → 결과로 `isIosUserAgent`/`isMobileUserAgent` 분기 조정(조정 범위가 `_lib/phone-verification.ts` 유틸에 갇히도록 구현). jsdom 자동화 불가.

---

### Task 0: 브랜치 생성

- [ ] **Step 0-1**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/signup-login-phone-mo-ui
```
Expected: `Switched to a new branch 'feat/signup-login-phone-mo-ui'`

---

### Task 1: MO 인증 기반 스택 (순수 추가 — 제거 없음)

이 태스크는 전부 **추가**라 기존 코드/타입을 건드리지 않고 typecheck 가 green 이다. `PhoneVerificationField` 는 아직 아무도 안 쓰지만 단위 테스트로 격리 검증한다.

**Files:**
- Modify: `packages/types/src/user.ts` (타입 추가만)
- Modify: `packages/api/src/client.ts` (auth 인터페이스·구현에 메서드 2개 추가, import 추가)
- Create: `packages/hooks/src/authQueryKeys.ts`
- Modify: `packages/hooks/src/auth.ts` (훅 2개 추가, import 추가), `packages/hooks/src/index.ts` (배럴에 훅 2개 추가)
- Create: `apps/web/app/(auth)/signup/_lib/phone-verification.ts`
- Create: `apps/web/app/(auth)/signup/_lib/use-phone-verification.ts`
- Create: `apps/web/app/(auth)/signup/_components/PhoneVerificationField.tsx`
- Test (create): `apps/web/test/(auth)/signup/phone-verification.test.ts`, `apps/web/test/(auth)/signup/use-phone-verification.test.tsx`, `apps/web/test/(auth)/signup/PhoneVerificationField.test.tsx`

**Interfaces produced (later tasks consume):**
- Types: `StartPhoneVerificationPayload`, `PhoneVerificationSession`, `PhoneVerificationStatusValue`, `PhoneVerificationStatus`
- Client: `client.auth.startPhoneVerification(payload, includeQr)`, `client.auth.getPhoneVerificationStatus(token)`
- Hooks: `useStartPhoneVerificationMutation()`, `usePhoneVerificationStatusQuery(token|null, {enabled})`, `authQueryKeys`
- Hook: `usePhoneVerification(phone)` → 상태머신 (아래 스펙)
- Component: `<PhoneVerificationField phone verification onPhoneChange />`

- [ ] **Step 1-1: 타입 추가** — `packages/types/src/user.ts` 끝에 추가(기존 email 타입은 Task 4 에서 제거, 지금은 유지).

```ts
export type StartPhoneVerificationPayload = {
  phone: string;
};

export type PhoneVerificationSession = {
  verificationToken: string;
  code: string;
  moNumber: string;
  qrCode: string | null;
  expiresAt: string;
  expiresInSeconds: number;
};

export type PhoneVerificationStatusValue = 'PENDING' | 'VERIFIED' | 'EXPIRED';

export type PhoneVerificationStatus = {
  status: PhoneVerificationStatusValue;
  expiresInSeconds: number;
  maskedPhone: string | null;
};
```

- [ ] **Step 1-2: 클라이언트 메서드 추가** — `packages/api/src/client.ts`.
  1. import(`from '@duing/types'`)에 `StartPhoneVerificationPayload`, `PhoneVerificationSession`, `PhoneVerificationStatus` 추가.
  2. `DuingApiClient.auth` 타입 블록의 `logout(): Promise<void>;` 위에 추가:

```ts
    startPhoneVerification(
      payload: StartPhoneVerificationPayload,
      includeQr: boolean,
    ): Promise<PhoneVerificationSession>;
    getPhoneVerificationStatus(verificationToken: string): Promise<PhoneVerificationStatus>;
```
  3. 구현부(`auth: { ... signup/login ... }`)에 기존 `signup`/`login` 옆 패턴 그대로 추가(헬퍼 `jsonOk`·`http` 는 파일 내 기존 이름 사용):

```ts
    startPhoneVerification: (payload, includeQr) =>
      jsonOk<PhoneVerificationSession>(
        http.post('auth/phone-verifications', {
          json: payload,
          searchParams: includeQr ? { qr: 'true' } : undefined,
        }),
      ),
    getPhoneVerificationStatus: (verificationToken) =>
      jsonOk<PhoneVerificationStatus>(
        http.get(`auth/phone-verifications/${verificationToken}`),
      ),
```
  주의: 파일의 실제 구현 헬퍼명이 `jsonOk` 가 아니면(signup 구현 라인 확인) 그 이름을 쓴다. searchParams 는 ky 옵션.

- [ ] **Step 1-3: queryKeys 생성** — `packages/hooks/src/authQueryKeys.ts`:

```ts
export const authQueryKeys = {
  all: ['auth'] as const,
  phoneVerification: (verificationToken: string) =>
    [...authQueryKeys.all, 'phoneVerification', verificationToken] as const,
};
```

- [ ] **Step 1-4: 훅 추가** — `packages/hooks/src/auth.ts`.
  1. import 에 타입 추가: `StartPhoneVerificationPayload`(그리고 `useQuery` 는 이미 import 됨). `authQueryKeys` import: `import { authQueryKeys } from './authQueryKeys';`
  2. 파일 끝(이메일 훅은 Task 4 에서 제거 — 지금은 그대로 두고 아래를 추가):

```ts
export function useStartPhoneVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ payload, includeQr }: { payload: StartPhoneVerificationPayload; includeQr: boolean }) =>
      client.auth.startPhoneVerification(payload, includeQr),
  });
}

// 서버 상태를 3초 간격으로 폴링한다. VERIFIED/EXPIRED 로 확정되면 refetchInterval=false 로 스스로 멈추고,
// 백그라운드 탭에서는 폴링하지 않는다. enabled 는 "문자 보냈어요" 를 누른 뒤(waiting)에만 true 로 넘긴다.
export function usePhoneVerificationStatusQuery(
  verificationToken: string | null,
  options: { enabled: boolean },
) {
  const client = useApiClient();
  return useQuery({
    queryKey: authQueryKeys.phoneVerification(verificationToken ?? ''),
    queryFn: () => client.auth.getPhoneVerificationStatus(verificationToken as string),
    enabled: options.enabled && verificationToken !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'VERIFIED' || status === 'EXPIRED' ? false : 3000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  });
}
```
  3. `packages/hooks/src/index.ts` 배럴에 `useStartPhoneVerificationMutation`, `usePhoneVerificationStatusQuery` 를 named export 로 추가.

- [ ] **Step 1-5: 순수 유틸 + 테스트(TDD)** — 먼저 `apps/web/test/(auth)/signup/phone-verification.test.ts` 작성:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSmsDeeplink,
  isIosUserAgent,
  isMobileUserAgent,
  formatSeconds,
  mapIssueError,
  mapStatusError,
} from '@/app/(auth)/signup/_lib/phone-verification';
import { ApiError } from '@duing/api';

describe('phone-verification 유틸', () => {
  it('iOS UA 는 sms 딥링크에 & 구분자를 쓴다', () => {
    expect(buildSmsDeeplink('16663538', '7K3M9PXQ', true)).toBe('sms:16663538&body=7K3M9PXQ');
  });
  it('비 iOS UA 는 ? 구분자를 쓴다', () => {
    expect(buildSmsDeeplink('16663538', '7K3M9PXQ', false)).toBe('sms:16663538?body=7K3M9PXQ');
  });
  it('본문은 URL 인코딩된다', () => {
    expect(buildSmsDeeplink('16663538', 'A B', false)).toBe('sms:16663538?body=A%20B');
  });
  it('iPhone UA 를 iOS 로 판정한다', () => {
    expect(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBe(false);
  });
  it('모바일 UA 를 판정한다', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe(false);
  });
  it('초를 mm:ss 로 만든다', () => {
    expect(formatSeconds(65)).toBe('01:05');
  });
  it('발급 에러 코드를 한국어로 매핑한다', () => {
    expect(mapIssueError(new ApiError(409, 'x', undefined, 'PHONE_ALREADY_REGISTERED'))).toContain('이미 가입');
    expect(mapIssueError(new ApiError(429, 'x', undefined, 'PHONE_VERIFICATION_COOLDOWN'))).toContain('잠시 후');
  });
  it('상태조회 에러 코드를 한국어로 매핑한다', () => {
    expect(mapStatusError(new ApiError(503, 'x', undefined, 'SMS_POLL_QUOTA_EXCEEDED'))).toContain('제한');
    expect(mapStatusError(new ApiError(404, 'x', undefined, 'PHONE_VERIFICATION_NOT_FOUND'))).toContain('다시 시작');
  });
});
```
  실패 확인: `pnpm --filter @duing/web exec vitest run phone-verification` → 모듈 미존재로 FAIL.

  구현 `apps/web/app/(auth)/signup/_lib/phone-verification.ts`:

```ts
import { ApiError } from '@duing/api';

export const RESEND_COOLDOWN_SECONDS = 60;
export const SMS_TIMEOUT_SECONDS = 300; // 세션 TTL(5분)과 정렬 (spec §4.3)

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function isIosUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

/**
 * SMS 딥링크. iOS 는 비표준 `&body=`, 그 외(Android Chromium)는 `?body=` (spec §4.1).
 * 실기기 보장이 없으므로 호출부는 항상 수신번호·코드 수동 폴백을 함께 노출한다.
 */
export function buildSmsDeeplink(moNumber: string, code: string, ios: boolean): string {
  const separator = ios ? '&' : '?';
  return `sms:${moNumber}${separator}body=${encodeURIComponent(code)}`;
}

export function mapIssueError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PHONE_ALREADY_REGISTERED') return '이미 가입된 번호예요. 로그인해 주세요.';
    if (error.code === 'PHONE_VERIFICATION_COOLDOWN') return '잠시 후 다시 시도할 수 있어요.';
    if (error.code === 'VERIFICATION_RATE_LIMITED') return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    if (error.status === 409) return '이미 가입된 번호예요. 로그인해 주세요.';
    return error.message;
  }
  return '인증 시작에 실패했어요. 잠시 후 다시 시도해주세요.';
}

export function mapStatusError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'SMS_POLL_QUOTA_EXCEEDED') return '일시적으로 인증 확인이 제한됐어요. 잠시 후 다시 시도해주세요.';
    if (error.code === 'PHONE_VERIFICATION_NOT_FOUND') return '인증 세션을 찾을 수 없어요. 다시 시작해주세요.';
    return error.message;
  }
  return '인증 확인 중 문제가 발생했어요.';
}
```
  통과 확인.

- [ ] **Step 1-6: `usePhoneVerification` 상태머신 훅 + 테스트(TDD)**

  **상태머신 스펙** (`_lib/use-phone-verification.ts`, `use-email-verification.ts` 를 레퍼런스로 미러):

  | status | 진입 | 폴링 | UI 의미 |
  |---|---|---|---|
  | `idle` | 초기·phone 변경·reset | ✗ | 번호 입력받고 [인증 시작] 대기 |
  | `issued` | issue() 성공 | ✗ | 코드·QR/딥링크 표시, [문자를 보냈어요] 대기 |
  | `waiting` | markSent() | ✓(3초) | 폴링 중 |
  | `verified` | 폴링 status=VERIFIED | ✗ | 완료(토큰 확정) |
  | `expired` | 폴링 status=EXPIRED 또는 remaining=0 | ✗ | 시간초과, 재발급 유도 |

  **인자·반환:** `usePhoneVerification(phone: string)` 반환 →
  `{ status, verified: status==='verified', session, verificationToken: session?.verificationToken ?? null, code: session?.code ?? '', moNumber: session?.moNumber ?? '', qrCode: session?.qrCode ?? null, remainingSeconds, resendCooldownSeconds, issuing, canIssue, errorMessage, issue, markSent, reset }`.

  **핵심 동작(구현 지침):**
  - 내부 state: `status`, `session: PhoneVerificationSession | null`, `remainingSeconds`, `resendCooldownSeconds`, `errorMessage`.
  - `startMutation = useStartPhoneVerificationMutation()`.
  - `includeQr` 는 호출부(컴포넌트)가 UA 로 정해 issue 에 넘긴다: `issue(includeQr: boolean)`.
  - `issue(includeQr)`: phone 을 `/^010-\d{4}-\d{4}$/` 로 선검증(불일치 시 errorMessage 세팅 후 return). `startMutation.mutateAsync({payload:{phone}, includeQr})` → 성공 시 `session=결과`, `status='issued'`, `remainingSeconds=결과.expiresInSeconds`, `resendCooldownSeconds=RESEND_COOLDOWN_SECONDS`, `errorMessage=null`. 실패 시 `errorMessage=mapIssueError(e)`.
  - `markSent()`: `status==='issued'` 일 때만 `status='waiting'`.
  - 폴링: `const poll = usePhoneVerificationStatusQuery(session?.verificationToken ?? null, { enabled: status === 'waiting' })`.
  - effect: `poll.data?.status` 가 `'VERIFIED'` → `setStatus('verified')`; `'EXPIRED'` → `setStatus('expired')`. `poll.error` → `errorMessage=mapStatusError(poll.error)`(단, PENDING 유지 — 폴링 계속). deps `[poll.data?.status]`.
  - 1초 틱 effect: `status==='issued' || status==='waiting'` 일 때 `setInterval(1000)` 로 `remainingSeconds`·`resendCooldownSeconds` 를 각각 `Math.max(0, n-1)`. `remainingSeconds` 가 0 이 되면 `status='expired'`. cleanup `clearInterval`.
  - phone 변경 시 리셋: `previousPhoneRef` 로 phone 이 바뀌면 `reset()`(email 훅의 previousEmailRef 미러). **단, `status==='verified'` 여도 phone 이 바뀌면 리셋**(검증된 번호가 아닌 다른 번호로 가입되는 것 방지 — 검증은 세션의 번호 기준이라 서버가 최종 방어하지만 UX 정합).
  - `canIssue`: `/^010-\d{4}-\d{4}$/.test(phone) && !startMutation.isPending && status !== 'verified' && resendCooldownSeconds === 0`.
  - `reset()`: status='idle', session=null, remaining=0, cooldown=0, errorMessage=null.

  **테스트** `apps/web/test/(auth)/signup/use-phone-verification.test.tsx` (renderHook + fake timers + QueryClient wrapper + mock ApiClient via ApiProvider — 기존 훅 테스트의 provider 패턴을 따르되 TanStack Query 자체는 모킹 금지(CLAUDE.md), `client.auth.startPhoneVerification`/`getPhoneVerificationStatus` 를 stub 한 ApiClient 를 주입):
  - `it('issue 성공 시 issued 로 전이하고 코드·만료초를 담는다')`
  - `it('markSent 후 waiting 에서 폴링이 VERIFIED 를 받으면 verified 로 전이한다')`(fake timers advance 3s, stub 이 VERIFIED 반환)
  - `it('remainingSeconds 가 0 이 되면 expired 로 전이한다')`
  - `it('phone 이 바뀌면 idle 로 리셋된다(verified 였어도)')`
  - `it('잘못된 번호 형식으로 issue 하면 에러 메시지를 세팅하고 발급하지 않는다')`
  - `it('발급 60초 쿨다운 동안 canIssue 가 false 다')`

  구현 후 통과 확인. (기존 훅 테스트가 어떤 provider util 을 쓰는지 `apps/web/test/` 에서 확인해 동일 패턴 사용. 없으면 최소 QueryClientProvider + 커스텀 ApiProvider 로 stub client 주입.)

- [ ] **Step 1-7: `PhoneVerificationField` 프레젠테이션 컴포넌트 + 테스트(TDD)**

  `EmailVerificationField.tsx` 를 UI 레퍼런스로, 다음 스펙의 dumb 컴포넌트를 만든다(상태는 부모의 `usePhoneVerification` 이 소유, 프롭으로 주입).

  **Props:**
```ts
type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  status: PhoneVerificationStatus... // 'idle'|'issued'|'waiting'|'verified'|'expired'
  code: string;
  moNumber: string;
  qrCode: string | null;
  remainingSeconds: number;
  resendCooldownSeconds: number;
  issuing: boolean;
  canIssue: boolean;
  errorMessage: string | null;
  onIssue: (includeQr: boolean) => void;
  onSent: () => void;
  onReset: () => void;
};
```
  (status 타입은 `use-phone-verification.ts` 에서 `export type PhoneVerificationFieldStatus = 'idle'|'issued'|'waiting'|'verified'|'expired'` 로 내보내 재사용.)

  **UA 판정:** 컴포넌트 최상단에서 `const isMobile = typeof navigator !== 'undefined' && isMobileUserAgent(navigator.userAgent); const isIos = typeof navigator !== 'undefined' && isIosUserAgent(navigator.userAgent);` (client 컴포넌트라 navigator 접근 가능 — packages 아님). [인증 시작] 클릭 시 `onIssue(!isMobile)`(PC 만 QR 요청).

  **상태별 UI:**
  - `idle`: `PhoneInput`(재사용, `value=phone onChange=onPhoneChange`) + [인증 시작] 버튼(`disabled={!canIssue}`, onClick `onIssue(!isMobile)`). 안내문 "번호로 인증코드를 문자 전송해 주세요".
  - `issued`·`waiting`: 번호 잠금 표시(회색), 수신번호(`moNumber` 를 `1666-3538` 형태로 포맷) + 코드(`code`, 큰 monospace) + [코드 복사](navigator.clipboard.writeText(code)) + 만료 카운트다운(`formatSeconds(remainingSeconds)`). 모바일이면 [문자 앱으로 보내기] 앵커(`href={buildSmsDeeplink(moNumber, code, isIos)}`) — 클릭 시 `onSent()` 도 호출. PC 면 `qrCode` 있을 때 `<img src={qrCode} alt="문자 전송 QR" />`(없으면 텍스트 폴백). 공통 [문자를 보냈어요] 버튼(onClick `onSent()`). 안내문 "메시지를 수정 없이 그대로 보내주세요 · 요금제에 따라 문자 요금이 발생할 수 있어요". `waiting` 이면 "확인 중…" 스피너/텍스트. 60초 내 [재발급] 은 `resendCooldownSeconds>0` 이면 `disabled`(남은 초 표시), 아니면 `onIssue(!isMobile)`.
  - `verified`: ✓ "이 번호로 인증됐어요"(초록). 번호 표시.
  - `expired`: "시간이 초과됐어요. 다시 인증해주세요." + [다시 인증] 버튼(onReset → idle).
  - `errorMessage` 있으면 상단에 coral 알럿(email 필드와 동일 스타일).

  **테스트** `apps/web/test/(auth)/signup/PhoneVerificationField.test.tsx`(RTL, `EmailVerificationField.test.tsx` 패턴):
  - `it('idle 에서 유효 번호면 인증 시작 버튼이 활성화된다')`
  - `it('issued 에서 코드와 수신번호, 문자를 보냈어요 버튼을 노출한다')`
  - `it('문자를 보냈어요를 누르면 onSent 를 호출한다')`
  - `it('코드 복사 버튼이 clipboard 에 코드를 쓴다')`(navigator.clipboard mock)
  - `it('verified 에서 인증 완료 문구를 보여준다')`
  - `it('expired 에서 다시 인증 버튼이 onReset 을 호출한다')`
  - `it('errorMessage 를 alert 로 노출한다')`

  통과 확인.

- [ ] **Step 1-8: typecheck/lint/test 후 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm typecheck && pnpm --filter @duing/web exec vitest run signup && pnpm lint
git add -A
git commit -m "feat(web): 휴대폰 MO 인증 기반 타입·클라이언트·훅·필드 컴포넌트 추가"
```
Expected: typecheck·test·lint 통과(정확한 test 필터는 워크스페이스 관례에 맞춤 — Step 1-5 에서 확인한 명령 재사용).

---

### Task 2: 회원가입 폼을 MO 인증으로 재배선

**Files:**
- Modify: `apps/web/app/(auth)/signup/_lib/signup-state.ts` (email 제거, phone 유지)
- Modify: `packages/schemas/src/index.ts` (`signupSchema`: email/phone → verificationToken)
- Modify: `packages/types/src/user.ts` (`SignupPayload`: email/phone → verificationToken)
- Modify: `apps/web/app/(auth)/signup/_components/SignupFormPanel.tsx` (재배선)
- Modify: `packages/schemas/test/signup.test.ts`(email/phone 시드 → verificationToken)
- Test: `apps/web/test/(auth)/signup/` 신규 SignupFormPanel 통합 테스트(선택 — 최소 canSubmit 게이트·403 처리)

**Consumes:** Task 1 의 `usePhoneVerification`, `PhoneVerificationField`.

- [ ] **Step 2-1: signup-state 변경** — `SignupFormState`·`initialSignupState` 에서 `email` 제거(주석 `// step 1`/`// step 2` 는 유지). `phone` 은 유지(인증 스텝 입력값). 결과:

```ts
export type SignupFormState = {
  password: string;
  passwordConfirm: string;
  name: string;
  studentId: string;
  studentIdConfirm: string;
  grade: Grade | '';
  college: College | '';
  major: string;
  phone: string;
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
};
```
`initialSignupState` 에서 `email: '',` 라인 삭제.

- [ ] **Step 2-2: signupSchema 변경** — `packages/schemas/src/index.ts` `signupSchema` 에서 `email: schoolEmailSchema` 라인과 `phone: z.string().regex(...)` 블록 삭제, 대신 추가:

```ts
  verificationToken: z
    .string()
    .min(1, '휴대폰 인증을 완료해주세요.')
    .max(36, '휴대폰 인증 정보가 올바르지 않습니다.'),
```
(`schoolEmailSchema`·`verificationCodeSchema` 는 Task 4 에서 제거 — 지금 signupSchema 만 참조 해제.)

- [ ] **Step 2-3: SignupPayload 변경** — `packages/types/src/user.ts` `SignupPayload` 에서 `email: string;`·`phone: string;` 삭제, `major` 아래에 `verificationToken: string;` 추가.

- [ ] **Step 2-4: SignupFormPanel 재배선** — 핵심 변경만(나머지 JSX·필드는 그대로):
  1. import 교체: `useEmailVerification`·`EmailVerificationField`·`PhoneInput` 제거, 추가 `import { usePhoneVerification } from '../_lib/use-phone-verification';` · `import { PhoneVerificationField } from './PhoneVerificationField';`
  2. `const emailVerification = useEmailVerification(state.email);` → `const phoneVerification = usePhoneVerification(state.phone);`
  3. `canSubmit` 의 `emailVerification.verified` → `phoneVerification.verified`.
  4. `handleSubmit` 의 `signupSchema.safeParse({...})` 에서 `email: state.email`·`phone: state.phone` 제거, `verificationToken: phoneVerification.verificationToken ?? ''` 추가.
  5. catch 블록의 `signupError.code === 'EMAIL_NOT_VERIFIED'` → `=== 'PHONE_NOT_VERIFIED'`, 그 안 `emailVerification.reset()` → `phoneVerification.reset()`, 메시지 "휴대폰 인증이 만료됐어요. 다시 인증해주세요.".
  6. JSX 의 `<EmailVerificationField .../>` 블록(라인 165–181) 을 아래로 교체:

```tsx
            {/* 휴대폰 MO 인증 */}
            <PhoneVerificationField
              phone={state.phone}
              onPhoneChange={(phone) => setField('phone', phone)}
              status={phoneVerification.status}
              code={phoneVerification.code}
              moNumber={phoneVerification.moNumber}
              qrCode={phoneVerification.qrCode}
              remainingSeconds={phoneVerification.remainingSeconds}
              resendCooldownSeconds={phoneVerification.resendCooldownSeconds}
              issuing={phoneVerification.issuing}
              canIssue={phoneVerification.canIssue}
              errorMessage={phoneVerification.errorMessage}
              onIssue={phoneVerification.issue}
              onSent={phoneVerification.markSent}
              onReset={phoneVerification.reset}
            />
```
  7. **기존 독립 Phone 블록(라인 329–339 `{/* Phone */}`)을 삭제** — 번호 입력은 이제 `PhoneVerificationField` 가 소유한다. (안내문 "연락 인증·경력 안내 번호에 사용되요" 도 함께 삭제.)

- [ ] **Step 2-5: 스키마 테스트 갱신** — `packages/schemas/test/signup.test.ts` 의 `baseInput`(또는 유효 입력 픽스처)에서 `email`·`phone` 키 제거, `verificationToken: 'a'.repeat(36)` 추가. email/phone 검증 케이스가 있으면 verificationToken 누락→실패 케이스로 대체(`verificationToken: ''` → parse 실패).

- [ ] **Step 2-6: typecheck/test/lint 후 커밋**
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm typecheck && pnpm --filter @duing/schemas test && pnpm --filter @duing/web exec vitest run signup && pnpm lint
git add -A && git commit -m "feat(web): 회원가입을 휴대폰 MO 인증 소비 방식으로 전환"
```

---

### Task 3: 로그인 폼을 학번으로 전환

**Files:**
- Modify: `packages/types/src/user.ts` (`LoginPayload`), `packages/schemas/src/index.ts` (`loginSchema`), `apps/web/app/(auth)/login/_components/LoginFormPanel.tsx`
- Test (create): `apps/web/test/(auth)/login/LoginFormPanel.test.tsx` (현재 로그인 테스트 0건)

- [ ] **Step 3-1: 실패 테스트 작성** — `apps/web/test/(auth)/login/LoginFormPanel.test.tsx`:
  - `it('학번이 8자리가 아니면 제출 시 검증 에러를 보여준다')`(입력 `2024`, 제출 → "학번은 8자리 숫자여야 합니다." 노출, login mutation 미호출)
  - `it('유효한 학번·비밀번호로 제출하면 login 을 호출한다')`(stub client.auth.login, 성공 시 호출 인자 `{studentId:'20240001', password:...}`)
  - `it('로그인 실패 시 학번 기준 에러 문구를 보여준다')`(stub reject → "학번 또는 비밀번호가 올바르지 않습니다.")
  (RTL + 기존 훅 provider 패턴. 라우팅은 next/navigation mock — 기존 테스트 관례 확인.)

- [ ] **Step 3-2: LoginPayload 변경** — `packages/types/src/user.ts` `LoginPayload` 의 `email: string;` → `studentId: string;`.

- [ ] **Step 3-3: loginSchema 변경** — `packages/schemas/src/index.ts`:
```ts
export const loginSchema = z.object({
  studentId: z
    .string()
    .min(1, '학번은 필수 입력값입니다.')
    .regex(/^\d{8}$/, '학번은 8자리 숫자여야 합니다.'),
  password: z.string().min(1, '비밀번호는 필수 입력값입니다.'),
});
```

- [ ] **Step 3-4: LoginFormPanel 변경** — email→studentId:
  1. `const [email, setEmail] = useState('')` → `const [studentId, setStudentId] = useState('')`.
  2. `isEmailValid` → `isStudentIdValid = /^\d{8}$/.test(studentId)`.
  3. `handleSubmit`: `loginSchema.safeParse({ email, password })` → `{ studentId, password }`.
  4. 입력 필드: label "학교 이메일" → "학번", `IconMail` → 유지하거나 숫자 아이콘(간단히 `IconMail` 유지 가능 — 선택). input `type="email"`→`type="text"`, `inputMode="numeric"`, `maxLength={8}`, `pattern="\d{8}"`, `autoComplete="username"` 유지, `placeholder="20241234"`, onChange `setStudentId(e.target.value.replace(/\D/g,'').slice(0,8))`, 체크 아이콘 게이트 `isStudentIdValid`. id `login-email`→`login-studentId`, htmlFor 동기화.
  5. 상단 안내문 "대구대학교 학교 이메일로 로그인할 수 있어요." → "학번과 비밀번호로 로그인할 수 있어요.".
  6. catch 문구 유지("이메일 또는 비밀번호..." → "학번 또는 비밀번호가 올바르지 않습니다.").
  7. "비밀번호를 잊으셨나요?" 링크는 그대로 둔다(Out of Scope — PR4).

- [ ] **Step 3-5: 통과 후 커밋**
```bash
pnpm typecheck && pnpm --filter @duing/web exec vitest run login && pnpm lint
git add -A && git commit -m "feat(web): 로그인 식별자를 이메일에서 학번으로 전환"
```

---

### Task 4: 이메일 인증 프론트 스택 + dead code 삭제

이제 signup/login 이 이메일 인증을 안 쓰므로 안전하게 제거.

**Delete:**
- `apps/web/app/(auth)/signup/_components/EmailVerificationField.tsx`
- `apps/web/app/(auth)/signup/_lib/use-email-verification.ts`
- `apps/web/app/(auth)/signup/_lib/email-verification.ts`
- `apps/web/app/(auth)/signup/_components/SignupStepAccount.tsx`, `SignupStepProfile.tsx` (dead)
- `apps/web/app/(auth)/_components/AuthCard.tsx` (미사용)
- Tests: `apps/web/test/(auth)/signup/EmailVerificationField.test.tsx`, `apps/web/test/(auth)/signup/email-verification.test.ts`

**Modify:**
- `packages/types/src/user.ts`: `SendEmailVerificationPayload`·`ConfirmEmailVerificationPayload`·`EmailVerificationResult` 삭제
- `packages/api/src/client.ts`: `auth` 인터페이스의 `sendEmailVerification`·`confirmEmailVerification` 선언·구현 삭제, 관련 타입 import 삭제
- `packages/hooks/src/auth.ts`: `useSendEmailVerificationMutation`·`useConfirmEmailVerificationMutation` 삭제, import 에서 `SendEmailVerificationPayload`·`ConfirmEmailVerificationPayload` 삭제
- `packages/hooks/src/index.ts`: 두 훅 배럴 export 삭제
- `packages/schemas/src/index.ts`: `schoolEmailSchema`·`verificationCodeSchema` 삭제(Task 2 후 소비처 0 — grep 으로 재확인)

- [ ] **Step 4-1:** 위 파일 `git rm`, modify 반영.
- [ ] **Step 4-2: 잔존 참조 확인** — `grep -rn "EmailVerification\|email-verification\|schoolEmailSchema\|verificationCodeSchema\|sendEmailVerification\|confirmEmailVerification" apps/web packages` → app/test 코드에서 0건(마이그레이션·주석 제외). 남으면 제거.
- [ ] **Step 4-3:** `pnpm typecheck && pnpm --filter @duing/web exec vitest run && pnpm lint` → 통과.
- [ ] **Step 4-4:** `git add -A && git commit -m "feat(web): 이메일 인증 프론트 스택·미사용 컴포넌트 제거"`

---

### Task 5: email 노출 제거 (타입 + 표시 화면)

`User.email` 등 타입 필드와 그 표시 소비처를 원자적으로 제거해 typecheck 를 green 유지.

**Files:**
- Types: `packages/types/src/user.ts`(`User.email`), `packages/types/src/application.ts`(`Applicant.email`, `ApplicantDetail.applicant.email`), `packages/types/src/admin.ts`(`AdminUserSearchResult.email`)
- 표시: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantProfilePanel.tsx`(이메일 dt/dd), `apps/web/app/me/_components/MyPageHeader.tsx`(email prop·📨 렌더) + 호출부 `apps/web/app/me/_pages/MyPage.tsx`·`apps/web/app/me/settings/_pages/SettingsPage.tsx`, `SettingsPage`(이메일 SettingsRow+인증배지), `apps/web/app/admin/clubs/_components/LeaderSearchCombobox.tsx`(email 렌더 2곳·placeholder), `apps/web/app/manage/clubs/[clubId]/_components/RecertificationRequestModal.tsx`(`me?.email` 기본값 → `''`)
- Test: 위 화면의 기존 테스트에 email 단언이 있으면 제거/조정

- [ ] **Step 5-1: 타입에서 email 필드 삭제** — `User`(`email: string;`), `Applicant`(`email`), `ApplicantDetail.applicant.email`, `AdminUserSearchResult`(`email`).
- [ ] **Step 5-2: 표시 소비처 수정**
  - `ApplicantProfilePanel`: 이메일 `<dt>이메일</dt><dd>{...email}</dd>` 행 삭제(전화·학번 유지).
  - `MyPageHeader`: `email` prop(타입·구조분해·📨 렌더 라인) 삭제. 두 호출부(`MyPage.tsx`, `SettingsPage.tsx`)에서 `email={user?.email ?? '—'}` prop 전달 삭제.
  - `SettingsPage`: "이메일" `SettingsRow`(값+하드코딩 "인증완료" 배지) 전체 삭제.
  - `LeaderSearchCombobox`: `selectedLeader.email`·`user.email` 렌더를 `{studentId} · {name}` 형태로(또는 email 조각만 제거), placeholder "학번 / 이름 / 이메일로 회장 검색" → "학번 / 이름으로 회장 검색".
  - `RecertificationRequestModal`: `defaultValues.contactEmail: me?.email ?? ''` → `''`(개인 email 의존 제거; contactEmail 필드 자체는 동아리 연락처라 유지).
- [ ] **Step 5-3: 잔존 참조** — `grep -rn "\.email" apps/web/app | grep -v contactEmail` 로 개인 email 렌더 잔존 0 확인(club/recert contactEmail 은 정상 유지).
- [ ] **Step 5-4:** `pnpm typecheck && pnpm --filter @duing/web exec vitest run && pnpm lint` → 통과.
- [ ] **Step 5-5:** `git add -A && git commit -m "feat(web): 사용자·지원자·회장검색 화면에서 email 노출 제거"`

---

### Task 6: 프로필 수정에서 전화번호 편집 제거 (백엔드 Task 9 의 FE 짝)

백엔드 `PATCH /users/me` 가 phone 을 무시하므로, 다이얼로그에 번호 필드가 남으면 "수정했어요" 토스트만 뜨고 실제 반영 안 되는 거짓 성공 버그다. 제거한다.

**Files:**
- `packages/types/src/user.ts`: `UpdateProfilePayload` 에서 `phone: string;` 삭제
- `apps/web/app/me/settings/_components/ProfileEditDialog.tsx`: phone 상태·입력 블록·payload 삭제(name·grade 만), 이 파일 인라인 `formatPhone` 도 미사용되면 삭제
- Test: `ProfileEditDialog` 테스트에 phone 관련 단언 있으면 제거

- [ ] **Step 6-1:** `UpdateProfilePayload` 에서 `phone` 삭제.
- [ ] **Step 6-2:** `ProfileEditDialog`: phone `useState`·`<label>전화번호</label>` 입력 블록·제출 payload 의 `phone` 삭제. `updateProfile` payload 는 `{ name, grade }` 만. 미사용된 인라인 `formatPhone` 정리.
- [ ] **Step 6-3:** `pnpm typecheck && pnpm --filter @duing/web exec vitest run && pnpm lint` → 통과.
- [ ] **Step 6-4:** `git add -A && git commit -m "feat(web): 프로필 수정에서 전화번호 편집 제거"`

---

### Task 7: 최종 검증 + 실기기 QA 체크리스트

- [ ] **Step 7-1: 전체 검증**
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @duing/web build
```
Expected: 전부 성공(출력에서 성공 문자열 직접 확인, tail 파이프로 exit 가리지 말 것). build 는 login·signup 이 정적 박제되지 않게(force-dynamic 필요 페이지) 기존 설정 유지 확인.

- [ ] **Step 7-2: PR 직전 self-check(컨트롤러 수행 후 사용자 보고)**
  1. typecheck·lint·test·build 전부 SUCCESS
  2. 범위 vs 설계 §14/§16 PR3 일치 — 누락 0(로그인·가입·이메일스택삭제·email노출제거·프로필번호제거), 요청 외 변경 0(forgot-password·번호변경재인증·PasswordChangeDialog·조직 contactEmail 미변경)
  3. 다른 측면: 백엔드 계약과 1:1(엔드포인트·에러코드), 배포는 백엔드 PR2 와 근접(구BE↔신FE 도 로그인·가입만 실패)
  4. 모든 task spec+quality 리뷰 완료
  5. 계획 self-review 재검증
  6. 커밋 규칙(Conventional Commits 한국어, 금지 라인 없음)
  7. EOF newline
  **push·PR 은 이 보고 후 사용자 지시로만.**

- [ ] **Step 7-3: 실기기 QA 체크리스트 남기기** — PR 본문 💬 에 "iOS Safari/Chrome·Android Chrome·삼성인터넷·카카오톡 인앱에서 `sms:` body 프리필 + PC QR 스캔 실기기 확인 필요, 결과에 따라 `_lib/phone-verification.ts` UA 분기 조정" 명시. (자동화 불가 — 코드 완료와 별개.)

---

## 리뷰 체크포인트 (컨트롤러용)

- 태스크마다: spec 준수 + feature-dev:code-reviewer 품질 리뷰(FE 컨벤션 — type/any/as/서버상태·DOM import 규칙).
- 관전 포인트: ① 폴링이 VERIFIED/EXPIRED·비waiting 에서 확실히 멈추는가(refetchInterval false + enabled) ② phone 변경 시 verified 세션도 리셋되는가 ③ QR 은 PC(`!isMobile`)만 요청·렌더, 모바일은 딥링크+수동 폴백 ④ 딥링크 URL iOS/비iOS 분기가 유틸에 갇혀 실기기 결과로 조정 가능한가 ⑤ email 필드 제거가 표시 소비처와 원자적이라 태스크별 typecheck green ⑥ 프로필 번호 제거로 거짓 성공 버그 해소.

## Self-Review (작성 후 spec 대조 — 실행 후 재검증)

- **커버리지**: §14 타입/훅/컴포넌트/가입폼/로그인폼/신설·삭제, §16 PR3(FE 가입·로그인 전환 + dead code) → Task 1~6 매핑. §4 UX(딥링크·QR·폴링 트리거·카운트다운·쿨다운·타임아웃) → Task 1 컴포넌트. §13 프론트 email 제거 목록(ApplicantProfilePanel·MyPageHeader·SettingsPage·LeaderSearchCombobox·packages/types) → Task 5. 프로필 번호(백엔드 Task 9 짝) → Task 6.
- **플레이스홀더**: 순수 파일(타입·스키마·클라이언트·훅·유틸)은 완전 코드. 컴포넌트·상태머신 훅은 상태표+반환형+핵심 effect 지침+레퍼런스(use-email-verification/EmailVerificationField)로 명세 — 구현자가 템플릿 미러링. 테스트는 각 케이스 문장 명시.
- **타입 일관성**: `PhoneVerificationSession`(token/code/moNumber/qrCode/expiresAt/expiresInSeconds)·`PhoneVerificationStatus`(status/expiresInSeconds/maskedPhone)·`usePhoneVerification` 반환형이 컴포넌트 Props·SignupFormPanel 소비와 일치. `SignupPayload.verificationToken`·`signupSchema.verificationToken`·`LoginPayload.studentId`·`loginSchema.studentId` 정합.
