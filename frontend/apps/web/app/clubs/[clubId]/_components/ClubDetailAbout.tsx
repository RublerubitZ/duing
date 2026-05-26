<<<<<<< HEAD
type Props = {
  description: string | null;
  tagline: string | null;
  highlights: string[];
  majorProjects: string | null;
};

export function ClubDetailAbout({ description, tagline, highlights, majorProjects }: Props) {
  const hasAny = description !== null
    || tagline !== null
    || highlights.length > 0
    || majorProjects !== null;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      {tagline && <h2 className="mb-4 text-[28px] font-bold text-ink-deep">{tagline}</h2>}
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
=======
type Props = { description: string | null };

export function ClubDetailAbout({ description }: Props) {
  if (!description) return null;
  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      <p className="whitespace-pre-wrap">{description}</p>
>>>>>>> origin/main
    </article>
  );
}
