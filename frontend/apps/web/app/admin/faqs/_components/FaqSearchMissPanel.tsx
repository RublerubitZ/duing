'use client';

import { useEffect, useState } from 'react';
import { useAdminFederationFaqSearchMissesQuery } from '@duing/hooks';
import { Pagination } from '@/components/Pagination';

const PANEL_PAGE_SIZE = 10;

// 무결과 검색어 접이식 패널 — 공개 FAQ 검색에서 0건이었던 정규화 키워드의 집계를 보여준다.
// "학생이 찾는데 없는 FAQ" 를 발견하는 admin 갭 신호. 목록 페이지 상단 카테고리 관리 카드와
// 동일하게 기본 접힘 + 접이식 토글이며, enabled=expanded 로 접힌 동안은 fetch 하지 않는다
// (관리자가 굳이 펼치지 않으면 불필요한 요청을 만들지 않기 위한 지연 로딩).
export function FaqSearchMissPanel() {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);

  // 접었다 다시 펼칠 때 staleTime(15s) 내에는 캐시를 그대로 보여주고, 그 이후에는
  // 백그라운드 refetch 로 갱신되는 것이 의도된 동작이다.
  const searchMissesQuery = useAdminFederationFaqSearchMissesQuery(
    { page, size: PANEL_PAGE_SIZE },
    expanded,
  );

  const items = searchMissesQuery.data?.content ?? [];
  const totalPages = searchMissesQuery.data?.totalPages ?? 0;

  // 데이터의 totalPages 가 현재 page 보다 작아지면 마지막 유효 페이지로 보정한다.
  // 현재 백엔드는 행 삭제가 없어 실발생하지 않지만, P3 dismiss(검색어 정리) 도입 시
  // 범위 밖 page 에 갇혀 빈 상태가 오표시되는 것을 방어한다.
  useEffect(() => {
    if (totalPages > 0 && page >= totalPages) {
      setPage(totalPages - 1);
    }
  }, [totalPages, page]);

  return (
    <div className="rounded-xl border border-line bg-paper">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13.5px] font-semibold text-ink"
      >
        <span className="flex items-baseline gap-2">
          무결과 검색어
          <span className="text-[12px] font-normal text-charcoal-3">검색했지만 결과가 없던 키워드예요</span>
        </span>
        <span className="text-[12px] font-normal text-charcoal-3">{expanded ? '접기' : '펼치기'}</span>
      </button>

      {expanded && (
        <div className="border-t border-line px-4 py-4">
          {searchMissesQuery.isLoading && (
            <p className="text-[13px] text-charcoal-2">불러오는 중…</p>
          )}
          {searchMissesQuery.isError && (
            <p className="text-[13px] text-coral">무결과 검색어를 불러오지 못했습니다.</p>
          )}
          {searchMissesQuery.isSuccess && (
            items.length === 0 ? (
              <p className="text-[13px] text-charcoal-2">아직 무결과 검색어가 없어요</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-[13px]">
                    <thead className="bg-graysoft text-charcoal-2">
                      <tr>
                        <Th>키워드</Th><Th>검색 횟수</Th><Th>마지막 검색일</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.keyword} className="border-t border-line">
                          <Td>{item.keyword}</Td>
                          <Td><span className="tabular-nums">{item.missCount}</span></Td>
                          <Td>{new Date(item.lastSearchedAt).toLocaleDateString('ko-KR')}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="무결과 검색어 페이지" />
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
