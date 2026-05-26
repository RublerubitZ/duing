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
<<<<<<< HEAD
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
=======
    <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={allAgreed}
          onChange={(event) => toggleAll(event.target.checked)}
        />
        모두 동의합니다
      </label>
      <div className="border-t border-slate-200 pt-2 space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={termsOfServiceAgreed}
            onChange={(event) => onChangeTermsOfService(event.target.checked)}
          />
          (필수) 이용약관에 동의합니다.
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={privacyPolicyAgreed}
            onChange={(event) => onChangePrivacyPolicy(event.target.checked)}
          />
          (필수) 개인정보 수집·이용에 동의합니다.
        </label>
      </div>
    </fieldset>
  );
}
>>>>>>> origin/main
