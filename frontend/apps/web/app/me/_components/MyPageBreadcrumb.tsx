type Props = {
  current?: string;
};

export function MyPageBreadcrumb({ current = '마이페이지' }: Props) {
  return (
    <div className="relative pb-2.5 pt-7 bg-cream">
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 flex items-center gap-2.5 text-[11.5px] leading-4 font-semibold text-charcoal-3">
        <span>⌂</span>
        <span>내 두잉</span>
        <span>›</span>
        <span className="text-ink font-bold">{current}</span>
      </div>
    </div>
  );
}
