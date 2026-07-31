import { Link as LinkIcon } from 'lucide-react';
import type { IconType } from 'react-icons';
import {
  FaDiscord, FaFacebook, FaFigma, FaGithub, FaInstagram, FaSlack, FaXTwitter, FaYoutube,
} from 'react-icons/fa6';
import { SiKakaotalk, SiNotion } from 'react-icons/si';

import type { SnsBrand } from '../_lib/snsPlatform';

// 아이콘 정책: 일반 UI 아이콘은 lucide-react, 브랜드(로고) 아이콘은 react-icons.
// lucide 는 v1 에서 브랜드 아이콘을 전부 뺐고, 로고는 상표라 임의로 다시 그릴 것도 아니다.
const BRAND_ICONS: Record<SnsBrand, IconType> = {
  INSTAGRAM: FaInstagram,
  FACEBOOK: FaFacebook,
  KAKAO: SiKakaotalk,
  DISCORD: FaDiscord,
  GITHUB: FaGithub,
  YOUTUBE: FaYoutube,
  X: FaXTwitter,
  NOTION: SiNotion,
  FIGMA: FaFigma,
  SLACK: FaSlack,
};

type Props = {
  /** null 이면 브랜드를 못 알아낸 링크 — 범용 링크 아이콘으로 떨어진다. */
  brand: SnsBrand | null;
  className?: string;
};

export function BrandIcon({ brand, className }: Props) {
  const Icon = brand !== null ? BRAND_ICONS[brand] : LinkIcon;
  return <Icon aria-hidden className={className} />;
}
