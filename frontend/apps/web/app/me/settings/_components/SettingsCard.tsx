type Props = {
  title: string;
  hint?: string;
  children: React.ReactNode;
  danger?: boolean;
};

export function SettingsCard({ title, hint, children, danger = false }: Props) {
  return (
    <section className="bg-paper rounded-lg border border-line mb-4 overflow-hidden">
      <div
        className={[
          'px-7 py-5 border-b border-line',
          danger ? 'bg-[rgba(217,119,87,0.05)]' : '',
        ].join(' ')}
      >
        <h3 className="text-[17px] font-body font-bold text-ink-deep">{title}</h3>
        {hint && <p className="text-[12.5px] text-charcoal-3 mt-1">{hint}</p>}
      </div>
      <div className="px-7 py-2">{children}</div>
    </section>
  );
}
