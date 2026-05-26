import { CalendarPage } from './_pages/CalendarPage';

<<<<<<< HEAD
export default function Page() {
  return <CalendarPage />;
}
=======
import Link from 'next/link';
import { useState } from 'react';
import { useRecruitmentCalendarQuery } from '@duing/hooks';
import { displayStatusLabel } from '../_lib/recruitmentDisplay';

function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [yearMonth, setYearMonth] = useState(() => toYearMonth(new Date()));
  const calendarQuery = useRecruitmentCalendarQuery(yearMonth);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-end justify-between">
        <h1 className="text-2xl font-bold">모집 달력</h1>
        <input
          type="month"
          value={yearMonth}
          onChange={(event) => setYearMonth(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1"
        />
      </header>
      {calendarQuery.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {calendarQuery.data && (
        <ul className="space-y-3">
          {calendarQuery.data.length === 0 && (
            <li className="text-sm text-slate-500">해당 월에 진행되는 모집이 없습니다.</li>
          )}
          {calendarQuery.data.map((recruitment) => (
            <li
              key={recruitment.id}
              className="rounded-lg border border-slate-200 p-4 hover:border-slate-400"
            >
              <Link href={`/clubs/${recruitment.clubId}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{recruitment.title}</span>
                  <span className="text-sm text-slate-500">
                    {recruitment.startDate} ~ {recruitment.endDate}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{recruitment.clubName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {displayStatusLabel(recruitment.displayStatus)} ·{' '}
                  {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'} · 정원{' '}
                  {recruitment.capacity}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
>>>>>>> origin/main
