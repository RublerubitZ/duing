import { BrandMark } from './BrandMark';

export function PromoFooter() {
  return (
    <footer className="border-t border-line bg-cream-2 px-10 py-14">
      <div className="max-w-layout mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <BrandMark size={28} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-charcoal-2">
            대구대학교 학생자치회 공식 동아리 플랫폼.
            <br />
            탐색부터 운영까지, 두잉 하나로.
          </p>
        </div>
        {[
          { title: '서비스', items: ['동아리 탐색', '캘린더', '공지', 'FAQ'] },
          { title: '운영자', items: ['우리 동아리 등록', '운영자 가이드', '문의하기'] },
          { title: '문의', items: ['help@duing.daegu.ac.kr', '대구대 학생자치회'] },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-xs font-bold tracking-wide06 text-ink-deep">{col.title}</div>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-charcoal-2">
              {col.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="max-w-layout mx-auto mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-charcoal-3">
        <div>© 2026 Duing · 대구대학교 학생자치회</div>
        <div className="flex gap-5">
          <a>이용약관</a>
          <a>개인정보 처리방침</a>
        </div>
      </div>
    </footer>
  );
}
