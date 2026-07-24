import type { ClubSnsLink, ClubSnsPlatform } from '@duing/types';

export const SNS_PLATFORM_LABELS: Record<ClubSnsPlatform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  KAKAO: '카카오톡',
  OTHER: '기타',
};

export function snsDisplayName(link: ClubSnsLink): string {
  if (link.platform === 'OTHER') return link.label ?? SNS_PLATFORM_LABELS.OTHER;
  return SNS_PLATFORM_LABELS[link.platform];
}
