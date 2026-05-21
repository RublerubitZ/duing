package com.duing.domain.clubmember.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.api.AdminLeaderSuccessionApi;
import com.duing.domain.clubmember.controller.dto.request.AssignAdminLeaderRequest;
import com.duing.domain.clubmember.controller.dto.request.ProcessLeaderSuccessionRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestDetailResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestSummaryResponse;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.AdminLeaderAssignmentService;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminLeaderSuccessionController implements AdminLeaderSuccessionApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final LeaderSuccessionService successionService;
    private final AdminLeaderAssignmentService leaderAssignmentService;
    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRepository historyRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<SuccessionRequestSummaryResponse>>> listRequests(
            SuccessionStatus status, Long clubId, Pageable pageable
    ) {
        Page<LeaderSuccessionRequest> page = successionService.searchForAdmin(
                new SuccessionAdminSearchCondition(status, clubId), pageable);
        Page<SuccessionRequestSummaryResponse> mapped = page.map(request ->
                SuccessionRequestSummaryResponse.of(
                        request,
                        clubName(request.getClubId()),
                        toSummaryUserRef(request.getRequesterUserId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<SuccessionRequestDetailResponse>> getRequest(Long requestId) {
        LeaderSuccessionRequest request = successionService.getById(requestId);
        SuccessionRequestDetailResponse.ClubRef clubRef = clubRefOrDeleted(request.getClubId());
        SuccessionRequestDetailResponse.UserRef requester = toDetailUserRef(request.getRequesterUserId()).orElse(null);
        SuccessionRequestDetailResponse.UserRef currentLeader = currentLeaderRef(request.getClubId());
        SuccessionRequestDetailResponse.UserRef handler = request.getHandledBy() == null
                ? null
                : toDetailUserRef(request.getHandledBy()).orElse(null);
        return ResponseEntity.ok(ApiResponse.success(SuccessionRequestDetailResponse.of(
                request, clubRef, requester, currentLeader, handler)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, @Valid @RequestBody ProcessLeaderSuccessionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        successionService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> assignLeader(
            Long clubId, @Valid @RequestBody AssignAdminLeaderRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        leaderAssignmentService.assign(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ClubMemberHistoryResponse>>> listMemberHistory(
            Long clubId, Pageable pageable
    ) {
        if (clubRepository.findById(clubId).isEmpty()) {
            throw new ClubMemberException.NotFound();
        }
        Page<ClubMemberHistory> page = historyRepository.findByClubIdOrderByCreatedAtDesc(clubId, pageable);
        Page<ClubMemberHistoryResponse> mapped = page.map(history -> ClubMemberHistoryResponse.of(
                history,
                toHistoryUserRef(history.getTargetUserId()),
                toHistoryUserRef(history.getActorUserId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private String clubName(Long clubId) {
        return clubRepository.findById(clubId).map(Club::getName).orElse(DELETED_LABEL);
    }

    private SuccessionRequestDetailResponse.ClubRef clubRefOrDeleted(Long clubId) {
        return clubRepository.findById(clubId)
                .map(club -> new SuccessionRequestDetailResponse.ClubRef(club.getId(), club.getName()))
                .orElse(new SuccessionRequestDetailResponse.ClubRef(clubId, DELETED_LABEL));
    }

    private SuccessionRequestDetailResponse.UserRef currentLeaderRef(Long clubId) {
        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(member -> new SuccessionRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .orElse(null);
    }

    private SuccessionRequestSummaryResponse.UserRef toSummaryUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new SuccessionRequestSummaryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new SuccessionRequestSummaryResponse.UserRef(userId, DELETED_LABEL));
    }

    private Optional<SuccessionRequestDetailResponse.UserRef> toDetailUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new SuccessionRequestDetailResponse.UserRef(user.getId(), user.getName()));
    }

    private ClubMemberHistoryResponse.UserRef toHistoryUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new ClubMemberHistoryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new ClubMemberHistoryResponse.UserRef(userId, DELETED_LABEL));
    }
}
