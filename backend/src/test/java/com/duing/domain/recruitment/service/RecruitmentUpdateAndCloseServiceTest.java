package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class RecruitmentUpdateAndCloseServiceTest {

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);

    private final GeneralRecruitmentService recruitmentService = new GeneralRecruitmentService(
            recruitmentRepository,
            clubRepository,
            clubAuthService
    );

    private static final Long MANAGER_USER_ID = 1L;
    private static final Long MEMBER_USER_ID = 2L;
    private static final Long RECRUITMENT_ID = 10L;
    private static final Long CLUB_ID = 100L;

    private Club club;

    @BeforeEach
    void setUp() {
        club = Club.create("두잉 동아리", ClubCategory.ACADEMIC, "공과대학", "설명", null);
        setField(club, "id", CLUB_ID);
    }

    private Recruitment openSelfRecruitment() {
        Recruitment recruitment = Recruitment.create(
                club,
                "2026 봄 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(14),
                10
        );
        setField(recruitment, "id", RECRUITMENT_ID);
        return recruitment;
    }

    private Recruitment openExternalRecruitment() {
        Recruitment recruitment = openSelfRecruitment();
        setField(recruitment, "applicationMode", ApplicationMode.EXTERNAL);
        return recruitment;
    }

    private Recruitment closedRecruitment() {
        Recruitment recruitment = openSelfRecruitment();
        setField(recruitment, "status", RecruitmentStatus.CLOSED);
        return recruitment;
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Class<?> clazz = target.getClass();
            while (clazz != null) {
                try {
                    Field field = clazz.getDeclaredField(fieldName);
                    field.setAccessible(true);
                    field.set(target, value);
                    return;
                } catch (NoSuchFieldException e) {
                    clazz = clazz.getSuperclass();
                }
            }
            throw new RuntimeException("필드를 찾을 수 없습니다: " + fieldName);
        } catch (IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    @DisplayName("OFFICER 이상의 운영진이 모집 공고를 수정하면 변경 사항이 반영된다")
    void managerCanUpdateOpenRecruitment() {
        Recruitment recruitment = openSelfRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                "수정된 제목",
                null,
                null,
                null,
                20,
                null,
                null
        );

        recruitmentService.update(updateCommand);

        assertThat(recruitment.getTitle()).isEqualTo("수정된 제목");
        assertThat(recruitment.getCapacity()).isEqualTo(20);
    }

    @Test
    @DisplayName("이미 마감된 모집 공고를 수정하려 하면 409 예외가 발생한다")
    void updateClosedRecruitmentThrowsAlreadyClosed() {
        Recruitment recruitment = closedRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                "수정 시도",
                null,
                null,
                null,
                null,
                null,
                null
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(RecruitmentException.RecruitmentAlreadyClosedException.class);
    }

    @Test
    @DisplayName("외부 폼 모집 공고에 질문 목록을 전달하면 400 예외가 발생한다")
    void updateExternalRecruitmentWithQuestionsThrowsInvalidMode() {
        Recruitment recruitment = openExternalRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of("질문1", "질문2")
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }

    @Test
    @DisplayName("endDate 만 수정 시 기존 startDate 와 비교해 endDate 가 이전이면 400 예외가 발생한다")
    void updateWithInvalidEndDateThrowsInvalidPeriod() {
        Recruitment recruitment = openSelfRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                null,
                null,
                null,
                LocalDate.now().minusDays(1),
                null,
                null,
                null
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(RecruitmentException.InvalidRecruitmentPeriodException.class);
    }

    @Test
    @DisplayName("모집 공고 마감 호출 시 상태가 CLOSED 로 전환된다")
    void closeRecruitmentChangesStatusToClosed() {
        Recruitment recruitment = openSelfRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.close(RECRUITMENT_ID, MANAGER_USER_ID);

        assertThat(recruitment.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
    }

    @Test
    @DisplayName("이미 마감된 모집 공고에 마감 재호출 시 409 예외가 발생한다")
    void closeAlreadyClosedRecruitmentThrowsConflict() {
        Recruitment recruitment = closedRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.close(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.RecruitmentAlreadyClosedException.class);
    }

    @Test
    @DisplayName("동아리 운영진이 아닌 일반 회원이 수정을 시도하면 403 예외가 발생한다")
    void memberCannotUpdateRecruitment() {
        Recruitment recruitment = openSelfRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(MEMBER_USER_ID, CLUB_ID);

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MEMBER_USER_ID,
                "수정 시도",
                null,
                null,
                null,
                null,
                null,
                null
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("title 을 공백 문자열로 수정하려 하면 도메인에서 거부된다")
    void updateWithBlankTitleIsRejected() {
        Recruitment recruitment = openSelfRecruitment();
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                "   ",
                null,
                null,
                null,
                null,
                null,
                null
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("공백");
    }
}
