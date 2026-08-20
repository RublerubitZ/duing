package com.duing.domain.notification.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecruitmentOpenedNotificationTest {

    @Test
    @DisplayName("기간모집 오픈 알림은 찜한 동아리 이름을 제목에, 모집 제목과 '마감 {날짜}' 를 본문에 담고 동아리 상세로 링크된다")
    void assemblesCommandForRecruitmentWithEndDate() {
        CreateNotificationCommand command = RecruitmentOpenedNotification.commandFor(
                7L,
                new RecruitmentOpenedEvent(42L, 3L, "두잉동아리", "2026 봄 모집", LocalDate.of(2026, 6, 30)));

        assertThat(command.userId()).isEqualTo(7L);
        assertThat(command.type()).isEqualTo(NotificationType.RECRUITMENT_OPENED);
        assertThat(command.title()).isEqualTo("찜한 두잉동아리의 새 모집이 시작됐어요");
        assertThat(command.body()).isEqualTo("2026 봄 모집 · 마감 2026-06-30");
        assertThat(command.linkUrl()).isEqualTo("/clubs/3");
        assertThat(command.payload())
                .isEqualTo(Map.of("recruitmentId", 42L, "clubId", 3L));
        // dedupKey 는 리스너·배치 두 경로가 서로의 발송을 흡수하는 유일한 계약이다.
        // 형식이 한 글자라도 바뀌면 배치가 리스너 발송분을 못 알아보고 전량 재발송한다.
        assertThat(command.dedupKey()).isEqualTo("RECRUITMENT_OPENED:r=42");
    }

    @Test
    @DisplayName("마감일이 없는 상시모집 오픈 알림은 본문 마감 라벨이 '상시 모집' 이 되고 나머지 필드는 동일하게 조립된다")
    void assemblesCommandForAlwaysOpenRecruitment() {
        CreateNotificationCommand command = RecruitmentOpenedNotification.commandFor(
                11L,
                new RecruitmentOpenedEvent(58L, 9L, "상시동아리", "상시 신입 모집", null));

        assertThat(command.userId()).isEqualTo(11L);
        assertThat(command.type()).isEqualTo(NotificationType.RECRUITMENT_OPENED);
        assertThat(command.title()).isEqualTo("찜한 상시동아리의 새 모집이 시작됐어요");
        assertThat(command.body()).isEqualTo("상시 신입 모집 · 상시 모집");
        assertThat(command.body()).doesNotContain("null");
        assertThat(command.linkUrl()).isEqualTo("/clubs/9");
        assertThat(command.payload())
                .isEqualTo(Map.of("recruitmentId", 58L, "clubId", 9L));
        assertThat(command.dedupKey()).isEqualTo("RECRUITMENT_OPENED:r=58");
    }
}
