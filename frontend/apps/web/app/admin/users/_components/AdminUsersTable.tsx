'use client';

import type { AdminUserSearchResult, UserRole } from '@duing/types';

import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
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
    // 카드로 감싸는 것이 장식이 아니다 — 콘솔 배경이 크림이라 맨몸으로 두면 안내 문구가
    // 4.24:1 로 AA 에 미달한다(같은 이유로 상세 패널의 placeholder 도 charcoal-2 를 쓴다).
    // 흰 배경 위에서는 4.70:1 로 통과한다. 오류 상태도 같은 이유로 카드 안에 있다.
    return (
      <ConsoleCard>
        <EmptyState
          icon="🔎"
          title="조회 결과가 없습니다"
          body={
            '검색어를 줄이거나 상태 필터를 바꿔보세요.\n학번은 앞자리부터, 이름은 일부만 입력해도 찾을 수 있어요.'
          }
        />
      </ConsoleCard>
    );
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
              // 정지 행은 hover 도 같은 계열로 받는다 — 공통 hover:bg-graysoft/50 을 그대로 두면
              // 특이성이 높은 hover 규칙이 이겨 마우스를 올린 동안 구분 강조가 사라진다.
              // 틴트도 danger 토큰을 쓴다 — 정지 뱃지·버튼과 같은 계열이어야 한 화면으로 읽힌다.
              className={`border-t border-line ${
                user.status === 'SUSPENDED'
                  ? 'bg-danger/[0.04] hover:bg-danger/[0.08]'
                  : 'hover:bg-graysoft/50'
              }`}
            >
              <Td>
                <div className="flex items-center gap-2.5">
                  {/* 이니셜 원형 — aria-hidden 이다. 이름 바로 옆이라 읽어주면 "김 김두잉"이 된다. */}
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sage/15 text-[13px] font-bold text-ink"
                  >
                    {user.name.slice(0, 1)}
                  </span>
                  <MemberIdentity user={user} />
                </div>
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
                    // 행의 주된 행동이라 솔리드로 둔다 — 옆의 강제 로그아웃(약한 파괴적)과 위계를 나눈다.
                    className="rounded-md bg-ink-deep px-3 py-1.5 text-[12px] font-semibold text-paper transition-colors hover:bg-ink"
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
