package com.duing.domain.joincode.controller.dto.request;

import com.duing.domain.joincode.service.dto.command.BulkApproveJoinRequestsCommand;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record BulkApproveJoinRequestsRequest(
        @NotEmpty(message = "가입 요청 ID 목록은 비어있을 수 없습니다.")
        @Size(max = 500, message = "한 번에 처리할 수 있는 가입 요청 수는 500건 이하입니다.")
        List<@NotNull Long> joinRequestIds
) {
    public BulkApproveJoinRequestsCommand toCommand(Long clubId, Long requesterId) {
        return new BulkApproveJoinRequestsCommand(clubId, joinRequestIds, requesterId);
    }
}
