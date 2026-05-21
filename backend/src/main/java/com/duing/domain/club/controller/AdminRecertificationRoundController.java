package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRoundApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRoundRequest;
import com.duing.domain.club.controller.dto.response.RecertificationRoundResponse;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.RecertificationRoundService;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminRecertificationRoundController implements AdminRecertificationRoundApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final RecertificationRoundService roundService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> openRound(
            CreateRecertificationRoundRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long id = roundService.open(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> closeRound(
            Long roundId, @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        roundService.close(new CloseRoundCommand(roundId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<RecertificationRoundResponse>>> listRounds(
            RoundStatus status, Pageable pageable
    ) {
        Page<RecertificationRound> page = roundService.searchForAdmin(
                new RoundAdminSearchCondition(status), pageable);
        Page<RecertificationRoundResponse> mapped = page.map(round ->
                RecertificationRoundResponse.of(round, userRef(round.getOpenedBy()),
                        round.getClosedBy() == null ? null : userRef(round.getClosedBy()))
        );
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private RecertificationRoundResponse.UserRef userRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new RecertificationRoundResponse.UserRef(user.getId(), user.getName()))
                .orElse(new RecertificationRoundResponse.UserRef(userId, DELETED_LABEL));
    }
}
