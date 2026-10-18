import { cn } from '@/app/_lib/cn';

import { HeroActivityImage } from './HeroActivityImage';

type Props = {
  imageUrl: string | null;
  title: string;
  description: string;
  /** 콘솔 슬롯 화면 전용 — 미전달 시 번호 배지를 렌더하지 않는다(학생 화면·Preview). */
  slotNumber?: number;
  /** 벤토 첫 카드(2×2) 스케일 업 — 부모 셀이 col/row-span 과 높이를 소유한다. */
  size?: 'default' | 'big';
  /** false 면 이미지와 "사진을 선택하세요" 를 그리지 않는다(틀·제목·설명은 그대로) — 상세가 ISR 시드로 그리는 동안 이미지 받기를 미룰 때. 기본 true. */
  showImage?: boolean;
};

/**
 * 대표 활동 카드 — 순수 표현 코어. 콘솔(슬롯 에디터·Preview)과 학생 화면(벤토·스와이프)이
 * 래퍼를 통해 공유하는 단일 양식. 4:5 비율(big 은 부모가 높이 소유) + 그라데이션 + 제목/설명 오버레이.
 */
export function HeroActivityCard({ imageUrl, title, description, slotNumber, size = 'default', showImage = true }: Props) {
  const big = size === 'big';
  const hasBadge = slotNumber !== undefined;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[14px] border border-line bg-sage-mist',
        big ? 'h-full' : 'aspect-[4/5]',
      )}
    >
      {/* 이미지만 클라이언트 컴포넌트 — 로드 완료 때 드러난다(useImageLoadFade). 카드 자체는 서버 컴포넌트로 남긴다. */}
      {showImage && imageUrl && <HeroActivityImage imageUrl={imageUrl} alt={title || '대표 활동'} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />
      {showImage && !imageUrl && (
        <span className="absolute inset-0 grid place-items-center text-[13px] font-medium text-charcoal-2">사진을 선택하세요</span>
      )}
      {hasBadge && (
        <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-[13px] font-bold text-ink shadow-sm">{slotNumber}</span>
      )}
      <p
        className={cn(
          'absolute inset-x-3 line-clamp-2 font-bold leading-snug',
          hasBadge ? 'top-12' : big ? 'top-4' : 'top-3',
          big ? 'text-[22px]' : 'text-[15px]',
          title ? 'text-white' : 'text-white/50',
        )}
      >
        {title || '제목'}
      </p>
      {description && (
        <p className={cn('absolute inset-x-3 bottom-3 leading-relaxed text-white/90', big ? 'line-clamp-3 text-[14px]' : 'line-clamp-3 text-[12.5px]')}>
          {description}
        </p>
      )}
    </div>
  );
}
