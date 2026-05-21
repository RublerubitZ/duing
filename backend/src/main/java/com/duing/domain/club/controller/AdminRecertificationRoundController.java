package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRoundApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRoundRequest;
import com.duing.domain.club.controller.dto.response.RecertificationRoundResponse;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.RecertificationRoundService;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
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
public class AdminRecertificationRoundController implements AdminRecertificationRoundApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final RecertificationRoundService roundService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> openRound(
            @Valid @RequestBody CreateRecertificationRoundRequest request,
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

        Set<Long> userIds = new HashSet<>();
        for (RecertificationRound round : page.getContent()) {
            userIds.add(round.getOpenedBy());
            if (round.getClosedBy() != null) userIds.add(round.getClosedBy());
        }
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Page<RecertificationRoundResponse> mapped = page.map(round ->
                RecertificationRoundResponse.of(
                        round,
                        userRef(round.getOpenedBy(), userMap.get(round.getOpenedBy())),
                        round.getClosedBy() == null
                                ? null
                                : userRef(round.getClosedBy(), userMap.get(round.getClosedBy())))
        );
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private RecertificationRoundResponse.UserRef userRef(Long userId, User user) {
        if (user == null) {
            return new RecertificationRoundResponse.UserRef(userId, DELETED_LABEL);
        }
        return new RecertificationRoundResponse.UserRef(user.getId(), user.getName());
    }
}
