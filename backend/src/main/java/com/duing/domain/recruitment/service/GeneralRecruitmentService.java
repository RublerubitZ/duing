package com.duing.domain.recruitment.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentService implements RecruitmentService {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public Long create(CreateRecruitmentCommand createRecruitmentCommand) {
        Club club = clubRepository.findById(createRecruitmentCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        // 동아리 운영진(LEADER/OFFICER)만 모집 공고를 생성할 수 있다.
        clubAuthService.requireManager(createRecruitmentCommand.currentUserId(), club.getId());

        Recruitment recruitment;
        try {
            recruitment = Recruitment.createWithOptions(
                    club,
                    createRecruitmentCommand.title(),
                    createRecruitmentCommand.content(),
                    createRecruitmentCommand.startDate(),
                    createRecruitmentCommand.endDate(),
                    createRecruitmentCommand.capacity(),
                    createRecruitmentCommand.applicationMode(),
                    createRecruitmentCommand.externalFormUrl(),
                    createRecruitmentCommand.useInterview(),
                    createRecruitmentCommand.targetRole(),
                    null,
                    null,
                    false
            );
        } catch (IllegalArgumentException exception) {
            throw new RecruitmentException.InvalidRecruitmentPeriodException();
        }

        // 외부 폼 모집은 자체 RecruitmentForm 행을 생성하지 않는다 (1:0..1).
        if (createRecruitmentCommand.applicationMode() == ApplicationMode.SELF) {
            RecruitmentForm form = RecruitmentForm.create(recruitment, createRecruitmentCommand.questions());
            recruitment.attachForm(form);
        }

        Recruitment saved = recruitmentRepository.save(recruitment);

        if (saved.getStatus() == RecruitmentStatus.OPEN
                && !saved.getStartDate().isAfter(LocalDate.now())) {
            eventPublisher.publishEvent(new RecruitmentOpenedEvent(
                    saved.getId(),
                    club.getId(),
                    club.getName(),
                    saved.getTitle(),
                    saved.getEndDate()));
        }

        return saved.getId();
    }

    @Override
    public List<RecruitmentSummaryQuery> getCalendar(YearMonth yearMonth) {
        LocalDate periodStart = yearMonth.atDay(1);
        LocalDate periodEnd = yearMonth.atEndOfMonth();
        LocalDate today = LocalDate.now();

        return recruitmentRepository.findOverlappingPeriod(periodStart, periodEnd).stream()
                .map(recruitment -> RecruitmentSummaryQuery.from(recruitment, today))
                .toList();
    }

    @Override
    public RecruitmentDetailQuery getById(Long recruitmentId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        return RecruitmentDetailQuery.from(recruitment, LocalDate.now());
    }

    @Override
    public List<RecruitmentSummaryQuery> getByClubId(Long clubId) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository
                .findByClubIdOrderByStatusOpenFirstAndStartDateDesc(clubId)
                .stream()
                .map(recruitment -> RecruitmentSummaryQuery.from(recruitment, today))
                .toList();
    }

    @Override
    @Transactional
    public void update(UpdateRecruitmentCommand updateRecruitmentCommand) {
        Recruitment recruitment = recruitmentRepository.findById(updateRecruitmentCommand.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(updateRecruitmentCommand.currentUserId(), clubId);

        if (updateRecruitmentCommand.questions() != null
                && recruitment.getApplicationMode() != ApplicationMode.SELF) {
            throw new RecruitmentException.InvalidApplicationModeException(
                    "자체 폼 모집에서만 질문을 수정할 수 있습니다.");
        }

        recruitment.update(updateRecruitmentCommand);
    }

    @Override
    @Transactional
    public void close(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        recruitment.close();
    }
}
