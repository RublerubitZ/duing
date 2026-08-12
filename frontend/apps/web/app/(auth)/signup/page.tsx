import { fetchClubStats } from '@/app/_lib/club-stats';
import { SignupFormPanel } from './_components/SignupFormPanel';

const BENEFITS = [
  {
    label: '대구대 동아리 정보',
    color: 'bg-sky/30 text-sky',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5l1.3 4H13l-3.5 2.5 1.3 4L7 9.5 3.2 12l1.3-4L1 5.5h4.7L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: '마감 임박·면접 일정 알람',
    color: 'bg-warm/30 text-warm',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5a4 4 0 014 4v2.5l1 1.5H2l1-1.5V5.5a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5.5 11.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: '지원서 자동 임시 저장',
    color: 'bg-sage-soft/40 text-ink',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: '찜한 동아리 모아보기',
    color: 'bg-berry/20 text-berry',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 11.5S2 8 2 4.5a2.5 2.5 0 015-0 2.5 2.5 0 015 0C12 8 7 11.5 7 11.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// 통계는 홈과 같은 600초 ISR — force-dynamic 은 요청(·`?next=` 리다이렉트 복귀)마다 백엔드
// COUNT 2발을 만들었다. 빌드 시점 API 실패 폴백(null → 통계 문구 생략)이 박혀도 첫 재생성(≤600초)에
// 회복되므로 과거 "SSG 박제"(무기한 고정) 문제는 재발하지 않는다.
export const revalidate = 600;

export default async function SignupPage() {
  const stats = await fetchClubStats();

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
            JOIN DUING
          </p>
          {/* `.duing h2` 가 text-ink-deep(어두운 색) 를 강제해 Tailwind 텍스트 색 유틸리티를 덮으므로,
              다크 패널에서는 인라인 스타일로 흰색을 지정해 배경(ink-deep)과 묻히지 않게 한다(brand-mark 와 동일 패턴). */}
          <h2
            className="mb-4 text-[2.5rem] font-bold leading-tight tracking-tightx"
            style={{ color: '#fff' }}
          >
            30초 만에
            <br />
            두잉 시작
          </h2>
          <p className="mb-8 text-sm leading-relaxed text-cream/55">
            대구대학교 동아리 플랫폼.
            {stats && (
              <>
                <br />
                {stats.totalCount}개 동아리 · {stats.recruitingCount}곳 이번 학기 모집 중.
              </>
            )}
          </p>

          {/* Benefits list */}
          <div className="rounded-lg bg-white/8 p-4">
            <p className="mb-3 text-xs font-semibold text-cream/50 tracking-wide04">
              가입하면 바로 누리는 혜택
            </p>
            <ul className="space-y-2.5">
              {BENEFITS.map((benefit, index) => (
                <li key={benefit.label} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${benefit.color}`}
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </span>
                  <span className="text-sm text-cream/80">
                    {index === 0 && stats ? `${stats.totalCount}개 ${benefit.label}` : benefit.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-8 pb-6 text-[11px] text-cream/35">
          <span>© DUING</span>
        </div>
      </aside>

      {/* ─── Right form panel (Client Component) ─── */}
      <SignupFormPanel />
    </div>
  );
}
