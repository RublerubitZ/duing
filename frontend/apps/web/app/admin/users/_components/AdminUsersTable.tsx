'use client';

import type { AdminUserSearchResult, UserRole } from '@duing/types';

import { MemberIdentity } from '../../_components/MemberIdentity';
import { UserStatusBadge } from './UserStatusBadge';

const USER_ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: '학생',
  ADMIN: '관리자',
};

type Props = {
  items: AdminUserSearchResult[];
  onOpenDetail: (user: AdminUserSearchResult) => void;
  onForceLogout: (user: AdminUserSearchResult) => void;
};

export function AdminUsersTable({ items, onOpenDetail, onForceLogout }: Props) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-charcoal-3 text-[13px]">조회 결과가 없습니다</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>회원</Th>
            <Th>역할</Th>
            <Th>상태</Th>
            <Th>조치</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <tr
              key={user.id}
              // 정지 행은 hover 도 코랄로 받는다 — 공통 hover:bg-graysoft/50 을 그대로 두면
              // 특이성이 높은 hover 규칙이 이겨 마우스를 올린 동안 구분 강조가 사라진다.
              className={`border-t border-line ${
                user.status === 'SUSPENDED'
                  ? 'bg-coral/[0.04] hover:bg-coral/[0.08]'
                  : 'hover:bg-graysoft/50'
              }`}
            >
              <Td>
                <MemberIdentity user={user} />
              </Td>
              {/* 배포 전환기의 미지 role 값도 빈 셀 대신 원문으로 노출한다(fail-open) */}
              <Td>{USER_ROLE_LABEL[user.role] ?? user.role}</Td>
              <Td>
                <UserStatusBadge status={user.status} />
              </Td>
              <Td>
                <div className="flex gap-1">
                  {/* 행마다 같은 글자만 읽히면 어느 회원의 버튼인지 알 수 없어 접근명에 이름을 붙인다. */}
                  <button
                    type="button"
                    onClick={() => onOpenDetail(user)}
                    aria-label={`${user.name} 상세`}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:bg-graysoft"
                  >
                    상세
                  </button>
                  <button
                    type="button"
                    onClick={() => onForceLogout(user)}
                    aria-label={`${user.name} 강제 로그아웃`}
                    // 흰 배경 위 text-coral 은 3.02:1 로 AA 미달 — 파괴적 액션 공용 변형(danger 토큰)을 쓴다.
                    className="btn-danger-quiet rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors"
                  >
                    강제 로그아웃
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
