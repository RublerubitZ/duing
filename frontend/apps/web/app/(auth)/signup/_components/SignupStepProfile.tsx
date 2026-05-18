'use client';

import type { College, Grade } from '@duing/types';
import type { SignupFormState } from '../_lib/signup-state';
import { CollegeSelect } from './CollegeSelect';
import { GradeSelect } from './GradeSelect';
import { PhoneInput } from './PhoneInput';
import { TermsAgreement } from './TermsAgreement';

type Props = {
  state: SignupFormState;
  onField: (field: keyof SignupFormState, value: string | boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
};

export function SignupStepProfile({ state, onField, onBack, onSubmit, submitting, error }: Props) {
  const canSubmit = state.termsOfServiceAgreed && state.privacyPolicyAgreed && !submitting;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        <span className="text-sm text-slate-600">이름</span>
        <input
          required
          maxLength={50}
          autoFocus
          value={state.name}
          onChange={(event) => onField('name', event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">학번</span>
        <input
          required
          pattern="\d{7,10}"
          inputMode="numeric"
          value={state.studentId}
          onChange={(event) => onField('studentId', event.target.value)}
          placeholder="7~10자리 숫자"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <GradeSelect value={state.grade} onChange={(grade: Grade) => onField('grade', grade)} />
      <CollegeSelect
        value={state.college}
        onChange={(college: College) => onField('college', college)}
      />
      <label className="block">
        <span className="text-sm text-slate-600">전공 학과</span>
        <input
          required
          maxLength={50}
          value={state.major}
          onChange={(event) => onField('major', event.target.value)}
          placeholder="예: 컴퓨터정보공학부"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <PhoneInput value={state.phone} onChange={(phone) => onField('phone', phone)} />
      <TermsAgreement
        termsOfServiceAgreed={state.termsOfServiceAgreed}
        privacyPolicyAgreed={state.privacyPolicyAgreed}
        onChangeTermsOfService={(next) => onField('termsOfServiceAgreed', next)}
        onChangePrivacyPolicy={(next) => onField('privacyPolicyAgreed', next)}
      />
      {error && <p className="text-sm text-rose-600" aria-live="polite">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-700"
        >
          이전
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? '가입 중…' : '회원가입'}
        </button>
      </div>
    </form>
  );
}
