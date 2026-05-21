package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRequestApi;
import com.duing.domain.club.controller.dto.request.ProcessRecertificationRequest;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestDetailResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestSummaryResponse;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.RecertificationRequestService;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import java.util.Optional;
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
        Page<RecertificationRequestSummaryResponse> mapped = page.map(request ->
                RecertificationRequestSummaryResponse.of(
                        request,
                        roundRef(request.getRoundId()),
                        clubRef(request.getClubId()),
                        userRefSummary(request.getLeaderUserId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<RecertificationRequestDetailResponse>> getRequest(Long requestId) {
        RecertificationRequest request = requestService.getById(requestId);
        var round = roundRepository.findById(request.getRoundId())
                .map(r -> new RecertificationRequestDetailResponse.RoundRef(r.getId(), r.getYear(), r.getLabel()))
                .orElse(new RecertificationRequestDetailResponse.RoundRef(request.getRoundId(), 0, DELETED_LABEL));
        var club = clubRepository.findById(request.getClubId())
                .map(c -> new RecertificationRequestDetailResponse.ClubRef(
                        c.getId(), c.getName(), c.getLastVerifiedYear()))
                .orElse(new RecertificationRequestDetailResponse.ClubRef(request.getClubId(), DELETED_LABEL, null));

        var currentLeader = clubMemberRepository.findFirstByClubIdAndRole(request.getClubId(), ClubMemberRole.LEADER)
                .map(member -> new RecertificationRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .orElse(null);

        List<RecertificationRequestDetailResponse.UserRef> officers = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(request.getClubId()).stream()
                .filter(member -> member.getRole() == ClubMemberRole.OFFICER)
                .map(member -> new RecertificationRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .toList();

        var submittedLeader = userRefDetail(request.getLeaderUserId()).orElse(null);
        var handler = request.getHandledBy() == null
                ? null
                : userRefDetail(request.getHandledBy()).orElse(null);

        Page<ClubMemberHistory> recent = historyRepository.findByClubIdOrderByCreatedAtDesc(
                request.getClubId(), PageRequest.of(0, RECENT_HISTORY_LIMIT));
        List<ClubMemberHistoryResponse> recentResponses = recent.getContent().stream()
                .map(history -> ClubMemberHistoryResponse.of(
                        history,
                        historyUserRef(history.getTargetUserId()),
                        historyUserRef(history.getActorUserId())))
                .toList();

        return ResponseEntity.ok(ApiResponse.success(RecertificationRequestDetailResponse.of(
                request, round, club, currentLeader, officers, submittedLeader, handler, recentResponses)));
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

    private RecertificationRequestSummaryResponse.RoundRef roundRef(Long roundId) {
        return roundRepository.findById(roundId)
                .map(r -> new RecertificationRequestSummaryResponse.RoundRef(
                        r.getId(), r.getYear(), r.getLabel(), r.getStatus()))
                .orElse(new RecertificationRequestSummaryResponse.RoundRef(
                        roundId, 0, DELETED_LABEL, null));
    }

    private RecertificationRequestSummaryResponse.ClubRef clubRef(Long clubId) {
        return clubRepository.findById(clubId)
                .map(c -> new RecertificationRequestSummaryResponse.ClubRef(c.getId(), c.getName()))
                .orElse(new RecertificationRequestSummaryResponse.ClubRef(clubId, DELETED_LABEL));
    }

    private RecertificationRequestSummaryResponse.UserRef userRefSummary(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new RecertificationRequestSummaryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new RecertificationRequestSummaryResponse.UserRef(userId, DELETED_LABEL));
    }

    private Optional<RecertificationRequestDetailResponse.UserRef> userRefDetail(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new RecertificationRequestDetailResponse.UserRef(user.getId(), user.getName()));
    }

    private ClubMemberHistoryResponse.UserRef historyUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new ClubMemberHistoryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new ClubMemberHistoryResponse.UserRef(userId, DELETED_LABEL));
    }
}
