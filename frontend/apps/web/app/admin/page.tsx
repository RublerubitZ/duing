import Link from 'next/link';
import { toRoute } from '../_lib/route';

type AdminSection = {
  href: `/${string}`;
  title: string;
  description: string;
};

const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: '/admin/clubs',
    title: '동아리 관리',
    description: '동아리 승인·반려, 중앙동아리 지정, 신규 등록',
  },
  {
    href: '/admin/notices',
    title: '공지 관리',
    description: '학생/동아리 대상 공지 작성·수정·노출 범위 설정',
  },
  {
    href: '/admin/reports',
    title: '신고 관리',
    description: '신고 접수 검토 및 해결/기각 처리',
  },
  {
    href: '/admin/leader-succession',
    title: '회장 승계',
    description: 'OFFICER 의 회장 승계 요청 검토 및 처리',
  },
  {
    href: '/admin/recertification/rounds',
    title: '재인증 라운드',
    description: '중앙동아리 연간 재인증 라운드 개설·종료',
  },
  {
    href: '/admin/recertification/requests',
    title: '재인증 요청',
    description: '중앙동아리 재인증 제출 검토 및 처리',
  },
  {
    href: '/admin/recertification/status',
    title: '재인증 현황',
    description: '운영 연도 기준 중앙동아리 재인증 만료 현황',
  },
  {
    href: '/admin/promotion-requests',
    title: '홍보 요청',
    description: '동아리 홍보 배너 요청 검토 및 승인',
  },
  {
    href: '/admin/promotions',
    title: '홍보 배너',
    description: '메인 노출 홍보 배너 등록·수정·활성화 관리',
  },
];

export default function AdminIndexPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink">총동연 관리자</h1>
        <p className="mt-2 text-sm text-charcoal-3">
          어드민 권한이 부여된 영역을 한눈에 확인하고 진입할 수 있습니다.
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={toRoute(section.href)}
              className="block rounded-2xl border border-charcoal-1 bg-white p-5 transition hover:border-coral hover:shadow-sm"
            >
              <h2 className="text-base font-semibold text-ink">{section.title}</h2>
              <p className="mt-2 text-sm text-charcoal-3">{section.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
