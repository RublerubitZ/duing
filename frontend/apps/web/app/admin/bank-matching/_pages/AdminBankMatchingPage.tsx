'use client';

import { BankMatchingClubs } from '../_components/BankMatchingClubs';

export function AdminBankMatchingPage() {
  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">BANK 자동매칭 등록</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          은행 입금 자동매칭에 사용할 동아리를 등록·해제합니다.
        </p>
      </header>

      <BankMatchingClubs />
    </main>
  );
}
