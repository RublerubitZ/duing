import Link from 'next/link';
import type { ClubSummary } from '@duing/types';

const CATEGORY_LABEL: Record<ClubSummary['category'], string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

export function ClubCard({ club }: { club: ClubSummary }) {
  return (
    <Link
      href={{ pathname: '/clubs/[clubId]', query: { clubId: club.id } }}
      className="block rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        {club.logoUrl ? (
          <img src={club.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-slate-200" />
        )}
        <div>
          <h3 className="font-semibold">{club.name}</h3>
          <p className="text-xs text-slate-500">
            {CATEGORY_LABEL[club.category]}
            {club.division ? ` · ${club.division}` : ''}
          </p>
        </div>
      </div>
      {club.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1">
          {club.tags.slice(0, 5).map((tag) => (
            <li key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}