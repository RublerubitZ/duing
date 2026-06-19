import Link from 'next/link';
import { SparkleFull } from '@/components/duing/Sparkle';
import { RegisterClubButton } from './RegisterClubButton';

export function LeaderCta() {
  return (
    <section className="px-4 sm:px-6 md:px-10 pb-6 pt-10 sm:pt-20">
      <div className="max-w-layout relative mx-auto grid items-center gap-8 overflow-hidden rounded-xl bg-sage-mist px-14 py-11 md:grid-cols-[1fr_auto]">
        <SparkleFull
          size={48}
          color="#9DB6A0"
          className="absolute right-[320px] top-6 opacity-60"
        />
        <SparkleFull
          size={28}
          color="#143025"
          className="absolute bottom-7 right-[420px] opacity-40"
        />
        <div>
          <div className="mb-3 text-[12.5px] font-bold tracking-[0.1em] text-ink">
            FOR CLUB LEADERS · 동아리 운영자
          </div>
          <h2 className="mb-2.5 text-4xl leading-[1.15] text-ink-deep">
            우리 동아리도 두잉에 등록하고 싶어요
          </h2>
          <p className="max-w-[580px] text-[15.5px] leading-[1.55] text-ink-deep/70">
            지원자 관리 · 공지 발송 · 회비 정산까지. 운영자 검토 후 승인됩니다.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <RegisterClubButton />
          <Link
            href="/introduce#section-3"
            className="btn btn-ghost btn-sm text-ink-deep"
          >
            운영자 가이드 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
