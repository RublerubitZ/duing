package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.dto.query.RoundDetailQuery;
import java.time.LocalDateTime;
import java.util.List;

public record RoundDetailResponse(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        int requestSequence,
        boolean deadlinePassed,
        Counts counts,
        List<Member> members,
        List<Slot> slots
) {
    public record Counts(long totalMemberCount, long invitedCount, long respondedCount,
                         long noAvailableSlotCount, long assignedCount, long excludedCount,
                         long unrespondedCount) {
        public static Counts from(RoundDetailQuery.MemberCounts memberCounts) {
            return new Counts(memberCounts.totalMemberCount(), memberCounts.invitedCount(),
                    memberCounts.respondedCount(), memberCounts.noAvailableSlotCount(),
                    memberCounts.assignedCount(), memberCounts.excludedCount(),
                    memberCounts.unrespondedCount());
        }
    }

    public record Member(Long memberId, Long applicationId, String userName, String studentId,
                         RoundMemberStatus status, boolean unresponded,
                         String alternativeAvailabilityText, long selectedSlotCount, Long assignedSlotId) {
        public static Member from(RoundDetailQuery.MemberLine memberLine) {
            return new Member(memberLine.memberId(), memberLine.applicationId(),
                    memberLine.userName(), memberLine.studentId(), memberLine.status(),
                    memberLine.unresponded(), memberLine.alternativeAvailabilityText(),
                    memberLine.selectedSlotCount(), memberLine.assignedSlotId());
        }
    }

    public record Slot(Long slotId, LocalDateTime startTime, LocalDateTime endTime,
                       int capacity, long selectedCount, long assignedCount) {
        public static Slot from(RoundDetailQuery.SlotLine slotLine) {
            return new Slot(slotLine.slotId(), slotLine.startTime(), slotLine.endTime(),
                    slotLine.capacity(), slotLine.selectedCount(), slotLine.assignedCount());
        }
    }

    public static RoundDetailResponse from(RoundDetailQuery detailQuery) {
        return new RoundDetailResponse(
                detailQuery.roundId(), detailQuery.title(), detailQuery.status(),
                detailQuery.availabilityDeadline(), detailQuery.location(), detailQuery.requestSequence(),
                detailQuery.deadlinePassed(),
                Counts.from(detailQuery.counts()),
                detailQuery.members().stream().map(Member::from).toList(),
                detailQuery.slots().stream().map(Slot::from).toList());
    }
}
