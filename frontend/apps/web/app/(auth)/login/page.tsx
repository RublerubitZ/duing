import { fetchClubStats } from '@/app/_lib/club-stats';
import { LoginFormPanel } from './_components/LoginFormPanel';

export default async function LoginPage() {
  const { totalCount, recruitingCount } = await fetchClubStats();

  return (
    <div className="duing flex min-h-dvh">
      {/* ─── Left decorative panel ─── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:w-[420px] lg:shrink-0 lg:flex-col xl:w-[480px] bg-ink-deep">
        <div className="absolute inset-0 bg-grid opacity-20" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5 px-8 pt-8">
          <span className="brand-mark">
            <span className="b-d" style={{ color: '#fff' }}>D</span>
            <span className="b-u" style={{ color: 'rgba(157,182,160,0.85)', marginLeft: '-7px' }}>u</span>
            <span className="b-ing" style={{ color: 'rgba(255,255,255,0.75)' }}>ing</span>
            <svg className="b-spark" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 0l1.5 5.5L14 7l-5.5 1.5L7 14l-1.5-5.5L0 7l5.5-1.5L7 0z"
                fill="rgba(157,182,160,0.75)"
              />
            </svg>
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide06 text-cream/75">
            대구대학교
          </span>
        </div>

        {/* Main copy */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide16 text-sage-soft">
            WELCOME BACK
          </p>
          <h2 className="mb-4 text-[2.5rem] font-bold leading-tight tracking-tightx !text-cream">
            다시 만나서
            <br />
            반가워요
          </h2>
          <p className="text-sm leading-relaxed text-cream/55">
            대구대학교 동아리 플랫폼.
            <br />
            {totalCount}개 동아리 · {recruitingCount}곳 이번 학기 모집 중.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-8 pb-6">
          <div className="flex items-center justify-between text-[11px] text-cream/35">
            <span>© 2025 Duing · 대구대학교</span>
            <span className="flex gap-3">
              <span>도움말</span>
              <span>이용약관</span>
            </span>
          </div>
        </div>
      </aside>

      {/* ─── Right form panel (Client Component) ─── */}
      <LoginFormPanel />
    </div>
  );
}
