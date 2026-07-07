import Link from 'next/link';

import { fetchFederationFaqHighlights } from '@/app/_lib/home-data';
import { toRoute } from '@/app/_lib/route';
import { HomeFaqAccordion } from './HomeFaqAccordion';

export async function HomeQnaSection() {
  const faqs = await fetchFederationFaqHighlights(4);
  if (faqs.length === 0) return null; // BE 폴백·데이터 없음 → 섹션 미렌더(RecruitmentTicker 동일 패턴)

  return (
    <section className="px-4 sm:px-6 md:px-10 py-8 sm:py-16">
      <div className="max-w-layout mx-auto">
        <div className="mb-9">
          <h2 className="text-[26px] sm:text-[36px] md:text-[44px]">자주 묻는 질문</h2>
          <p className="mt-2.5 text-[14px] text-charcoal-2 md:text-[15px]">
            총동연에 궁금한 점을 물어보세요
          </p>
        </div>

        <HomeFaqAccordion items={faqs} />

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={toRoute('/me/inquiries/new')}
            className="rounded-full bg-coral px-5 py-2.5 text-[14px] font-semibold text-paper"
          >
            1:1 문의하기
          </Link>
          <Link
            href="/faq"
            className="rounded-full border border-line bg-paper px-5 py-2.5 text-[14px] font-semibold text-charcoal-2"
          >
            자주 묻는 질문 전체 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
