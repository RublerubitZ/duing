import type { ClubSnsLink, ContactVisibility } from '@duing/types';
import { snsDisplayName } from '../../../_lib/snsPlatform';
import { safeExternalHref } from '../../../_lib/route';

type Props = {
  snsLinks: ClubSnsLink[];
  location: string | null;
  contactPhone: string | null;
  contactVisibility: ContactVisibility;
};

export function ClubContactCard({ snsLinks, location, contactPhone, contactVisibility }: Props) {
  const contactLine =
    contactPhone !== null
      ? { text: contactPhone, href: `tel:${contactPhone.replaceAll('-', '')}` }
      : contactVisibility === 'LOGGED_IN_ONLY'
        ? { text: '로그인 후 확인 가능', href: null }
        : contactVisibility === 'PRIVATE'
          ? { text: '대표 연락처 비공개', href: null }
          : null; // PUBLIC + 회장 미등록 → 숨김
  const hasAny = snsLinks.length > 0 || location !== null || contactLine !== null;
  if (!hasAny) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-charcoal">
        {location !== null && <li>📍 {location}</li>}
        {contactLine !== null && (
          <li>
            📞{' '}
            {contactLine.href ? (
              <a href={contactLine.href} className="hover:underline">{contactLine.text}</a>
            ) : (
              <span className="text-charcoal-3">{contactLine.text}</span>
            )}
          </li>
        )}
        {snsLinks.map((link) => {
          const safeUrl = safeExternalHref(link.url);
          const displayName = snsDisplayName(link);
          return (
            <li key={link.url}>
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {displayName} · {link.url}
                </a>
              ) : (
                <span>{displayName} · {link.url}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
