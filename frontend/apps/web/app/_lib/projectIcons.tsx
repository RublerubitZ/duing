import {
  BookOpen, Briefcase, Camera, Code, Dumbbell, FlaskConical, Gamepad2, Globe,
  GraduationCap, Heart, Leaf, Lightbulb, Mic, Monitor, Music, Palette, Rocket,
  Sparkles, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import type { ProjectIcon } from '@duing/types';

/** BE ProjectIcon enum 과 이중 목록 — enum 변경 시 양쪽 동시 수정 (§4.1). */
export const PROJECT_ICON_COMPONENTS: Record<ProjectIcon, LucideIcon> = {
  CODE: Code, TROPHY: Trophy, USERS: Users, ROCKET: Rocket, BOOK: BookOpen,
  CAMERA: Camera, PALETTE: Palette, MUSIC: Music, MIC: Mic, GLOBE: Globe,
  HEART: Heart, LEAF: Leaf, BRIEFCASE: Briefcase, LIGHTBULB: Lightbulb,
  FLASK: FlaskConical, GAMEPAD: Gamepad2, DUMBBELL: Dumbbell,
  GRADUATION: GraduationCap, MONITOR: Monitor, SPARKLES: Sparkles,
};

/** 카드 배경 팔레트 — 순서 기반 순환(Green→Blue→Orange→Purple), 데이터에 저장하지 않는다 (§4.1·§8). */
export const PROJECT_CARD_TONES = [
  'bg-[#E3E9E1]', 'bg-[#DDE8F1]', 'bg-[#FBEFD7]', 'bg-[#E9E2F1]',
] as const;

export function projectCardTone(index: number): string {
  // 튜플이라 상수 인덱스([0])는 항상 존재 — noUncheckedIndexedAccess 용 폴백.
  return PROJECT_CARD_TONES[index % PROJECT_CARD_TONES.length] ?? PROJECT_CARD_TONES[0];
}
