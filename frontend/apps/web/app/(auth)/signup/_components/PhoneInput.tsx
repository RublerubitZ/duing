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
    <label className="block">
      <span className="text-sm text-slate-600">전화번호</span>
      <input
        required
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        onChange={(event) => onChange(formatPhone(event.target.value))}
        placeholder="010-1234-5678"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}