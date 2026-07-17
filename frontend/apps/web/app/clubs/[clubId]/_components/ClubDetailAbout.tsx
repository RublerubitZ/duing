type Props = {
  description: string | null;
  tagline: string | null;
  tags: string[];
  highlights: string[];
  majorProjects: string | null;
};

export function ClubDetailAbout({ description, tagline, tags, highlights, majorProjects }: Props) {
  const hasAny = description !== null
    || tagline !== null
    || tags.length > 0
    || highlights.length > 0
    || majorProjects !== null;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      {/* 한줄 소개 → 해시태그 → 동아리 소개 순 — 탐색 카드에서 뺀 해시태그는 여기서 키워드 역할. */}
      {tagline && <h2 className="mb-4 text-[28px] font-bold text-ink-deep">{tagline}</h2>}
      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {tags.map((tagName) => (
            // 데이터에 "#" 를 붙여 저장한 태그도 있어 선행 "#" 를 정규화한 뒤 붙인다(## 방지).
            <span key={tagName} className="pill pill-outline text-[12px]">#{tagName.replace(/^#+/, '')}</span>
          ))}
        </div>
      )}
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

      {majorProjects && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">주요 프로젝트</h3>
          <p className="whitespace-pre-wrap">{majorProjects}</p>
        </>
      )}
    </article>
  );
}
