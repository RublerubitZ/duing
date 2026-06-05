package com.duing.domain.globalevent.controller.dto.request;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateGlobalEventRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,

        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,

        @NotNull(message = "시작 시각은 필수 입력값입니다.") LocalDateTime startAt,
        @NotNull(message = "종료 시각은 필수 입력값입니다.") LocalDateTime endAt,

        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location,

        @Pattern(regexp = "^https?://.+", message = "링크는 http:// 또는 https:// 로 시작해야 합니다.")
        @Size(max = 500, message = "링크는 500자 이하여야 합니다.") String linkUrl,

        @Size(max = 500, message = "이미지 URL은 500자 이하여야 합니다.")
        String coverImageUrl,

        @NotNull(message = "카테고리는 필수 입력값입니다.") GlobalEventCategory category
) {
    public CreateGlobalEventCommand toCommand(Long createdBy) {
        return new CreateGlobalEventCommand(
                createdBy, title, description, startAt, endAt,
                location, linkUrl, coverImageUrl, category
        );
    }
}
