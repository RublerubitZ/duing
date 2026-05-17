import Link from 'next/link';
import { ArrowRight } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';
import { landingCategories, type LandingCategory } from '../../_mocks';

const TONE_BACKGROUND: Record<LandingCategory['tone'], string> = {
  sage: '#E8EEE8',
  warm: '#FBEFD7',
  berry: '#F6DCE3',
  coral: '#FCE2D9',
  sky: '#DDE8F1',
  ink: '#E3E9E1',
};

const TONE_FOREGROUND: Record<LandingCategory['tone'], string> = {
  sage: '#1F4A36',
  warm: '#8E6620',
  berry: '#7E2A45',
  coral: '#9A3F23',
  sky: '#2F557A',
  ink: '#143025',
};

export function Categories() {
  return (
    <section className="px-10 pb-10 pt-24">
      <div className="max-w-layout mx-auto">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <div className="mb-2.5 text-[13px] font-semibold tracking-wide08 text-ink">
              CATEGORY · 카테고리로 둘러보기
            </div>
            <h2 className="text-[44px]">
              관심사로 시작해요
              <SparkleFull
                size={28}
                color="#9DB6A0"
                className="ml-2.5 inline-block align-middle"
              />
            </h2>
          </div>
          <Link
            href="/clubs"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:gap-2"
          >
            전체 카테고리 <ArrowRight />
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
  return (
    <Link
      href={`/clubs?category=${encodeURIComponent(category.cat)}`}
      className="group relative overflow-hidden rounded-lg border border-line p-6 transition hover:-translate-y-0.5 hover:shadow-2"
      style={{ background: TONE_BACKGROUND[category.tone] }}
    >
      <div className="text-4xl">{category.emoji}</div>
      <div className="mt-5">
        <h3
          className="text-[22px] font-display font-bold"
          style={{ color: TONE_FOREGROUND[category.tone] }}
        >
          {category.cat}
        </h3>
        <div
          className="mt-1 text-xs font-semibold"
          style={{ color: TONE_FOREGROUND[category.tone], opacity: 0.7 }}
        >
          {category.count}개 동아리
        </div>
      </div>
      <ArrowRight
        size={18}
        className="absolute right-5 top-5 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: TONE_FOREGROUND[category.tone] }}
      />
    </Link>
  );
}
