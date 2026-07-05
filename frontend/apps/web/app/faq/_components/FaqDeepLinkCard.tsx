'use client';

// 딥링크(`/faq?item={id}`)로 진입했을 때 목록 위에 항상 펼쳐진 상태로 보여주는 단건 카드.
// 닫기 버튼을 누르면 상위(FaqPage)에서 item 쿼리스트링을 제거한다.

import { useFederationFaqDetailQuery } from '@duing/hooks';

type Props = {
  faqId: number;
  onClose: () => void;
};

export function FaqDeepLinkCard({ faqId, onClose }: Props) {
  const detailQuery = useFederationFaqDetailQuery(faqId);
  const faq = detailQuery.data;
  const isLoading = detailQuery.isLoading;
  const isError = detailQuery.isError;

  return (
    <div className="mb-6 rounded-[18px] border border-ink bg-paper px-5 py-5 md:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-bold tracking-wide08 text-ink">공유된 질문</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="공유된 질문 닫기"
          className="grid h-7 w-7 place-items-center rounded-full text-charcoal-3 transition-colors hover:bg-graysoft hover:text-charcoal"
        >
          ×
        </button>
      </div>

      {isLoading && (
        <p className="py-6 text-center text-[13px] text-charcoal-3">불러오는 중…</p>
      )}
      {isError && (
        <p className="py-6 text-center text-[13px] text-coral">해당 FAQ를 찾을 수 없어요</p>
      )}
      {faq && (
        <div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {faq.pinned && (
              <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-paper">
                고정
              </span>
            )}
            {faq.categoryName && (
              <span className="text-[12.5px] text-charcoal-3">{faq.categoryName}</span>
            )}
          </div>
          <h2 className="mb-3 text-[16px] font-bold text-ink-deep">{faq.question}</h2>
          <p className="whitespace-pre-line text-[14px] leading-[1.65] text-charcoal-2">
            {faq.answer}
          </p>
        </div>
      )}
    </div>
  );
}
