'use client';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function PhoneInput({ value, onChange }: Props) {
  return (
<<<<<<< HEAD
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h2.5l1 3.5-1.5 1a9 9 0 004.5 4.5l1-1.5L14 10.5V13a1 1 0 01-1 1C6.373 14 2 9.627 2 4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <input
        id="signup-phone"
=======
    <label className="block">
      <span className="text-sm text-slate-600">전화번호</span>
      <input
>>>>>>> origin/main
        required
        inputMode="numeric"
        autoComplete="tel"
        value={value}
<<<<<<< HEAD
        onChange={(changeEvent) => onChange(formatPhone(changeEvent.target.value))}
        placeholder="010-1234-5678"
        className="w-full rounded-md border border-line bg-paper py-3 pl-10 pr-3.5 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50"
      />
    </div>
  );
}
=======
        onChange={(event) => onChange(formatPhone(event.target.value))}
        placeholder="010-1234-5678"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
>>>>>>> origin/main
