package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;

class RecruitmentUpdateAndCloseServiceTest {

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final ClubJoinCodeRepository clubJoinCodeRepository = mock(ClubJoinCodeRepository.class);
    private final ClubJoinRequestRepository clubJoinRequestRepository = mock(ClubJoinRequestRepository.class);
    private final ClubAuditEventRepository clubAuditEventRepository = mock(ClubAuditEventRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);

    private final GeneralRecruitmentService recruitmentService = new GeneralRecruitmentService(
            recruitmentRepository,
            applicationRepository,
            clubJoinCodeRepository,
            clubJoinRequestRepository,
            clubAuditEventRepository,
            clubRepository,
            clubAuthService,
            eventPublisher,
            // 실제 빈(seoulClock)과 동일한 Asia/Seoul 존 — systemDefaultZone 은 환경 의존.
            Clock.system(ZoneId.of("Asia/Seoul"))
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

    private Recruitment openSelfRecruitmentWithForm(List<String> questionTexts) {
        Recruitment recruitment = openSelfRecruitment();
        List<RecruitmentQuestion> questions = questionTexts.stream().map(RecruitmentQuestion::createText).toList();
        recruitment.attachForm(RecruitmentForm.create(recruitment, questions));
        return recruitment;
    }

    private static List<String> questionTexts(Recruitment recruitment) {
        return recruitment.getForm().getQuestions().stream().map(RecruitmentQuestion::text).toList();
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
                null,
                null,
                null,
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
                List.of("질문1", "질문2"),
                null,
                null,
                null,
                null
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }

    @Test
    @DisplayName("수정으로는 applicationMode 와 externalFormUrl 을 바꿀 수 없다 — 화이트리스트는 생성 시 한 번만 검증하면 충분하다")
    void updateCannotChangeApplicationModeOrExternalFormUrl() {
        Recruitment recruitment = openExternalRecruitment();
        setField(recruitment, "externalFormUrl", "https://forms.gle/aBcD1234");
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        // 수정 명령에는 applicationMode·externalFormUrl 필드 자체가 없어 어떤 값도 실어 보낼 수 없다.
        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                "수정된 제목",
                null,
                null,
                null,
                20,
                null,
                null,
                null,
                null,
                null,
                null
        );

        recruitmentService.update(updateCommand);

        assertThat(recruitment.getApplicationMode()).isEqualTo(ApplicationMode.EXTERNAL);
        assertThat(recruitment.getExternalFormUrl()).isEqualTo("https://forms.gle/aBcD1234");
        assertThat(recruitment.getTitle()).isEqualTo("수정된 제목");
    }

    @Test
    @DisplayName("이미 지원자가 있는 모집 공고에서 질문을 변경하려 하면 409 예외가 발생하고 질문은 그대로 유지된다")
    void updateQuestionsWithExistingApplicationsThrowsConflict() {
        Recruitment recruitment = openSelfRecruitmentWithForm(List.of("기존 질문1", "기존 질문2"));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(2L);

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of("이름", "기존 질문1", "기존 질문2"), // 앞에 질문을 추가해 기존 답변의 위치가 밀린다
                null,
                null,
                null,
                null
        );

