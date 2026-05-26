package com.duing.domain.club.service;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRequestRepository;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.duing.domain.club.service.dto.query.RecertificationRequestAdminDetailQuery;
import com.duing.domain.club.service.dto.query.RecertificationRequestAdminSummaryQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberHistoryAdminQuery;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecertificationRequestService implements RecertificationRequestService {

    private static final int RECENT_HISTORY_LIMIT = 10;

    private final RecertificationRequestRepository requestRepository;
    private final RecertificationRoundRepository roundRepository;
    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRepository historyRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public Long create(CreateRecertificationCommand command) {
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        if (!club.isCentralClub()) {
            throw new ClubException.NotCentralClubException();
        }
        RecertificationRound openRound = roundRepository.findByStatus(RoundStatus.OPEN)
                .orElseThrow(ClubException.NoOpenRoundException::new);

        requestRepository.findByRoundIdAndClubIdAndStatus(
                        openRound.getId(), club.getId(), RecertificationStatus.PENDING)
                .ifPresent(existing -> {
                    throw new ClubException.DuplicatePendingRecertificationException();
                });

        try {
            return requestRepository.save(RecertificationRequest.create(
                    openRound.getId(), club.getId(), command.requesterUserId(),
                    command.contactEmail(), command.contactPhone(),
                    command.operatingYear(), command.notes()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubException.DuplicatePendingRecertificationException();
        }
    }

    @Override
    @Transactional
    public void process(ProcessRecertificationCommand command) {
        RecertificationRequest request = requestRepository.findByIdForUpdate(command.requestId())
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);

        request.process(command.handlerAdminId(), command.status(), command.actionNote());

        if (command.status() == RecertificationStatus.APPROVED) {
            RecertificationRound round = roundRepository.findById(request.getRoundId())
                    .orElseThrow(ClubException.RoundNotFoundException::new);
            Club club = clubRepository.findById(request.getClubId())
                    .orElseThrow(ClubException.ClubNotFoundException::new);
            club.updateLastVerifiedYear(round.getYear());
        }
    }

    @Override
    public RecertificationRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);
    }

    @Override
    public Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable
    ) {
        return requestRepository.findCentralClubStatuses(query, pageable);
    }

    @Override
    public Page<RecertificationRequestAdminSummaryQuery> listForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable
    ) {
        Page<RecertificationRequest> requestPage = requestRepository.searchForAdmin(condition, pageable);

        // ID 수집 — N+1 을 피하기 위해 findAllById 로 한 번에 조회한다
        Set<Long> roundIds = new HashSet<>();
        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (RecertificationRequest request : requestPage.getContent()) {
            roundIds.add(request.getRoundId());
            clubIds.add(request.getClubId());
            userIds.add(request.getLeaderUserId());
        }
        Map<Long, RecertificationRound> roundMap = indexById(roundRepository.findAllById(roundIds), RecertificationRound::getId);
        Map<Long, Club> clubMap = indexById(clubRepository.findAllById(clubIds), Club::getId);
        Map<Long, User> userMap = indexById(userRepository.findAllById(userIds), User::getId);

        return requestPage.map(request -> new RecertificationRequestAdminSummaryQuery(
                request,
                buildSummaryRoundRef(request.getRoundId(), roundMap.get(request.getRoundId())),
                buildSummaryClubRef(request.getClubId(), clubMap.get(request.getClubId())),
                buildSummaryUserRef(request.getLeaderUserId(), userMap.get(request.getLeaderUserId()))
        ));
    }

    @Override
    public RecertificationRequestAdminDetailQuery getDetailForAdmin(Long requestId) {
        RecertificationRequest request = requestRepository.findById(requestId)
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);

        // 라운드·클럽 참조 — 삭제된 경우 fallback 라벨 사용
        RecertificationRequestAdminDetailQuery.RoundRef roundRef = roundRepository.findById(request.getRoundId())
                .map(round -> new RecertificationRequestAdminDetailQuery.RoundRef(
                        round.getId(), round.getYear(), round.getLabel()))
                .orElse(new RecertificationRequestAdminDetailQuery.RoundRef(
                        request.getRoundId(), null, AdminLabels.DELETED));
        RecertificationRequestAdminDetailQuery.ClubRef clubRef = clubRepository.findById(request.getClubId())
                .map(club -> new RecertificationRequestAdminDetailQuery.ClubRef(
                        club.getId(), club.getName(), club.getLastVerifiedYear()))
                .orElse(new RecertificationRequestAdminDetailQuery.ClubRef(
                        request.getClubId(), AdminLabels.DELETED, null));

        List<ClubMember> members = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(request.getClubId());
        List<ClubMemberHistory> memberHistoryPage = historyRepository.findByClubIdOrderByCreatedAtDesc(
                request.getClubId(), PageRequest.of(0, RECENT_HISTORY_LIMIT)).getContent();

        // User ID 수집 — 멤버·이력·제출자·처리자 전부 한 번에 로드
        Set<Long> userIds = new HashSet<>();
        userIds.add(request.getLeaderUserId());
        if (request.getHandledBy() != null) userIds.add(request.getHandledBy());
        for (ClubMember member : members) userIds.add(member.getUser().getId());
        for (ClubMemberHistory row : memberHistoryPage) {
            userIds.add(row.getTargetUserId());
            userIds.add(row.getActorUserId());
        }
        Map<Long, User> userMap = indexById(userRepository.findAllById(userIds), User::getId);

        RecertificationRequestAdminDetailQuery.UserRef currentLeaderRef = members.stream()
                .filter(member -> member.getRole() == ClubMemberRole.LEADER)
                .findFirst()
                .map(member -> buildDetailUserRef(member.getUser().getId(), userMap.get(member.getUser().getId())))
                .orElse(null);

        List<RecertificationRequestAdminDetailQuery.UserRef> officerRefs = members.stream()
                .filter(member -> member.getRole() == ClubMemberRole.OFFICER)
                .map(member -> buildDetailUserRef(member.getUser().getId(), userMap.get(member.getUser().getId())))
                .toList();

        RecertificationRequestAdminDetailQuery.UserRef submittedLeaderRef =
                buildDetailUserRef(request.getLeaderUserId(), userMap.get(request.getLeaderUserId()));
        RecertificationRequestAdminDetailQuery.UserRef handledByRef = request.getHandledBy() == null
                ? null
                : buildDetailUserRef(request.getHandledBy(), userMap.get(request.getHandledBy()));

        List<ClubMemberHistoryAdminQuery> recentHistoryQueries = memberHistoryPage.stream()
                .map(row -> new ClubMemberHistoryAdminQuery(
                        row.getId(), row.getEventType(),
                        buildHistoryUserRef(row.getTargetUserId(), userMap.get(row.getTargetUserId())),
                        buildHistoryUserRef(row.getActorUserId(), userMap.get(row.getActorUserId())),
                        row.getFromRole(), row.getToRole(),
                        row.getReason(), row.getCreatedAt()))
                .toList();

        return new RecertificationRequestAdminDetailQuery(
                request, roundRef, clubRef,
                currentLeaderRef, officerRefs, submittedLeaderRef,
                handledByRef, recentHistoryQueries
        );
    }

    // ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

    private static <T> Map<Long, T> indexById(Collection<T> items, Function<T, Long> idExtractor) {
        return items.stream().collect(Collectors.toMap(idExtractor, Function.identity()));
    }

    private RecertificationRequestAdminSummaryQuery.RoundRef buildSummaryRoundRef(
            Long roundId, RecertificationRound round
    ) {
        if (round == null) {
            return new RecertificationRequestAdminSummaryQuery.RoundRef(roundId, null, AdminLabels.DELETED, null);
        }
        return new RecertificationRequestAdminSummaryQuery.RoundRef(
                round.getId(), round.getYear(), round.getLabel(), round.getStatus());
    }

    private RecertificationRequestAdminSummaryQuery.ClubRef buildSummaryClubRef(Long clubId, Club club) {
        if (club == null) {
            return new RecertificationRequestAdminSummaryQuery.ClubRef(clubId, AdminLabels.DELETED);
        }
        return new RecertificationRequestAdminSummaryQuery.ClubRef(club.getId(), club.getName());
    }

    private RecertificationRequestAdminSummaryQuery.UserRef buildSummaryUserRef(Long userId, User user) {
        if (user == null) {
            return new RecertificationRequestAdminSummaryQuery.UserRef(userId, AdminLabels.DELETED);
        }
        return new RecertificationRequestAdminSummaryQuery.UserRef(user.getId(), user.getName());
    }

    private RecertificationRequestAdminDetailQuery.UserRef buildDetailUserRef(Long userId, User user) {
        if (user == null) {
            return new RecertificationRequestAdminDetailQuery.UserRef(userId, AdminLabels.DELETED);
        }
        return new RecertificationRequestAdminDetailQuery.UserRef(user.getId(), user.getName());
    }

    private ClubMemberHistoryAdminQuery.UserRef buildHistoryUserRef(Long userId, User user) {
        if (user == null) {
            return new ClubMemberHistoryAdminQuery.UserRef(userId, AdminLabels.DELETED);
        }
        return new ClubMemberHistoryAdminQuery.UserRef(user.getId(), user.getName());
    }
}
