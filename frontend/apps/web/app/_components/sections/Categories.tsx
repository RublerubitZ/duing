import Link from 'next/link';
import type { ClubCategory } from '@duing/types';

import { fetchClubStats } from '@/app/_lib/club-stats';
import { HOME_CATEGORIES, type HomeCategoryMeta } from '@/app/_lib/homeCategories';

type CategoryCounts = Partial<Record<ClubCategory, number>>;

export async function Categories() {
  const stats = await fetchClubStats();
  // 통계 조회 실패·BE 미배포 전환기에는 카운트만 생략하고 타일은 그대로 그린다 —
  // 카테고리 탐색 자체는 카운트 없이도 성립한다(가짜 숫자를 박지 않는다).
  const categoryCounts: CategoryCounts = stats?.categoryCounts ?? {};

  return (
    <section className="px-4 sm:px-6 md:px-10 pb-6 pt-8 sm:pb-8 sm:pt-14">
      <div className="max-w-layout mx-auto">
        <h2 className="mb-5 text-[20px] md:mb-10 md:text-[36px]">내게 맞는 카테고리</h2>

        {/* 모바일: 4×2 타일 */}
        <div className="grid grid-cols-4 gap-2.5 md:hidden">
          {HOME_CATEGORIES.map((category) => (
            <CategoryTile
              key={category.value}
              category={category}
              count={categoryCounts[category.value]}
            />
          ))}
        </div>

        {/* 데스크탑: 가로 스크롤. 카테고리가 8종이라 한 화면에 4~5개만 보이고 나머지는 밀어서 본다. */}
        <div className="hidden overflow-x-auto pb-3 md:block">
          <div className="flex w-max gap-6">
            {HOME_CATEGORIES.map((category) => (
              <CategoryCard
                key={category.value}
                category={category}
                count={categoryCounts[category.value]}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 카운트 접근명 — 타일 링크 하나에 이름·개수를 함께 실어 스크린리더가 두 번 읽지 않게 한다. */
function categoryLinkLabel(category: HomeCategoryMeta, count: number | undefined): string {
  return count === undefined
    ? `${category.label} 동아리 보기`
    : `${category.label} 동아리 ${count}개 보기`;
}

function CategoryCard({
  category,
  count,
}: {
  category: HomeCategoryMeta;
  count: number | undefined;
}) {
  return (
    <Link
      href={`/clubs?category=${category.value}`}
      aria-label={categoryLinkLabel(category, count)}
      // 네이티브 앵커 드래그가 가로 스크롤 제스처를 끊지 않도록 막는다.
      draggable={false}
      className="group relative flex h-[194px] w-[264px] shrink-0 flex-col justify-between overflow-hidden rounded-[18px] border border-line bg-paper p-[22px] text-inherit no-underline transition duration-250 ease-duing hover:-translate-y-1 hover:shadow-3 motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between">
        <span aria-hidden className="text-[30px] font-semibold leading-none tracking-tightest text-ink">
          {category.label}
        </span>
        <span
          aria-hidden
          className="text-[24px] leading-none text-charcoal-3 transition-transform duration-250 group-hover:translate-x-0.5"
        >
          ›
        </span>
      </div>

      {count !== undefined && (
        <span
          aria-hidden
          className="w-fit rounded-full bg-ink-deep px-4 py-2 text-[16px] font-semibold leading-none tracking-tightest text-cream"
        >
          {count}개
        </span>
      )}

      {/* 픽토그램 — 장식이라 접근성 트리에서 제외한다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-3.5 right-4 select-none text-[80px] leading-none"
      >
        {category.emoji}
      </span>
    </Link>
  );
}

function CategoryTile({
  category,
  count,
}: {
  category: HomeCategoryMeta;
  count: number | undefined;
}) {
  return (
    <Link
      href={`/clubs?category=${category.value}`}
      aria-label={categoryLinkLabel(category, count)}
      draggable={false}
      className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-[10px] border border-line bg-paper p-2.5 text-inherit no-underline transition active:scale-[0.97]"
    >
      <span aria-hidden className="text-[14px] font-semibold leading-none tracking-tightest text-ink">
        {category.label}
      </span>
      <span
        aria-hidden
        className="pointer-events-none select-none self-end text-[30px] leading-none"
      >
        {category.emoji}
      </span>
    </Link>
  );
}
