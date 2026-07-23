type Props = {
  description: string | null;
  highlights: string[];
};

// 한줄 소개는 탐색 카드 전용, 해시태그는 상세 히어로(이름 아래) 담당, 주요 프로젝트는 랜딩 섹션으로 이관 — 여기는 소개 본문·강조만 다룬다.
export function ClubDetailAbout({ description, highlights }: Props) {
  const hasAny = description !== null || highlights.length > 0;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      {description && <p className="mb-6 whitespace-pre-wrap">{description}</p>}

      {highlights.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">이런 사람이 좋아할 거예요</h3>
          <ul className="mb-6 space-y-2">
            {highlights.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="text-ink">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
