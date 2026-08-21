package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record RoundDetailQuery(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        int requestSequence,
        boolean deadlinePassed,
        MemberCounts counts,
        List<MemberLine> members,
        List<SlotLine> slots
) {
    public record MemberCounts(
            long totalMemberCount,
            long invitedCount,
            long respondedCount,
            long noAvailableSlotCount,
            long assignedCount,
            long excludedCount,
            long unrespondedCount
    ) {}

    public record MemberLine(
            Long memberId,
            Long applicationId,
            String userName,
            String studentId,
            RoundMemberStatus status,
            boolean unresponded,
            String alternativeAvailabilityText,
            long selectedSlotCount,
            Long assignedSlotId
    ) {}

    public record SlotLine(
            Long slotId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            int capacity,
            long selectedCount,
            long assignedCount
    ) {}

    /**
     * 미응답은 저장하지 않는다 — INVITED && now > deadline 로 파생한다 (스펙 §5.3).
     * 운영진 dashboard 는 EXCLUDED 포함 raw 상태를 본다 (지원자 노출 술어 isVisibleToApplicant 와 무관 — §5.4).
     */
    public static RoundDetailQuery assemble(InterviewRound round,
                                            List<RoundMemberLine> memberLines,
                                            Map<Long, Long> selectionCountByApplicationId,
                                            Map<Long, Long> assignedSlotIdByApplicationId,
                                            List<InterviewSlot> slotEntities,
                                            Map<Long, Long> selectionCountBySlotId,
                                            Map<Long, Long> assignedCountBySlotId,
                                            LocalDateTime now) {
        boolean deadlinePassed = round.isAvailabilityDeadlinePassed(now);

        List<MemberLine> members = memberLines.stream()
                .map(line -> new MemberLine(
                        line.memberId(),
                        line.applicationId(),
                        line.userName(),
                        line.studentId(),
                        line.status(),
                        line.status().isUnresponded(deadlinePassed),
                        line.alternativeAvailabilityText(),
                        selectionCountByApplicationId.getOrDefault(line.applicationId(), 0L),
                        assignedSlotIdByApplicationId.get(line.applicationId())))
                .toList();

        long invited = countByStatus(memberLines, RoundMemberStatus.INVITED);
        long excluded = countByStatus(memberLines, RoundMemberStatus.EXCLUDED);
        MemberCounts counts = new MemberCounts(
                memberLines.size() - excluded,
                invited,
                countByStatus(memberLines, RoundMemberStatus.RESPONDED),
                countByStatus(memberLines, RoundMemberStatus.NO_AVAILABLE_SLOT),
                countByStatus(memberLines, RoundMemberStatus.ASSIGNED),
                excluded,
                deadlinePassed ? invited : 0L);

        List<SlotLine> slots = slotEntities.stream()
                .map(slot -> new SlotLine(
                        slot.getId(),
                        slot.getStartTime(),
                        slot.getEndTime(),
                        slot.getCapacity(),
                        selectionCountBySlotId.getOrDefault(slot.getId(), 0L),
                        assignedCountBySlotId.getOrDefault(slot.getId(), 0L)))
                .toList();

        return new RoundDetailQuery(round.getId(), round.getTitle(), round.getStatus(),
                round.getAvailabilityDeadline(), round.getLocation(), round.getRequestSequence(),
                deadlinePassed, counts, members, slots);
    }

    private static long countByStatus(List<RoundMemberLine> lines, RoundMemberStatus status) {
        return lines.stream().filter(line -> line.status() == status).count();
    }
}
