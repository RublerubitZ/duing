type Props = {
  hasFilter: boolean;
};

export function NoticeEmptyState({ hasFilter }: Props) {
  return (
    <div className="py-24 text-center text-charcoal-3">
      <p className="text-[14px] font-semibold text-charcoal-2">
        {hasFilter ? '검색 결과가 없습니다' : '아직 공지가 없습니다'}
      </p>
      <p className="mt-1.5 text-[13px]">
        {hasFilter ? '카테고리나 검색어를 바꿔보세요.' : '새 공지가 올라오면 여기에 표시됩니다.'}
      </p>
    </div>
  );
}
