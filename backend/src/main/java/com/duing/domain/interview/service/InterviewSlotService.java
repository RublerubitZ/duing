package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import com.duing.domain.interview.service.dto.query.SlotListView;
import java.util.List;

public interface InterviewSlotService {

    List<Long> createBulk(CreateInterviewSlotsCommand command);

    List<SlotListView> listByRecruitment(Long recruitmentId, Long actorUserId);

    void update(UpdateInterviewSlotCommand command);

    void delete(Long slotId, Long actorUserId);
}
