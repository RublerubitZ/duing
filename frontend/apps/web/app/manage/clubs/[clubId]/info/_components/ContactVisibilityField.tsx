'use client';

import type { ContactVisibility } from '@duing/types';

const VISIBILITY_OPTIONS: { value: ContactVisibility; label: string }[] = [
  { value: 'PUBLIC', label: '전체 공개' },
  { value: 'LOGGED_IN_ONLY', label: '로그인 사용자만 공개' },
  { value: 'PRIVATE', label: '비공개' },
];

type Props = {
  phone: string | null;
  value: ContactVisibility;
  onChange: (next: ContactVisibility) => void;
  disabled: boolean;
};

export function ContactVisibilityField({ phone, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      {phone !== null ? (
        <div className="flex w-full max-w-[280px] items-center gap-2 rounded-[8px] border border-[#cfcab8] bg-[#f5f3ec] px-3 py-2.5 font-mono text-[14px] font-semibold text-[#2a2f27]">
          {phone}
          <span className="text-[11.5px] font-normal text-[#8a8f83]">(회장 전화번호)</span>
        </div>
      ) : (
        <p className="text-[13px] text-[#8a8f83]">
          회장 미등록 — 회원 명단에서 회장을 지정하면 자동으로 연동됩니다.
        </p>
      )}

      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[12.5px] font-medium text-[#4a5247]">공개 범위</legend>
        <div className="flex flex-col gap-1.5">
          {VISIBILITY_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#2a2f27]">
              <input
                type="radio"
                name="contact-visibility"
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="accent-[#4a6b3f]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-[12px] leading-relaxed text-[#8a8f83]">
        대표 연락처를 공개하면 외부 방문자도 동아리에 직접 연락할 수 있습니다. 공개 전 회장에게 반드시 안내
        및 동의를 받아주세요.
      </p>
      {value === 'PUBLIC' && (
        <p className="text-[12px] leading-relaxed text-[#b04a2a]">
          대표 연락처를 전체 공개하면 로그인하지 않은 외부 방문자도 전화번호를 확인할 수 있습니다.
        </p>
      )}
    </div>
  );
}
