package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateClubNoticeRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "요약은 500자 이하여야 합니다.") String summary,
        @Size(max = 20000, message = "본문은 20000자 이하여야 합니다.") String content,
        @Size(max = 500, message = "표지 이미지 URL 은 500자 이하여야 합니다.") String coverImageUrl,
        Boolean pinned,
        LocalDateTime expiresAt
) {
    public UpdateClubNoticeCommand toCommand(Long clubId, Long noticeId) {
        return new UpdateClubNoticeCommand(clubId, noticeId, title, summary, content,
                coverImageUrl, pinned, expiresAt);
    }
}
