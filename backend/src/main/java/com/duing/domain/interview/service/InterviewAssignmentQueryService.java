package com.duing.domain.interview.service;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewProgress;
import com.duing.domain.interview.service.dto.query.AssignedInterviewSlot;
import com.duing.domain.interview.service.dto.query.InterviewRoundBrief;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.duing.domain.interview.service.dto.query.ManagerInterviewSnapshot;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 지원서 화면이 필요로 하는 "면접 배정 read-model" 의 단일 조립 지점 —
 * 지원 목록(batch)·지원자 본인 상세·운영진 지원자 상세 세 화면이 쓰던 면접 조회 조합을 여기로 모은다.
 * 덕분에 application 도메인은 interview 리포지토리 5종을 직접 알 필요가 없다.
 *
 * <p>반환 타입은 모두 interview 도메인 소유 record 다 — 호출자는 결과를 자신의 표현으로 매핑한다
 * ({@link InterviewSlotTimeWindow} 와 동일한 관례). 반대 방향(interview → application) 의존은 두지 않는다.
 *
 * <p><b>트랜잭션 경계는 호출자의 것을 그대로 쓴다</b> — 세 진입점 모두 이미 readOnly 트랜잭션 안에서
 * 호출되므로 여기서 경계를 새로 선언할 이유가 없고, 선언하면 같은 조회가 호출자에 따라 다른 경계를
 * 갖게 된다 ({@link InterviewRoundAccessor}·ApplicationStatusChanger 와 동일한 판단).
 *
 * <p><b>면접 미사용 모집 가드는 호출자에 둔다</b> — "useInterview=false 면 면접 쿼리를 아예 쏘지 않는다"는
 * 계약은 모집 정보를 이미 들고 있는 호출자가 판정하는 것이 자연스럽고, 여기로 옮기면 모집을 다시
 * 읽는 왕복이 생긴다.
 */
@Component
@RequiredArgsConstructor
public class InterviewAssignmentQueryService {

    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewRoundMemberRepositoryCustom interviewRoundMemberRepository;
    private final Clock clock;

