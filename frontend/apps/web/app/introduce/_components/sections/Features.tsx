import { FeatureSection } from '../FeatureSection';
import { promoApplicants, promoClubs } from '../../_mocks';

type AdminStatItem = { value: string; label: string; highlight: boolean };

const FEATURE_ADMIN_STATS: ReadonlyArray<AdminStatItem> = [
  { value: '43', label: '총 지원자', highlight: false },
  { value: '12', label: '검토중', highlight: false },
  { value: '8', label: '면접 확정', highlight: true },
];

const FILTER_CHIPS = ['전체', '학술', '음악', '운동', 'IT'] as const;

function CheckList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-[10px] text-[14px]" style={{ color: '#4a5247' }}>
          <span
            className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold"
            style={{ background: '#3e5b34', color: '#ffffff' }}
          >
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function ExploreMockup() {
  const exploreClubs = promoClubs
    .filter((club) => club.cat === 'IT' || club.cat === '학술')
    .slice(0, 4);

  return (
    <div
      className="rounded-[14px] border p-[18px]"
      style={{
        background: '#ffffff',
        borderColor: '#d9d4c3',
        boxShadow: '0 2px 8px rgba(47,58,46,.06), 0 12px 28px rgba(47,58,46,.06)',
      }}
    >
      <div className="mb-[14px] flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip, idx) => (
          <span
            key={chip}
            className="rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
            style={
              idx === 0
                ? { background: '#3e5b34', color: '#fbf6e6', borderColor: '#3e5b34' }
                : { background: '#faf7ee', color: '#4a5247', borderColor: '#d9d4c3' }
            }
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        {exploreClubs.map((club) => (
          <div
            key={club.id}
            className="flex items-center gap-3 rounded-[10px] border p-[14px]"
            style={{ background: '#faf7ee', borderColor: '#e6e1d2' }}
          >
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border bg-white text-base"
              style={{ borderColor: '#d9d4c3' }}
            >
              {club.avatar}
            </div>
            <div>
              <div
                className="mb-1 inline-block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: '#e7ebd9', color: '#3e5b34' }}
              >
                {club.cat}
              </div>
              <div className="text-[13.5px] font-bold leading-tight" style={{ color: '#2a2f27' }}>
                {club.name}
              </div>
              <div className="mt-0.5 font-mono text-[11px]" style={{ color: '#8a8f83' }}>
                {club.members}명
              </div>
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
      className="rounded-[14px] border p-[18px]"
      style={{
        background: '#ffffff',
        borderColor: '#d9d4c3',
        boxShadow: '0 2px 8px rgba(47,58,46,.06), 0 12px 28px rgba(47,58,46,.06)',
      }}
    >
      <h4
        className="mb-1.5 font-mono text-[12px]"
        style={{ color: '#8a8f83', letterSpacing: '.12em' }}
      >
        STEP 2 / 3 · 자기소개
      </h4>
      <p className="mb-[14px] text-[16px] font-bold" style={{ color: '#2c4124' }}>
        지원 동기를 적어주세요
      </p>
      <div
        className="relative min-h-[130px] rounded-[8px] border p-3 text-[13px] leading-[1.6]"
        style={{ background: '#faf7ee', borderColor: '#e6e1d2', color: '#4a5247' }}
      >
        대학 와서 처음으로 개발 공부를 시작했고, 혼자 강의를 들으면서 자그마한 사이드 프로젝트를…
        <span
          className="inline-block w-px h-[14px] align-[-2px] animate-blink-cursor"
          style={{ background: '#3e5b34' }}
        />
      </div>
      <div
        className="mt-[10px] flex items-center gap-1.5 font-mono text-[11px]"
        style={{ color: '#3e5b34' }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#5b7e4d' }} />
        자동 저장됨 · 방금 전
      </div>
      <div className="mt-[14px] flex justify-between">
        <span className="px-3 py-2 text-[12.5px]" style={{ color: '#8a8f83' }}>
          ← 이전
        </span>
        <span
          className="rounded-[8px] px-[14px] py-2 text-[12.5px] font-semibold"
          style={{ background: '#2c4124', color: '#fbf6e6' }}
        >
          다음 단계 →
        </span>
      </div>
    </div>
  );
}

function statusStyle(status: '검토중' | '면접확정' | '합격'): { background: string; color: string } {
  if (status === '합격') return { background: '#e8f1d8', color: '#4a6b3f' };
  if (status === '면접확정') return { background: '#e7ebd9', color: '#3e5b34' };
  return { background: '#fbe9d8', color: '#8c5125' };
}

function AdminMockup() {
  return (
    <div
      className="rounded-[14px] border p-[18px]"
      style={{
        background: '#ffffff',
        borderColor: '#d9d4c3',
        boxShadow: '0 2px 8px rgba(47,58,46,.06), 0 12px 28px rgba(47,58,46,.06)',
      }}
    >
      <div className="mb-[14px] grid grid-cols-3 gap-[10px]">
        {FEATURE_ADMIN_STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[10px] border px-[14px] py-3"
            style={
              stat.highlight
                ? { background: '#e7ebd9', borderColor: '#cfd6b3' }
                : { background: '#faf7ee', borderColor: '#e6e1d2' }
            }
          >
            <div
              className="font-mono text-[22px] font-bold"
              style={{ color: stat.highlight ? '#3e5b34' : '#2c4124' }}
            >
              {stat.value}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: '#8a8f83' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      <div
        className="overflow-hidden rounded-[10px] border"
        style={{ background: '#faf7ee', borderColor: '#e6e1d2' }}
      >
        <div
          className="grid items-center gap-2.5 px-[14px] py-[10px] font-mono text-[11px] uppercase"
          style={{
            gridTemplateColumns: '1fr 1fr auto',
            background: '#ffffff',
            color: '#8a8f83',
            letterSpacing: '.08em',
          }}
        >
          <span>지원자</span>
          <span>학과</span>
          <span>상태</span>
        </div>
        {promoApplicants.map((applicant, idx) => (
          <div
            key={applicant.id}
            className="grid items-center gap-2.5 px-[14px] py-2.5 text-[12.5px]"
            style={{
              gridTemplateColumns: '1fr 1fr auto',
              borderTop: idx > 0 ? '1px solid #e6e1d2' : 'none',
            }}
          >
            <span className="flex items-center gap-2 font-medium" style={{ color: '#2a2f27' }}>
              <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-bold text-[10.5px]"
                style={{ background: '#e7ebd9', color: '#3e5b34' }}
              >
                {applicant.name[0]}
              </span>
              {applicant.name}
            </span>
            <span style={{ color: '#4a5247' }}>{applicant.dept.replace('학과', '')}</span>
            <span
              className="rounded-full px-2 py-[3px] text-[11px] font-semibold"
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

export function Features() {
  return (
    <section
      className="px-8 py-24"
      style={{ borderTop: '1px solid #e6e1d2', background: '#faf7ee' }}
    >
      <div className="mx-auto max-w-[1180px]">
        <p
          className="mb-[18px] font-mono text-[11.5px] font-semibold uppercase"
          style={{ letterSpacing: '.22em', color: '#3e5b34' }}
        >
          FEATURES · 주요 기능
        </p>
        <h2
          className="mb-[18px] max-w-[760px] font-bold leading-[1.12]"
          style={{ fontSize: 'clamp(32px, 4vw, 44px)', letterSpacing: '-0.025em', color: '#2c4124' }}
        >
          동아리 생활의 모든 순간
        </h2>
        <p className="mb-12 max-w-[640px] text-[16.5px]" style={{ color: '#4a5247' }}>
          대구대학교의 모든 동아리를 한 곳에서. 검색하고, 지원하고, 활동까지 두잉으로 관리하세요.
        </p>

        {/* Feature 01 — 텍스트 왼쪽에서, 비주얼 팝인 */}
        <FeatureSection
          className="mb-16 grid items-center gap-16 border-b border-dashed pb-16 md:grid-cols-2"
          style={{ borderColor: '#d9d4c3' }}
        >
          <div className="feature-text-left">
            <p
              className="mb-[14px] font-mono text-[11.5px] font-semibold"
              style={{ letterSpacing: '.2em', color: '#3e5b34' }}
            >
              FEATURE 01
            </p>
            <h3
              className="mb-[18px] font-bold leading-[1.12]"
              style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', letterSpacing: '-0.025em', color: '#2c4124' }}
            >
              여러 곳의 동아리를
              <br />
              한눈에, 관심사로 골라봐요
            </h3>
            <p className="mb-[22px] text-[15.5px]" style={{ color: '#4a5247' }}>
              학술, 운동, 음악, 봉사… 8개 카테고리로 정리된 대구대 모든 동아리. 요일·인원·단과대학으로 필터링해서 나에게 맞는 곳을 빠르게 찾을 수 있어요.
            </p>
            <CheckList
              items={[
                '카테고리 필터 + 키워드 검색',
                '활동 사진과 후기로 분위기 파악',
                '찜한 동아리는 마이페이지에 자동 저장',
              ]}
            />
          </div>
          <div className="feature-visual">
            <ExploreMockup />
          </div>
        </FeatureSection>

        {/* Feature 02 — 비주얼 팝인, 텍스트 오른쪽에서 */}
        <FeatureSection
          className="mb-16 grid items-center gap-16 border-b border-dashed pb-16 md:grid-cols-2"
          style={{ borderColor: '#d9d4c3' }}
        >
          <div className="feature-visual">
            <ApplyMockup />
          </div>
          <div className="feature-text-right">
            <p
              className="mb-[14px] font-mono text-[11.5px] font-semibold"
              style={{ letterSpacing: '.2em', color: '#3e5b34' }}
            >
              FEATURE 02
            </p>
            <h3
              className="mb-[18px] font-bold leading-[1.12]"
              style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', letterSpacing: '-0.025em', color: '#2c4124' }}
            >
              지원서, 한 번에
              <br />
              제출하고 끝
            </h3>
            <p className="mb-[22px] text-[15.5px]" style={{ color: '#4a5247' }}>
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
        </FeatureSection>

        {/* Feature 03 — 텍스트 왼쪽에서, 비주얼 팝인 */}
        <FeatureSection className="grid items-center gap-16 md:grid-cols-2">
          <div className="feature-text-left">
            <p
              className="mb-[14px] font-mono text-[11.5px] font-semibold"
              style={{ letterSpacing: '.2em', color: '#3e5b34' }}
            >
              FEATURE 03 · 운영자
            </p>
            <h3
              className="mb-[18px] font-bold leading-[1.12]"
              style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', letterSpacing: '-0.025em', color: '#2c4124' }}
            >
              우리 동아리 운영은
              <br />
              두잉에서 통째로
            </h3>
            <p className="mb-[22px] text-[15.5px]" style={{ color: '#4a5247' }}>
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
          <div className="feature-visual">
            <AdminMockup />
          </div>
        </FeatureSection>
      </div>
    </section>
  );
}
