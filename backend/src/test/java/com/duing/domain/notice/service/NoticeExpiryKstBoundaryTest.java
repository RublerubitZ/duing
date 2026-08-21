package com.duing.domain.notice.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.broadcast.service.NoticeBroadcaster;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 공지 만료 경계의 KST 판정 회귀 테스트.
 * 운영자는 expiresAt 을 KST 벽시계로 입력한다 — prod JVM(UTC)의 무클럭 now() 와 비교하면
 * 만료가 9시간 늦게 적용되는 버그가 있었다. 판정이 주입된 seoulClock 기준인지 고정 Clock 으로 검증한다.
 */
class NoticeExpiryKstBoundaryTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Long CLUB_ID = 7L;
    private static final Long NOTICE_ID = 42L;

    private final NoticeRepository noticeRepository = mock(NoticeRepository.class);
    private final NoticeTargetClubRepository targetClubRepository = mock(NoticeTargetClubRepository.class);

    // 상대 시각 기준 — 절대 미래 날짜 하드코딩 금지.
    private final LocalDateTime expiresAt = LocalDate.now(SEOUL).atTime(12, 0);

    @Test
    @DisplayName("expiresAt 직전(KST)에는 동아리 회원이 공지를 조회할 수 있다")
    void noticeVisibleJustBeforeKstExpiry() {
        stubClubScopedNotice();
        Clock kstJustBeforeExpiry = Clock.fixed(
                expiresAt.minusMinutes(1).atZone(SEOUL).toInstant(), SEOUL);

        Notice found = serviceWithClock(kstJustBeforeExpiry).getClubScopedForMember(CLUB_ID, NOTICE_ID);

        assertThat(found.getId()).isEqualTo(NOTICE_ID);
    }

    @Test
    @DisplayName("expiresAt 직후(KST)에는 UTC 벽시계가 아직 만료 전이어도 조회가 차단된다")
    void noticeHiddenJustAfterKstExpiry() {
        stubClubScopedNotice();
        // KST 만료 1분 뒤 = UTC 벽시계로는 만료 8시간 59분 전 — 무클럭 now() 였다면 노출됐을 시각.
        Clock kstJustAfterExpiry = Clock.fixed(
                expiresAt.plusMinutes(1).atZone(SEOUL).toInstant(), SEOUL);

        assertThrows(NoticeException.NoticeAccessDeniedException.class,
                () -> serviceWithClock(kstJustAfterExpiry).getClubScopedForMember(CLUB_ID, NOTICE_ID));
    }

    private void stubClubScopedNotice() {
        Notice notice = mock(Notice.class);
        when(notice.getId()).thenReturn(NOTICE_ID);
        when(notice.getOwningClubId()).thenReturn(CLUB_ID);
        when(notice.getVisibility()).thenReturn(NoticeVisibility.CLUB_SCOPED);
        when(notice.getClubScopeRole()).thenReturn(NoticeClubScopeRole.ALL_MEMBERS);
        when(notice.getExpiresAt()).thenReturn(expiresAt);
        when(noticeRepository.findById(NOTICE_ID)).thenReturn(Optional.of(notice));

        NoticeTargetClub targetClub = mock(NoticeTargetClub.class);
        when(targetClub.getClubId()).thenReturn(CLUB_ID);
        when(targetClubRepository.findAllByIdNoticeId(NOTICE_ID)).thenReturn(List.of(targetClub));
    }

    private GeneralNoticeService serviceWithClock(Clock fixedClock) {
        return new GeneralNoticeService(
                noticeRepository,
                targetClubRepository,
                mock(ClubRepository.class),
                mock(ClubMemberRepository.class),
                mock(NoticeBroadcaster.class),
                fixedClock);
    }
}
