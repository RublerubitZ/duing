import { BrandMark } from '@/components/duing/BrandMark';
import { ArrowRight } from '@/components/duing/Icon';

const NAV_ITEMS = ['소개', '주요 기능', '사용법', '후기'] as const;

export function PromoNav() {
  return (
    <header
      className="sticky top-0 z-50 border-b border-line backdrop-blur-xl"
      style={{ background: 'rgba(246,243,236,0.85)' }}
    >
      <div className="max-w-layout mx-auto flex items-center gap-9 px-10 py-4">
        <BrandMark size={26} />
        <span className="text-xs font-semibold text-charcoal-3 tracking-body">
          for 대구대학교
        </span>
        <nav className="ml-7 hidden gap-7 md:flex">
          {NAV_ITEMS.map((item, idx) => (
            <a
              key={item}
              href={`#section-${idx + 1}`}
              className={`text-sm font-semibold ${idx === 0 ? 'text-ink-deep' : 'text-charcoal-3'}`}
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <a className="text-sm font-semibold text-charcoal-2" href="/login">
            로그인
          </a>
          <button
            type="button"
            className="btn btn-primary btn-sm rounded-full px-[18px] py-[9px]"
          >
            두잉 시작하기
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