        assertThatThrownBy(() -> recruitmentService.update(updateCommand))
                .isInstanceOf(RecruitmentException.QuestionsNotEditableWithApplicationsException.class);
        assertThat(questionTexts(recruitment)).containsExactly("기존 질문1", "기존 질문2");
    }

    @Test
    @DisplayName("지원자가 없는 모집 공고는 질문을 변경할 수 있다")
    void updateQuestionsWithoutApplicationsSucceeds() {
        Recruitment recruitment = openSelfRecruitmentWithForm(List.of("기존 질문1"));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(0L);

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of("새 질문1", "새 질문2"),
                null,
                null,
                null,
                null
        );

        recruitmentService.update(updateCommand);

        assertThat(questionTexts(recruitment)).containsExactly("새 질문1", "새 질문2");
    }

    @Test
    @DisplayName("지원자가 있어도 기존과 동일한 질문을 그대로 다시 전달하면 다른 필드 수정과 함께 허용된다")
    void resubmittingIdenticalQuestionsWithApplicationsSucceeds() {
        Recruitment recruitment = openSelfRecruitmentWithForm(List.of("질문1", "질문2"));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                "수정된 제목",
                null,
                null,
                null,
                null,
                null,
                List.of("질문1", "질문2"), // 내용 동일 — 위치 어긋남이 없어 허용
                null,
                null,
                null,
                null
        );

        recruitmentService.update(updateCommand);

        assertThat(recruitment.getTitle()).isEqualTo("수정된 제목");
        assertThat(questionTexts(recruitment)).containsExactly("질문1", "질문2");
        // 질문이 바뀌지 않았으므로 지원자 수 조회 자체를 건너뛴다.
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
    }

    @Test
    @DisplayName("지원자가 있어도 질문 외 필드(제목·정원 등)는 수정할 수 있다")
    void updateNonQuestionFieldsWithApplicationsSucceeds() {
        Recruitment recruitment = openSelfRecruitmentWithForm(List.of("질문1"));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        UpdateRecruitmentCommand updateCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                "새 제목",
                null,
                null,
                null,
                30,
                null,
                null, // questions 미전달 — 질문 가드 미적용
                null,
                null,
                null,
                null
        );

        recruitmentService.update(updateCommand);

        assertThat(recruitment.getTitle()).isEqualTo("새 제목");
        assertThat(recruitment.getCapacity()).isEqualTo(30);
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
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
                null,
                null,
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
        // 마감은 라운드 생성과 직렬화하기 위해 모집 행을 잠그고 읽는다 (delete 와 동일 경로).
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.close(RECRUITMENT_ID, MANAGER_USER_ID);

        assertThat(recruitment.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(recruitment.getClosedAt())
                .as("실제 종료 시각을 남긴다 — 가입 링크의 사용 가능 기간 기준점이다").isNotNull();
    }

    @Test
    @DisplayName("이미 마감된 모집 공고에 마감 재호출 시 409 예외가 발생한다")
    void closeAlreadyClosedRecruitmentThrowsConflict() {
        Recruitment recruitment = closedRecruitment();
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.close(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.RecruitmentAlreadyClosedException.class);
    }

    @Test
    @DisplayName("마감되고 지원자가 없는 모집 공고는 운영진이 삭제할 수 있다")
    void managerCanDeleteClosedRecruitmentWithoutApplications() {
        Recruitment recruitment = closedRecruitment();
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(0L);

        recruitmentService.delete(RECRUITMENT_ID, MANAGER_USER_ID);

        verify(recruitmentRepository).delete(recruitment);
    }

    @Test
    @DisplayName("진행 중(OPEN)인 모집 공고를 삭제하려 하면 409 예외가 발생하고 삭제되지 않는다")
    void deleteOpenRecruitmentThrowsConflict() {
        Recruitment recruitment = openSelfRecruitment();
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.delete(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.OpenRecruitmentNotDeletableException.class);
        verify(recruitmentRepository, never()).delete(recruitment);
    }

    @Test
    @DisplayName("마감됐어도 지원자가 있는 모집 공고를 삭제하려 하면 409 예외가 발생하고 삭제되지 않는다")
    void deleteClosedRecruitmentWithApplicationsThrowsConflict() {
        Recruitment recruitment = closedRecruitment();
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(3L);

        assertThatThrownBy(() -> recruitmentService.delete(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.ApplicationsExistException.class);
        verify(recruitmentRepository, never()).delete(recruitment);
    }

    @Test
    @DisplayName("동아리 운영진이 아닌 일반 회원이 삭제를 시도하면 403 예외가 발생하고 삭제되지 않는다")
    void memberCannotDeleteRecruitment() {
        Recruitment recruitment = closedRecruitment();
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(MEMBER_USER_ID, CLUB_ID);

        assertThatThrownBy(() -> recruitmentService.delete(RECRUITMENT_ID, MEMBER_USER_ID))
                .isInstanceOf(AccessDeniedException.class);
        verify(recruitmentRepository, never()).delete(recruitment);
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
