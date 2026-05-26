import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';

export function Cta() {
  return (
    <section
      className="px-8 pb-20 pt-24 text-center"
      style={{ background: '#2c4124', color: '#f3efe4' }}
    >
      <div className="mx-auto max-w-[880px]">
        <h2
          className="mb-[14px] font-bold"
          style={{
            fontSize: 'clamp(34px, 4.4vw, 50px)',
            letterSpacing: '-0.025em',
            color: '#f6f1dd',
          }}
        >
          오늘부터 두잉,
          <br />
          같이 해볼래요?
        </h2>
        <p className="mb-[30px] text-[16px]" style={{ color: 'rgba(243,239,228,.7)' }}>
          대구대학교 학생증 이메일로 30초 만에 가입.
          <br />
          이번 학기 7곳이 모집중이에요.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={toRoute('/signup')}
            className="inline-flex items-center gap-2 rounded-full px-5 py-[11px] text-sm font-semibold no-underline transition-colors hover:bg-white"
            style={{ background: '#f6f1dd', color: '#2c4124' }}
          >
            두잉 시작하기 →
          </Link>
          <Link
            href={toRoute('/clubs')}
            className="inline-flex items-center gap-2 rounded-full border px-5 py-[11px] text-sm font-semibold no-underline transition-colors hover:bg-[rgba(255,255,255,.06)]"
            style={{ background: 'transparent', color: '#f6f1dd', borderColor: 'rgba(243,239,228,.3)' }}
          >
            우리 동아리 등록하기
          </Link>
        </div>
      </div>
    </section>
  );
}
