import type { ReactNode } from 'react';
import { MapPinned, Phone } from 'lucide-react';

import type { ClubSnsLink, ContactVisibility } from '@duing/types';
import { BrandIcon } from '../../../_components/BrandIcon';
import { snsBrand, snsPresentation } from '../../../_lib/snsPlatform';
import { safeExternalHref } from '../../../_lib/route';

type Props = {
  clubName: string;
  snsLinks: ClubSnsLink[];
  location: string | null;
  contactPhone: string | null;
  contactVisibility: ContactVisibility;
};

const ICON_CLASS = 'h-4 w-4';

// 링크·정보 행이 같은 패딩을 쓰게 묶는다 — 링크에만 패딩을 주면 행 간격이 들쭉날쭉해지고
// 같은 대표 연락처 행이 공개 설정에 따라 높이가 달라진다. py-1.5 는 44px 터치 타깃도 맞춘다.
const ROW_CLASS = '-mx-1.5 flex items-start gap-2.5 rounded-[10px] px-1.5 py-1.5';

// 링크 행은 전체가 하나의 클릭 영역 — 아이콘·값이 같이 진해지고 focus 링도 행 단위로 잡힌다.
// hover 배경은 두지 않는다: 터치에서는 뜨지 않고 iOS 는 새 탭 이동 뒤 :hover 를 물고 있는다.
const ROW_LINK_CLASS =
  `group ${ROW_CLASS} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink`;

// 링크 값은 본문(charcoal)과 달리 브랜드 그린 + medium — 눌리는 것임을 hover 전에도 알 수 있게.
const LINK_VALUE_CLASS = 'font-medium text-ink transition-colors group-hover:text-ink-deep group-hover:underline';

type RowProps = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** 없으면 클릭 불가한 정보 행으로 렌더한다. */
  href?: string;
  external?: boolean;
  /** 링크에 감춘 원본 URL — 데스크탑 hover 로 확인용. */
  title?: string;
};

/** 아이콘 + (라벨 / 값) 2단 행. 아이콘은 첫 줄(라벨)에 맞춰 정렬한다. */
function ContactRow({ icon, label, value, href, external = false, title }: RowProps) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0 text-ink transition-colors group-hover:text-ink-deep">{icon}</span>
      <span className="min-w-0">
        {/* charcoal-3 은 sage-mist 위에서 3.99:1 로 AA 미달 — 12px 라벨이 모든 행의 구조 신호라 charcoal-2(6.99:1). */}
        <span className="block text-[12px] leading-tight text-charcoal-2">{label}</span>
        {/* truncate 금지 — 긴 동아리방 위치가 잘리면 되살릴 방법이 없다(정보 행에는 title 도 없음). */}
        <span className={`mt-0.5 block text-[13.5px] leading-snug ${href !== undefined ? LINK_VALUE_CLASS : ''}`}>
          {value}
        </span>
      </span>
    </>
  );
  if (href === undefined) return <li className={ROW_CLASS}>{body}</li>;
  return (
    <li>
      <a
        href={href}
        title={title}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={ROW_LINK_CLASS}
      >
        {body}
      </a>
    </li>
  );
}

export function ClubContactCard({ clubName, snsLinks, location, contactPhone, contactVisibility }: Props) {
  const contactLine =
    contactPhone !== null
      ? { text: contactPhone, href: `tel:${contactPhone.replaceAll('-', '')}` }
      : contactVisibility === 'LOGGED_IN_ONLY'
        ? { text: '로그인 후 확인 가능', href: undefined }
        : contactVisibility === 'PRIVATE'
          ? { text: '대표 연락처 비공개', href: undefined }
          : null; // PUBLIC + 회장 미등록 → 숨김
  const hasAny = snsLinks.length > 0 || location !== null || contactLine !== null;
  if (!hasAny) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      {/* 행마다 py-1.5 를 갖고 있어 ul 간격은 최소로 둔다 — gap-2.5 를 겹치면 카드가 성기게 벌어진다. */}
      <ul className="flex flex-col gap-0.5 text-charcoal">
        {location !== null && (
          <ContactRow icon={<MapPinned aria-hidden className={ICON_CLASS} />} label="동아리방 위치" value={location} />
        )}
        {contactLine !== null && (
          <ContactRow
            icon={<Phone aria-hidden className={ICON_CLASS} />}
            label="대표 연락처"
            value={
              contactLine.href !== undefined
                ? contactLine.text
                : <span className="text-charcoal-3">{contactLine.text}</span>
            }
            href={contactLine.href}
          />
        )}
        {snsLinks.map((link, index) => {
          const safeUrl = safeExternalHref(link.url);
          const { label, value } = snsPresentation(link, clubName);
          return (
            // 같은 URL 을 두 번 저장하는 걸 막는 제약이 없다 — url 만 키로 쓰면 행이 뒤섞인다.
            <ContactRow
              key={`${index}-${link.url}`}
              icon={<BrandIcon brand={snsBrand(link)} className={ICON_CLASS} />}
              label={label}
              value={value}
              href={safeUrl ?? undefined}
              external
              title={safeUrl !== null ? link.url : undefined}
            />
          );
        })}
      </ul>
    </div>
  );
}
