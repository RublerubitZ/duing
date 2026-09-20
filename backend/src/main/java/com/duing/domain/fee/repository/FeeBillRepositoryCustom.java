package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FeeBillRepositoryCustom {

    // status 필터는 표기 축(displayStatus) 시멘틱으로 해석된다 — today 는 KST 오늘이며 서비스가 넘긴다.
    Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, LocalDate today, Pageable pageable);

    // searchClubBills 와 동일하게 status 필터를 표기 축으로 해석한다(today 는 서비스가 주입).
    List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query, LocalDate today);

    // 상태별 카운트도 표기 축 파생이다 — today 는 KST 오늘이며 서비스가 넘긴다.
    FeeBillSummaryProjection summarizeBills(Long clubId, FeeBillSummaryQuery query, LocalDate today);

    long sumActivePaid(Long clubId, FeeBillSummaryQuery query);

    // 입금액과 잔액(청구액 − 활성 납부합)이 정확히 일치하는 동아리 내 미납 청구 후보를 마감일 오름차순으로 반환한다.
    // 쿼리 정의를 한 벌로 유지하려고 아래 배치 조회에 위임한다(단건 호출부는 이 시그니처를 그대로 쓴다).
    List<MatchCandidate> findMatchCandidates(Long clubId, long depositAmount);

    // 위 후보 조회의 배치판 — 여러 입금액을 IN 한 문장으로 훑어 검토 큐 한 페이지의 행당 조회를 없앤다.
    // 반환 목록에는 금액이 섞여 있으므로 호출부가 MatchCandidate.remaining 으로 금액별 분배한다(금액 내 정렬은 유지).
    // 입력이 비면 빈 목록(쿼리 생략).
    List<MatchCandidate> findMatchCandidates(Long clubId, Collection<Long> depositAmounts);

    // 매칭 내역 표시용으로, 동아리 내 주어진 청구 id 들의 매칭 회원 이름·회차를 일괄 조회한다(N+1 방지). 입력이 비면 빈 목록.
    List<MatchedBillInfo> findMatchedBillInfo(Long clubId, Collection<Long> feeBillIds);
}
