import { SparkleFull } from '@/components/duing/Sparkle';

type Props = {
  name: string;
  studentId: string;
  email: string;
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
  email,
  applyCount,
  joinedCount,
  savedCount,
}: Props) {
  return (
    <section className="px-4 sm:px-6 md:px-10 pt-11 pb-6">
      <div className="max-w-layout mx-auto">
        <div
          className="relative overflow-hidden rounded-xl px-10 py-8 grid gap-8 items-center"
          style={{
            background: 'linear-gradient(120deg, #1F4A36 0%, #143025 100%)',
            gridTemplateColumns: '1fr auto',
          }}
        >
          <SparkleFull
            size={64}
            color="rgba(157,182,160,0.5)"
            className="absolute top-6 right-[200px] pointer-events-none"
          />
          <SparkleFull
            size={28}
            color="rgba(157,182,160,0.4)"
            className="absolute bottom-6 right-[350px] pointer-events-none"
          />

          <div>
            <div className="text-[12px] font-bold text-sage tracking-wide16 mb-1.5">MY DUING</div>
            <h1 className="text-[32px] !text-cream mb-2.5 flex items-center gap-2">
              안녕하세요, {name}님
              <SparkleFull size={20} color="#9DB6A0" className="inline-block align-middle" />
            </h1>
            <div className="flex gap-[18px] flex-wrap text-[13px] text-white/70">
              <span>🎓 학생</span>
              <span>·</span>
              <span className="font-mono">{studentId}</span>
              <span>·</span>
              <span>📨 {email}</span>
            </div>
          </div>

          <div className="flex gap-6 items-center z-[1]">
            {(
              [
                [String(applyCount), '지원 중'],
                [String(joinedCount), '가입'],
                [String(savedCount), '찜'],
              ] as const
            ).map(([count, label]) => (
              <div key={label} className="text-center">
                <div className="font-display text-[32px] font-bold text-white">{count}</div>
                <div className="text-[11px] text-white/60 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
