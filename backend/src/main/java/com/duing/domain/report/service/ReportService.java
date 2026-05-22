package com.duing.domain.report.service;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import com.duing.domain.report.service.dto.query.ReportAdminDetailQuery;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import com.duing.domain.report.service.dto.query.ReportAdminSummaryQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ReportService {
    Long create(CreateReportCommand command);
    void process(ProcessReportCommand command);
    Report getById(Long reportId);
    Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable);
    Page<ReportAdminSummaryQuery> listForAdmin(ReportAdminSearchCondition condition, Pageable pageable);
    ReportAdminDetailQuery getDetailForAdmin(Long reportId);
}
