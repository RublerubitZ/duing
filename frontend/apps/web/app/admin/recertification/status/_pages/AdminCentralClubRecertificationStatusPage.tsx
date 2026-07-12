'use client';

import { useState } from 'react';
import { useCentralClubRecertificationStatusQuery } from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { AdminCentralClubRecertificationStatusTable } from '../_components/AdminCentralClubRecertificationStatusTable';

const PAGE_SIZE = 20;
const CURRENT_YEAR = new Date().getFullYear();

export function AdminCentralClubRecertificationStatusPage() {
  const [operatingYear, setOperatingYear] = useState(CURRENT_YEAR);
  const [page, setPage] = useState(0);

  const statusQuery = useCentralClubRecertificationStatusQuery({
    operatingYear,
    page,
    size: PAGE_SIZE,
  });

  const items = statusQuery.data?.content ?? [];
  const totalPages = statusQuery.data?.totalPages ?? 0;

  const handleYearChange = (next: number) => {
    setOperatingYear(next);
    setPage(0);
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">중앙동아리 재인증 현황</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          연도별 중앙동아리 재인증 상태를 확인합니다.
        </p>
      </header>

      <div className="mb-5 flex items-center gap-3">
        <label className="text-[13px] text-charcoal-2 font-semibold" htmlFor="operating-year-input">
          운영연도
        </label>
        <input
          id="operating-year-input"
          type="number"
          min="2000"
          max="2099"
          value={operatingYear}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (Number.isInteger(parsed) && parsed > 0) handleYearChange(parsed);
          }}
          className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px] w-28"
        />
      </div>

      {statusQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {statusQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">
          재인증 현황을 불러오지 못했습니다.
        </p>
      )}
      {statusQuery.isSuccess && (
        <AdminCentralClubRecertificationStatusTable items={items} />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}
