package com.duing.domain.facilitybooking.controller.dto.request;

import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;

public record CreateFacilityBookingRequest(
        @NotNull(message = "시설은 필수 입력값입니다.") Long facilityId,
        @NotNull(message = "예약 날짜는 필수 입력값입니다.") LocalDate date,
        @NotNull(message = "시작 시간은 필수 입력값입니다.") LocalTime startTime,
        @NotNull(message = "종료 시간은 필수 입력값입니다.") LocalTime endTime,
        @NotBlank(message = "사용 목적은 필수 입력값입니다.")
        @Size(max = 200, message = "사용 목적은 200자 이하로 입력해주세요.") String purpose,
        @Positive(message = "사용 인원은 1명 이상이어야 합니다.") Integer attendeeCount
) {
    public CreateFacilityBookingCommand toCommand(Long clubId, Long currentUserId) {
        return new CreateFacilityBookingCommand(clubId, currentUserId, facilityId,
                date, startTime, endTime, purpose, attendeeCount);
    }
}
