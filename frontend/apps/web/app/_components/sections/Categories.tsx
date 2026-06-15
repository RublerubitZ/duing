import Image from 'next/image';
import Link from 'next/link';
import {
  Church,
  Drama,
  Dumbbell,
  Gamepad2,
  GraduationCap,
  HeartHandshake,
  Palette,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import type { ClubCategory } from '@duing/types';

import { HOME_CATEGORIES, type HomeCategoryMeta } from '@/app/_lib/homeCategories';

// 모바일 4×2 아이콘 타일용 — 카테고리별 lucide 아이콘.
const CATEGORY_ICON: Record<ClubCategory, LucideIcon> = {
  ACADEMIC: GraduationCap,
  CULTURE: Drama,
  ART: Palette,
  SPORTS: Dumbbell,
  VOLUNTEER: HeartHandshake,
  RELIGION: Church,
  HOBBY: Gamepad2,
  OTHER: Shapes,
};

export function Categories() {
  return (
    <section className="px-4 sm:px-6 md:px-10 pb-8 pt-10 sm:pb-10 sm:pt-24">
      <div className="max-w-layout mx-auto">
        <div className="mb-6 flex flex-col items-start gap-2 sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
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

        {/* 모바일: 큰 이미지 카드 대신 4×2 아이콘 타일로 한눈에 */}
        <div className="grid grid-cols-4 gap-2.5 md:hidden">
          {HOME_CATEGORIES.map((category) => (
            <CategoryIconTile key={category.value} category={category} />
          ))}
        </div>

        {/* 데스크탑: 기존 이미지 카드 */}
        <div className="hidden gap-4 md:grid md:grid-cols-4">
          {HOME_CATEGORIES.map((category) => (
            <CategoryTile key={category.value} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}

// 모바일 전용 콤팩트 아이콘 타일 (4×2 그리드).
function CategoryIconTile({ category }: { category: HomeCategoryMeta }) {
  const Icon = CATEGORY_ICON[category.value];
  return (
    <Link
      href={`/clubs?category=${category.value}`}
      className="group flex flex-col items-center gap-2 rounded-2xl border bg-paper px-1 py-3.5 text-inherit no-underline transition-[transform,border-color] active:scale-[0.97]"
      style={{ borderColor: '#e6e1d2' }}
    >
      <span
        className="grid h-11 w-11 place-items-center rounded-full"
        style={{ background: `${category.accent}1f`, color: category.accent }}
      >
        <Icon size={20} strokeWidth={1.8} aria-hidden />
      </span>
      <span
        className="text-[12px] font-semibold leading-none"
        style={{ color: '#2c4124', letterSpacing: '-0.01em' }}
      >
        {category.label}
      </span>
    </Link>
  );
}

function CategoryTile({ category }: { category: HomeCategoryMeta }) {
  return (
    <Link
      href={`/clubs?category=${category.value}`}
      className="group relative flex flex-col overflow-hidden rounded-[18px] border text-inherit no-underline transition-[transform,box-shadow,border-color] duration-250 ease-duing hover:-translate-y-1 hover:border-[color:var(--accent)] hover:shadow-[0_16px_32px_rgba(47,58,46,.08),0_2px_6px_rgba(47,58,46,.04)]"
      style={{
        background: '#ffffff',
        borderColor: '#d9d4c3',
        ['--accent' as string]: category.accent,
      }}
    >
      <div
        className="relative overflow-hidden border-b"
        style={{ height: 170, borderColor: '#e6e1d2', background: category.fallbackBg }}
      >
        <Image
          src={category.imageSrc}
          alt={category.label}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition-transform duration-600 ease-duing group-hover:scale-105"
        />
        <span
          className="absolute left-3.5 top-3 z-20 rounded-full px-[9px] py-1 font-mono text-[10px] font-semibold"
          style={{
            background: 'rgba(255,255,255,.86)',
            color: category.accent,
            letterSpacing: '.12em',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            boxShadow: '0 1px 2px rgba(0,0,0,.06)',
          }}
        >
          {category.index}
        </span>
        <span
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.18) 100%)',
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-[18px] py-4">
        <div className="flex flex-col gap-[3px]">
          <span
            className="text-[16.5px] font-bold leading-tight"
            style={{ color: '#2c4124', letterSpacing: '-0.015em' }}
          >
            {category.label}
          </span>
          <span
            className="flex items-center gap-1.5 font-mono text-[11.5px]"
            style={{ color: '#8a8f83' }}
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: category.accent }}
            />
            둘러보기
          </span>
        </div>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-250 group-hover:-rotate-45 group-hover:border-[color:var(--accent)] group-hover:bg-[color:var(--accent)] group-hover:text-white"
          style={{ borderColor: '#d9d4c3', color: '#4a5247' }}
        >
          <svg viewBox="0 0 12 12" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9L9 3M4 3h5v5" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
