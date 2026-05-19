type Props = {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
};

export function SettingsRow({ label, value, action }: Props) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-line last:border-b-0">
      <div className="w-[140px] text-[13px] font-semibold text-charcoal-2">{label}</div>
      <div className="flex-1 text-[14.5px] text-ink-deep font-medium">{value}</div>
      {action}
    </div>
  );
}
