package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.entity.RoundStatus;
import jakarta.validation.constraints.NotNull;

public record AssignScheduleRequest(
        @NotNull(message = "배정할 슬롯을 선택해야 합니다.")
        Long slotId,
        // 요청자가 화면에서 본 라운드 단계 — 다르면 409(낡은 배정 검토 화면이 확정 라운드를 재배정·알림하지 않게). 없으면 검사하지 않는다(옛 클라이언트).
        RoundStatus expectedRoundStatus
) {}
