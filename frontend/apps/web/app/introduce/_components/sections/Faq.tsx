import { FadeIn } from '@/components/motion/FadeIn';
import { Accordion, type AccordionItemData } from '../Accordion';

const FAQ_ITEMS: ReadonlyArray<AccordionItemData> = [
  {
    question: '누구나 가입할 수 있나요?',
    answer: '대구대학교 재학생·휴학생 누구나 가입할 수 있어요. 이메일 인증을 거쳐 30초면 가입돼요.',
  },
  {
    question: '대구대학교 전용인가요?',
    answer: '네, 현재는 대구대학교 동아리를 위한 플랫폼이에요. 다른 학교 확장은 검토 중입니다.',
  },
  {
    question: '회비 관리 기능은 어떻게 동작하나요?',
    answer:
      '운영진이 회비 정책을 만들어 부원에게 청구하면, 납부 현황이 한눈에 정리돼요. 은행 입금 내역을 부원과 자동으로 맞춰주고, 수입·지출은 금전출납부로 기록됩니다.',
  },
  {
    question: '면접 일정도 두잉에서 잡을 수 있나요?',
    answer:
      '지원자에게 가능한 시간을 받아 면접 라운드를 만들고, 슬롯에 맞춰 일정을 자동으로 배정해요. 확정과 재안내 알림까지 두잉 안에서 처리됩니다.',
  },
  {
    question: '비용이 발생하나요?',
    answer: '두잉 이용은 무료예요. 동아리 회비는 동아리별로 다르게 책정됩니다.',
  },
  {
    question: '지원서 작성 도중에 꺼져도 괜찮나요?',
    answer: '자동으로 임시 저장되니 걱정 마세요. 작성하던 내용은 다시 들어와 이어서 작성할 수 있어요.',
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-line px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-[880px]">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FAQ · 자주 묻는 질문
          </p>
          <h2 className="mb-8" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            궁금한 거 있으세요?
          </h2>
        </FadeIn>

        <FadeIn>
          <Accordion items={FAQ_ITEMS} />
        </FadeIn>
      </div>
    </section>
  );
}
