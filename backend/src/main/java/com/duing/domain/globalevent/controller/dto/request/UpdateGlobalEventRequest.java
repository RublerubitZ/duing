package com.duing.domain.globalevent.controller.dto.request;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateGlobalEventRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location,
        // 빈 문자열은 "linkUrl clear" 시맨틱 (description/location 과 일관). non-empty 일 때만 http(s) regex enforce.
        @Pattern(regexp = "^$|^https?://.+$", message = "링크는 http:// 또는 https:// 로 시작해야 합니다.")
        @Size(max = 500, message = "링크는 500자 이하여야 합니다.") String linkUrl,
        GlobalEventCategory category,
        @Size(max = 500, message = "이미지 URL은 500자 이하여야 합니다.")
        String coverImageUrl,
        Boolean clearCoverImage
) {
    public UpdateGlobalEventCommand toCommand(Long eventId) {
        return new UpdateGlobalEventCommand(
                eventId, title, description, startAt, endAt,
                location, linkUrl, category,
                coverImageUrl, clearCoverImage
        );
    }
}
