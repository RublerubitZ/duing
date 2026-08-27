package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.RecordClubViewCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RecordClubViewRequest(
        @NotBlank(message = "방문자 키는 필수 입력값입니다.")
        @Size(max = 64, message = "방문자 키는 64자 이하여야 합니다.")
        String visitorKey
) {
    public RecordClubViewCommand toCommand(Long clubId, String clientIp) {
        return new RecordClubViewCommand(clubId, visitorKey, clientIp);
    }
}
