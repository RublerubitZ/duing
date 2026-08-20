package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

/**
 * 모집 표시 상태(모집중/마감 뱃지·필터) 경계의 KST 판정 회귀 테스트.
 * prod JVM 은 UTC 라서 무클럭 LocalDate.now() 를 쓰면 마감일 다음날 KST 00:00~08:59 에도
 * 목록에서 여전히 '모집중' 으로 보이는 버그가 있었다 — 판정이 주입된 seoulClock 기준인지 고정 Clock 으로 검증한다.
 */
class RecruitmentDisplayStatusKstBoundaryTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Long CLUB_ID = 3L;

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);

    // 상대 날짜 기준 — 절대 미래 날짜 하드코딩 금지 (시한폭탄 CI 전례).
    private final LocalDate deadline = LocalDate.now(SEOUL);

    @Test
    @DisplayName("마감일 당일 KST 23:59 에는 동아리 모집 목록에서 모집중(OPEN)으로 표시된다")
    void displayStatusOpenUntilKstEndOfDeadlineDay() {
        stubActiveClubWithRecruitmentEndingOnDeadline();
        Clock kstEndOfDeadlineDay = Clock.fixed(
                deadline.atTime(23, 59).atZone(SEOUL).toInstant(), SEOUL);

        RecruitmentSummaryQuery summary = serviceWithClock(kstEndOfDeadlineDay).getByClubId(CLUB_ID).get(0);

        assertThat(summary.displayStatus()).isEqualTo(RecruitmentDisplayStatus.OPEN);
        assertThat(summary.effectivelyOpen()).isTrue();
    }

    @Test
    @DisplayName("마감일 다음날 KST 자정 직후에는 UTC 날짜가 아직 마감일이어도 마감(CLOSED)으로 표시된다")
    void displayStatusClosedRightAfterKstMidnight() {
        stubActiveClubWithRecruitmentEndingOnDeadline();
        // KST 00:30 = UTC 전날 15:30 — 무클럭 now() 였다면 today 가 여전히 마감일이라 OPEN 으로 보였을 시각.
        Clock kstJustAfterMidnight = Clock.fixed(
                deadline.plusDays(1).atTime(0, 30).atZone(SEOUL).toInstant(), SEOUL);

        RecruitmentSummaryQuery summary = serviceWithClock(kstJustAfterMidnight).getByClubId(CLUB_ID).get(0);

        assertThat(summary.displayStatus()).isEqualTo(RecruitmentDisplayStatus.CLOSED);
        assertThat(summary.effectivelyOpen()).isFalse();
    }

    private void stubActiveClubWithRecruitmentEndingOnDeadline() {
        Club activeClub = mock(Club.class);
        when(activeClub.getId()).thenReturn(CLUB_ID);
        when(activeClub.getName()).thenReturn("경계 동아리");
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
        when(clubRepository.existsByIdAndStatus(CLUB_ID, ClubStatus.ACTIVE)).thenReturn(true);
        when(recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(CLUB_ID))
                .thenReturn(List.of(recruitment));
    }

    private GeneralRecruitmentService serviceWithClock(Clock fixedClock) {
        return new GeneralRecruitmentService(
                recruitmentRepository,
                mock(ApplicationRepository.class),
                mock(ClubJoinCodeRepository.class),
                mock(ClubJoinRequestRepository.class),
                mock(ClubAuditEventRepository.class),
                clubRepository,
                mock(ClubAuthService.class),
                new ClubVisibilityPolicy(clubRepository),
                mock(ApplicationEventPublisher.class),
                fixedClock);
    }
}
