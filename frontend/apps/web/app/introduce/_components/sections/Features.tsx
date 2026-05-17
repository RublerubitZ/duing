import { Check } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';
import { promoApplicants, promoClubs } from '../../_mocks';

const FILTER_CHIPS: ReadonlyArray<string> = ['전체', '학술', '음악', '운동', 'IT'];

const ADMIN_STATS: ReadonlyArray<{ value: string; label: string; highlight: boolean }> = [
  { value: '34', label: '총 지원자', highlight: false },
  { value: '12', label: '검토중', highlight: false },
  { value: '8', label: '면접 확정', highlight: true },
  { value: '6', label: '합격', highlight: false },
];

function FeatureBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 inline-flex rounded-full bg-sage-mist px-3 py-1.5 text-xs font-bold tracking-wide06 text-ink-deep">
      {children}
    </div>
  );
}

function CheckList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="flex list-none flex-col gap-3 pl-0">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[14.5px] text-charcoal">
          <Check size={18} className="mt-0.5 shrink-0 text-ink" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ExploreMockup() {
  const exploreClubs = promoClubs.filter((club) => club.cat === 'IT' || club.cat === '학술').slice(0, 4);
  return (
    <div className="rounded-xl border border-line bg-paper p-7 shadow-2">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map((chip, idx) => (
          <span
            key={chip}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              idx === 3
                ? 'bg-ink text-white'
                : 'border border-line bg-paper text-charcoal-2'
            }`}
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {exploreClubs.map((club) => (
          <div key={club.id} className="rounded-md border border-line bg-cream p-3">
            <div
              className="grid h-[70px] place-items-center rounded-md text-[26px]"
              style={{
                background: `linear-gradient(135deg, ${club.color}22, ${club.color}11)`,
              }}
            >
              {club.avatar}
            </div>
            <div className="mt-2.5">
              <span className="pill" style={{ fontSize: 10, padding: '2px 6px' }}>
                {club.cat}
              </span>
              <div className="mt-1.5 text-[13px] font-bold text-ink-deep">{club.name}</div>
              <div className="mt-0.5 text-[11px] text-charcoal-3">{club.members}명</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApplyMockup() {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-8 text-white"
      style={{ background: 'linear-gradient(180deg, #1F4A36 0%, #143025 100%)' }}
    >
      <SparkleFull size={36} color="#9DB6A0" className="absolute right-6 top-6 opacity-60" />
      <div className="mb-3 text-[11px] font-bold tracking-wide06 text-sage">
        STEP 2 / 3 · 자기소개
      </div>
      <div className="mb-7 flex gap-1.5">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full ${step <= 2 ? 'bg-sage' : 'bg-white/15'}`}
          />
        ))}
      </div>
      <h4 className="mb-4 font-body text-[26px] text-white">지원 동기를 적어주세요</h4>
      <div className="min-h-[100px] rounded-md border border-white/10 bg-white/5 p-4 text-[13.5px] leading-relaxed text-white/70">
        대학 와서 처음으로 개발 공부를 시작했고, 혼자 강의를 들으면서 자그마한 사이드 프로젝트를…
        <span className="text-sage">|</span>
      </div>
      <div className="mt-2.5 text-right text-[11px] text-white/45">자동 저장됨 · 16:24</div>
      <div className="mt-6 flex justify-between gap-2">
        <button className="rounded-md bg-white/10 px-4 py-2.5 text-white" type="button">
          이전
        </button>
        <button
          className="rounded-md bg-sage px-4 py-2.5 font-bold text-ink-deep"
          type="button"
        >
          다음 단계
        </button>
      </div>
    </div>
  );
}

