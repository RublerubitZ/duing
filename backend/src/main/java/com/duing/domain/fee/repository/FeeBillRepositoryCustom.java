package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FeeBillRepositoryCustom {

    Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, Pageable pageable);

    List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query);
}
