type Props = { description: string | null };

export function ClubDetailAbout({ description }: Props) {
  if (!description) return null;
  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      <p className="whitespace-pre-wrap">{description}</p>
    </article>
  );
}
