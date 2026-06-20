'use client';

import Link from 'next/link';

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
    <div className="rounded-md border border-line bg-paper">
      {/* 모두 동의 (개별 동의를 한 번에 토글하는 편의 체크박스) */}
      <label className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-3">
        <input
          type="checkbox"
          checked={allAgreed}
          onChange={(changeEvent) => toggleAll(changeEvent.target.checked)}
          className="h-4 w-4 cursor-pointer rounded accent-ink"
        />
        <span className="text-sm font-semibold text-charcoal">약관에 모두 동의합니다</span>
      </label>

      {/* 개별 동의 — 이용약관 동의와 개인정보 수집·이용 동의를 분리해 받는다 */}
      <div className="space-y-2.5 px-4 py-3">
        <ConsentRow
          checked={termsOfServiceAgreed}
          onChange={onChangeTermsOfService}
          label="이용약관 동의"
          href="/terms#terms"
        />
        <ConsentRow
          checked={privacyPolicyAgreed}
          onChange={onChangePrivacyPolicy}
          label="개인정보 수집·이용 동의"
          href="/terms#privacy"
        />
      </div>
    </div>
  );
}

type ConsentRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  href: '/terms#terms' | '/terms#privacy';
};

function ConsentRow({ checked, onChange, label, href }: ConsentRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(changeEvent) => onChange(changeEvent.target.checked)}
          className="h-4 w-4 cursor-pointer rounded accent-ink"
        />
        <span className="text-sm text-charcoal">
          {label} <span className="text-charcoal-3">(필수)</span>
        </span>
      </label>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-xs text-charcoal-2 underline underline-offset-2 hover:text-charcoal"
      >
        보기
      </Link>
    </div>
  );
}
