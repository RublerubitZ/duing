package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.MyFeeResponse;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralMyFeeService implements MyFeeService {

    private final FeeBillRepository feeBillRepository;
    private final FeePaidAmountReader paidAmountReader;
    private final Clock clock; // Asia/Seoul Clock 빈(displayStatus 파생의 '오늘')

    // 본인(userId) 청구만 조회한다. clubId/status 는 옵션 필터이며, 권한 검사 없이
    // user_id 고정 술어가 다른 회원의 청구 노출을 차단한다(§8 currentUser.id() 한정).
    @Override
    public List<MyFeeResponse> getMyFees(Long userId, MyFeeSearchQuery query) {
        // today 를 한 번만 산출해 필터(표기 축)와 응답 displayStatus 파생이 같은 기준일을 쓰게 한다.
        LocalDate today = LocalDate.now(clock);
        List<FeeBill> bills = feeBillRepository.searchMyBills(userId, query, today);
        Map<Long, Long> paidByBill = paidAmountReader.paidAmountByBillId(
                bills.stream().map(FeeBill::getId).toList());
        return bills.stream()
                .map(bill -> MyFeeResponse.from(
                        FeeBillQuery.from(bill, paidByBill.getOrDefault(bill.getId(), 0L), today)))
                .toList();
    }
}
