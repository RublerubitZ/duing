'use client';

type FormSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** ON/OFF 스위치 — role=switch, ink 트랙 + 흰 노브. 운영 콘솔(모집 폼)과 총동연 콘솔(정보 확인 팝업)이 같이 쓴다. */
export function FormSwitch({ checked, onChange, ariaLabel, disabled = false }: FormSwitchProps) {
  // 키보드 포커스는 콘솔 관례인 ink 링으로(브라우저 기본 파란 링 대신) — 켜진 트랙도 ink 라 간격을 둬야 링이 구분된다.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-default ${
        checked ? 'bg-ink' : 'bg-charcoal-3/50'
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? 'left-[23px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}
