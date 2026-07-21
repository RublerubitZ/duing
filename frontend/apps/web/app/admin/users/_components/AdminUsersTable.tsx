'use client';

import type { AdminUserSearchResult, UserRole } from '@duing/types';

import { MemberIdentity } from '../../_components/MemberIdentity';

const USER_ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: '학생',
  ADMIN: '관리자',
};

type Props = {
  items: AdminUserSearchResult[];
  onForceLogout: (user: AdminUserSearchResult) => void;
};

export function AdminUsersTable({ items, onForceLogout }: Props) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-charcoal-3 text-[13px]">검색 결과가 없습니다</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>회원</Th>
            <Th>역할</Th>
            <Th>조치</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <tr key={user.id} className="border-t border-line hover:bg-graysoft/50">
              <Td>
                <MemberIdentity user={user} />
              </Td>
              {/* 배포 전환기의 미지 role 값도 빈 셀 대신 원문으로 노출한다(fail-open) */}
              <Td>{USER_ROLE_LABEL[user.role] ?? user.role}</Td>
              <Td>
                <button
                  type="button"
                  onClick={() => onForceLogout(user)}
                  className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-coral transition-colors hover:bg-coral/5"
                >
                  강제 로그아웃
                </button>
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
