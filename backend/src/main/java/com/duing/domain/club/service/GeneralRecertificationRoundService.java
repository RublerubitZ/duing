package com.duing.domain.club.service;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.query.RecertificationRoundAdminListQuery;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecertificationRoundService implements RecertificationRoundService {

    private final RecertificationRoundRepository roundRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public Long open(OpenRoundCommand command) {
        roundRepository.findByYearAndStatus(command.year(), RoundStatus.OPEN)
                .ifPresent(existing -> { throw new ClubException.DuplicateOpenRoundException(); });
        try {
            return roundRepository.save(RecertificationRound.open(
                    command.year(), command.label(), command.openedBy()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubException.DuplicateOpenRoundException();
        }
    }

    @Override
    @Transactional
    public void close(CloseRoundCommand command) {
        RecertificationRound round = roundRepository.findByIdForUpdate(command.roundId())
                .orElseThrow(ClubException.RoundNotFoundException::new);
        round.close(command.closedByUserId());
    }

    @Override
    public RecertificationRound getById(Long roundId) {
        return roundRepository.findById(roundId)
                .orElseThrow(ClubException.RoundNotFoundException::new);
    }

    @Override
    public Page<RecertificationRoundAdminListQuery> listForAdmin(
            RoundAdminSearchCondition condition, Pageable pageable
    ) {
        Page<RecertificationRound> roundPage = roundRepository.searchForAdmin(condition, pageable);

        // 개설자·마감자 User ID 수집 — N+1 을 피하기 위해 findAllById 로 한 번에 조회한다
        Set<Long> userIds = new HashSet<>();
        for (RecertificationRound round : roundPage.getContent()) {
            userIds.add(round.getOpenedBy());
            if (round.getClosedBy() != null) userIds.add(round.getClosedBy());
        }
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        return roundPage.map(round -> new RecertificationRoundAdminListQuery(
                round,
                buildUserRef(round.getOpenedBy(), userMap.get(round.getOpenedBy())),
                round.getClosedBy() == null
                        ? null
                        : buildUserRef(round.getClosedBy(), userMap.get(round.getClosedBy()))
        ));
    }

    // ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

    private RecertificationRoundAdminListQuery.UserRef buildUserRef(Long userId, User user) {
        if (user == null) {
            return new RecertificationRoundAdminListQuery.UserRef(userId, AdminLabels.DELETED);
        }
        return new RecertificationRoundAdminListQuery.UserRef(user.getId(), user.getName());
    }
}
