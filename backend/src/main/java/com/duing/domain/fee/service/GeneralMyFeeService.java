package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.MyFeeResponse;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralMyFeeService implements MyFeeService {

    private final FeeBillRepository feeBillRepository;

    // 본인(userId) 청구만 조회한다. clubId/status 는 옵션 필터이며, 권한 검사 없이
    // user_id 고정 술어가 다른 회원의 청구 노출을 차단한다(§8 currentUser.id() 한정).
    @Override
    public List<MyFeeResponse> getMyFees(Long userId, MyFeeSearchQuery query) {
        return feeBillRepository.searchMyBills(userId, query).stream()
                .map(FeeBillQuery::from)
                .map(MyFeeResponse::from)
                .toList();
    }
}
