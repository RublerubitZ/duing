package com.duing.domain.interview.repository;

import com.duing.domain.interview.service.dto.query.SlotListView;
import java.util.List;

public interface InterviewSlotRepositoryCustom {

    List<SlotListView> findSlotListViewByRecruitmentId(Long recruitmentId);
}
