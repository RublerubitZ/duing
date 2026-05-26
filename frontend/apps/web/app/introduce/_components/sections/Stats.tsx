type Stat = { value: string; label: string };

const STATS: ReadonlyArray<Stat> = [
  { value: '128', label: '등록 동아리' },
  { value: '7', label: '이번 학기 모집중' },
  { value: '1,200+', label: '두잉 회원' },
  { value: '12', label: '단과대학' },
];

export function Stats() {
  return (
    <section style={{ background: '#faf7ee' }}>
      <div className="mx-auto max-w-[1180px]">
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ borderTop: '1px solid #d9d4c3', borderBottom: '1px solid #d9d4c3' }}
        >
          {STATS.map((stat, idx) => (
            <div
              key={stat.label}
              className="px-6 py-7"
              style={{
                borderRight: idx < STATS.length - 1 ? '1px solid #d9d4c3' : 'none',
              }}
            >
              <div
                className="font-mono text-[38px] font-bold leading-none"
                style={{ color: '#2c4124', letterSpacing: '-0.02em' }}
              >
                {stat.value}
              </div>
              <div className="mt-2 text-[13px]" style={{ color: '#8a8f83' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
