import { SparkleFull } from '../Sparkle';

type Testimonial = {
  quote: string;
  who: string;
  dept: string;
  dark: boolean;
};

const TESTIMONIALS: ReadonlyArray<Testimonial> = [
  {
    quote:
      '지원할 동아리 찾으려고 매번 인스타랑 에브리타임 뒤지던 시간이 사라졌어요. 두잉에서 카테고리로 찾으니까 30분도 안 걸려요.',
    who: '이서연',
    dept: '경영학과 1학년 · 2025-2학기 가입',
    dark: false,
  },
  {
    quote:
      '회장단인데 매학기 지원자 정리하느라 엑셀이랑 구글폼이랑 카톡 다 봐야 했거든요. 이제 한 화면에서 다 처리해요.',
    who: '박지호',
    dept: '산업디자인학과 3학년 · 픽셀팩토리 회장',
    dark: true,
  },
  {
    quote:
      '면접 일정 알림 카톡으로 와서 진짜 까먹을 일이 없어요. 합격했을 때 알림 받았을 때 기분 좋았던 거 잊지 못해요.',
    who: '오현우',
    dept: '컴퓨터공학과 3학년 · 두잉코드 9기',
    dark: false,
  },
];

export function Testimonials() {
  return (
    <section id="section-4" className="px-10 pb-[120px] pt-20">
      <div className="max-w-layout mx-auto">
        <div className="mb-14 text-center">
          <div className="mb-3.5 text-[13px] font-bold tracking-wide16 text-ink">
            VOICES · 두잉을 쓰는 이유
          </div>
          <h2 className="text-[48px] leading-[1.1]">
            대구대 학생들의 한마디
            <SparkleFull
              size={24}
              color="#9DB6A0"
              className="ml-2 inline-block align-middle"
            />
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <div
              key={item.who}
              className={`relative rounded-xl p-8 ${
                item.dark ? 'bg-ink text-white' : 'border border-line bg-paper text-charcoal'
              }`}
            >
              <div
                className={`mb-2 font-display text-[64px] font-bold leading-[0.5] ${
                  item.dark ? 'text-sage' : 'text-sage-soft'
                }`}
              >
                &ldquo;
              </div>
              <p
                className={`mb-7 text-[15px] leading-[1.65] ${
                  item.dark ? 'text-white/85' : 'text-charcoal'
                }`}
              >
                {item.quote}
              </p>
              <div
                className={`flex items-center gap-3 border-t pt-5 ${
                  item.dark ? 'border-dashed border-white/15' : 'border-dashed border-line'
                }`}
              >
                <div
                  className={`grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-ink-deep ${
                    item.dark ? 'bg-sage' : 'bg-sage-mist'
                  }`}
                >
                  {item.who.slice(-2)}
                </div>
                <div>
                  <div
                    className={`text-sm font-bold ${
                      item.dark ? 'text-white' : 'text-ink-deep'
                    }`}
                  >
                    {item.who}
                  </div>
                  <div
                    className={`mt-0.5 text-[11.5px] ${
                      item.dark ? 'text-white/55' : 'text-charcoal-3'
                    }`}
                  >
                    {item.dept}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
