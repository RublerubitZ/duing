package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRequestApi;
import com.duing.domain.club.controller.dto.request.ProcessRecertificationRequest;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestDetailResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestSummaryResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.RecertificationRequestService;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminRecertificationRequestController implements AdminRecertificationRequestApi {

    private static final String DELETED_LABEL = "(삭제됨)";
    private static final int RECENT_HISTORY_LIMIT = 10;

    private final RecertificationRequestService requestService;
    private final RecertificationRoundRepository roundRepository;
    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRepository historyRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<RecertificationRequestSummaryResponse>>> listRequests(
            Long roundId, RecertificationStatus status, Pageable pageable
    ) {
        Page<RecertificationRequest> page = requestService.searchForAdmin(
                new RecertificationAdminSearchCondition(roundId, status), pageable);

        Set<Long> roundIds = new HashSet<>();
        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (RecertificationRequest request : page.getContent()) {
            roundIds.add(request.getRoundId());
            clubIds.add(request.getClubId());
            userIds.add(request.getLeaderUserId());
        }
        Map<Long, RecertificationRound> roundMap = indexById(roundRepository.findAllById(roundIds), RecertificationRound::getId);
        Map<Long, Club> clubMap = indexById(clubRepository.findAllById(clubIds), Club::getId);
        Map<Long, User> userMap = indexById(userRepository.findAllById(userIds), User::getId);

        Page<RecertificationRequestSummaryResponse> mapped = page.map(request ->
                RecertificationRequestSummaryResponse.of(
                        request,
                        summaryRoundRef(request.getRoundId(), roundMap.get(request.getRoundId())),
                        summaryClubRef(request.getClubId(), clubMap.get(request.getClubId())),
                        summaryUserRef(request.getLeaderUserId(), userMap.get(request.getLeaderUserId()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<RecertificationRequestDetailResponse>> getRequest(Long requestId) {
        RecertificationRequest request = requestService.getById(requestId);

        var roundRef = roundRepository.findById(request.getRoundId())
                .map(round -> new RecertificationRequestDetailResponse.RoundRef(
                        round.getId(), round.getYear(), round.getLabel()))
                .orElse(new RecertificationRequestDetailResponse.RoundRef(
                        request.getRoundId(), null, DELETED_LABEL));
        var clubRef = clubRepository.findById(request.getClubId())
                .map(club -> new RecertificationRequestDetailResponse.ClubRef(
                        club.getId(), club.getName(), club.getLastVerifiedYear()))
                .orElse(new RecertificationRequestDetailResponse.ClubRef(
                        request.getClubId(), DELETED_LABEL, null));

        List<ClubMember> members = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(request.getClubId());
        List<ClubMemberHistory> history = historyRepository.findByClubIdOrderByCreatedAtDesc(
                request.getClubId(), PageRequest.of(0, RECENT_HISTORY_LIMIT)).getContent();

        Set<Long> userIds = new HashSet<>();
        userIds.add(request.getLeaderUserId());
        if (request.getHandledBy() != null) userIds.add(request.getHandledBy());
        for (ClubMember member : members) userIds.add(member.getUser().getId());
        for (ClubMemberHistory row : history) {
            userIds.add(row.getTargetUserId());
            userIds.add(row.getActorUserId());
        }
        Map<Long, User> userMap = indexById(userRepository.findAllById(userIds), User::getId);

        RecertificationRequestDetailResponse.UserRef currentLeader = members.stream()
                .filter(member -> member.getRole() == ClubMemberRole.LEADER)
                .findFirst()
                .map(member -> detailUserRef(member.getUser().getId(), userMap.get(member.getUser().getId())))
                .orElse(null);

        List<RecertificationRequestDetailResponse.UserRef> officers = members.stream()
                .filter(member -> member.getRole() == ClubMemberRole.OFFICER)
                .map(member -> detailUserRef(member.getUser().getId(), userMap.get(member.getUser().getId())))
                .toList();

        RecertificationRequestDetailResponse.UserRef submittedLeader =
                detailUserRef(request.getLeaderUserId(), userMap.get(request.getLeaderUserId()));
        RecertificationRequestDetailResponse.UserRef handler = request.getHandledBy() == null
                ? null
                : detailUserRef(request.getHandledBy(), userMap.get(request.getHandledBy()));

        List<ClubMemberHistoryResponse> recentResponses = history.stream()
                .map(row -> ClubMemberHistoryResponse.of(
                        row,
                        historyUserRef(row.getTargetUserId(), userMap.get(row.getTargetUserId())),
                        historyUserRef(row.getActorUserId(), userMap.get(row.getActorUserId()))))
                .toList();

        return ResponseEntity.ok(ApiResponse.success(RecertificationRequestDetailResponse.of(
                request, roundRef, clubRef, currentLeader, officers, submittedLeader, handler, recentResponses)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, ProcessRecertificationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        requestService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<CentralClubRecertificationStatusResponse>>> listClubStatuses(
            int operatingYear, Pageable pageable
    ) {
        Page<CentralClubRecertificationStatusResponse> page = requestService.findCentralClubStatuses(
                new CentralClubRecertificationStatusQuery(operatingYear), pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    private static <T> Map<Long, T> indexById(Collection<T> items, Function<T, Long> idExtractor) {
        return items.stream().collect(Collectors.toMap(idExtractor, Function.identity()));
    }

    private RecertificationRequestSummaryResponse.RoundRef summaryRoundRef(Long roundId, RecertificationRound round) {
        if (round == null) {
            return new RecertificationRequestSummaryResponse.RoundRef(roundId, null, DELETED_LABEL, null);
        }
        return new RecertificationRequestSummaryResponse.RoundRef(
                round.getId(), round.getYear(), round.getLabel(), round.getStatus());
    }

    private RecertificationRequestSummaryResponse.ClubRef summaryClubRef(Long clubId, Club club) {
        if (club == null) {
            return new RecertificationRequestSummaryResponse.ClubRef(clubId, DELETED_LABEL);
        }
        return new RecertificationRequestSummaryResponse.ClubRef(club.getId(), club.getName());
    }

    private RecertificationRequestSummaryResponse.UserRef summaryUserRef(Long userId, User user) {
        if (user == null) {
            return new RecertificationRequestSummaryResponse.UserRef(userId, DELETED_LABEL);
        }
        return new RecertificationRequestSummaryResponse.UserRef(user.getId(), user.getName());
    }

    private RecertificationRequestDetailResponse.UserRef detailUserRef(Long userId, User user) {
        if (user == null) {
            return new RecertificationRequestDetailResponse.UserRef(userId, DELETED_LABEL);
        }
        return new RecertificationRequestDetailResponse.UserRef(user.getId(), user.getName());
    }

    private ClubMemberHistoryResponse.UserRef historyUserRef(Long userId, User user) {
        if (user == null) {
            return new ClubMemberHistoryResponse.UserRef(userId, DELETED_LABEL);
        }
        return new ClubMemberHistoryResponse.UserRef(user.getId(), user.getName());
    }
}
