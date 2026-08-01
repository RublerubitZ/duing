import type { Metadata } from 'next';

import { InfoTabs } from '@/app/_components/InfoTabs';
import { HomeFooter } from '@/app/_components/HomeFooter';

export const metadata: Metadata = {
  title: '이용약관 · 개인정보 처리방침 | 두잉',
  description: '두잉(Duing) 서비스 이용약관 및 개인정보 처리방침.',
};

const EFFECTIVE_DATE = '2026-06-19';
const OPERATOR = '두잉(Duing) 운영팀';
const CONTACT_EMAIL = 'duing.official@gmail.com';
const PRIVACY_OFFICER = '구승율';
const PRIVACY_OFFICER_TITLE = '팀장';
// 회원 탈퇴 시 개인정보 파기 잡(PII Retention)의 실제 보관기간과 일치시킨다.
const RETENTION_PERIOD = '탈퇴 후 45일';

export default function TermsPage() {
  return (
    // 크림 캔버스(duing min-h-lvh bg-cream)와 ExploreNav 는 terms/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
    // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky(InfoTabs)면 라우터 자동 스크롤 기준에서 제외된다.
    <div>
      <InfoTabs />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-2xl font-bold text-ink-deep sm:text-3xl">이용약관 · 개인정보 처리방침</h1>
        <p className="mt-2 text-[13px] text-charcoal-3">시행일 · 최종 개정일: {EFFECTIVE_DATE}</p>

        <div className="mt-5 rounded-lg border border-warm/40 bg-warm/10 px-4 py-3 text-[13px] leading-relaxed text-charcoal-2">
          두잉은 <strong className="font-semibold text-ink">대구대학교 학생들이 운영하는 서비스</strong>입니다.
        </div>

        <nav className="mt-6 flex flex-wrap gap-2 text-[13px]">
          <a
            href="#terms"
            className="rounded-full border border-line bg-paper px-3.5 py-1.5 font-medium text-charcoal-2 hover:border-ink hover:text-ink"
          >
            제1부 · 이용약관
          </a>
          <a
            href="#privacy"
            className="rounded-full border border-line bg-paper px-3.5 py-1.5 font-medium text-charcoal-2 hover:border-ink hover:text-ink"
          >
            제2부 · 개인정보 처리방침
          </a>
        </nav>

        {/* ───────────────── 제1부 이용약관 ───────────────── */}
        <section id="terms" className="mt-12 scroll-mt-20">
          <h2 className="pb-3 text-xl font-bold text-ink-deep">제1부 · 이용약관</h2>

          <Article title="제1조 (목적)">
            본 약관은 {OPERATOR}(이하 “운영팀”)이 제공하는 두잉(Duing) 서비스(이하 “서비스”)의 이용과 관련하여 운영팀과
            이용자(이하 “회원”) 간의 권리·의무 및 책임사항, 서비스 이용조건과 절차 등 기본적인 사항을 규정함을 목적으로
            합니다. 두잉은 대구대학교 학생들이 자율적으로 운영하는 서비스입니다.
          </Article>

          <Article title="제2조 (정의)">
            <List
              items={[
                '“서비스”란 대구대학교 동아리 정보 탐색, 동아리 가입·지원, 동아리 운영(공지·일정·회비 관리 등)을 지원하기 위해 운영팀이 제공하는 일체의 온라인 서비스를 말합니다.',
                '“회원”이란 본 약관에 동의하고 회원가입을 완료하여 서비스를 이용하는 대구대학교 재학생·휴학생 등을 말합니다.',
                '“운영진”이란 동아리의 회장·임원 등 동아리 운영 권한을 부여받은 회원을 말합니다.',
                '“회비”란 각 동아리가 자체적으로 정하여 회원에게 청구하는 금액을 말합니다.',
              ]}
            />
          </Article>

          <Article title="제3조 (약관의 게시와 개정)">
            <List
              items={[
                '운영팀은 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 화면에 게시합니다.',
                '운영팀은 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자와 개정사유를 명시하여 시행일 전에 공지합니다. 회원에게 불리한 개정의 경우 시행일로부터 상당한 기간 전에 공지합니다.',
                '회원이 개정 약관의 적용에 동의하지 않는 경우 이용계약을 해지(탈퇴)할 수 있습니다.',
              ]}
            />
          </Article>

          <Article title="제4조 (서비스의 제공 및 변경)">
            <List
              items={[
                '운영팀은 동아리 탐색·지원, 동아리 운영 지원, 공지·일정·회비 관리 보조 등의 기능을 제공합니다.',
                '서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 하나, 시스템 점검·장애·천재지변 등 부득이한 경우 일시 중단될 수 있습니다.',
                '운영팀은 서비스의 내용을 변경할 수 있으며, 중요한 변경은 사전에 공지합니다.',
              ]}
            />
          </Article>

          <Article title="제5조 (이용계약의 체결)">
            <List
              items={[
                '이용계약은 회원이 되고자 하는 자가 본 약관에 동의하고 운영팀이 정한 절차에 따라 회원가입을 신청한 후, 운영팀이 이를 승낙함으로써 체결됩니다.',
                '운영팀은 회원 식별 및 부정가입 방지를 위해 학번 입력과 본인 명의 휴대전화 문자(MO) 인증을 요구할 수 있습니다.',
                '운영팀은 타인의 정보를 도용하거나 허위 정보를 기재한 경우 등 신청 내용에 허위·누락이 있는 경우 승낙을 거부하거나 사후에 이용계약을 해지할 수 있습니다.',
              ]}
            />
          </Article>

          <Article title="제6조 (회원의 의무)">
            <List
              items={[
                '회원은 본 약관 및 관련 법령, 운영팀이 공지하는 사항을 준수하여야 합니다.',
                '회원은 자신의 계정 정보를 안전하게 관리할 책임이 있으며, 이를 제3자에게 양도·대여할 수 없습니다.',
                '회원은 타인의 권리를 침해하거나 서비스의 정상적인 운영을 방해하는 행위를 하여서는 안 됩니다.',
              ]}
            />
          </Article>

          <Article title="제7조 (게시물·콘텐츠)">
            회원이 서비스 내에 게시한 게시물에 대한 책임은 게시한 회원에게 있습니다. 운영팀은 관련 법령을 위반하거나
            타인의 권리를 침해하는 게시물에 대해 사전 통지 없이 삭제·이동하거나 게시를 거부할 수 있습니다.
          </Article>

          <Article title="제8조 (서비스 이용 제한)">
            운영팀은 회원이 본 약관 또는 관련 법령을 위반하는 경우 경고, 일시정지, 이용계약 해지 등 단계적으로 서비스
            이용을 제한할 수 있습니다.
          </Article>

          <Article title="제9조 (회비 등)">
            <List
              items={[
                '회비는 각 동아리가 자체적으로 책정·청구하며, 운영팀은 회비의 청구·납부 현황 확인 등 운영 보조 기능만을 제공합니다.',
                '회비의 납부는 원칙적으로 회원과 동아리 간 계좌이체 등으로 이루어지며, 운영팀은 결제를 대행하거나 회비를 직접 수취하지 않습니다.',
                '회비의 부과·환불 등에 관한 사항은 해당 동아리의 정책에 따르며, 이로 인한 분쟁은 회원과 동아리 간에 해결함을 원칙으로 합니다.',
              ]}
            />
          </Article>

          <Article title="제10조 (책임의 제한)">
            <List
              items={[
                '운영팀은 천재지변, 회원의 귀책사유, 제3자의 행위 등 운영팀의 합리적 통제를 벗어난 사유로 발생한 손해에 대해 책임을 지지 않습니다.',
                '서비스는 동아리 정보 제공·운영 보조를 목적으로 하며, 동아리 활동 자체의 내용·품질 및 회원과 동아리 간 거래에 대해 운영팀은 보증하지 않습니다.',
              ]}
            />
          </Article>

          <Article title="제11조 (분쟁 해결 및 준거법)">
            본 약관은 대한민국 법령에 따라 해석되며, 서비스 이용과 관련한 분쟁에 대해서는 관련 법령이 정한 절차에 따른
            관할 법원을 따릅니다.
          </Article>

          <Article title="부칙">본 약관은 {EFFECTIVE_DATE}부터 시행합니다.</Article>
        </section>

        {/* ───────────────── 제2부 개인정보 처리방침 ───────────────── */}
        <section id="privacy" className="mt-14 scroll-mt-20">
          <h2 className="pb-3 text-xl font-bold text-ink-deep">제2부 · 개인정보 처리방침</h2>
          <p className="mt-4 text-[13.5px] leading-relaxed text-charcoal-2">
            {OPERATOR}(이하 “운영팀”)은 「개인정보 보호법」 등 관련 법령을 준수하며, 정보주체의 개인정보를 보호하기 위해
            다음과 같이 개인정보 처리방침을 수립·공개합니다. 두잉은 대구대학교 학생들이 운영하는 서비스입니다.
          </p>

          <Article title="1. 수집하는 개인정보 항목">
            <List
              items={[
                '회원가입·인증(모두 필수): 학번, 이름, 비밀번호(암호화 저장), 학년, 단과대학·학과, 휴대전화번호',
                '동아리·회비 이용 과정에서 생성: 가입 동아리, 지원 내역, 회비 청구·납부 내역, 입금자명 등 입금 확인에 필요한 정보',
                '서비스 이용 과정에서 자동 생성: 접속 일시, 기기·브라우저 정보, 서비스 이용 기록 등',
              ]}
            />
          </Article>

          <Article title="2. 개인정보의 수집·이용 목적">
            <List
              items={[
                '회원 식별·관리 및 휴대전화 본인 인증을 통한 부정가입 방지',
                '동아리 탐색·가입·지원 및 동아리 운영(공지·일정·회비 관리) 지원',
                '회비 청구·납부 현황 확인 및 입금 매칭 보조',
                '공지·알림 등 서비스 운영에 필요한 안내',
                '서비스 개선, 부정이용 방지 및 문의 응대',
              ]}
            />
          </Article>

          <Article title="3. 개인정보의 보유 및 이용 기간">
            <List
              items={[
                `운영팀은 원칙적으로 회원 탈퇴 시 개인정보를 파기하되, 운영·분쟁 대응을 위해 ${RETENTION_PERIOD} 이내 보관한 뒤 파기합니다.`,
                '관련 법령에서 일정 기간 보관을 요구하는 경우(예: 통신비밀보호법에 따른 접속기록 등) 해당 기간 동안 보관 후 파기합니다.',
              ]}
            />
          </Article>

          <Article title="4. 개인정보의 제3자 제공">
            운영팀은 정보주체의 동의가 있거나 법령에 근거가 있는 경우를 제외하고 개인정보를 외부에 제공하지 않습니다. 다만
            가입한 동아리의 운영진에게는 동아리 운영(회원 관리·회비 등) 목적 범위 내에서 필요한 정보가 제공·열람될 수
            있습니다.
          </Article>

          <Article title="5. 개인정보 처리의 위탁">
            운영팀은 안정적인 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 위탁업무 내용이나
            수탁자가 변경될 경우 본 방침을 통해 공개합니다.
            <List
              items={[
                'Amazon Web Services(AWS) — 서버 인프라(Lightsail, 서울 리전) 운영·호스팅',
                'Supabase — 데이터베이스 호스팅 및 관리(한국 리전)',
                'Cloudflare — 업로드 파일 저장(R2) 및 콘텐츠 전송(CDN)·보안',
                'Vercel — 웹 프런트엔드 호스팅·렌더링',
                'Resend — 인증·알림 이메일 발송',
                // ⚠️ 배포 전 계약서로 확인 필요(2건): (1) 정식 법인명 — 현재 참고자료(옥토모 공식 org) 기준 가정,
                //   (2) 옥토버스 서버 소재지 — 국내로 가정하여 아래 6조(국외 이전)에는 넣지 않음. 국외라면 6조에도 추가할 것.
                '옥토버스(Octoverse Corp., 서비스명 Octomo) — 휴대전화 문자(MO) 본인 인증 확인(수신 문자 대조를 위해 휴대전화번호·인증코드 전달)',
              ]}
            />
          </Article>

          <Article title="6. 개인정보의 국외 이전">
            AWS 및 Supabase는 운영자가 선택한 한국 리전에서 처리됩니다. 다만 Cloudflare R2는 글로벌 인프라를 기반으로
            운영될 수 있으며, 기술적 처리 과정에서 국외 서버를 경유할 수 있습니다. 아래 사업자는 국외에 서버를 두고 있어
            일부 개인정보가 국외로 이전되며, 이전 일시 및 방법은 서비스 이용 시점에 정보통신망을 통한 전송입니다.
            <List
              items={[
                'Vercel Inc. / 이전 항목: IP 주소, 브라우저 정보, 접속 로그, 서비스 이용 기록 등 서비스 제공 과정에서 생성되는 정보 / 이전 목적: 웹 호스팅·렌더링 / 보유·이용기간: 위탁계약 종료 시까지',
                'Resend / 이전 항목: 이메일 주소, 이메일 발송에 필요한 메시지 정보 / 이전 목적: 인증·알림 이메일 발송 / 보유·이용기간: 발송 및 장애 대응을 위한 기간 동안 보관 후 삭제되며, 구체적인 기간은 Resend의 정책에 따릅니다',
              ]}
            />
          </Article>

          <Article title="7. 정보주체의 권리·의무 및 행사방법">
            정보주체는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 서비스 내 설정 또는
            아래 연락처를 통해 행사할 수 있습니다. 운영팀은 관련 법령에 따라 지체 없이 조치합니다.
          </Article>

          <Article title="8. 개인정보의 파기 절차 및 방법">
            보유기간이 경과하거나 처리목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구·재생되지 않도록
            안전하게 삭제하고, 출력물이 있는 경우 분쇄 또는 소각합니다.
          </Article>

          <Article title="9. 개인정보의 안전성 확보조치">
            <List
              items={[
                '비밀번호는 복호화되지 않도록 일방향 암호화하여 저장합니다.',
                '회비 계좌번호 등 민감 정보는 암호화하여 저장합니다.',
                '로그인 토큰은 비밀번호 변경·로그아웃 시 즉시 무효화될 수 있도록 관리합니다.',
                '개인정보에 접근할 수 있는 권한을 최소한으로 제한합니다.',
              ]}
            />
          </Article>

          <Article title="10. 쿠키 등 자동 수집 장치">
            운영팀은 서비스 제공을 위해 인증 토큰 등 필요한 정보를 이용자 기기에 저장할 수 있습니다. 이용자는 브라우저
            설정을 통해 저장을 거부할 수 있으나, 이 경우 로그인 등 일부 기능 이용이 제한될 수 있습니다.
          </Article>

          <Article title="11. 개인정보 보호책임자 및 문의">
            개인정보 처리에 관한 문의·불만·피해구제는 아래로 접수할 수 있으며, 운영팀은 신속하게 답변·처리합니다.
            <List
              items={[
                `개인정보 보호책임자: ${PRIVACY_OFFICER} (${PRIVACY_OFFICER_TITLE})`,
                `문의: ${CONTACT_EMAIL}`,
              ]}
            />
          </Article>

          <Article title="12. 권익침해 구제방법">
            정보주체는 개인정보 침해로 인한 구제를 받기 위해 아래 기관에 분쟁해결·상담 등을 신청할 수 있습니다.
            <List
              items={[
                '개인정보분쟁조정위원회: (국번없이) 1833-6972 / www.kopico.go.kr',
                '개인정보침해신고센터: (국번없이) 118 / privacy.kisa.or.kr',
                '대검찰청 사이버수사과: (국번없이) 1301 / www.spo.go.kr',
                '경찰청 사이버수사국: (국번없이) 182 / ecrm.police.go.kr',
              ]}
            />
          </Article>

          <Article title="13. 개인정보 처리방침의 변경">
            본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 변경 시 시행일과 변경 내용을 서비스 화면에 공지합니다.
            본 방침은 {EFFECTIVE_DATE}부터 시행합니다.
          </Article>
        </section>
      </main>

      <HomeFooter />
    </div>
  );
}

function Article({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mt-7">
      <h3 className="text-[15px] font-semibold text-ink-deep">{title}</h3>
      <div className="mt-2 text-[13.5px] leading-relaxed text-charcoal-2">{children}</div>
    </article>
  );
}

function List({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ol className="ml-4 list-decimal space-y-1.5 marker:text-charcoal-3">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}
