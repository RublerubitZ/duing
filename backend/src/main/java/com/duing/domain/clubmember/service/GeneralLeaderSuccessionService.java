package com.duing.domain.clubmember.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.clubmember.service.dto.query.ClubMemberHistoryAdminQuery;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestAdminDetailQuery;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestAdminSummaryQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralLeaderSuccessionService implements LeaderSuccessionService {

    private final LeaderSuccessionRequestRepository requestRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final ClubRepository clubRepository;
    private final ClubMemberHistoryRepository historyRepository;
    private final UserRepository userRepository;
    private final ClubMemberHistoryRecorder historyRecorder;
    private final EntityManager entityManager;

    @Override
    @Transactional
    public Long create(CreateSuccessionCommand command) {
        // 운영 행위 게이트(Part C · D5) — 승계 요청은 멤버 관리 운영 행위이므로 ClubAuthService 단일
        // 진입점으로 멤버십·OFFICER 역할·동아리 ACTIVE 상태를 함께 검증한다 (비 ACTIVE 는 403).
        // 클럽 미존재·비멤버·비-OFFICER 직접 판정(404/400)은 게이트의 NotAMember/AccessDenied(403) 로
        // 통일된다 — ClubAuthService 의 가드 응답 일관성 하드닝과 동일한 계약.
        ClubMember requester = clubAuthService.requireOfficer(command.requesterUserId(), command.clubId());
        // 게이트가 OFFICER 역할을 이미 보장하지만, "승계 요청은 OFFICER 만 제출" 도메인 불변식은
        // 게이트 의미론과 독립적으로 유지한다 (게이트 완화 시 2차 방어선).
        if (requester.getRole() != ClubMemberRole.OFFICER) {
            throw new ClubMemberException.SuccessionRequiresOfficer();
        }
        requestRepository.findByClubIdAndStatus(command.clubId(), SuccessionStatus.PENDING)
                .ifPresent(existing -> { throw new ClubMemberException.DuplicatePendingSuccession(); });

        try {
            return requestRepository.save(LeaderSuccessionRequest.create(
                    command.clubId(), command.requesterUserId(), command.reason()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubMemberException.DuplicatePendingSuccession();
        }
    }

    @Override
    @Transactional
    public void process(ProcessSuccessionCommand command) {
        LeaderSuccessionRequest preview = requestRepository.findById(command.requestId())
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);

        if (command.status() == SuccessionStatus.REJECTED) {
            preview.process(command.handlerAdminId(), SuccessionStatus.REJECTED, command.actionNote());
            // REJECTED 경로는 락도 재조회도 없어 stale entity 의 in-memory terminal 체크만으로 UPDATE 를 쏜다.
            // 다른 운영진이 먼저 APPROVED 처리해 club_member 권한을 이전한 뒤 이 REJECTED UPDATE 가
            // status='REJECTED' 로 덮어쓰면 정합성이 깨진다. @Version 기반 OptimisticLock 충돌을
            // 현재 트랜잭션 안에서 잡아 도메인 예외(409) 로 변환한다.
            try {
                requestRepository.flush();
            } catch (ObjectOptimisticLockingFailureException concurrentProcess) {
                throw new ClubMemberException.ConcurrentSuccessionUpdateException();
            }
            return;
        }

        // findByIdForUpdate 가 최신 DB 상태를 가져오도록 1차 캐시 비우기 (transferLeader 패턴 동일).
        Long requestId = preview.getId();
        Long clubId = preview.getClubId();
        Long requesterUserId = preview.getRequesterUserId();
        entityManager.clear();

        LeaderSuccessionRequest request = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);

        ClubMember currentLeader = clubMemberRepository
                .findByClubIdAndRoleForUpdate(clubId, ClubMemberRole.LEADER)
                .orElseThrow(ClubMemberException.SuccessionLeaderAbsent::new);
        ClubMember requesterMember = clubMemberRepository
                .findByClubIdAndUserIdForUpdate(clubId, requesterUserId)
                .orElseThrow(ClubMemberException.SuccessionRequesterNoLongerOfficer::new);

        if (requesterMember.getRole() != ClubMemberRole.OFFICER) {
            throw new ClubMemberException.SuccessionRequesterNoLongerOfficer();
        }

        currentLeader.changeRole(ClubMemberRole.MEMBER);
        requesterMember.changeRole(ClubMemberRole.LEADER);

        historyRecorder.record(
                clubId, currentLeader.getUser().getId(), command.handlerAdminId(),
                ClubMemberEventType.SUCCESSION_APPROVED,
                ClubMemberRole.LEADER, ClubMemberRole.MEMBER, command.actionNote());
        historyRecorder.record(
                clubId, requesterMember.getUser().getId(), command.handlerAdminId(),
                ClubMemberEventType.SUCCESSION_APPROVED,
                ClubMemberRole.OFFICER, ClubMemberRole.LEADER, command.actionNote());

        request.process(command.handlerAdminId(), SuccessionStatus.APPROVED, command.actionNote());

        // APPROVED 경로도 @Version 보호 대상이 되도록 마무리 flush + 좁은 catch.
        // PESSIMISTIC_WRITE 가 1차 방어이고 OptimisticLock 은 2차 안전망 — 새 진입 경로가
        // 추가되거나 락 범위 밖에서 request 가 갱신되는 케이스에서도 정합성을 보장한다.
        try {
            requestRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentProcess) {
            throw new ClubMemberException.ConcurrentSuccessionUpdateException();
        }
    }

    @Override
    public LeaderSuccessionRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);
    }

    @Override
    public Page<SuccessionRequestAdminSummaryQuery> listForAdmin(
            SuccessionAdminSearchCondition condition, Pageable pageable
    ) {
        Page<LeaderSuccessionRequest> page = requestRepository.searchForAdmin(condition, pageable);

        // 페이지 내 clubId / requesterUserId 를 한 번에 조회해 N+1 회피
        List<Long> clubIds = page.stream()
                .map(LeaderSuccessionRequest::getClubId)
                .distinct()
                .collect(Collectors.toList());
        List<Long> requesterUserIds = page.stream()
                .map(LeaderSuccessionRequest::getRequesterUserId)
                .distinct()
                .collect(Collectors.toList());

        Map<Long, String> clubNameById = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName));
        Map<Long, String> userNameById = userRepository.findAllById(requesterUserIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));

        return page.map(request -> {
            String clubName = clubNameById.getOrDefault(request.getClubId(), AdminLabels.DELETED);
            String requesterName = userNameById.getOrDefault(
                    request.getRequesterUserId(), AdminLabels.DELETED);
            SuccessionRequestAdminSummaryQuery.UserRef requesterRef =
                    new SuccessionRequestAdminSummaryQuery.UserRef(
                            request.getRequesterUserId(), requesterName);
            return SuccessionRequestAdminSummaryQuery.of(request, clubName, requesterRef);
        });
    }

    @Override
    public SuccessionRequestAdminDetailQuery getDetailForAdmin(Long requestId) {
        LeaderSuccessionRequest request = requestRepository.findById(requestId)
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);

        // 동아리 참조 — 삭제된 경우 DELETED 라벨로 대체
        SuccessionRequestAdminDetailQuery.ClubRef clubRef = clubRepository.findById(request.getClubId())
                .map(club -> new SuccessionRequestAdminDetailQuery.ClubRef(club.getId(), club.getName()))
                .orElse(new SuccessionRequestAdminDetailQuery.ClubRef(
                        request.getClubId(), AdminLabels.DELETED));

        // 요청자 참조 — 삭제된 경우 null 처리
        SuccessionRequestAdminDetailQuery.UserRef requesterRef =
                userRepository.findById(request.getRequesterUserId())
                        .map(user -> new SuccessionRequestAdminDetailQuery.UserRef(
                                user.getId(), user.getName()))
                        .orElse(null);

        // 현재 회장 참조 — 존재하지 않으면 null (회장 공석 가능)
        SuccessionRequestAdminDetailQuery.UserRef currentLeaderRef =
                clubMemberRepository.findFirstByClubIdAndRole(request.getClubId(), ClubMemberRole.LEADER)
                        .map(member -> new SuccessionRequestAdminDetailQuery.UserRef(
                                member.getUser().getId(), member.getUser().getName()))
                        .orElse(null);

        // 처리자 참조 — 미처리이거나 처리자가 삭제된 경우 null
        SuccessionRequestAdminDetailQuery.UserRef handlerRef = null;
        if (request.getHandledBy() != null) {
            handlerRef = userRepository.findById(request.getHandledBy())
                    .map(user -> new SuccessionRequestAdminDetailQuery.UserRef(
                            user.getId(), user.getName()))
                    .orElse(null);
        }

        return SuccessionRequestAdminDetailQuery.of(
                request, clubRef, requesterRef, currentLeaderRef, handlerRef);
    }

    @Override
    @Transactional
    public void cancelPendingOnClubClosure(Long clubId, Long actorAdminId, String reason) {
        requestRepository.findByClubIdAndStatus(clubId, SuccessionStatus.PENDING)
                .ifPresent(request -> request.process(actorAdminId, SuccessionStatus.REJECTED, reason));
    }

    @Override
    public Page<ClubMemberHistoryAdminQuery> listMemberHistoryForAdmin(
            Long clubId, Pageable pageable
    ) {
        // 동아리가 존재하지 않으면 ClubNotFoundException(404) — PR3-2 에서 NotFound → ClubNotFoundException 변경
        if (!clubRepository.existsById(clubId)) {
            throw new ClubException.ClubNotFoundException();
        }

        Page<ClubMemberHistory> page =
                historyRepository.findByClubIdOrderByCreatedAtDesc(clubId, pageable);

        // 페이지 내 targetUserId / actorUserId 를 한 번에 조회해 N+1 회피
        Set<Long> userIds = page.stream()
                .flatMap(history -> Stream.of(history.getTargetUserId(), history.getActorUserId()))
                .collect(Collectors.toSet());
        Map<Long, String> userNameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));

        return page.map(history -> {
            ClubMemberHistoryAdminQuery.UserRef targetRef = new ClubMemberHistoryAdminQuery.UserRef(
                    history.getTargetUserId(),
                    userNameById.getOrDefault(history.getTargetUserId(), AdminLabels.DELETED));
            ClubMemberHistoryAdminQuery.UserRef actorRef = new ClubMemberHistoryAdminQuery.UserRef(
                    history.getActorUserId(),
                    userNameById.getOrDefault(history.getActorUserId(), AdminLabels.DELETED));
            return new ClubMemberHistoryAdminQuery(
                    history.getId(), history.getEventType(), targetRef, actorRef,
                    history.getFromRole(), history.getToRole(),
                    history.getReason(), history.getCreatedAt());
        });
    }
}
