import {
  BookOpen,
  Clapperboard,
  Code,
  Coffee,
  Dumbbell,
  HeartHandshake,
  type LucideIcon,
  Mic,
  Music,
  Rocket,
} from 'lucide-react';
import type { PromoClub } from '../_data';

// 동아리 카테고리 → lucide 아이콘. 이모지 아바타 대신 라인 아이콘으로 통일한다(thin-stroke).
const CATEGORY_ICON: Record<PromoClub['cat'], LucideIcon> = {
  학술: BookOpen,
  운동: Dumbbell,
  음악: Music,
  공연: Mic,
  봉사: HeartHandshake,
  창작: Clapperboard,
  IT: Code,
  창업: Rocket,
  친목: Coffee,
};

type CategoryIconProps = { cat: PromoClub['cat']; size?: number; className?: string };

export function CategoryIcon({ cat, size = 18, className }: CategoryIconProps) {
  const Icon = CATEGORY_ICON[cat];
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}
