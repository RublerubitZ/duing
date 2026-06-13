import { NaturalImage } from './NaturalImage';

type Props = {
  urls: string[];
};

export function NoticeBodyImages({ urls }: Props) {
  if (urls.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-bold text-ink-deep mb-3">사진</h2>
      <div className="flex flex-col gap-4">
        {urls.map((url, index) => (
          <NaturalImage key={`${url}-${index}`} src={url} alt={`본문 이미지 ${index + 1}`} />
        ))}
      </div>
    </section>
  );
}
