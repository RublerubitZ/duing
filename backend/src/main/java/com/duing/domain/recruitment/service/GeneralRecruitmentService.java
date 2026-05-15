package com.duing.domain.recruitment.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentService implements RecruitmentService {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    @Transactional
    public Long create(CreateRecruitmentCommand createRecruitmentCommand) {
        Club club = clubRepository.findById(createRecruitmentCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        // 동아리 운영진(LEADER/OFFICER)만 모집 공고를 생성할 수 있다.
        clubMemberRepository
                .findByClubIdAndUserId(club.getId(), createRecruitmentCommand.currentUserId())
                .filter(member -> member.canManageClub())
                .orElseThrow(ClubMemberException.NotClubManagerException::new);

        Recruitment recruitment;
        try {
            recruitment = Recruitment.create(
                    club,
                    createRecruitmentCommand.title(),
                    createRecruitmentCommand.content(),
                    createRecruitmentCommand.startDate(),
                    createRecruitmentCommand.endDate(),
                    createRecruitmentCommand.capacity()
            );
        } catch (IllegalArgumentException exception) {
            throw new RecruitmentException.InvalidRecruitmentPeriodException();
        }

        RecruitmentForm form = RecruitmentForm.create(recruitment, createRecruitmentCommand.questions());
        recruitment.attachForm(form);

        return recruitmentRepository.save(recruitment).getId();
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
}
