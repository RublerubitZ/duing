package com.duing.domain.interview.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.event.InterviewScheduledEvent;
import com.duing.domain.interview.event.InterviewUpdatedEvent;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.MatchingInput;
import com.duing.domain.interview.service.dto.MatchingResult;
import com.duing.domain.interview.service.dto.query.AutoAssignResult;
import com.duing.domain.interview.service.dto.query.ConfirmResult;
import com.duing.domain.interview.service.dto.query.RoundMemberLine;
import com.duing.domain.interview.service.dto.query.UnresolvedMembersPayload;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewAssignmentService implements InterviewAssignmentService {

    // 운영진 제외는 진행 중 라운드에서만 — 결과 확정 정리(releaseOnResultDecided)와 같은 집합이어야 한다.
    private static final Set<RoundStatus> EXCLUDABLE_ROUND_STATUSES = RoundStatus.inProgressSet();

    // §6.4 — ASSIGNING(draft 수동 배정)·SCHEDULED(확정 후 개별 재배정) 허용.
    // CANCELLED 는 집합에 없으므로 종결 상태가 새지 않는다.
    private static final Set<RoundStatus> ASSIGNABLE_ROUND_STATUSES =
            Set.of(RoundStatus.ASSIGNING, RoundStatus.SCHEDULED);

    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final ApplicationRepository applicationRepository;
    private final InterviewRoundAccessor interviewRoundAccessor;
    private final InterviewMatchingService interviewMatchingService;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Override
    @Transactional
    public AutoAssignResult autoAssign(Long roundId, Long currentUserId) {
        // round writer(자동배정·확정·취소) 간 직렬화 (스펙 §7). 인가 projection 이 404 를 먼저 판정하고
        // 잠금은 인가 뒤에 잡는다(#839) — projection 은 무잠금 SELECT 라 아래 잠금 순서에 들지 않는다.
        interviewRoundAccessor.requireManagerForWriteByRoundId(roundId, currentUserId);
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);

        if (round.getStatus() == RoundStatus.COLLECTING) {
            round.openAssigning();
        } else if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        // 잠금 순서: round → slots(id 순) → members(id 순) — 응답 API(application → slots → member)와
        // 자원 순서(슬롯 먼저, 멤버 나중)가 일치해 교착 사이클이 없다. 슬롯 잠금은 동시 capacity
        // 축소와의 race(정원 초과 배정)를 차단한다 — 축소 측은 잠금 획득 후 CapacityBelowAssigned 로 검증.
        List<InterviewSlot> lockedSlots = interviewSlotRepository.findAllByRoundIdForUpdate(roundId);

        List<InterviewRoundMember> respondedMembers = interviewRoundMemberRepository
                .findAllByRoundIdAndStatusForUpdate(roundId, RoundMemberStatus.RESPONDED);
        // 결과를 정한(합격·불합격) 응답자는 배정하지 않는다 — 결과 확정 정리(#1659) 전에 결과를 정한 멤버는 응답 완료로 남아 있다.
        // 지원서는 잠그지 않고 상태만 읽는다(수동 배정과 같은 이유). 겹치는 결과 확정은 멤버를 제외해 위 잠금 조회가 거르므로, 여기서 거르는 것은 이미 커밋된 결과뿐이다.
        Set<Long> undecidedApplicationIds = Set.copyOf(applicationRepository.findIdsByIdInAndStatusIn(
                respondedMembers.stream().map(InterviewRoundMember::getApplicationId).toList(),
                ApplicationStatus.activeSet()));

        Map<Long, Set<Long>> selectedSlotIdsByApplicationId = interviewAvailabilityRepository
                .findByRoundId(roundId).stream()
                .collect(Collectors.groupingBy(InterviewAvailability::getApplicationId,
                        Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toSet())));

        MatchingInput matchingInput = new MatchingInput(
                respondedMembers.stream()
                        .filter(member -> undecidedApplicationIds.contains(member.getApplicationId()))
                        .map(member -> new MatchingInput.ApplicantSelection(
                                member.getApplicationId(),
                                selectedSlotIdsByApplicationId.getOrDefault(
                                        member.getApplicationId(), Set.of())))
                        .toList(),
                lockedSlots.stream()
                        .sorted(Comparator.comparing(InterviewSlot::getStartTime))
                        .map(slot -> new MatchingInput.SlotState(
                                slot.getId(), slot.getStartTime(), slot.getCapacity()))
                        .toList());

        // 재실행 교체 (§6.2) — 첫 실행에선 no-op 라 분기하지 않는다.
        interviewScheduleRepository.softDeleteByRoundId(roundId);

        MatchingResult matchingResult = interviewMatchingService.match(matchingInput);

        LocalDateTime now = LocalDateTime.now(clock);
        interviewScheduleRepository.saveAll(matchingResult.assigned().stream()
                .map(assignment -> InterviewSchedule.create(
                        assignment.applicationId(), assignment.slotId(), roundId, now))
                .toList());

        return new AutoAssignResult(
                matchingResult.assigned().size(),
                matchingResult.unassignedApplicationIds().size());
    }

    @Override
    @Transactional
    public void assignSchedule(Long roundId, Long memberId, Long slotId, RoundStatus expectedRoundStatus,
                               Long currentUserId) {
        // 잠금 순서 §16-7-4: round → slot → member.
        interviewRoundAccessor.requireManagerForWriteByRoundId(roundId, currentUserId);
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        // 잠금 조회로 읽은 단계와 비교한다(앞에서 라운드 엔티티를 읽지 않는다) — 화면을 연 뒤 확정·취소된 라운드를 낡은 화면이 바꾸지 않게.
        if (expectedRoundStatus != null && expectedRoundStatus != round.getStatus()) {
            throw new InterviewException.RoundStatusChanged();
        }
        // SCHEDULED 재배정 성공 시 INTERVIEW_UPDATED 알림 발행 (메서드 마지막).
        if (!ASSIGNABLE_ROUND_STATUSES.contains(round.getStatus())) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        InterviewSlot slot = interviewSlotRepository.findByIdAndRoundIdForUpdate(slotId, roundId)
                .orElseThrow(InterviewException.InvalidSlotSelection::new);
        InterviewRoundMember member = getLockedMemberOfRound(roundId, memberId);
        // 결과를 정한 지원은 일정을 바꾸지 않는다 — 확정 라운드는 결과 확정 정리 대상이 아니라 ASSIGNED 로 남는다(#1659).
        // 지원서는 잠그지 않는다: 결과 확정(지원서 → 멤버)·응답 API(지원서 → 슬롯)가 지원서를 먼저 잠가, 슬롯·멤버를 쥔 채 잠그면 교착이다.
        // 잠그지 않아도 되는 이유 — 배정 검토는 결과 확정이 멤버 잠금을 기다렸다가 정리하고, 확정 단계는 커밋 뒤 리스너가 알림을 거른다.
        if (applicationRepository.findStatusById(member.getApplicationId())
                .filter(ApplicationStatus::isTerminal)
                .isPresent()) {
            throw new InterviewException.ApplicationAlreadyDecided();
        }
        if (member.getStatus() == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }

        Optional<InterviewSchedule> activeSchedule = interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, member.getApplicationId(),
                        InterviewScheduleStatus.ASSIGNED);
        // 지금 배정과 같은 슬롯이면 바꿀 것이 없다 — 지웠다 다시 만들면 확정 단계에서 지원자에게 일정 변경 알림이 나간다.
        if (activeSchedule.filter(schedule -> schedule.getSlotId().equals(slotId)).isPresent()) {
            return;
        }
        // 삭제는 count 앞 — count 쿼리의 자동 flush 가 soft delete 를 INSERT 보다 먼저 보낸다(활성 배정 유니크 uq_interview_schedule_active_per_round).
        activeSchedule.ifPresent(interviewScheduleRepository::delete);
        long assignedCount = interviewScheduleRepository
                .countBySlotIdAndStatus(slotId, InterviewScheduleStatus.ASSIGNED);
        if (assignedCount >= slot.getCapacity()) {
            throw new InterviewException.SlotCapacityExceeded();
        }
        interviewScheduleRepository.save(InterviewSchedule.create(
                member.getApplicationId(), slotId, roundId, LocalDateTime.now(clock)));

        // SCHEDULED 재배정 — 확정 완료된 지원자에게 변경 알림 발행 (§6.4·§8).
        // ASSIGNING 의 수동 배정은 draft 단계이므로 알림을 보내지 않는다.
        // AFTER_COMMIT 리스너가 처리하므로 롤백 시 알림은 발송되지 않는다 (BE#11 전례).
        if (round.getStatus() == RoundStatus.SCHEDULED) {
            eventPublisher.publishEvent(new InterviewUpdatedEvent(
                    member.getApplicationId(), slotId, round.getRecruitmentId()));
        }
    }

    @Override
    @Transactional
    public void unassignSchedule(Long roundId, Long memberId, Long currentUserId) {
        interviewRoundAccessor.requireManagerForWriteByRoundId(roundId, currentUserId);
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        // 멤버 행을 쓰지 않으므로 멤버 잠금은 불요 — 존재·소속 검증만 한다.
        InterviewRoundMember member = interviewRoundMemberRepository.findById(memberId)
                .filter(found -> found.getRoundId().equals(roundId))
                .orElseThrow(InterviewException.MemberNotFound::new);
        InterviewSchedule schedule = interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, member.getApplicationId(),
                        InterviewScheduleStatus.ASSIGNED)
                .orElseThrow(InterviewException.ScheduleNotFound::new);
        interviewScheduleRepository.delete(schedule);
    }

    @Override
    @Transactional
    public void excludeMember(Long roundId, Long memberId, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → member. round 잠금이 자동배정 재실행·향후 확정/취소와
        // 직렬화하고, 멤버 잠금(§16-7-2)이 동시 "배정 vs 제외" 의 잔존 배정을 차단한다.
        interviewRoundAccessor.requireManagerForWriteByRoundId(roundId, currentUserId);
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        if (!EXCLUDABLE_ROUND_STATUSES.contains(round.getStatus())) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        InterviewRoundMember member = getLockedMemberOfRound(roundId, memberId);
        member.exclude();
        // §16-3 — 누락 시 제외된 지원자에게 리마인더가 발송되고 dashboard 에 배정이 잔존한다.
        removeActiveSchedule(roundId, member.getApplicationId());
    }

    @Override
    @Transactional
    public void releaseAllOnWithdrawal(Long userId) {
        // 멤버 행만 id 순으로 잠근다 — 라운드 writer 는 round → (slots →) members 순이고 이 경로는 round·slot 을
        // 잡지 않는다. 순서가 엇갈리는 곳은 둘이다: 지원자 본인의 가능 시간 응답(availability → member), 그리고 동아리
        // 폐쇄(schedule → club_member — 탈퇴는 club_member 를 먼저 잡고 schedule 은 그 뒤 flush 때 쓴다). 둘 다 같은 사람·
        // 같은 동아리에서 동시에 일어나야만 맞물리고, 그때도 PostgreSQL 이 한쪽을 교착으로 끊어 남는 데이터는 없다.
        for (InterviewRoundMember member
                : interviewRoundMemberRepository.findAllOfUserInUncancelledRoundsForUpdate(userId)) {
            interviewAvailabilityRepository.softDeleteByRoundIdAndApplicationIdKeepingContext(
                    member.getRoundId(), member.getApplicationId());
            removeActiveSchedule(member.getRoundId(), member.getApplicationId());
            member.excludeOnWithdrawal();
        }
    }

    @Override
    @Transactional
    public void releaseOnResultDecided(Long applicationId) {
        // 잠금 순서: 지원서(호출자의 flush) → 멤버(id 순) — 응답 API(지원서 → 슬롯 → 멤버)와 같은 방향이고 라운드·슬롯은 잡지 않는다.
        for (InterviewRoundMember member : interviewRoundMemberRepository
                .findAllExcludableOfApplicationInRoundsForUpdate(
                        applicationId, RoundMemberStatus.excludableSet(), RoundStatus.inProgressSet())) {
            interviewAvailabilityRepository.softDeleteByRoundIdAndApplicationIdKeepingContext(
                    member.getRoundId(), member.getApplicationId());
            removeActiveSchedule(member.getRoundId(), member.getApplicationId());
            member.exclude();
        }
    }

    private InterviewRoundMember getLockedMemberOfRound(Long roundId, Long memberId) {
        return interviewRoundMemberRepository.findByIdAndRoundIdForUpdate(memberId, roundId)
                .orElseThrow(InterviewException.MemberNotFound::new);
    }

    private void removeActiveSchedule(Long roundId, Long applicationId) {
        interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, applicationId,
                        InterviewScheduleStatus.ASSIGNED)
                .ifPresent(interviewScheduleRepository::delete);
    }

    @Override
    @Transactional
    public ConfirmResult confirmRound(Long roundId, boolean force, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → members(전체). slot 잠금은 불요 — capacity 검증 없이 읽기만.
        interviewRoundAccessor.requireManagerForWriteByRoundId(roundId, currentUserId);
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        List<InterviewRoundMember> members =
                interviewRoundMemberRepository.findAllByRoundIdForUpdate(roundId);
        Map<Long, InterviewSchedule> scheduleByApplicationId = interviewScheduleRepository
                .findByRoundIdAndStatus(roundId, InterviewScheduleStatus.ASSIGNED).stream()
                .collect(Collectors.toMap(InterviewSchedule::getApplicationId, schedule -> schedule));

        List<InterviewRoundMember> confirmTargets = members.stream()
                .filter(member -> member.getStatus() != RoundMemberStatus.EXCLUDED)
                .filter(member -> scheduleByApplicationId.containsKey(member.getApplicationId()))
                .toList();
        List<InterviewRoundMember> unresolvedMembers = members.stream()
                .filter(member -> member.getStatus() != RoundMemberStatus.EXCLUDED)
                .filter(member -> !scheduleByApplicationId.containsKey(member.getApplicationId()))
                .toList();

        if (confirmTargets.isEmpty()) {
            throw new InterviewException.NothingToConfirm();
        }
        if (!unresolvedMembers.isEmpty() && !force) {
            throw new InterviewException.RoundHasUnresolvedMembers(
                    buildUnresolvedPayload(roundId, unresolvedMembers));
        }

        // force — 잔존 미처리 자동 EXCLUDED (§6.3). 미처리 = 활성 배정 미보유라 §16-3 정리 대상이 없다.
        unresolvedMembers.forEach(InterviewRoundMember::exclude);
        confirmTargets.forEach(InterviewRoundMember::confirmAssigned);
        round.confirm(Instant.now(clock));

        // 알림은 AFTER_COMMIT 리스너가 처리 — 롤백 시 발송되지 않는다 (기존 인프라 재사용).
        confirmTargets.forEach(member -> eventPublisher.publishEvent(new InterviewScheduledEvent(
                member.getApplicationId(),
                scheduleByApplicationId.get(member.getApplicationId()).getSlotId(),
                round.getRecruitmentId())));

        return new ConfirmResult(confirmTargets.size(), unresolvedMembers.size());
    }

    private UnresolvedMembersPayload buildUnresolvedPayload(
            Long roundId, List<InterviewRoundMember> unresolvedMembers) {
        Map<Long, String> nameByApplicationId = interviewRoundMemberRepository
                .findMemberLinesByRoundId(roundId).stream()
                .collect(Collectors.toMap(RoundMemberLine::applicationId, RoundMemberLine::userName));
        Map<Long, List<Long>> selectedSlotIdsByApplicationId = interviewAvailabilityRepository
                .findByRoundId(roundId).stream()
                .collect(Collectors.groupingBy(InterviewAvailability::getApplicationId,
                        Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toList())));

        return new UnresolvedMembersPayload(
                unresolvedMembers.stream()
                        .filter(member -> member.getStatus() != RoundMemberStatus.RESPONDED)
                        .map(member -> new UnresolvedMembersPayload.UnrespondedMember(
                                member.getApplicationId(),
                                nameByApplicationId.get(member.getApplicationId()),
                                member.getStatus()))
                        .toList(),
                unresolvedMembers.stream()
                        .filter(member -> member.getStatus() == RoundMemberStatus.RESPONDED)
                        .map(member -> new UnresolvedMembersPayload.RespondedUnassignedMember(
                                member.getApplicationId(),
                                nameByApplicationId.get(member.getApplicationId()),
                                selectedSlotIdsByApplicationId.getOrDefault(
                                        member.getApplicationId(), List.of())))
                        .toList());
    }
}
