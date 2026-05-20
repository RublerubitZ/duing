type Props = {
  expiresAt: string;
};

export function ExpiredBanner({ expiresAt }: Props) {
  const dateText = new Date(expiresAt).toLocaleDateString('ko-KR');
  return (
    <div
      role="status"
      className="rounded-xl bg-graysoft border border-line px-4 py-3 text-[13px] text-charcoal-2"
    >
      마감된 공지입니다. ({dateText} 종료)
    </div>
  );
}
