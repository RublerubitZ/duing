import { JOINED_CLUBS } from '../../_constants/mock';
import { SectionHeader } from '../SectionHeader';
import { Icon } from '../Icons';

export function SectionJoined() {
  return (
    <section
      data-section="joined"
      id="sec-joined"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title="가입한 동아리 · 2"
          hint="활동 중인 동아리와 다음 모임 일정을 확인해요."
        />
        <div className="grid grid-cols-2 gap-3">
          {JOINED_CLUBS.map((club, index) => (
            <div
              key={index}
              className={[
                'bg-paper rounded-[18px] p-5 flex items-center gap-4',
                'cursor-pointer transition-[transform,box-shadow] duration-[180ms]',
                'hover:-translate-y-0.5 hover:shadow-2',
                club.isAdmin ? 'border-[1.5px] border-ink' : 'border border-line',
              ].join(' ')}
            >
              <div
                className={[
                  'w-14 h-14 rounded-md grid place-items-center text-[26px] shrink-0',
                  club.isAdmin ? 'bg-ink-deep text-white' : 'bg-sage-mist text-ink-deep',
                ].join(' ')}
              >
                {club.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-bold text-[16px] text-ink-deep">{club.name}</span>
                  <span
                    className={['pill text-[10.5px]', club.isAdmin ? 'pill-solid' : ''].join(' ')}
                  >
                    {club.isAdmin && '✦ '}
                    {club.role}
                  </span>
                </div>
                <div className="text-[12.5px] text-charcoal-2 mb-0.5">
                  <span className="font-semibold text-charcoal-2">다음 모임</span> · {club.next}
                </div>
                <div className="text-[11.5px] text-charcoal-3 font-mono">
                  가입 {club.since} · {club.cat}
                </div>
              </div>

              {club.isAdmin ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: 'var(--ink, #1F4A36)', color: '#fff', border: 'none' }}
                  title="이 동아리의 운영자 콘솔로 이동"
                >
                  관리
                  <Icon.arrowRight />
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm">
                  <Icon.arrowRight />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
