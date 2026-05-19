import { SAVED_CLUBS } from '../../_constants/mock';
import { SectionHeader } from '../SectionHeader';
import { Icon } from '../Icons';

export function SectionSaved() {
  return (
    <section
      data-section="saved"
      id="sec-saved"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title="찜한 동아리 · 8"
          hint="관심 표시한 동아리예요. 모집 마감이 임박하면 알려드려요."
          extra={
            <button type="button" className="btn btn-ghost btn-sm">
              <Icon.filter />
              정렬
            </button>
          }
        />
        <div className="grid grid-cols-4 gap-3">
          {SAVED_CLUBS.map((club) => (
            <div
              key={club.id}
              className="relative bg-paper border border-line rounded-[16px] p-4 flex flex-col gap-3 cursor-pointer transition-[transform,box-shadow,border-color] duration-[180ms] hover:-translate-y-0.5 hover:shadow-2 hover:border-ink"
            >
              <div className="flex items-center justify-between">
                <div
                  className="w-11 h-11 rounded-[12px] grid place-items-center text-[22px]"
                  style={{ background: `${club.color}11`, color: club.color }}
                >
                  {club.avatar}
                </div>
                <Icon.heartFill className="text-coral w-[18px] h-[18px]" />
              </div>

              <div>
                <div className="font-bold text-[14.5px] text-ink-deep mb-1">{club.name}</div>
                <div className="text-[11.5px] text-charcoal-3 leading-snug">{club.tag}</div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-line">
                <span className="pill text-[10px]">{club.cat}</span>
                <span
                  className={['font-semibold font-mono', club.recruit ? 'text-ink' : 'text-charcoal-3'].join(' ')}
                >
                  {club.recruit ? `~${club.deadline}` : '마감'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
