import Link from 'next/link';

type FooterColumn = { title: string; items: ReadonlyArray<string> };

const FOOTER_COLUMNS: ReadonlyArray<FooterColumn> = [
  { title: '서비스', items: ['동아리 탐색', '캘린더', '공지', 'FAQ'] },
  { title: '운영자', items: ['우리 동아리 등록', '운영자 가이드', '문의하기'] },
  { title: '문의', items: ['duing.official@gmail.com'] },
];

export function PromoFooter() {
  return (
    <footer style={{ background: '#232c22', color: 'rgba(243,239,228,.6)', fontSize: '13px' }}>
      <div className="mx-auto max-w-[1180px] px-8 py-12">
        <div className="flex flex-wrap justify-between gap-10">
          {/* Brand */}
          <div>
            <div
              className="mb-2 font-mono text-[18px] font-bold"
              style={{ color: '#f6f1dd' }}
            >
              Du<span style={{ color: '#5b7e4d' }}>·</span>ing
            </div>
            <p className="max-w-[220px] leading-relaxed" style={{ color: 'rgba(243,239,228,.6)' }}>
              탐색부터 운영까지, 두잉 하나로.
            </p>
          </div>

          {/* Columns */}
          <div className="flex flex-wrap gap-14">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <h4
                  className="mb-[10px] font-mono text-[12px] font-semibold"
                  style={{ color: '#f6f1dd', letterSpacing: '.12em' }}
                >
                  {col.title}
                </h4>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {col.items.map((item) => (
                    <li key={item}>
                      <a
                        href={item.includes('@') ? `mailto:${item}` : '#'}
                        className="no-underline transition-colors hover:text-[#f6f1dd]"
                        style={{ color: 'rgba(243,239,228,.55)' }}
                      >
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div
          className="mt-8 border-t pt-[18px] text-center text-[12px]"
          style={{ borderColor: '#34402f', color: 'rgba(243,239,228,.4)' }}
        >
          © DUING · All Rights Reserved &nbsp;·&nbsp;{' '}
          <Link href="/terms#terms" className="transition-colors hover:text-[#f6f1dd]">
            이용약관
          </Link>{' '}
          &nbsp;·&nbsp;{' '}
          <Link href="/terms#privacy" className="transition-colors hover:text-[#f6f1dd]">
            개인정보 처리방침
          </Link>
        </div>
      </div>
    </footer>
  );
}
