package com.duing.domain.recruitment.service;

import com.duing.domain.application.repository.ApplicationRepository;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentService implements RecruitmentService {

    // V38 partial unique 인덱스. (club_id) WHERE status='OPEN' AND deleted_at IS NULL.
    private static final String RECRUITMENT_ACTIVE_UNIQUE_CONSTRAINT = "uk_recruitment_club_active";
    // PostgreSQL unique_violation.
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
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

        // uk_recruitment_club_active (V38) 는 endDate 와 무관하게 status='OPEN' 만 보고 1건만 허용한다.
        // 한편 사용자/사전 체크가 인식하는 "활성" 의 의미는 status=OPEN AND endDate>=today 라서
        // endDate 가 지났지만 status 가 OPEN 인 행이 있으면 사전 체크는 통과하고 INSERT 가 인덱스에
        // 걸리는 모순이 생긴다. 이 경우 운영자가 보기엔 이미 끝난 모집이므로 자동 close 후 새 INSERT 를
        // 진행해 사용자 멘탈모델과 DB 인덱스의 의미차를 흡수한다. 진짜 활성인 경우엔 그대로 거부.
        LocalDate today = LocalDate.now();
        recruitmentRepository.findOpenByClubId(club.getId()).ifPresent(existingOpen -> {
            boolean isStillActive = existingOpen.getEndDate() == null
                    || !existingOpen.getEndDate().isBefore(today);
            if (isStillActive) {
                throw new RecruitmentException.DuplicateActiveRecruitmentException();
            }
            // 만료된 OPEN — close UPDATE 가 새 INSERT 보다 먼저 DB 에 가도록 명시적 flush.
            // Hibernate 기본 액션 순서 INSERT→UPDATE 에서 자기 자신과 unique 충돌 차단 (replaceActive 와 동일 패턴).
            existingOpen.close();
            recruitmentRepository.flush();
        });

        return buildAndPersist(club, createRecruitmentCommand);
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
        Integer applicantCount = recruitment.isShowApplicantCount()
                ? (int) applicationRepository.countByRecruitmentId(recruitmentId)
                : null;
        return RecruitmentDetailQuery.from(recruitment, LocalDate.now(), applicantCount);
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

    @Override
    @Transactional
    public Long replaceActive(CreateRecruitmentCommand command) {
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        clubAuthService.requireManager(command.currentUserId(), club.getId());

        // close() 는 메모리상의 status 만 바꾸므로 그 다음 buildAndPersist 의 INSERT 가
        // flush 될 때 Hibernate 기본 액션 순서(INSERT → UPDATE) 상 UPDATE 가 뒤로 밀려
        // uk_recruitment_club_active 와 자기 자신이 충돌한다. close 직후 명시적 flush 로
        // UPDATE 를 먼저 DB 에 반영한 뒤 INSERT 를 진행한다.
        recruitmentRepository.findActiveByClubId(club.getId())
                .ifPresent(existingActive -> {
                    existingActive.close();
                    recruitmentRepository.flush();
                });

        return buildAndPersist(club, command);
    }

    private Long buildAndPersist(Club club, CreateRecruitmentCommand command) {
        Recruitment recruitment;
        try {
            recruitment = Recruitment.createWithOptions(
                    club,
                    command.title(),
                    command.content(),
                    command.startDate(),
                    command.endDate(),
                    command.capacity(),
                    command.applicationMode(),
                    command.externalFormUrl(),
                    command.useInterview(),
                    command.targetRole(),
                    command.interviewStartDate(),
                    command.interviewEndDate(),
                    command.showApplicantCount()
            );
        } catch (IllegalArgumentException exception) {
            throw new RecruitmentException.InvalidRecruitmentPeriodException();
        }

        if (command.applicationMode() == ApplicationMode.SELF) {
            RecruitmentForm form = RecruitmentForm.create(recruitment, command.questions());
            recruitment.attachForm(form);
        }

        // 동시 생성 race 는 uk_recruitment_club_active partial unique 로 차단된다.
        // 명시적 flush 로 commit 이 아닌 현재 트랜잭션 안에서 충돌을 잡아
        // DuplicateActiveRecruitmentException 으로 변환한다. 다른 종류의
        // DataIntegrityViolationException (FK / CHECK / 다른 unique 등) 은 그대로 전파.
        Recruitment saved;
        try {
            saved = recruitmentRepository.save(recruitment);
            recruitmentRepository.flush();
        } catch (DataIntegrityViolationException racedActiveInsertion) {
            if (!isRecruitmentActiveDuplicate(racedActiveInsertion)) {
                throw racedActiveInsertion;
            }
            throw new RecruitmentException.DuplicateActiveRecruitmentException();
        }

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

    /**
     * 활성 모집 unique 인덱스(uk_recruitment_club_active) 위반인지만 true.
     * 다른 unique / CHECK / FK 위반은 false 를 돌려 호출 측에서 그대로 전파시킨다.
     */
    private static boolean isRecruitmentActiveDuplicate(DataIntegrityViolationException exception) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof java.sql.SQLException sqlException)) {
            return false;
        }
        if (!POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(RECRUITMENT_ACTIVE_UNIQUE_CONSTRAINT);
    }
}
