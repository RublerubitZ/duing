package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateClubNoticeRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "요약은 500자 이하여야 합니다.") String summary,
        @NotBlank(message = "본문은 필수 입력값입니다.")
        @Size(max = 20000, message = "본문은 20000자 이하여야 합니다.") String content,
        @Size(max = 500, message = "표지 이미지 URL 은 500자 이하여야 합니다.") String coverImageUrl,
        Boolean pinned,
        LocalDateTime expiresAt
) {
    public CreateClubNoticeCommand toCommand(Long clubId, Long authorId) {
        return new CreateClubNoticeCommand(clubId, authorId, title, summary, content,
                coverImageUrl, pinned != null && pinned, expiresAt);
    }
}
