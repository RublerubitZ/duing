/**
 * 어드민 홈 카드와 사이드바가 공유하는 영역 정의.
 * 한 곳에서만 수정하면 두 진입 지점이 동시에 갱신된다.
 */
export type AdminSection = {
  href: `/${string}`;
  title: string;
  description: string;
  group: AdminSectionGroup;
};

export type AdminSectionGroup = '동아리' | '커뮤니티 운영' | '재인증' | '홍보';

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: '/admin/clubs',
    title: '동아리 관리',
    description: '동아리 승인·반려, 중앙동아리 지정, 신규 등록',
    group: '동아리',
  },
  {
    href: '/admin/notices',
    title: '공지 관리',
    description: '학생/동아리 대상 공지 작성·수정·노출 범위 설정',
    group: '커뮤니티 운영',
  },
  {
    href: '/admin/global-events',
    title: '글로벌 이벤트',
    description: '학교 단위 행사 일정 작성·수정·삭제 + 카테고리 분포',
    group: '커뮤니티 운영',
  },
  {
    href: '/admin/reports',
    title: '신고 관리',
    description: '신고 접수 검토 및 해결/기각 처리',
    group: '커뮤니티 운영',
  },
  {
    href: '/admin/leader-succession',
    title: '회장 승계',
    description: 'OFFICER 의 회장 승계 요청 검토 및 처리',
    group: '동아리',
  },
  {
    href: '/admin/bank-matching',
    title: 'BANK 자동매칭',
    description: '은행 입금 자동매칭에 사용할 동아리 등록·해제',
    group: '동아리',
  },
  {
    href: '/admin/recertification/rounds',
    title: '재인증 라운드',
    description: '중앙동아리 연간 재인증 라운드 개설·종료',
    group: '재인증',
  },
  {
    href: '/admin/recertification/requests',
    title: '재인증 요청',
    description: '중앙동아리 재인증 제출 검토 및 처리',
    group: '재인증',
  },
  {
    href: '/admin/recertification/status',
    title: '재인증 현황',
    description: '운영 연도 기준 중앙동아리 재인증 만료 현황',
    group: '재인증',
  },
  {
    href: '/admin/promotion-requests',
    title: '홍보 요청',
    description: '동아리 홍보 배너 요청 검토 및 승인',
    group: '홍보',
  },
  {
    href: '/admin/promotions',
    title: '홍보 배너',
    description: '메인 노출 홍보 배너 등록·수정·활성화 관리',
    group: '홍보',
  },
];

export const ADMIN_SECTION_GROUP_ORDER: AdminSectionGroup[] = [
  '동아리',
  '커뮤니티 운영',
  '재인증',
  '홍보',
];
