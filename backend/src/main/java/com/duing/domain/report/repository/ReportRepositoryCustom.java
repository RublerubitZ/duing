package com.duing.domain.report.repository;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ReportRepositoryCustom {
    Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable);
}
