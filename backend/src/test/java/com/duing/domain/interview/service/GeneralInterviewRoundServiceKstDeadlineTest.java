package com.duing.domain.interview.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 라운드 생성 시 응답 마감(availabilityDeadline) 미래 검증이 seoulClock 기준인지 확인한다.
 * 무클럭 LocalDateTime.now() 는 마감 이행 판정(now(clock))과 다른 시계라, 같은 필드를 두 시계로
 * 판정하는 어긋남을 만든다 — 생성 검증도 주입된 clock 을 써야 한다.
 */
class GeneralInterviewRoundServiceKstDeadlineTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Long RECRUITMENT_ID = 1L;
    private static final Long USER_ID = 10L;

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final UserRepository userRepository = mock(UserRepository.class);

    @Test
    @DisplayName("마감이 주입된 clock 기준으로 이미 지났으면 실시간과 무관하게 InvalidDeadline 이 발생한다")
    void deadlineJudgedByInjectedClockNotSystemNow() {
        // 상대 미래 고정 Clock — 무클럭 now() 였다면 마감이 '실제 미래'라 통과했을 시각.
        Instant fixedInstant = LocalDate.now(SEOUL).plusYears(1).atTime(12, 0).atZone(SEOUL).toInstant();
        Clock fixedClock = Clock.fixed(fixedInstant, SEOUL);
        LocalDateTime deadlineEqualToNow = LocalDateTime.ofInstant(fixedInstant, SEOUL);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getClub()).thenReturn(mock(Club.class));
        when(recruitment.isUseInterview()).thenReturn(true);
        // 라운드 생성은 마감과 직렬화하기 위해 모집 행을 잠그고 읽는다.
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));

        // 마감 검증 이전(라운드 생성 초입)까지만 도달하므로 이후 협력자는 사용되지 않는다.
        GeneralInterviewRoundService service = new GeneralInterviewRoundService(
                recruitmentRepository, clubAuthService, null, null, null, null,
                userRepository, null, null, null, null, fixedClock, null);

        CreateInterviewRoundCommand command = new CreateInterviewRoundCommand(
                RECRUITMENT_ID, USER_ID, "1차 면접", deadlineEqualToNow, "동방", List.of());

        assertThrows(InterviewException.InvalidDeadline.class, () -> service.createRound(command));
    }
}
