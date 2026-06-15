import type { ClubSnsLink } from '@duing/types';
import { safeExternalHref } from '../../../_lib/route';

type Props = {
  snsLinks: ClubSnsLink[];
  location: string | null;
  contactEmail: string | null;
};

export function ClubContactCard({ snsLinks, location, contactEmail }: Props) {
  const hasAny = snsLinks.length > 0 || location !== null || contactEmail !== null;
  if (!hasAny) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-charcoal">
        {location !== null && <li>📍 {location}</li>}
        {contactEmail !== null && (
          <li>
            📨 <a href={`mailto:${contactEmail}`} className="hover:underline">{contactEmail}</a>
          </li>
        )}
        {snsLinks.map((link) => {
          const safeUrl = safeExternalHref(link.url);
          return (
            <li key={link.url}>
              {safeUrl ? (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {link.platform} · {link.url}
                </a>
              ) : (
                <span>{link.platform} · {link.url}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
