import type { ClubFaq } from '@duing/types';

type Props = { faqs: ClubFaq[] };

export function ClubDetailQna({ faqs }: Props) {
  const sorted = faqs.slice().sort((a, b) => a.order - b.order);
  return (
    <ul className="space-y-3">
      {sorted.map((faq, idx) => (
        <li key={idx} className="rounded-[14px] border border-line bg-paper p-4">
          <p className="font-semibold text-ink-deep">Q. {faq.question}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-charcoal-2">{faq.answer}</p>
        </li>
      ))}
    </ul>
  );
}
