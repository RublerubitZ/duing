package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FeeBillRepositoryCustom {

    Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, Pageable pageable);

    List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query);

    FeeBillSummaryProjection summarizeBills(Long clubId, FeeBillSummaryQuery query);

    long sumActivePaid(Long clubId, FeeBillSummaryQuery query);

    // 입금액과 잔액(청구액 − 활성 납부합)이 정확히 일치하는 동아리 내 미납 청구 후보를 마감일 오름차순으로 반환한다.
    List<MatchCandidate> findMatchCandidates(Long clubId, long depositAmount);

    // 매칭 내역 표시용으로, 동아리 내 주어진 청구 id 들의 매칭 회원 이름·회차를 일괄 조회한다(N+1 방지). 입력이 비면 빈 목록.
    List<MatchedBillInfo> findMatchedBillInfo(Long clubId, Collection<Long> feeBillIds);
}
