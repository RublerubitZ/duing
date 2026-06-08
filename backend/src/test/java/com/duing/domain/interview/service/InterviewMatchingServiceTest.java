package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.MatchingInput;
import com.duing.domain.interview.service.dto.MatchingInput.ApplicantSelection;
import com.duing.domain.interview.service.dto.MatchingInput.SlotState;
import com.duing.domain.interview.service.dto.MatchingResult;
import com.duing.domain.interview.service.dto.MatchingResult.Assignment;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class InterviewMatchingServiceTest {

    private final InterviewMatchingService service = new InterviewMatchingService();

    private static final LocalDateTime T1 = LocalDateTime.parse("2026-03-20T09:00");
    private static final LocalDateTime T2 = LocalDateTime.parse("2026-03-20T10:00");
    private static final LocalDateTime T3 = LocalDateTime.parse("2026-03-20T11:00");

    @Test
    @DisplayName("선택 슬롯 수가 적은 지원자가 먼저 배정된다")
    void leastFlexibleFirst() {
        // 지원자 A: 슬롯 1개 선택(슬롯100) — 유연성 낮음 → 먼저 배정 대상
        // 지원자 B: 슬롯 2개 선택(슬롯100, 슬롯101) — 나중에 배정
        // 슬롯100의 capacity=1 이므로 A가 선점하면 B는 슬롯101로 배정
        SlotState slot100 = new SlotState(100L, T1, 1);
        SlotState slot101 = new SlotState(101L, T2, 1);

        ApplicantSelection applicantA = new ApplicantSelection(1L, Set.of(100L));
        ApplicantSelection applicantB = new ApplicantSelection(2L, Set.of(100L, 101L));

        MatchingInput input = new MatchingInput(List.of(applicantB, applicantA), List.of(slot100, slot101));
        MatchingResult result = service.match(input);

        assertThat(result.assigned()).contains(
                new Assignment(1L, 100L),
                new Assignment(2L, 101L)
        );
        assertThat(result.unassignedApplicationIds()).isEmpty();
    }

    @Test
    @DisplayName("동일한 슬롯 후보 중 현재 배정 수가 가장 적은 슬롯이 선택된다")
    void fewestAssignedSlotIsChosen() {
        // 슬롯200은 capacity=2, 슬롯201은 capacity=2
        // 지원자 1이 먼저 슬롯200에 배정됨 (startTime이 같으면 slotId 오름차순)
        // 지원자 2도 두 슬롯 모두 선택 가능 → 슬롯200(count=1) vs 슬롯201(count=0) → 슬롯201 선택
        SlotState slot200 = new SlotState(200L, T1, 2);
        SlotState slot201 = new SlotState(201L, T1, 2);

        ApplicantSelection applicant1 = new ApplicantSelection(1L, Set.of(200L, 201L));
        ApplicantSelection applicant2 = new ApplicantSelection(2L, Set.of(200L, 201L));

        MatchingInput input = new MatchingInput(List.of(applicant1, applicant2), List.of(slot200, slot201));
        MatchingResult result = service.match(input);

        // applicant1 → slotId=200(count=0, tiebreak slotId 오름차순)
        // applicant2 → slotId=201(count=0, 이제 slot200은 count=1)
        assertThat(result.assigned()).hasSize(2);
        List<Long> assignedSlotIds = result.assigned().stream()
                .map(Assignment::slotId)
                .toList();
        // 두 지원자가 서로 다른 슬롯에 분배되어야 한다
        assertThat(assignedSlotIds).containsExactlyInAnyOrder(200L, 201L);
        assertThat(result.unassignedApplicationIds()).isEmpty();
    }

    @Test
    @DisplayName("배정 수가 동률이면 가장 빠른 시간의 슬롯이 선택된다")
    void tieBreakByEarliestStartTime() {
        // 슬롯300(T3), 슬롯301(T1) — 배정 수 동률(0) 시 T1이 더 빠름
        SlotState slotLate  = new SlotState(300L, T3, 2);
        SlotState slotEarly = new SlotState(301L, T1, 2);

        ApplicantSelection applicant = new ApplicantSelection(1L, Set.of(300L, 301L));

        MatchingInput input = new MatchingInput(List.of(applicant), List.of(slotLate, slotEarly));
        MatchingResult result = service.match(input);

        assertThat(result.assigned()).containsExactly(new Assignment(1L, 301L));
        assertThat(result.unassignedApplicationIds()).isEmpty();
    }

    @Test
    @DisplayName("capacity 가 모두 소진된 슬롯을 선택한 지원자는 미배정 결과에 포함된다")
    void applicantUnassignedWhenCapacityExhausted() {
        // 슬롯400: capacity=1
        // 지원자1 배정 후 capacity 소진 → 지원자2 미배정
        SlotState slot400 = new SlotState(400L, T1, 1);

        ApplicantSelection applicant1 = new ApplicantSelection(1L, Set.of(400L));
        ApplicantSelection applicant2 = new ApplicantSelection(2L, Set.of(400L));

        MatchingInput input = new MatchingInput(List.of(applicant1, applicant2), List.of(slot400));
        MatchingResult result = service.match(input);

        assertThat(result.assigned()).containsExactly(new Assignment(1L, 400L));
        assertThat(result.unassignedApplicationIds()).containsExactly(2L);
    }

    @Test
    @DisplayName("선택한 슬롯이 모두 만석이면 미배정으로 분류된다")
    void allSelectedSlotsFull_unassigned() {
        // 슬롯500, 슬롯501 모두 capacity=1, 지원자1,2 가 이미 각각 점유
        // 지원자3이 두 슬롯 모두 선택했지만 만석 → 미배정
        SlotState slot500 = new SlotState(500L, T1, 1);
        SlotState slot501 = new SlotState(501L, T2, 1);

        ApplicantSelection applicant1 = new ApplicantSelection(1L, Set.of(500L));
        ApplicantSelection applicant2 = new ApplicantSelection(2L, Set.of(501L));
        ApplicantSelection applicant3 = new ApplicantSelection(3L, Set.of(500L, 501L));

        MatchingInput input = new MatchingInput(
                List.of(applicant1, applicant2, applicant3),
                List.of(slot500, slot501)
        );
        MatchingResult result = service.match(input);

        assertThat(result.assigned()).containsExactlyInAnyOrder(
                new Assignment(1L, 500L),
                new Assignment(2L, 501L)
        );
        assertThat(result.unassignedApplicationIds()).containsExactly(3L);
    }

    @Test
    @DisplayName("동일 입력에 대해 매칭 결과는 항상 동일하다")
    void deterministicResult() {
        SlotState slot600 = new SlotState(600L, T1, 2);
        SlotState slot601 = new SlotState(601L, T2, 2);

        ApplicantSelection applicant1 = new ApplicantSelection(1L, Set.of(600L, 601L));
        ApplicantSelection applicant2 = new ApplicantSelection(2L, Set.of(600L, 601L));
        ApplicantSelection applicant3 = new ApplicantSelection(3L, Set.of(600L));

        MatchingInput input = new MatchingInput(
                List.of(applicant1, applicant2, applicant3),
                List.of(slot600, slot601)
        );

        MatchingResult firstRun  = service.match(input);
        MatchingResult secondRun = service.match(input);

        assertThat(firstRun.assigned()).isEqualTo(secondRun.assigned());
        assertThat(firstRun.unassignedApplicationIds()).isEqualTo(secondRun.unassignedApplicationIds());
    }

    @Test
    @DisplayName("단일 슬롯에 capacity 만큼만 배정되고 나머지는 미배정된다")
    void capacityLimitRespected() {
        // 슬롯700: capacity=2, 지원자 5명 모두 이 슬롯만 선택
        SlotState slot700 = new SlotState(700L, T1, 2);

        List<ApplicantSelection> applicants = List.of(
                new ApplicantSelection(1L, Set.of(700L)),
                new ApplicantSelection(2L, Set.of(700L)),
                new ApplicantSelection(3L, Set.of(700L)),
                new ApplicantSelection(4L, Set.of(700L)),
                new ApplicantSelection(5L, Set.of(700L))
        );

        MatchingInput input = new MatchingInput(applicants, List.of(slot700));
        MatchingResult result = service.match(input);

        assertThat(result.assigned()).hasSize(2);
        assertThat(result.unassignedApplicationIds()).hasSize(3);
        // 모든 배정은 슬롯700 이어야 한다
        assertThat(result.assigned()).allMatch(a -> a.slotId().equals(700L));
    }

    @Test
    @DisplayName("입력에 존재하지 않는 slotId만 선택한 지원자는 미배정 목록에 포함된다")
    void applicantWithNoValidSlots_notInResult() {
        // 지원자1: 슬롯800 선택(입력에 존재하지 않는 slotId) → slotById.get() 이 null 반환 → 미배정
        // 지원자2: 슬롯801 정상 배정
        SlotState slot801 = new SlotState(801L, T1, 1);

        ApplicantSelection applicantWithUnknownSlot = new ApplicantSelection(1L, Set.of(800L));
        ApplicantSelection applicantWithValidSlot   = new ApplicantSelection(2L, Set.of(801L));

        MatchingInput input = new MatchingInput(
                List.of(applicantWithUnknownSlot, applicantWithValidSlot),
                List.of(slot801)
        );
        MatchingResult result = service.match(input);

        // 지원자2는 정상 배정, 지원자1은 미배정
        assertThat(result.assigned()).containsExactly(new Assignment(2L, 801L));
        assertThat(result.unassignedApplicationIds()).containsExactly(1L);
    }
}
