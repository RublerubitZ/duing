package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.MyFeeResponse;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.util.List;

public interface MyFeeService {
    List<MyFeeResponse> getMyFees(Long userId, MyFeeSearchQuery query);
}
