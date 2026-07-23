package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.heroactivity.service.dto.command.UpdateHeroActivityCommand;
import jakarta.validation.constraints.Size;

/** 전부 미지정(null) 은 미변경 — 서비스가 부분 수정으로 처리한다. */
public record UpdateHeroActivityRequest(
        Long clubPhotoId,

        @Size(max = 30, message = "제목은 30자 이하여야 합니다.")
        String title,

        @Size(max = 80, message = "설명은 80자 이하여야 합니다.")
        String description
) {
    public UpdateHeroActivityCommand toCommand(Long clubId, Long requesterId, Long heroActivityId) {
        return new UpdateHeroActivityCommand(
                clubId, requesterId, heroActivityId, clubPhotoId, title, description);
    }
}
