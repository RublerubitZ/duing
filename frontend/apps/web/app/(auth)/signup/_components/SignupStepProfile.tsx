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
