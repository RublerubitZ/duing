import { ImageWithFallback } from '../../_components/ImageWithFallback';

type Props = {
  coverImageUrl: string;
  title: string;
  summary: string;
};

export function NoticePosterHero({ coverImageUrl, title, summary }: Props) {
  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-7 items-start mb-8">
      <ImageWithFallback
        src={coverImageUrl}
        alt={title}
        className="aspect-[3/4] w-full max-w-[220px] mx-auto rounded-lg overflow-hidden border border-line shadow-2 md:max-w-none md:mx-0"
        emptyMessage="이미지 없음"
      />
      {summary ? (
        <p className="text-[17.5px] leading-[1.8] font-medium text-charcoal">{summary}</p>
      ) : (
        <span />
      )}
    </div>
  );
}
