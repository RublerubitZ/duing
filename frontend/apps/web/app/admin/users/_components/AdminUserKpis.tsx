'use client';

import { useAdminUserSearchQuery } from '@duing/hooks';

/**
 * 회원 관리 KPI. 현재 검색 API 가 주는 것만 노출한다 — 목록 응답의 전체 건수 하나뿐이라
 * 조건을 달리한 두 번의 조회로 "전체"와 "이용 정지"를 얻는다.
 *
 * <p>"오늘 활성"·"최근 7일 신규"는 마지막 로그인·가입일 집계가 필요한데 그런 API 가 없다.
 * 자리만 만들어 두고 비워 놓으면 데이터가 없는 것인지 0 인 것인지 화면에서 구분되지 않으므로,
 * 집계 API 가 생길 때 카드를 늘린다(칸 수를 미리 잡지 않는 이유).
 */

// 건수만 필요하므로 행은 최소로 받는다 — 목록 조회와 캐시 키가 갈려 서로를 덮지 않는다.
const COUNT_ONLY = { page: 0, size: 1 } as const;

export function AdminUserKpis() {
  const totalQuery = useAdminUserSearchQuery(COUNT_ONLY, { allowEmptyQuery: true });
  const suspendedQuery = useAdminUserSearchQuery(
    { ...COUNT_ONLY, status: 'SUSPENDED' },
    { allowEmptyQuery: true },
  );

  return (
    // 상태 필터 칩과 같은 낱말("이용 정지")을 쓰므로 목록에 이름을 붙여 둘을 구분한다.
    // 넓은 화면에서 4칸 격자를 쓰는 것은 빈 카드를 만들려는 게 아니라 카드 폭을 잡기 위해서다 —
    // 2칸 격자로 두면 카드 하나가 화면 절반을 차지해 숫자 하나에 빈 여백이 붙는다.
    <ul aria-label="회원 현황 요약" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="전체 회원"
        sub="재학생 계정"
        value={totalQuery.data?.totalElements}
        failed={totalQuery.isError}
      />
      <KpiCard
        label="이용 정지"
        sub="제재 상태"
        value={suspendedQuery.data?.totalElements}
        failed={suspendedQuery.isError}
        // 정지 회원이 있을 때만 시선을 끈다 — 0 건에 경고색을 칠하면 경고가 배경이 된다.
        warn={(suspendedQuery.data?.totalElements ?? 0) > 0}
      />
    </ul>
  );
}

function KpiCard({
  label,
  sub,
  value,
  warn = false,
  failed = false,
}: {
  label: string;
  sub: string;
  /** 아직 도착하지 않았으면 undefined — 0 과 구분해서 자리만 지킨다. */
  value: number | undefined;
  warn?: boolean;
  /** 조회가 실패했으면 자리표시자를 계속 돌리지 않는다 — 영원히 로딩 중인 화면이 된다. */
  failed?: boolean;
}) {
  return (
    <li className="rounded-[14px] border border-line bg-paper px-4 py-3.5">
      <p className="text-xs font-semibold text-charcoal-3">{label}</p>
      {failed ? (
        // 못 가져온 것과 0 은 다르다 — 0 으로 적으면 "정지 회원이 없다"는 거짓을 말하게 된다.
        <p className="mt-1 text-[22px] font-bold text-charcoal-3" title="불러오지 못했어요">
          —
        </p>
      ) : value === undefined ? (
        // 숫자가 들어올 자리를 같은 높이로 잡아 둔다 — 도착하는 순간 카드가 튀지 않는다.
        <span
          aria-hidden
          className="mt-1 block h-[26px] w-14 animate-pulse rounded bg-graysoft motion-reduce:animate-none"
        />
      ) : (
        <p className={`mt-1 text-[22px] font-bold ${warn ? 'text-danger' : 'text-ink'}`}>
          {value.toLocaleString('ko-KR')}
        </p>
      )}
      <p className="mt-0.5 text-[11.5px] text-charcoal-2">{sub}</p>
    </li>
  );
}
