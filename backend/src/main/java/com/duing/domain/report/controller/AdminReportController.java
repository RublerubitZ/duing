package com.duing.domain.report.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.api.AdminReportApi;
import com.duing.domain.report.controller.dto.request.ProcessReportRequest;
import com.duing.domain.report.controller.dto.response.ReportDetailResponse;
import com.duing.domain.report.controller.dto.response.ReportSummaryResponse;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.ReportService;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminReportController implements AdminReportApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final ReportService reportService;
    private final ClubRepository clubRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ReportSummaryResponse>>> getReports(
            ReportStatus status, ReportTargetType targetType, Pageable pageable
    ) {
        Page<Report> page = reportService.searchForAdmin(
                new ReportAdminSearchCondition(status, targetType), pageable);
        Page<ReportSummaryResponse> mapped = page.map(report ->
                ReportSummaryResponse.of(report, resolveTargetLabel(report)));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<ReportDetailResponse>> getReport(Long reportId) {
        Report report = reportService.getById(reportId);
        ReportDetailResponse.UserRef reporter = resolveUserRef(report.getReporterId()).orElse(null);
        ReportDetailResponse.UserRef handler = report.getHandledBy() == null
                ? null
                : resolveUserRef(report.getHandledBy()).orElse(null);
        ReportDetailResponse body = ReportDetailResponse.of(
                report, resolveTargetLabel(report), reporter, handler);
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processReport(
            Long reportId, @Valid @RequestBody ProcessReportRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        reportService.process(request.toCommand(reportId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    private String resolveTargetLabel(Report report) {
        return switch (report.getTargetType()) {
            case CLUB -> clubRepository.findById(report.getTargetId())
                    .map(Club::getName).orElse(DELETED_LABEL);
            case RECRUITMENT -> recruitmentRepository.findById(report.getTargetId())
                    .map(Recruitment::getTitle).orElse(DELETED_LABEL);
        };
    }

    private Optional<ReportDetailResponse.UserRef> resolveUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new ReportDetailResponse.UserRef(user.getId(), user.getName()));
    }
}
