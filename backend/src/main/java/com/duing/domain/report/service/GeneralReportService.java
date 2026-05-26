package com.duing.domain.report.service;

import com.duing.domain.club.entity.Club;
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
import com.duing.domain.report.service.dto.query.ReportAdminDetailQuery;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import com.duing.domain.report.service.dto.query.ReportAdminSummaryQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
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
    private final UserRepository userRepository;

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
    public Page<ReportAdminSummaryQuery> listForAdmin(ReportAdminSearchCondition condition, Pageable pageable) {
        Page<Report> reportPage = reportRepository.searchForAdmin(condition, pageable);

        Set<Long> clubTargetIds = reportPage.stream()
                .filter(report -> report.getTargetType() == ReportTargetType.CLUB)
                .map(Report::getTargetId)
                .collect(Collectors.toSet());
        Set<Long> recruitmentTargetIds = reportPage.stream()
                .filter(report -> report.getTargetType() == ReportTargetType.RECRUITMENT)
                .map(Report::getTargetId)
                .collect(Collectors.toSet());

        Map<Long, String> clubNameById = clubRepository.findAllById(clubTargetIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName));
        Map<Long, String> recruitmentTitleById = recruitmentRepository.findAllById(recruitmentTargetIds).stream()
                .collect(Collectors.toMap(Recruitment::getId, Recruitment::getTitle));

        return reportPage.map(report -> {
            String targetLabel = switch (report.getTargetType()) {
                case CLUB -> clubNameById.getOrDefault(report.getTargetId(), AdminLabels.DELETED);
                case RECRUITMENT -> recruitmentTitleById.getOrDefault(report.getTargetId(), AdminLabels.DELETED);
            };
            return new ReportAdminSummaryQuery(report, targetLabel);
        });
    }

    @Override
    public ReportAdminDetailQuery getDetailForAdmin(Long reportId) {
        Report report = reportRepository.findById(reportId)
                .orElseThrow(ReportException.ReportNotFoundException::new);

        String targetLabel = switch (report.getTargetType()) {
            case CLUB -> clubRepository.findById(report.getTargetId())
                    .map(Club::getName).orElse(AdminLabels.DELETED);
            case RECRUITMENT -> recruitmentRepository.findById(report.getTargetId())
                    .map(Recruitment::getTitle).orElse(AdminLabels.DELETED);
        };

        Set<Long> userIds = new java.util.HashSet<>();
        userIds.add(report.getReporterId());
        if (report.getHandledBy() != null) {
            userIds.add(report.getHandledBy());
        }
        Map<Long, User> userById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, user -> user));

        ReportAdminDetailQuery.UserRef reporter = userById.containsKey(report.getReporterId())
                ? new ReportAdminDetailQuery.UserRef(
                        userById.get(report.getReporterId()).getId(),
                        userById.get(report.getReporterId()).getName())
                : null;
        ReportAdminDetailQuery.UserRef handler = (report.getHandledBy() != null && userById.containsKey(report.getHandledBy()))
                ? new ReportAdminDetailQuery.UserRef(
                        userById.get(report.getHandledBy()).getId(),
                        userById.get(report.getHandledBy()).getName())
                : null;

        return new ReportAdminDetailQuery(report, targetLabel, reporter, handler);
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
