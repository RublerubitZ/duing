package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ClubMemberHistoryRecorder {

    private final ClubMemberHistoryRepository historyRepository;

    public void record(Long clubId, Long targetUserId, Long actorUserId,
                       ClubMemberEventType eventType,
                       ClubMemberRole fromRole, ClubMemberRole toRole,
                       String reason) {
        historyRepository.save(ClubMemberHistory.of(
                clubId, targetUserId, actorUserId, eventType, fromRole, toRole, reason));
    }
}
