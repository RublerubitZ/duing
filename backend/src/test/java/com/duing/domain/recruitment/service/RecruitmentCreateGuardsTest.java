package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

class RecruitmentCreateGuardsTest {

    private static final Long CLUB_ID = 9L;
    private static final Long LEADER_ID = 7L;

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);

    private final GeneralRecruitmentService recruitmentService = new GeneralRecruitmentService(
            recruitmentRepository,
            applicationRepository,
            mock(ClubJoinCodeRepository.class),
            mock(ClubJoinRequestRepository.class),
            mock(ClubAuditEventRepository.class),
            clubRepository,
            clubAuthService,
            eventPublisher,
            // 실제 빈(seoulClock)과 동일한 Asia/Seoul 존 — systemDefaultZone 은 환경 의존.
            Clock.system(ZoneId.of("Asia/Seoul")));

    @Test
    @DisplayName("진짜 활성(endDate >= today) 인 OPEN 모집이 있으면 DuplicateActiveRecruitmentException 을 던진다")
    void rejectsWhenStillActiveRecruitmentExists() {
        stubClubAndAuth();
        Recruitment activeRecruitment = mock(Recruitment.class);
        when(activeRecruitment.getEndDate()).thenReturn(LocalDate.now().plusDays(7));
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.of(activeRecruitment));

        assertThatThrownBy(() -> recruitmentService.create(buildCommand()))
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
    }

    @Test
    @DisplayName("상시 모집(endDate=null) 도 활성으로 간주되어 DuplicateActiveRecruitmentException 을 던진다")
    void rejectsWhenAlwaysOpenRecruitmentExists() {
        stubClubAndAuth();
        Recruitment alwaysOpen = mock(Recruitment.class);
        when(alwaysOpen.getEndDate()).thenReturn(null);
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.of(alwaysOpen));

        assertThatThrownBy(() -> recruitmentService.create(buildCommand()))
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
    }

    @Test
    @DisplayName("endDate 가 지난 OPEN 모집은 자동으로 close 되고 새 모집 생성이 성공한다")
    void autoClosesExpiredOpenRecruitmentAndProceeds() {
        stubClubAndAuth();
        Recruitment expiredOpen = mock(Recruitment.class);
        when(expiredOpen.getEndDate()).thenReturn(LocalDate.now().minusDays(1));
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.of(expiredOpen));
        Recruitment savedNew = mock(Recruitment.class);
        when(savedNew.getId()).thenReturn(999L);
        when(savedNew.getStatus()).thenReturn(com.duing.domain.recruitment.entity.RecruitmentStatus.CLOSED);
        when(recruitmentRepository.save(any(Recruitment.class))).thenReturn(savedNew);

        recruitmentService.create(buildCommand());

        verify(expiredOpen).close(any(LocalDateTime.class));
        verify(recruitmentRepository, atLeastOnce()).flush();
    }

    @Test
    @DisplayName("INSERT 시점의 uk_recruitment_club_active unique 위반은 DuplicateActiveRecruitmentException 으로 변환된다")
    void convertsTargetUniqueViolationToDomainException() {
        stubClubAndAuth();
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.empty());
        when(recruitmentRepository.save(any(Recruitment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        SQLException pgUnique = new SQLException(
                "duplicate key value violates unique constraint \"uk_recruitment_club_active\"",
                "23505");
        doThrow(new DataIntegrityViolationException("duplicate", pgUnique))
                .when(recruitmentRepository).flush();

        assertThatThrownBy(() -> recruitmentService.create(buildCommand()))
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
    }

    @Test
    @DisplayName("uk_recruitment_club_active 와 무관한 DataIntegrityViolationException 은 그대로 전파된다")
    void propagatesUnrelatedConstraintViolation() {
        stubClubAndAuth();
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.empty());
        when(recruitmentRepository.save(any(Recruitment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        // 23503 (FK 위반) 같은 다른 제약 위반은 도메인 예외로 둔갑시키면 안 된다.
        SQLException pgForeignKey = new SQLException(
                "insert or update on table \"recruitment\" violates foreign key constraint \"fk_recruitment_club\"",
                "23503");
        DataIntegrityViolationException foreignKeyViolation =
                new DataIntegrityViolationException("fk", pgForeignKey);
        doThrow(foreignKeyViolation).when(recruitmentRepository).flush();

        assertThatThrownBy(() -> recruitmentService.create(buildCommand()))
                .isSameAs(foreignKeyViolation);
    }

    @Test
    @DisplayName("같은 23505 SQLState 라도 다른 unique 인덱스 위반은 그대로 전파된다")
    void propagatesOtherUniqueViolation() {
        stubClubAndAuth();
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.empty());
        when(recruitmentRepository.save(any(Recruitment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        SQLException pgOtherUnique = new SQLException(
                "duplicate key value violates unique constraint \"uk_some_other_index\"",
                "23505");
        DataIntegrityViolationException otherUniqueViolation =
                new DataIntegrityViolationException("other", pgOtherUnique);
        doThrow(otherUniqueViolation).when(recruitmentRepository).flush();

        assertThatThrownBy(() -> recruitmentService.create(buildCommand()))
                .isSameAs(otherUniqueViolation);
    }

    @Test
    @DisplayName("종료일이 오늘보다 과거인 모집을 생성하려 하면 400 예외가 발생한다")
    void rejectsPastEndDateOnCreate() {
        stubClubAndAuth();

        assertThatThrownBy(() -> recruitmentService.create(
                buildCommand(kstToday().minusDays(3), kstToday().minusDays(1))))
                .isInstanceOf(RecruitmentException.PastEndDateException.class);
    }

    @Test
    @DisplayName("종료일이 과거인 생성 요청은 만료-OPEN 전임 모집을 자동 마감하기 전에 거부된다")
    void rejectsPastEndDateBeforeAutoClosingPredecessor() {
        stubClubAndAuth();
        Recruitment expiredOpen = mock(Recruitment.class);
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.of(expiredOpen));

        assertThatThrownBy(() -> recruitmentService.create(
                buildCommand(kstToday().minusDays(3), kstToday().minusDays(1))))
                .isInstanceOf(RecruitmentException.PastEndDateException.class);

        verify(expiredOpen, never()).close(any(LocalDateTime.class));
    }

    @Test
    @DisplayName("종료일이 오늘인 모집은 오늘 하루 지원을 받을 수 있으므로 생성된다")
    void allowsEndDateOfToday() {
        stubClubAndAuth();
        when(recruitmentRepository.findOpenByClubId(CLUB_ID)).thenReturn(Optional.empty());
        Recruitment savedRecruitment = mock(Recruitment.class);
        when(savedRecruitment.getId()).thenReturn(999L);
        when(recruitmentRepository.save(any(Recruitment.class))).thenReturn(savedRecruitment);

        recruitmentService.create(buildCommand(kstToday().minusDays(3), kstToday()));
    }

    /** 서비스 clock 과 같은 KST 기준 오늘 — 무존 LocalDate.now() 는 UTC CI 러너에서 경계일이 하루 어긋난다. */
    private LocalDate kstToday() {
        return LocalDate.now(ZoneId.of("Asia/Seoul"));
    }

    private void stubClubAndAuth() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(CLUB_ID);
        // 비 ACTIVE 동아리 모집 개설 차단 가드 통과용 — 이 테스트의 관심사는 활성 모집 중복 가드다.
        when(club.getStatus()).thenReturn(ClubStatus.ACTIVE);
        // 생성 경로는 운영 중단 전환과의 직렬화를 위해 행 잠금 조회(findByIdForUpdate)를 사용한다.
        when(clubRepository.findByIdForUpdate(CLUB_ID)).thenReturn(Optional.of(club));
        // clubAuthService.requireManager 는 void 라 기본 stub 으로 통과.
    }

    private CreateRecruitmentCommand buildCommand() {
        return buildCommand(LocalDate.now(), LocalDate.now().plusDays(7));
    }

    private CreateRecruitmentCommand buildCommand(LocalDate startDate, LocalDate endDate) {
        return new CreateRecruitmentCommand(
                CLUB_ID,
                LEADER_ID,
                "테스트 모집",
                // EXTERNAL 은 안내문(content)을 실을 수 없고 URL 도 허용 플랫폼이어야 한다 (스펙 §2·§3).
                null,
                startDate,
                endDate,
                10,
                ApplicationMode.EXTERNAL,
                "https://forms.gle/aBcD1234",
                false,
                TargetRole.MEMBER,
                List.of(),
                null,
                null,
                false
        );
    }
}
