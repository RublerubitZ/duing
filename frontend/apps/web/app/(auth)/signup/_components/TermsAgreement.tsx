'use client';

type Props = {
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
  onChangeTermsOfService: (next: boolean) => void;
  onChangePrivacyPolicy: (next: boolean) => void;
};

export function TermsAgreement({
  termsOfServiceAgreed,
  privacyPolicyAgreed,
  onChangeTermsOfService,
  onChangePrivacyPolicy,
}: Props) {
  const allAgreed = termsOfServiceAgreed && privacyPolicyAgreed;

  function toggleAll(next: boolean) {
    onChangeTermsOfService(next);
    onChangePrivacyPolicy(next);
  }

  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3">
      <span className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={allAgreed}
          onChange={(changeEvent) => toggleAll(changeEvent.target.checked)}
          className="h-4 w-4 cursor-pointer rounded accent-ink"
        />
        <span className="text-sm text-charcoal">
          이용약관·개인정보 처리방침에 동의합니다{' '}
          <span className="text-charcoal-3">(필수)</span>
        </span>
      </span>
      <a
        href="/terms"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        className="shrink-0 text-xs text-charcoal-2 underline underline-offset-2 hover:text-charcoal"
      >
        전체보기
      </a>
    </label>
  );
}
