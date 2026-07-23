import { cn } from '@/app/_lib/cn';

type Props = {
  slotNumber: number;
  imageUrl: string | null;
  title: string;
  description: string;
};

/**
 * 대표 활동 카드 — 순수 프레젠테이션. 편집 화면(HeroActivityEditor)과 학생 미리보기가
 * 공유하는 단일 양식. 4:5 비율 + 상·하단 그라데이션 + 좌상단 번호 배지 + 제목/설명 오버레이.
 */
export function HeroActivityCard({ slotNumber, imageUrl, title, description }: Props) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] border border-line bg-sage-mist">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. 대표 활동 카드 이미지.
        <img
          src={imageUrl}
          alt={title || '대표 활동'}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* 가독성 그라데이션 — 상단(배지·제목)·하단(설명)을 어둡게, 가운데는 투명. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />

      {!imageUrl && (
        <span className="absolute inset-0 grid place-items-center text-[13px] font-medium text-charcoal-2">
          사진을 선택하세요
        </span>
      )}

      <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-[13px] font-bold text-ink shadow-sm">
        {slotNumber}
      </span>

      <p
        className={cn(
          'absolute inset-x-3 top-12 line-clamp-2 text-[15px] font-bold leading-snug',
          title ? 'text-white' : 'text-white/50',
        )}
      >
        {title || '제목'}
      </p>

      {description && (
        <p className="absolute inset-x-3 bottom-3 line-clamp-3 text-[12.5px] leading-relaxed text-white/90">
          {description}
        </p>
      )}
    </div>
  );
}
