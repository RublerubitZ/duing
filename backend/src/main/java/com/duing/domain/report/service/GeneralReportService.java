package com.duing.domain.report.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.exception.ReportException;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralReportService implements ReportService {

    private final ReportRepository reportRepository;
    private final ClubRepository clubRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    @Transactional
    public Long create(CreateReportCommand command) {
        Long contextClubId = resolveContextClubId(command.targetType(), command.targetId());
        if (canManage(command.reporterId(), contextClubId)) {
            throw new ReportException.SelfReportNotAllowedException();
        }

        reportRepository.findByReporterIdAndTargetTypeAndTargetIdAndStatus(
                command.reporterId(), command.targetType(), command.targetId(), ReportStatus.PENDING)
                .ifPresent(existing -> { throw new ReportException.DuplicatePendingReportException(); });

        Report saved;
        try {
            saved = reportRepository.save(Report.create(
                    command.reporterId(), command.targetType(), command.targetId(),
                    command.reasonCode(), command.detail()));
        } catch (DataIntegrityViolationException raceCondition) {
            throw new ReportException.DuplicatePendingReportException();
        }
        return saved.getId();
    }

    @Override
    @Transactional
    public void process(ProcessReportCommand command) {
        Report found = reportRepository.findById(command.reportId())
                .orElseThrow(ReportException.ReportNotFoundException::new);
        found.process(command.handlerUserId(), command.status(), command.actionNote());
    }

    @Override
    public Report getById(Long reportId) {
        return reportRepository.findById(reportId)
                .orElseThrow(ReportException.ReportNotFoundException::new);
    }

    @Override
    public Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable) {
        return reportRepository.searchForAdmin(condition, pageable);
    }

    private Long resolveContextClubId(ReportTargetType targetType, Long targetId) {
        return switch (targetType) {
            case CLUB -> clubRepository.findById(targetId)
                    .orElseThrow(ReportException.ReportTargetNotFoundException::new)
                    .getId();
            case RECRUITMENT -> {
                Recruitment recruitment = recruitmentRepository.findById(targetId)
                        .orElseThrow(ReportException.ReportTargetNotFoundException::new);
                yield recruitment.getClub().getId();
            }
        };
    }

    private boolean canManage(Long userId, Long clubId) {
        return clubMemberRepository.findByClubIdAndUserId(clubId, userId)
                .map(member -> member.canManageClub())
                .orElse(false);
    }
}
