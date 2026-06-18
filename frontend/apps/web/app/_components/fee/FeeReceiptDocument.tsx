'use client';

import type { Receipt } from '@duing/types';

import { feeStatusLabel, formatWon, paymentMethodLabel } from '@/app/_lib/feeLabels';

type FeeReceiptDocumentProps = {
  receipt: Receipt;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-charcoal-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

// 인쇄 시트. globals.css 의 @media print 가 .receipt-sheet 만 보이게 하고 나머지 화면 크롬을 숨긴다.
export function FeeReceiptDocument({ receipt }: FeeReceiptDocumentProps) {
  return (
    <article className="receipt-sheet rounded-xl border border-line bg-paper p-8 text-ink">
      <header className="flex items-start justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-lg font-bold">회비 납부 영수증</h1>
          <p className="mt-1 text-xs text-charcoal-3">{receipt.receiptNumber}</p>
        </div>
        <p className="text-sm font-semibold">{receipt.clubName}</p>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="회원" value={receipt.memberName} />
        <Field label="정책" value={receipt.policyName} />
        <Field label="회차" value={receipt.billingPeriod} />
        <Field label="상태" value={feeStatusLabel(receipt.status)} />
        <Field label="청구 기간" value={`${receipt.billingStartDate} ~ ${receipt.billingEndDate}`} />
        <Field label="마감일" value={receipt.dueDate} />
      </dl>

      <div className="mt-4 space-y-1 rounded-lg bg-graysoft px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-charcoal-2">청구액</span>
          <span className="font-semibold">{formatWon(receipt.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-charcoal-2">납부액 (총 {receipt.paymentCount}회)</span>
          <span className="font-semibold">{formatWon(receipt.paidTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-charcoal-2">잔액</span>
          <span className="font-semibold">{formatWon(receipt.remaining)}</span>
        </div>
      </div>

      <h2 className="mt-5 text-sm font-bold">납부 내역</h2>
      <table className="mt-2 w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line text-charcoal-3">
            <th className="py-1.5 font-medium">납부일</th>
            <th className="py-1.5 font-medium">수단</th>
            <th className="py-1.5 text-right font-medium">금액</th>
            <th className="py-1.5 font-medium">메모</th>
          </tr>
        </thead>
        <tbody>
          {receipt.payments.map((line, index) => (
            <tr key={`${line.paidAt}-${index}`} className="border-b border-line/60">
              <td className="py-1.5">{line.paidAt.slice(0, 10)}</td>
              <td className="py-1.5">{paymentMethodLabel(line.method)}</td>
              <td className="py-1.5 text-right">{formatWon(line.amount)}</td>
              <td className="py-1.5 text-charcoal-2">{line.memo ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-6 text-right text-xs text-charcoal-3">
        발급일 {receipt.issuedAt.slice(0, 10)}
      </footer>
    </article>
  );
}
