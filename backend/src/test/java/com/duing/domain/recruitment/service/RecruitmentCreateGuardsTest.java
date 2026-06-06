package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import java.sql.SQLException;
import java.time.LocalDate;
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
            clubRepository,
            clubAuthService,
            eventPublisher);

    @Test
    @DisplayName("사전 체크에서 활성 모집이 감지되면 DB 호출 없이 DuplicateActiveRecruitmentException 을 던진다")
    void rejectsWhenExistingActiveDetectedBeforeInsert() {
        stubClubAndAuth();
        when(recruitmentRepository.existsActiveByClubId(CLUB_ID)).thenReturn(true);

        assertThatThrownBy(() -> recruitmentService.create(buildCommand()))
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
    }

    @Test
    @DisplayName("INSERT 시점의 uk_recruitment_club_active unique 위반은 DuplicateActiveRecruitmentException 으로 변환된다")
    void convertsTargetUniqueViolationToDomainException() {
        stubClubAndAuth();
        when(recruitmentRepository.existsActiveByClubId(CLUB_ID)).thenReturn(false);
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
        when(recruitmentRepository.existsActiveByClubId(CLUB_ID)).thenReturn(false);
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
        when(recruitmentRepository.existsActiveByClubId(CLUB_ID)).thenReturn(false);
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

    private void stubClubAndAuth() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(CLUB_ID);
        when(clubRepository.findById(CLUB_ID)).thenReturn(Optional.of(club));
        // clubAuthService.requireManager 는 void 라 기본 stub 으로 통과.
    }

    private CreateRecruitmentCommand buildCommand() {
        return new CreateRecruitmentCommand(
                CLUB_ID,
                LEADER_ID,
                "테스트 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.EXTERNAL,
                "https://example.com/form",
                false,
                TargetRole.MEMBER,
                List.of(),
                null,
                null,
                false
        );
    }
}
