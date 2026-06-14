import { CalendarDays, MapPin, Users2, ExternalLink } from 'lucide-react';
import type { NoticeEventInfo } from '@duing/types';
import { formatEventRange } from '../_lib/eventFormat';
import { SparkleFull } from '../../_components/Sparkle';
import { safeExternalHref } from '../../_lib/route';

type Props = {
  eventInfo: NoticeEventInfo;
  linkUrl: string | null;
};

export function NoticeEventCard({ eventInfo, linkUrl }: Props) {
  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <CalendarDays size={16} aria-hidden />, label: '일시', value: formatEventRange(eventInfo.startAt, eventInfo.endAt) },
  ];
  if (eventInfo.location) rows.push({ icon: <MapPin size={16} aria-hidden />, label: '장소', value: eventInfo.location });
  if (eventInfo.host) rows.push({ icon: <Users2 size={16} aria-hidden />, label: '주최', value: eventInfo.host });
  if (eventInfo.audience) rows.push({ icon: <Users2 size={16} aria-hidden />, label: '대상', value: eventInfo.audience });

  const safeLink = safeExternalHref(linkUrl);

  return (
    <div className="relative overflow-hidden rounded-lg bg-ink text-paper p-6">
      <SparkleFull size={24} color="var(--sage)" className="absolute top-4 right-4 opacity-80" />
      <div className="text-[12px] font-bold tracking-[0.08em] text-sage mb-5">한눈에 보기</div>
      <dl className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-white/10 text-sage shrink-0">{row.icon}</span>
            <div className="flex flex-col">
              <dt className="text-[11.5px] font-semibold text-white/50">{row.label}</dt>
              <dd className="text-[14px] font-semibold">{row.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {safeLink && (
        <a
          href={safeLink}
          target="_blank"
          rel="noreferrer"
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-sage text-ink-deep text-[13px] font-bold"
        >
          <ExternalLink size={15} aria-hidden /> 자세히 보기
        </a>
      )}
    </div>
  );
}
