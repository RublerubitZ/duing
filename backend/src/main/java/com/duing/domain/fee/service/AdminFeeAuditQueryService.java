package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.query.AdminFeeClubDetailQuery;
import com.duing.domain.fee.service.dto.query.AdminFeeClubRow;
import com.duing.domain.fee.service.dto.query.AdminFeeClubSort;
import com.duing.domain.fee.service.dto.query.AdminFeeDashboardQuery;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.duing.domain.fee.service.dto.query.AdminFeeUsageFilter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** 총동연 회비 감사 콘솔 조회(스펙 §7.1~§7.3). */
public interface AdminFeeAuditQueryService {

    Page<AdminFeeClubRow> searchClubs(String q, AdminFeeUsageFilter usage, AdminFeePeriod period,
                                      AdminFeeClubSort sort, Pageable pageable);

    AdminFeeDashboardQuery getDashboard(AdminFeePeriod period);

    AdminFeeClubDetailQuery getClubDetail(Long clubId, AdminFeePeriod period, Long adminUserId);
}
