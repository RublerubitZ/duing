import { SparkleFull } from '../Sparkle';

export function Solution() {
  return (
    <section id="section-2" className="bg-sage-mist px-10 pb-[120px] pt-20">
      <div className="relative mx-auto max-w-[1100px] text-center">
        <SparkleFull size={48} color="#1F4A36" className="inline-block" />
        <h2 className="mb-7 mt-6 text-[76px] leading-[1.05] tracking-[-0.03em] text-ink-deep">
          그래서 두잉이
          <br />
          모았어요.
        </h2>
        <p className="mx-auto max-w-[580px] text-[19px] leading-[1.6] text-ink-deep/70">
          대구대학교의 모든 동아리를 한 곳에서.
          <br />
          검색하고, 지원하고, 활동까지 두잉으로 관리하세요.
        </p>
      </div>
    </section>
  );
}