    /**
     * 응답 리스트 DTO 의 nested {@code interview} 채움용 batch 조회.
     * 지원 ID 다건을 한 번에 끌어와 N+1 을 회피한다 — InterviewReminderJob 패턴과 동일.
     * <ol>
     *   <li>application_id IN (...) AND status=ASSIGNED InterviewSchedule 일괄 조회</li>
     *   <li>대상 schedule 들의 slot_id / round_id 를 batch 로 join</li>
     *   <li>{@code InterviewRound.location} 이 비어 있어도 배정 자체는 그대로 노출 (location 만 null)</li>
     * </ol>
     * 결과 Map 에 키가 없는 application 은 호출 측에서 {@code null} 로 표현되어 "면접 미배정" 을 의미한다.
     */
    public Map<Long, AssignedInterviewSlot> findAssignedByApplicationIds(Collection<Long> applicationIds) {
        if (applicationIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<InterviewSchedule> assignedSchedules = interviewScheduleRepository
                .findByApplicationIdIn(applicationIds).stream()
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .toList();
        if (assignedSchedules.isEmpty()) {
            return Collections.emptyMap();
        }

        Set<Long> slotIds = assignedSchedules.stream()
                .map(InterviewSchedule::getSlotId)
                .collect(Collectors.toSet());
        Set<Long> roundIds = assignedSchedules.stream()
                .map(InterviewSchedule::getRoundId)
                .collect(Collectors.toSet());

        Map<Long, InterviewSlot> slotById = interviewSlotRepository.findAllById(slotIds).stream()
                .collect(Collectors.toMap(InterviewSlot::getId, Function.identity()));
        Map<Long, InterviewRound> roundById = interviewRoundRepository.findAllById(roundIds).stream()
                .collect(Collectors.toMap(InterviewRound::getId, Function.identity()));

        Map<Long, AssignedInterviewSlot> assignedByApplicationId = new HashMap<>();
        for (InterviewSchedule schedule : assignedSchedules) {
            InterviewSlot slot = slotById.get(schedule.getSlotId());
            if (slot == null) {
                continue;
            }
            InterviewRound round = roundById.get(schedule.getRoundId());
            String location = round == null ? null : round.getLocation();
            assignedByApplicationId.put(schedule.getApplicationId(), new AssignedInterviewSlot(
                    slot.getId(), slot.getStartTime(), slot.getEndTime(), location));
        }
        return assignedByApplicationId;
    }

    /**
     * 지원자 본인 상세의 면접 진행 상황 — 제출한 가능시간 수 + 마감 시각 + 현재 배정.
     * 마감 시각은 isVisibleToApplicant 술어(DRAFT 제외)를 사용해 발송 전 라운드 정보가 새지 않는다
     * (스펙 §5.4·§9.3).
     */
    public ApplicantInterviewProgress findApplicantProgress(Long applicationId) {
        long availabilityCount = interviewAvailabilityRepository.countByApplicationId(applicationId);
        LocalDateTime availabilityDeadline = interviewRoundRepository
                .findVisibleToApplicantRoundByApplicationId(applicationId)
                .map(InterviewRound::getAvailabilityDeadline)
                .orElse(null);
        AssignedInterviewSlot assigned = interviewScheduleRepository
                .findAssignedSlotByApplicationId(applicationId)
                .orElse(null);

        return new ApplicantInterviewProgress(
                Math.toIntExact(availabilityCount), availabilityDeadline, assigned);
    }

    /**
     * 운영진 지원자 상세의 면접 묶음 — 지원자가 선택한 가능시간 + 현재 배정 슬롯 + 라운드 요약.
     * <p>
     * InterviewSchedule 의 취소는 status 만 CANCELLED 로 바꾸는 도메인 취소이고 soft delete 가 아니므로,
     * 배정 조회는 status=ASSIGNED 조건을 명시한 쿼리를 쓴다. 배정 슬롯과 배정 면접(장소 포함)은
     * 같은 행에서 나오므로 한 번만 조회해 호출 측이 두 표현으로 나눠 담는다.
     */
    public ManagerInterviewSnapshot findManagerSnapshot(Long applicationId) {
        List<InterviewSlotTimeWindow> availabilities =
                interviewAvailabilityRepository.findAvailabilityItemsByApplicationId(applicationId);
        AssignedInterviewSlot assigned = interviewScheduleRepository
                .findAssignedSlotByApplicationId(applicationId)
                .orElse(null);
        return new ManagerInterviewSnapshot(availabilities, assigned, findRoundBrief(applicationId));
    }

    /**
     * 운영진 상세 카드의 면접 라운드 요약 단건 헬퍼.
     * placement-active 멤버십(§5.4 — DRAFT 포함, EXCLUDED·CANCELLED 제외)이 있으면 brief 를 채우고,
     * 없으면 null (= 대기열/선정 전) 을 반환한다.
     * <p>
     * {@code unresponded} 는 저장 필드가 아니라 파생값이다 — INVITED && now > availabilityDeadline.
     * availabilityDeadline 이 null 인 DRAFT 라운드는 마감이 미설정 상태이므로 unresponded 가 false.
     */
    private InterviewRoundBrief findRoundBrief(Long applicationId) {
        return interviewRoundMemberRepository
                .findPlacementActiveMembershipByApplicationId(applicationId)
                .map(membership -> {
                    InterviewRound round = membership.round();
                    RoundMemberStatus memberStatus = membership.member().getStatus();
                    boolean unresponded = membership.member()
                            .isUnresponded(round.isAvailabilityDeadlinePassed(LocalDateTime.now(clock)));
                    String alternativeText = memberStatus == RoundMemberStatus.NO_AVAILABLE_SLOT
                            ? membership.member().getAlternativeAvailabilityText()
                            : null;
                    return new InterviewRoundBrief(
                            round.getId(),
                            round.getTitle(),
                            round.getStatus(),
                            memberStatus,
                            unresponded,
                            alternativeText);
                })
                .orElse(null);
    }
}
