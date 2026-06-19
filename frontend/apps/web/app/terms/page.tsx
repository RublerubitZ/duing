import type { Metadata } from 'next';
import Link from 'next/link';

import { BrandMark } from '@/components/duing/BrandMark';
import { HomeFooter } from '@/app/_components/HomeFooter';

export const metadata: Metadata = {
  title: '이용약관 · 개인정보 처리방침 | 두잉',
  description: '두잉(Duing) 서비스 이용약관 및 개인정보 처리방침.',
};

// 검토용 초안. 정식 게시 전 법무 검토와 [대괄호] 항목(운영 주체·책임자·시행일 등) 확정이 필요하다.
const EFFECTIVE_DATE = '[YYYY-MM-DD]';
const OPERATOR = '두잉(Duing) 운영팀'; // [정식 운영 주체/상호 확정 필요]
const CONTACT_EMAIL = 'duing.official@gmail.com';

export default function TermsPage() {
  return (
    <div className="duing min-h-dvh bg-cream">
      <header className="border-b border-line bg-cream-2">
        <div className="max-w-layout mx-auto flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="두잉 홈으로">
            <BrandMark size={24} />
          </Link>
          <Link href="/" className="text-[13px] text-charcoal-2 hover:text-ink">
            ← 홈으로
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-2xl font-bold text-ink-deep sm:text-3xl">이용약관 · 개인정보 처리방침</h1>
        <p className="mt-2 text-[13px] text-charcoal-3">최종 개정일 · 시행일: {EFFECTIVE_DATE}</p>

        <div className="mt-5 rounded-lg border border-warm/40 bg-warm/10 px-4 py-3 text-[13px] leading-relaxed text-charcoal-2">
          본 문서는 <strong className="font-semibold text-ink">검토용 초안</strong>입니다. 정식 게시 전 법무 검토와
          대괄호([ ]) 항목(운영 주체·개인정보 보호책임자·시행일 등) 확정이 필요합니다.
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
          <h2 className="border-b border-line pb-3 text-xl font-bold text-ink-deep">제1부 · 이용약관</h2>

          <Article title="제1조 (목적)">
            본 약관은 {OPERATOR}(이하 “회사”)이 제공하는 두잉(Duing) 서비스(이하 “서비스”)의 이용과 관련하여 회사와
            이용자(이하 “회원”) 간의 권리·의무 및 책임사항, 서비스 이용조건과 절차 등 기본적인 사항을 규정함을 목적으로
            합니다.
          </Article>

          <Article title="제2조 (정의)">
            <List
              items={[
                '“서비스”란 대구대학교 동아리 정보 탐색, 동아리 가입·지원, 동아리 운영(공지·일정·회비 관리 등)을 지원하기 위해 회사가 제공하는 일체의 온라인 서비스를 말합니다.',
                '“회원”이란 본 약관에 동의하고 회원가입을 완료하여 서비스를 이용하는 대구대학교 재학생·휴학생 등을 말합니다.',
                '“운영진”이란 동아리의 회장·임원 등 동아리 운영 권한을 부여받은 회원을 말합니다.',
                '“회비”란 각 동아리가 자체적으로 정하여 회원에게 청구하는 금액을 말합니다.',
              ]}
            />
          </Article>

          <Article title="제3조 (약관의 게시와 개정)">
            <List
              items={[
                '회사는 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 화면에 게시합니다.',
                '회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자와 개정사유를 명시하여 시행일 전에 공지합니다. 회원에게 불리한 개정의 경우 시행일로부터 상당한 기간 전에 공지합니다.',
                '회원이 개정 약관의 적용에 동의하지 않는 경우 이용계약을 해지(탈퇴)할 수 있습니다.',
              ]}
            />
          </Article>

          <Article title="제4조 (서비스의 제공 및 변경)">
            <List
              items={[
                '회사는 동아리 탐색·지원, 동아리 운영 지원, 공지·일정·회비 관리 보조 등의 기능을 제공합니다.',
                '서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 하나, 시스템 점검·장애·천재지변 등 부득이한 경우 일시 중단될 수 있습니다.',
                '회사는 서비스의 내용을 변경할 수 있으며, 중요한 변경은 사전에 공지합니다.',
              ]}
            />
          </Article>

          <Article title="제5조 (이용계약의 체결)">
            <List
              items={[
                '이용계약은 회원이 되고자 하는 자가 본 약관에 동의하고 회사가 정한 절차에 따라 회원가입을 신청한 후, 회사가 이를 승낙함으로써 체결됩니다.',
                '회사는 대구대학교 구성원 확인을 위해 학교 이메일(@daegu.ac.kr) 인증을 요구할 수 있습니다.',
                '회사는 타인의 정보를 도용하거나 허위 정보를 기재한 경우 등 신청 내용에 허위·누락이 있는 경우 승낙을 거부하거나 사후에 이용계약을 해지할 수 있습니다.',
              ]}
            />
          </Article>

          <Article title="제6조 (회원의 의무)">
            <List
              items={[
                '회원은 본 약관 및 관련 법령, 회사가 공지하는 사항을 준수하여야 합니다.',
                '회원은 자신의 계정 정보를 안전하게 관리할 책임이 있으며, 이를 제3자에게 양도·대여할 수 없습니다.',
                '회원은 타인의 권리를 침해하거나 서비스의 정상적인 운영을 방해하는 행위를 하여서는 안 됩니다.',
              ]}
            />
          </Article>

          <Article title="제7조 (게시물·콘텐츠)">
            회원이 서비스 내에 게시한 게시물에 대한 책임은 게시한 회원에게 있습니다. 회사는 관련 법령을 위반하거나
            타인의 권리를 침해하는 게시물에 대해 사전 통지 없이 삭제·이동하거나 게시를 거부할 수 있습니다.
          </Article>

          <Article title="제8조 (서비스 이용 제한)">
            회사는 회원이 본 약관 또는 관련 법령을 위반하는 경우 경고, 일시정지, 이용계약 해지 등 단계적으로 서비스
            이용을 제한할 수 있습니다.
          </Article>

          <Article title="제9조 (회비 등)">
            <List
              items={[
                '회비는 각 동아리가 자체적으로 책정·청구하며, 회사는 회비의 청구·납부 현황 확인 등 운영 보조 기능만을 제공합니다.',
                '회비의 납부는 원칙적으로 회원과 동아리 간 계좌이체 등으로 이루어지며, 회사는 결제를 대행하거나 회비를 직접 수취하지 않습니다.',
                '회비의 부과·환불 등에 관한 사항은 해당 동아리의 정책에 따르며, 이로 인한 분쟁은 회원과 동아리 간에 해결함을 원칙으로 합니다.',
              ]}
            />
          </Article>

          <Article title="제10조 (책임의 제한)">
            <List
              items={[
                '회사는 천재지변, 회원의 귀책사유, 제3자의 행위 등 회사의 합리적 통제를 벗어난 사유로 발생한 손해에 대해 책임을 지지 않습니다.',
                '서비스는 동아리 정보 제공·운영 보조를 목적으로 하며, 동아리 활동 자체의 내용·품질 및 회원과 동아리 간 거래에 대해 회사는 보증하지 않습니다.',
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
          <h2 className="border-b border-line pb-3 text-xl font-bold text-ink-deep">제2부 · 개인정보 처리방침</h2>
          <p className="mt-4 text-[13.5px] leading-relaxed text-charcoal-2">
            {OPERATOR}(이하 “회사”)은 「개인정보 보호법」 등 관련 법령을 준수하며, 정보주체의 개인정보를 보호하기 위해
            다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </p>

          <Article title="1. 수집하는 개인정보 항목">
            <List
              items={[
                '회원가입·인증: 학번, 이름, 학교 이메일(@daegu.ac.kr), 비밀번호(암호화 저장), 학년, 단과대학·학과, 휴대전화번호',
                '동아리·회비 이용 과정에서 생성: 가입 동아리, 지원 내역, 회비 청구·납부 내역, 입금자명 등 입금 확인에 필요한 정보',
                '서비스 이용 과정에서 자동 생성: 접속 일시, 기기·브라우저 정보, 서비스 이용 기록 등',
              ]}
            />
          </Article>

          <Article title="2. 개인정보의 수집·이용 목적">
            <List
              items={[
                '대구대학교 구성원 확인 및 회원 식별·관리',
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
                '회사는 원칙적으로 회원 탈퇴 시 개인정보를 지체 없이 파기합니다. 다만 운영·분쟁 대응을 위해 탈퇴 후 일정 기간([보관기간] 이내) 보관한 뒤 파기할 수 있습니다.',
                '관련 법령에서 일정 기간 보관을 요구하는 경우 해당 기간 동안 보관 후 파기합니다.',
              ]}
            />
          </Article>

          <Article title="4. 개인정보의 제3자 제공">
            회사는 정보주체의 동의가 있거나 법령에 근거가 있는 경우를 제외하고 개인정보를 외부에 제공하지 않습니다. 다만
            가입한 동아리의 운영진에게는 동아리 운영(회원 관리·회비 등) 목적 범위 내에서 필요한 정보가 제공·열람될 수
            있습니다.
          </Article>

          <Article title="5. 개인정보 처리의 위탁">
            회사는 서비스 운영에 필요한 범위에서 개인정보 처리 업무를 외부에 위탁할 수 있으며(예: 클라우드 인프라, 이메일
            발송 등), 위탁 시 수탁자와 위탁업무 내용을 본 방침을 통해 공개합니다. [현재 위탁 현황 확정 필요]
          </Article>

          <Article title="6. 정보주체의 권리·의무 및 행사방법">
            정보주체는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 서비스 내 설정 또는
            아래 연락처를 통해 행사할 수 있습니다. 회사는 관련 법령에 따라 지체 없이 조치합니다.
          </Article>

          <Article title="7. 개인정보의 파기 절차 및 방법">
            보유기간이 경과하거나 처리목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구·재생되지 않도록
            안전하게 삭제하고, 출력물은 분쇄 또는 소각합니다.
          </Article>

          <Article title="8. 개인정보의 안전성 확보조치">
            <List
              items={[
                '비밀번호는 복호화되지 않도록 일방향 암호화하여 저장하며, 회비 계좌번호 등 민감 정보는 암호화하여 보관합니다.',
                '개인정보 접근 권한을 최소한으로 제한하고 접근을 통제합니다.',
                '관련 법령에 따른 기술적·관리적 보호조치를 시행합니다.',
              ]}
            />
          </Article>

          <Article title="9. 쿠키 등 자동 수집 장치">
            회사는 서비스 제공을 위해 인증 토큰 등 필요한 정보를 이용자 기기에 저장할 수 있습니다. 이용자는 브라우저
            설정을 통해 저장을 거부할 수 있으나, 이 경우 로그인 등 일부 기능 이용이 제한될 수 있습니다.
          </Article>

          <Article title="10. 개인정보 보호책임자 및 문의">
            개인정보 처리에 관한 문의·불만·피해구제는 아래로 접수할 수 있습니다.
            <List
              items={[
                '개인정보 보호책임자: [성명/직책 확정 필요]',
                `문의: ${CONTACT_EMAIL}`,
              ]}
            />
          </Article>

          <Article title="11. 개인정보 처리방침의 변경">
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
