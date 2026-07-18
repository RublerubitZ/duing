'use client';

import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useState } from 'react';
import { ApiError } from '@duing/api';
import { useCompletePasswordResetMutation } from '@duing/hooks';
import { passwordSchema } from '@duing/schemas';
import { PhoneVerificationField } from '@/app/_components/PhoneVerificationField';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { usePasswordResetVerification } from '@/app/_lib/use-phone-verification';
import { useToast } from '@/app/_components/toast/ToastProvider';

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3.5 py-3 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50';

export function ForgotPasswordPanel() {
  const router = useGuardedRouter();
  const { addToast } = useToast();
  const completeMutation = useCompletePasswordResetMutation();

  const [studentId, setStudentId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verification = usePasswordResetVerification(studentId);

  async function handleComplete(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    if (!passwordSchema.safeParse(newPassword).success) {
      setError('새 비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상이어야 해요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않아요.');
      return;
    }
    if (!verification.verificationToken) return;
    setError(null);
    try {
      await completeMutation.mutateAsync({
        verificationToken: verification.verificationToken,
        newPassword,
      });
      addToast('비밀번호가 재설정되었어요. 새 비밀번호로 로그인해 주세요.');
      router.replace('/login');
    } catch (completeError) {
      if (completeError instanceof ApiError && completeError.code === 'PHONE_NOT_VERIFIED') {
        // 완료 창(10분) 초과 등 — 인증 스텝으로 복귀시켜 재인증을 유도한다 (spec §5.1).
        verification.reset();
        setNewPassword('');
        setConfirmPassword('');
        setError('인증이 만료됐어요. 처음부터 다시 진행해주세요.');
        return;
      }
      setError(
        completeError instanceof ApiError
          ? completeError.message
          : '재설정에 실패했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-cream">
      <nav className="flex shrink-0 items-center justify-between px-8 pt-6">
        <Link
          href="/login"
          className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal"
        >
          ← 로그인으로
        </Link>
      </nav>

      <main className="flex flex-1 justify-center px-8 py-10">
        <div className="w-full max-w-[520px]">
          <h1 className="mb-2 text-[1.75rem] font-bold leading-tight tracking-tightx text-ink-deep">
            비밀번호를 잊으셨나요?
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-charcoal-2">
            가입 시 인증한 <strong className="text-ink-deep">등록된 번호</strong>로 문자 인증하면 새 비밀번호를
            설정할 수 있어요.
          </p>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
            >
              {error}
            </div>
          )}

          {verification.status === 'idle' ? (
            <div>
              <label htmlFor="reset-student-id" className="mb-1.5 block text-sm font-medium text-charcoal">
                학번
              </label>
              <div className="flex gap-2">
                <input
                  id="reset-student-id"
                  required
                  pattern="\d{8}"
                  inputMode="numeric"
                  maxLength={8}
                  value={studentId}
                  onChange={(changeEvent) =>
                    setStudentId(changeEvent.target.value.replace(/\D/g, '').slice(0, 8))
                  }
                  placeholder="8자리 숫자"
                  className={inputCls}
                />
                <button
                  type="button"
                  disabled={!verification.canIssue}
                  onClick={() => verification.issue(true)}
                  className="btn btn-primary shrink-0 whitespace-nowrap disabled:opacity-50"
                >
                  {verification.issuing && <ButtonSpinner />}인증 시작
                </button>
              </div>
              <p className="mt-1.5 text-xs text-charcoal-3">
                등록된 번호로만 인증할 수 있어요 · 번호가 기억나지 않으면 총동아리연합회에 문의해주세요
              </p>
              {verification.errorMessage && (
                <p className="mt-2 text-xs text-coral" aria-live="polite">
                  {verification.errorMessage}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {verification.maskedPhone && !verification.verified && (
                <p className="rounded-md border border-line bg-paper px-3.5 py-2.5 text-sm text-charcoal-2">
                  등록된 번호 <strong className="text-ink">{verification.maskedPhone}</strong> 로 아래 코드를
                  문자 전송해주세요.
                </p>
              )}

              <PhoneVerificationField
                phone={verification.maskedPhone ?? ''}
                onPhoneChange={() => undefined}
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
                <form className="space-y-4" onSubmit={handleComplete}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-charcoal">
                        새 비밀번호
                      </label>
                      <input
                        id="reset-password"
                        required
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(changeEvent) => setNewPassword(changeEvent.target.value)}
                        placeholder="••••••••"
                        className={inputCls}
                      />
                      <p className="mt-1.5 text-xs text-charcoal-3">영문/숫자/특수문자 중 2종, 8~20자</p>
                    </div>
                    <div>
                      <label
                        htmlFor="reset-password-confirm"
                        className="mb-1.5 block text-sm font-medium text-charcoal"
                      >
                        새 비밀번호 확인
                      </label>
                      <input
                        id="reset-password-confirm"
                        required
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(changeEvent) => setConfirmPassword(changeEvent.target.value)}
                        placeholder="••••••••"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={completeMutation.isPending}
                    className="btn btn-primary btn-big w-full disabled:opacity-50"
                  >
                    {completeMutation.isPending && <ButtonSpinner />}비밀번호 재설정
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-sm text-charcoal-2">
            비밀번호가 기억나셨나요?{' '}
            <Link
              href="/login"
              className="font-medium text-charcoal underline underline-offset-2 transition-colors hover:text-ink"
            >
              로그인
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
