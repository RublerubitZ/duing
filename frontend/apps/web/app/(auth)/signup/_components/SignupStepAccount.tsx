'use client';

import type { SignupFormState } from '../_lib/signup-state';

type Props = {
  state: SignupFormState;
  onField: (field: keyof SignupFormState, value: string) => void;
  onNext: () => void;
  error: string | null;
};

export function SignupStepAccount({ state, onField, onNext, error }: Props) {
  const passwordMismatch =
    state.passwordConfirm.length > 0 && state.password !== state.passwordConfirm;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input
          required
          type="email"
          autoComplete="username"
          value={state.email}
          onChange={(event) => onField('email', event.target.value)}
          placeholder="hong@daegu.ac.kr"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-slate-500">
          대구대학교(@daegu.ac.kr) 이메일만 사용 가능합니다.
        </span>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <input
          required
          type="password"
          autoComplete="new-password"
          value={state.password}
          onChange={(event) => onField('password', event.target.value)}
          placeholder="8~20자, 영문/숫자/특수문자 중 2종 이상"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호 확인</span>
        <input
          required
          type="password"
          autoComplete="new-password"
          value={state.passwordConfirm}
          onChange={(event) => onField('passwordConfirm', event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
        {passwordMismatch && (
          <span className="mt-1 block text-xs text-rose-600">
            비밀번호가 일치하지 않습니다.
          </span>
        )}
      </label>
      {error && <p className="text-sm text-rose-600" aria-live="polite">{error}</p>}
      <button
        type="submit"
        disabled={passwordMismatch}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        다음
      </button>
    </form>
  );
}
