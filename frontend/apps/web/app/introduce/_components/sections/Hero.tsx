import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';

type HeroCategory = { emoji: string; label: string; selected: boolean };

const HERO_CATEGORIES: ReadonlyArray<HeroCategory> = [
  { emoji: '🎸', label: '음악', selected: true },
  { emoji: '📊', label: '학술', selected: false },
  { emoji: '🏀', label: '운동', selected: false },
  { emoji: '💻', label: 'IT', selected: false },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-8 pb-20 pt-14">
      <div className="mx-auto grid max-w-[1180px] items-center gap-14 md:grid-cols-[1.05fr_0.95fr]">

        {/* ── Text column ── */}
        <div>
          {/* Eyebrow */}
          <div
            className="mb-[22px] inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: '#e7ebd9', borderColor: '#cfd6b3', color: '#3e5b34' }}
          >
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full animate-pulse-ring"
              style={{ background: '#5b7e4d' }}
            />
            대구대학교 학생자치회 공식 동아리 플랫폼
          </div>

          {/* Heading */}
          <h1
            className="mb-[22px] font-bold leading-[1.04]"
            style={{ fontSize: 'clamp(40px, 5.6vw, 64px)', letterSpacing: '-0.035em', color: '#2c4124' }}
          >
            흩어져 있던 동아리,
            <br />
            <span className="relative inline-block" style={{ color: '#3e5b34' }}>
              두잉
              <span
                className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded-sm"
                style={{ background: '#e7ebd9' }}
              />
            </span>
            에 다 있어요.
          </h1>

          {/* Lead */}
          <p
            className="mb-[14px] leading-[1.55]"
            style={{ fontSize: '17.5px', color: '#4a5247', maxWidth: '480px' }}
          >
            탐색부터 지원, 동아리 운영까지.
            <br />
            대구대학교 모든 동아리를 한 곳에서 만나요.
          </p>

          {/* Sub */}
          <p className="mb-8 text-[15px]" style={{ color: '#8a8f83' }}>
            매 학기 업데이트되는 동아리 정보를 두잉에서 바로 확인하세요.
          </p>

          {/* CTA buttons */}
          <div className="mb-[22px] flex flex-wrap gap-3">
            <Link
              href={toRoute('/clubs')}
              className="inline-flex items-center gap-2 rounded-full px-5 py-[11px] text-sm font-semibold no-underline transition-colors"
              style={{
                background: '#3e5b34',
                color: '#f6f1dd',
                boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 8px 20px rgba(62,91,52,.22)',
              }}
            >
              동아리 둘러보기 →
            </Link>
            <Link
              href={toRoute('/signup')}
              className="inline-flex items-center gap-2 rounded-full border px-5 py-[11px] text-sm font-semibold no-underline transition-colors hover:bg-[rgba(62,91,52,.06)]"
              style={{ background: 'transparent', color: '#2c4124', borderColor: '#d9d4c3' }}
            >
              우리 동아리 등록하기
            </Link>
          </div>

          {/* Meta */}
          <div className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: '#8a8f83' }}>
            <span
              className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
              style={{ background: '#3e5b34', color: '#fbf6e6' }}
            >
              ✓
            </span>
            대구대 학생증 이메일로 30초 만에 가입
          </div>
        </div>

        {/* ── Visual column ── */}
        <div className="relative min-h-[560px]">

          {/* Card 1: Choose interest */}
          <div
            className="animate-float-a absolute left-0 top-0 rounded-[18px] border p-[22px]"
            style={{
              width: '78%',
              background: '#ffffff',
              borderColor: '#d9d4c3',
              boxShadow: '0 4px 16px rgba(47,58,46,.08), 0 24px 48px rgba(47,58,46,.08)',
              zIndex: 1,
            }}
          >
            <div
              className="mb-4 inline-flex items-center gap-1.5 rounded-full px-[10px] py-[5px] font-mono text-[10.5px] font-semibold uppercase"
              style={{ letterSpacing: '.14em', background: '#e7ebd9', color: '#3e5b34' }}
            >
              STEP 1 · 관심사 고르기
            </div>
            <h3
              className="mb-4 text-[17px] font-bold leading-tight"
              style={{ color: '#2c4124', letterSpacing: '-0.02em' }}
            >
              마음에 드는 분야부터
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {HERO_CATEGORIES.map((cat) => (
                <div
                  key={cat.label}
                  className="relative rounded-[12px] px-2 pb-3 pt-[18px] text-center"
                  style={
                    cat.selected
                      ? {
                          background: 'linear-gradient(135deg, #e7ebd9, #f0f3dc)',
                          border: '1.5px solid #3e5b34',
                          transform: 'translateY(-3px)',
                          boxShadow: '0 6px 18px rgba(62,91,52,.18)',
                        }
                      : { background: '#faf7ee', border: '1.5px solid #e6e1d2' }
                  }
                >
                  {cat.selected && (
                    <span
                      className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{ background: '#3e5b34', color: '#fbf6e6' }}
                    >
                      ✓
                    </span>
                  )}
                  <div className="mb-2 text-2xl leading-none">{cat.emoji}</div>
                  <div
                    className="text-[12px]"
                    style={{
                      color: cat.selected ? '#2c4124' : '#4a5247',
                      fontWeight: cat.selected ? 700 : 500,
                    }}
                  >
                    {cat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Application success */}
          <div
            className="animate-float-b absolute right-0 rounded-[18px] border p-[22px]"
            style={{
              top: '330px',
              width: '78%',
              background: '#ffffff',
              borderColor: '#d9d4c3',
              boxShadow: '0 4px 16px rgba(47,58,46,.08), 0 24px 48px rgba(47,58,46,.08)',
              zIndex: 2,
            }}
          >
            {/* Success header */}
            <div className="mb-[14px] flex items-center gap-[10px]">
              <span
                className="animate-pop-in inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: '#3e5b34', color: '#fbf6e6', boxShadow: '0 0 0 5px rgba(91,126,77,.16)' }}
              >
                ✓
              </span>
              <span
                className="text-[14.5px] font-bold"
                style={{ color: '#2c4124', letterSpacing: '-0.01em' }}
              >
                트레몰로 지원이 완료됐어요
              </span>
            </div>

            {/* Club line */}
            <div
              className="mb-3 flex items-center gap-3 rounded-[12px] border p-[12px]"
              style={{ background: 'linear-gradient(135deg, #e7ebd9, #f0f3dc)', borderColor: '#d6dcb6' }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-white text-xl"
                style={{ borderColor: '#d6dcb6' }}
              >
                🎸
              </div>
              <div>
                <div className="text-[15px] font-bold leading-tight" style={{ color: '#2c4124' }}>
                  트레몰로
                </div>
                <div
                  className="mt-0.5 font-mono text-[11px]"
                  style={{ letterSpacing: '.04em', color: '#4a6b3f' }}
                >
                  밴드 동아리 · 12명
                </div>
              </div>
            </div>

            {/* Ticket row */}
            <div
              className="flex items-center gap-3 rounded-[12px] border border-dashed p-3"
              style={{ borderColor: '#cfd6b3', background: '#faf7ee' }}
            >
              <div
                className="flex h-[52px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[10px]"
                style={{ background: '#2c4124', color: '#fbf6e6', boxShadow: '0 4px 12px rgba(44,65,36,.28)' }}
              >
                <span className="font-mono text-[10px] opacity-85" style={{ letterSpacing: '.1em' }}>
                  NOV
                </span>
                <span className="text-[22px] font-extrabold leading-none">21</span>
              </div>
              <div>
                <div
                  className="font-mono text-[10.5px] uppercase"
                  style={{ letterSpacing: '.08em', color: '#8a8f83' }}
                >
                  면접 일정
                </div>
                <div className="mt-0.5 text-[14.5px] font-bold" style={{ color: '#2a2f27' }}>
                  토 · 오후 1:30
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
