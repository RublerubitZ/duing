package com.duing.domain.clubevent.controller.dto.response;

import com.duing.domain.clubevent.repository.AdminClubEventRow;
import java.time.LocalDateTime;

/**
 * 총동연 캘린더에 표시되는 동아리 일정 카드.
 * 학생용 {@link ClubEventCardResponse} 와 달리 동아리명을 함께 싣는다(전 동아리 집계라 출처 표시가 필요).
 * 상세 정보(설명·작성자)는 노출하지 않는다.
 */
public record AdminClubEventCardResponse(
        Long id, Long clubId, String clubName, String title,
        LocalDateTime startAt, LocalDateTime endAt, String location
) {
    public static AdminClubEventCardResponse from(AdminClubEventRow eventRow) {
        return new AdminClubEventCardResponse(eventRow.eventId(), eventRow.clubId(), eventRow.clubName(),
                eventRow.title(), eventRow.startAt(), eventRow.endAt(), eventRow.location());
    }
}
