import Image from 'next/image';
import Link from 'next/link';
import { landingCategories, type LandingCategory } from '../../_mocks';

type CategoryMeta = {
  accent: string;
  fallbackBg: string;
  imageSrc: string;
  index: string;
};

const CATEGORY_META: Record<LandingCategory['cat'], CategoryMeta> = {
  학술: { accent: '#5b7e4d', fallbackBg: '#1e2e1a', imageSrc: '/categories/cat-01-academic.png', index: '01' },
  음악: { accent: '#7d4f87', fallbackBg: '#221428', imageSrc: '/categories/cat-02-music.png',    index: '02' },
  운동: { accent: '#c47a3b', fallbackBg: '#2e1e0e', imageSrc: '/categories/cat-03-sport.png',    index: '03' },
  IT:   { accent: '#4d6b8a', fallbackBg: '#121e2a', imageSrc: '/categories/cat-04-it.png',       index: '04' },
  공연: { accent: '#a85e5e', fallbackBg: '#281414', imageSrc: '/categories/cat-05-perform.png',  index: '05' },
  봉사: { accent: '#b88b3b', fallbackBg: '#28200e', imageSrc: '/categories/cat-06-volunteer.png',index: '06' },
  문화: { accent: '#6b7e3e', fallbackBg: '#1e2614', imageSrc: '/categories/cat-07-culture.png',  index: '07' },
  창업: { accent: '#3e7a73', fallbackBg: '#0e2422', imageSrc: '/categories/cat-08-startup.png',  index: '08' },
};

export function Categories() {
  return (
    <section className="px-10 pb-10 pt-24">
      <div className="max-w-layout mx-auto">
        <div className="mb-9 flex items-end justify-between gap-5">
          <div>
            <p
              className="mb-3 font-mono text-[11.5px] font-semibold uppercase"
              style={{ letterSpacing: '.22em', color: '#3e5b34' }}
            >
              CATEGORY · 카테고리로 둘러보기
            </p>
            <h2
              className="flex items-center gap-3.5 font-bold"
              style={{ fontSize: 'clamp(28px, 3vw, 38px)', letterSpacing: '-0.025em', color: '#2c4124' }}
            >
              관심사로 시작해요
              <span aria-hidden="true" className="inline-block" style={{ width: 26, height: 26, color: '#5b7e4d' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ animation: 'spin 6s linear infinite' }}>
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
                </svg>
              </span>
            </h2>
          </div>
          <Link
            href="/clubs"
            className="flex shrink-0 items-center gap-1.5 border-b border-transparent pb-0.5 text-[13.5px] font-medium transition-colors hover:border-current"
            style={{ color: '#3e5b34' }}
          >
            전체 카테고리
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {landingCategories.map((category) => (
            <CategoryTile key={category.cat} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryTile({ category }: { category: LandingCategory }) {
  const meta = CATEGORY_META[category.cat];

  return (
    <Link
      href={`/clubs?category=${encodeURIComponent(category.cat)}`}
      className="group relative flex flex-col overflow-hidden rounded-[18px] border text-inherit no-underline transition-[transform,box-shadow,border-color] duration-[250ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1 hover:border-[color:var(--accent)] hover:shadow-[0_16px_32px_rgba(47,58,46,.08),0_2px_6px_rgba(47,58,46,.04)]"
      style={{
        background: '#ffffff',
        borderColor: '#d9d4c3',
        ['--accent' as string]: meta.accent,
      }}
    >
      {/* 비주얼 영역 */}
      <div
        className="relative overflow-hidden border-b"
        style={{ height: 170, borderColor: '#e6e1d2', background: meta.fallbackBg }}
      >
        {/* 카테고리 사진 */}
        <Image
          src={meta.imageSrc}
          alt={category.cat}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition-transform duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-105"
        />

        {/* 인덱스 필 */}
        <span
          className="absolute left-3.5 top-3 z-20 rounded-full px-[9px] py-1 font-mono text-[10px] font-semibold"
          style={{
            background: 'rgba(255,255,255,.86)',
            color: meta.accent,
            letterSpacing: '.12em',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            boxShadow: '0 1px 2px rgba(0,0,0,.06)',
          }}
        >
          {meta.index}
        </span>

        {/* 하단 그라디언트 오버레이 */}
        <span
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.18) 100%)',
          }}
        />
      </div>

      {/* 메타 영역 */}
      <div className="flex items-center justify-between gap-2 px-[18px] py-4">
        <div className="flex flex-col gap-[3px]">
          <span
            className="text-[16.5px] font-bold leading-tight"
            style={{ color: '#2c4124', letterSpacing: '-0.015em' }}
          >
            {category.cat}
          </span>
          <span
            className="flex items-center gap-1.5 font-mono text-[11.5px]"
            style={{ color: '#8a8f83' }}
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: meta.accent }}
            />
            {category.count}개 동아리
          </span>
        </div>

        {/* 화살표 버튼 */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-[250ms] group-hover:-rotate-45 group-hover:border-[color:var(--accent)] group-hover:bg-[color:var(--accent)] group-hover:text-white"
          style={{
            borderColor: '#d9d4c3',
            color: '#4a5247',
          }}
        >
          <svg viewBox="0 0 12 12" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9L9 3M4 3h5v5" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
