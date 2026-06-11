package com.duing.domain.interview.service;

import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;

public interface InterviewSlotService {

    /**
     * 라운드에 슬롯을 일괄 생성한다 (DRAFT·COLLECTING 한정 — 스펙 §9.1 API 4).
     * COLLECTING && 마감 전이면 Rule 2: NO_AVAILABLE_SLOT 멤버를 INVITED 로 복귀시키고 재알림을 발화한다 (스펙 §5.5).
     */
    CreateInterviewSlotsResponse createSlots(CreateInterviewSlotsCommand createCommand);

    /**
     * 슬롯을 부분 수정한다. 시간은 아무도 선택하지 않은 슬롯만, 정원은 선택 여부와 무관하게 변경 가능.
     */
    void updateSlot(UpdateInterviewSlotCommand updateCommand);

    /**
     * 슬롯을 삭제한다 (soft delete). 선택한 지원자가 있으면 409.
     */
    void deleteSlot(Long slotId, Long currentUserId);
}
