import { CreditCard, GraduationCap } from 'lucide-react';
import Link from 'next/link';

import { toRoute } from '@/app/_lib/route';
import { SparkleFull } from '@/components/duing/Sparkle';

type Props = {
  name: string;
  studentId: string;
  /** 진행 중인 지원 수 */
  applyCount: number;
  /** 가입한 동아리 수 */
  joinedCount: number;
  /** 찜한 동아리 수 */
  savedCount: number;
};

export function MyPageHeader({
  name,
  studentId,
  applyCount,
  joinedCount,
  savedCount,
}: Props) {
  return (
    <section className="pt-page-top pb-6">
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10">
        {/* 모바일은 슬림 밴드(라벨+회비 링크 / 인사 / 신분) ≈120px — 숫자 3개는 바로 아래 탭 카운트와 중복이라 PC 에서만. */}
        <div
          className="relative overflow-hidden rounded-xl px-5 py-5 sm:px-10 sm:py-8 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 sm:gap-8 items-start sm:items-center"
          style={{
            background: 'linear-gradient(120deg, #1F4A36 0%, #143025 100%)',
          }}
        >
          <SparkleFull
            size={64}
            color="rgba(157,182,160,0.5)"
            className="absolute top-6 right-[200px] pointer-events-none hidden sm:block"
          />
          <SparkleFull
            size={28}
            color="rgba(157,182,160,0.4)"
            className="absolute bottom-6 right-[350px] pointer-events-none hidden sm:block"
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[12px] font-bold text-sage tracking-wide16">MY DUING</div>
              {/* 모바일 전용 회비 진입점 — 히트 영역은 음수 마진으로 확보해 행 높이를 안 늘린다. */}
              <Link
                href={toRoute('/me/fees')}
                className="sm:hidden -my-3 -mx-1 inline-flex items-center gap-1 px-1 py-3 text-[13px] font-medium text-cream/90 transition-colors hover:text-cream"
              >
                <CreditCard size={14} aria-hidden />
                회비 보기
                <span aria-hidden>→</span>
              </Link>
            </div>
            <h1 className="text-[24px] sm:text-[32px] !text-cream mb-2 sm:mb-2.5 flex items-center gap-2">
              안녕하세요, {name}님
              <SparkleFull size={20} color="#9DB6A0" className="inline-block align-middle" />
            </h1>
            <div className="flex items-center gap-[18px] flex-wrap text-[13px] text-white/70">
              <span className="inline-flex items-center gap-1">
                <GraduationCap size={14} aria-hidden />
                학생
              </span>
              <span>·</span>
              <span className="tabular-nums">{studentId}</span>
            </div>
            <Link
              href={toRoute('/me/fees')}
              className="hidden sm:inline-flex mt-4 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium text-cream ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/15"
            >
              <CreditCard size={14} aria-hidden />
              내 회비 보기
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="hidden sm:flex gap-6 items-center z-[1]">
            {(
              [
                [String(applyCount), '지원 중'],
                [String(joinedCount), '가입'],
                [String(savedCount), '찜'],
              ] as const
            ).map(([count, label]) => (
              <div key={label} className="text-center">
                <div className="text-[32px] font-bold text-white">{count}</div>
                <div className="text-[11px] text-white/60 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
