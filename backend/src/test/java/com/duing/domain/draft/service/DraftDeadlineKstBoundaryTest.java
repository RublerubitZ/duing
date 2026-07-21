package com.duing.domain.draft.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.exception.DraftException;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 임시저장 마감 경계의 KST 판정 회귀 테스트 — 제출 경로와 같은 seoulClock 기준으로
 * 마감일 다음날 KST 자정 직후 임시저장이 거부되는지 고정 Clock 으로 검증한다.
 */
class DraftDeadlineKstBoundaryTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Long RECRUITMENT_ID = 1L;
    private static final Long USER_ID = 10L;

    private final ApplicationDraftRepository draftRepository = mock(ApplicationDraftRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);

    // 상대 날짜 기준 — 절대 미래 날짜 하드코딩 금지.
    private final LocalDate deadline = LocalDate.now(SEOUL);

    @Test
    @DisplayName("마감일 당일 KST 23:59 에는 임시저장이 허용된다")
    void draftUpsertAllowedUntilKstEndOfDeadlineDay() {
        stubOpenRecruitmentEndingOnDeadline();
        when(draftRepository.findByUserIdAndRecruitmentId(USER_ID, RECRUITMENT_ID)).thenReturn(Optional.empty());
        Clock kstEndOfDeadlineDay = Clock.fixed(
                deadline.atTime(23, 59).atZone(SEOUL).toInstant(), SEOUL);

        GeneralApplicationDraftService draftService =
                new GeneralApplicationDraftService(draftRepository, recruitmentRepository, kstEndOfDeadlineDay);

        assertThatCode(() -> draftService.upsert(new UpsertDraftCommand(USER_ID, RECRUITMENT_ID, List.of())))
                .doesNotThrowAnyException();
        verify(draftRepository).save(any(ApplicationDraft.class));
    }

    @Test
    @DisplayName("마감일 다음날 KST 자정 직후에는 UTC 날짜가 아직 마감일이어도 임시저장이 거부된다")
    void draftUpsertRejectedRightAfterKstMidnight() {
        stubOpenRecruitmentEndingOnDeadline();
        // KST 00:30 = UTC 전날 15:30 — 무클럭 now() 였다면 today 가 여전히 마감일이라 통과했을 시각.
        Clock kstJustAfterMidnight = Clock.fixed(
                deadline.plusDays(1).atTime(0, 30).atZone(SEOUL).toInstant(), SEOUL);

        GeneralApplicationDraftService draftService =
                new GeneralApplicationDraftService(draftRepository, recruitmentRepository, kstJustAfterMidnight);

        assertThrows(DraftException.RecruitmentClosedException.class,
                () -> draftService.upsert(new UpsertDraftCommand(USER_ID, RECRUITMENT_ID, List.of())));
    }

    private void stubOpenRecruitmentEndingOnDeadline() {
        Club activeClub = mock(Club.class);
        when(activeClub.getStatus()).thenReturn(ClubStatus.ACTIVE);
        Recruitment recruitment = Recruitment.createWithOptions(
                activeClub,
                "마감 경계 모집",
                "내용",
                deadline.minusDays(10),
                deadline,
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                null,
                null,
                false);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
    }
}
