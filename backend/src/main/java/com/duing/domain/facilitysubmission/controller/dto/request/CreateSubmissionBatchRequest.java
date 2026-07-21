package com.duing.domain.facilitysubmission.controller.dto.request;

import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateSubmissionBatchRequest(
        @NotEmpty(message = "제출할 예약을 선택해주세요.")
        List<Long> bookingIds,
        @Size(max = 500, message = "메모는 500자 이하로 입력해주세요.")
        String memo
) {
    public CreateSubmissionBatchCommand toCommand() {
        return new CreateSubmissionBatchCommand(bookingIds, memo);
    }
}