function AdminMockup() {
  return (
    <div className="rounded-xl border border-line bg-paper p-6 shadow-2">
      <div className="mb-3.5 grid grid-cols-4 gap-2">
        {ADMIN_STATS.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-md px-3.5 py-3 ${
              stat.highlight
                ? 'bg-ink text-white'
                : 'border border-line bg-cream text-charcoal'
            }`}
          >
            <div
              className={`text-[10px] font-semibold ${
                stat.highlight ? 'text-sage' : 'text-charcoal-3'
              }`}
            >
              {stat.label}
            </div>
            <div className="font-display text-[22px] font-bold">{stat.value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border border-line bg-cream">
        <div className="grid grid-cols-[1fr_1fr_80px] gap-2.5 bg-graysoft px-3 py-2 text-[10px] font-bold tracking-wide04 text-charcoal-3">
          <span>지원자</span>
          <span>학과</span>
          <span>상태</span>
        </div>
        {promoApplicants.map((applicant, idx) => (
          <div
            key={applicant.id}
            className={`grid grid-cols-[1fr_1fr_80px] items-center gap-2.5 px-3 py-2.5 text-[11.5px] ${
              idx > 0 ? 'border-t border-line' : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <div className="grid h-[22px] w-[22px] place-items-center rounded-full bg-sage-mist text-[9px] font-bold text-ink-deep">
                {applicant.name.slice(-2)}
              </div>
              <span className="font-semibold text-ink-deep">{applicant.name}</span>
            </div>
            <span className="text-[11px] text-charcoal-2">
              {applicant.dept.replace('학과', '')}
            </span>
            <span
              className="w-fit rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={statusStyle(applicant.status)}
            >
              {applicant.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function statusStyle(status: '검토중' | '면접확정' | '합격') {
  if (status === '합격') return { background: '#E0EAD8', color: '#2A4A1F' };
  if (status === '면접확정') return { background: '#E8EEE8', color: '#143025' };
  return { background: '#F0EDE5', color: '#143025' };
}

export function Features() {
  return (
    <section id="section-3" className="px-10 pb-20 pt-[120px]">
      <div className="max-w-layout mx-auto">
        <div className="mb-16 text-center">
          <div className="mb-3.5 text-[13px] font-bold tracking-wide16 text-ink">
            FEATURES · 주요 기능
          </div>
          <h2 className="text-[56px] leading-[1.1]">
            동아리 생활의 모든 순간
            <SparkleFull
              size={28}
              color="#9DB6A0"
              className="ml-2.5 inline-block align-middle"
            />
          </h2>
        </div>

        <div className="mb-[120px] grid items-center gap-16 md:grid-cols-[1fr_1.1fr]">
          <div>
            <FeatureBadge>FEATURE 01</FeatureBadge>
            <h3 className="mb-5 text-[44px] leading-[1.1]">
              여러곳의 동아리를 한눈에
              <br />
              <span className="text-ink">관심사로 골라봐요</span>
            </h3>
            <p className="mb-6 text-base leading-[1.7] text-charcoal-2">
              학술, 운동, 음악, 봉사… 9개 카테고리로 정리된 대구대 모든 동아리. 요일·인원·단과대학으로 필터링해서 나에게 맞는 곳을 빠르게 찾을 수 있어요.
            </p>
            <CheckList
              items={[
                '카테고리 필터 + 키워드 검색',
                '활동 사진과 후기로 분위기 파악',
                '찜한 동아리는 마이페이지에 자동 저장',
              ]}
            />
          </div>
          <ExploreMockup />
        </div>

        <div className="mb-[120px] grid items-center gap-16 md:grid-cols-[1.1fr_1fr]">
          <ApplyMockup />
          <div>
            <FeatureBadge>FEATURE 02</FeatureBadge>
            <h3 className="mb-5 text-[44px] leading-[1.1]">
              지원서, <span className="text-ink">한 번에</span>
              <br />
              제출하고 끝
            </h3>
            <p className="mb-6 text-base leading-[1.7] text-charcoal-2">
              구글폼, 카톡, 인스타 DM 돌아다닐 필요 없어요. 두잉 안에서 동아리별 양식대로 작성하고, 면접 일정까지 받아볼 수 있어요.
            </p>
            <CheckList
              items={[
                '자동 임시 저장 — 잃어버릴 일 없어요',
                '면접 일정·결과 알림으로 받기',
                '지원 현황을 마이페이지에서 한눈에',
              ]}
            />
          </div>
        </div>

        <div className="grid items-center gap-16 md:grid-cols-[1fr_1.1fr]">
          <div>
            <FeatureBadge>FEATURE 03 · 운영자</FeatureBadge>
            <h3 className="mb-5 text-[44px] leading-[1.1]">
              우리 동아리 운영은
              <br />
              <span className="text-ink">두잉에서 통째로</span>
            </h3>
            <p className="mb-6 text-base leading-[1.7] text-charcoal-2">
              지원자 관리부터 공지, 일정, 회비 정산까지. 회장단이 노션·구글폼·엑셀로 나눠 쓰던 일을 한 곳에 모았어요.
            </p>
            <CheckList
              items={[
                '지원자 테이블 — 검토, 면접 일정, 합격 알림 발송',
                '공지·일정 — 부원 전체에 카톡·이메일 동시 전송',
                '통계 — 지원율, 참여율, 매학기 회원 추이',
              ]}
            />
          </div>
          <AdminMockup />
        </div>
      </div>
    </section>
  );
}
