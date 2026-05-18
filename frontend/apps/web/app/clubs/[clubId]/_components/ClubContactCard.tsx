import type { ClubSnsLink } from '@duing/types';

type Props = { snsLinks: ClubSnsLink[] };

export function ClubContactCard({ snsLinks }: Props) {
  if (snsLinks.length === 0) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-charcoal">
        {snsLinks.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {link.platform} · {link.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
