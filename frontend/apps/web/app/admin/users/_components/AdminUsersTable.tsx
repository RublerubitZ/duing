'use client';

import {
  COLLEGE_DISPLAY_NAME,
  GRADE_DISPLAY_NAME,
  isCollege,
  type AdminUserSearchResult,
  type UserRole,
} from '@duing/types';

import { EmptyState } from '../../_components/EmptyState';
import { UserStatusBadge } from './UserStatusBadge';

const USER_ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: '학생',
  ADMIN: '관리자',
};

type Props = {
  items: AdminUserSearchResult[];
  onOpenDetail: (user: AdminUserSearchResult) => void;
};

/**
 * 회원 목록 표.
 *
 * <p>목록은 조회와 진입만 맡는다 — 운영 조치(강제 로그아웃·정지)는 전부 상세 패널에서 한다.
 * 행마다 파괴적 버튼을 두면 목록을 훑는 동안 잘못 누르기 쉽고, 대상이 맞는지 확인할 정보가
 * 행에는 없다. 조치 전에 상세를 거치게 하는 것이 그 확인을 강제한다.
 *
 * <p>한 줄에 몰아넣던 식별 정보(학번·학년·단과대·전공)를 열로 나눈다. 운영자는 세로로 훑으며
 * 비교하므로, 같은 종류가 같은 자리에 있어야 눈이 덜 움직인다.
 * 휴대폰·가입 동아리 수·마지막 로그인은 목록 응답에 없어 열로 만들 수 없다(상세에만 있다).
 */
export function AdminUsersTable({ items, onOpenDetail }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔎"
        title="조회 결과가 없습니다"
        body={
          '검색어를 줄이거나 상태 필터를 바꿔보세요.\n학번은 앞자리부터, 이름은 일부만 입력해도 찾을 수 있어요.'
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        {/* 짧은 값이 든 열은 폭을 고정한다 — 자동 배분에 맡기면 마지막 열이 넓어져 버튼이
            상태 값에서 멀리 떨어지고, 시선이 행을 가로질러야 한다. */}
        <colgroup>
          <col />
          <col />
          <col className="w-[84px]" />
          <col className="w-[84px]" />
          <col className="w-[104px]" />
          <col className="w-[92px]" />
        </colgroup>
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>회원</Th>
            <Th>학과</Th>
            <Th>학년</Th>
            <Th>역할</Th>
            <Th>상태</Th>
            <Th align="right">관리</Th>
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
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-[13.5px] font-semibold text-charcoal">
                      {user.name}
                    </div>
                    <div className="mt-0.5 tabular-nums text-[11.5px] text-charcoal-3">
                      {user.studentId}
                    </div>
                  </div>
                </div>
              </Td>
              {/* break-keep — 좁은 폭에서 어절 단위로만 접어 '컴퓨터/공학' 처럼 낱말이 잘리지 않게 한다. */}
              <Td>
                <div className="min-w-0 break-keep leading-tight">
                  <div className="text-[12.5px] text-charcoal-2">{collegeLabel(user)}</div>
                  {user.major?.trim() && (
                    <div className="mt-0.5 text-[11.5px] text-charcoal-3">{user.major.trim()}</div>
                  )}
                </div>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-[12.5px] text-charcoal-2">
                  {gradeLabel(user)}
                </span>
              </Td>
              {/* 배포 전환기의 미지 role 값도 빈 셀 대신 원문으로 노출한다(fail-open) */}
              <Td>{USER_ROLE_LABEL[user.role] ?? user.role}</Td>
              <Td>
                <UserStatusBadge status={user.status} />
              </Td>
              <Td align="right">
                {/* 행마다 같은 글자만 읽히면 어느 회원의 버튼인지 알 수 없어 접근명에 이름을 붙인다. */}
                <button
                  type="button"
                  onClick={() => onOpenDetail(user)}
                  aria-label={`${user.name} 상세`}
                  className="rounded-md bg-ink-deep px-3 py-1.5 text-[12px] font-semibold text-paper transition-colors hover:bg-ink"
                >
                  상세
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 배포 전환기(구 백엔드 응답)에는 값이 없을 수 있어 알려진 코드일 때만 라벨링한다. */
function collegeLabel(user: AdminUserSearchResult): string {
  return isCollege(user.college) ? COLLEGE_DISPLAY_NAME[user.college] : '—';
}

function gradeLabel(user: AdminUserSearchResult): string {
  return user.grade ? GRADE_DISPLAY_NAME[user.grade] : '—';
}

const Th = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <td className={`px-3 py-2 align-middle ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
);
