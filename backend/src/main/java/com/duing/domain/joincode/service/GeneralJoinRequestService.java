package com.duing.domain.joincode.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralJoinRequestService implements JoinRequestService {

    private static final String PENDING_REQUEST_UNIQUE_CONSTRAINT = "uk_club_join_request_pending";
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    private final ClubJoinCodeRepository clubJoinCodeRepository;
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final UserRepository userRepository;
    private final JoinCodeRateLimiter joinCodeRateLimiter;
    private final Clock clock;

    @Override
    public JoinCodeCheckQuery check(String rawCode, Long currentUserId, String clientIp) {
        joinCodeRateLimiter.assertAndRecordCodeCheck(clientIp, LocalDateTime.now(clock));
        ClubJoinCode joinCode = clubJoinCodeRepository.findByCode(normalizeCode(rawCode))
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        Club club = joinCode.getClub();
        boolean usable = isUsable(joinCode);

        // 비로그인 확인은 동아리 정보까지만 — 내 상태 2종은 null 로 남긴다(스펙 5).
        if (currentUserId == null) {
            return new JoinCodeCheckQuery(club.getId(), club.getName(), joinCode.getGeneration(),
                    usable, null, null);
        }
        boolean alreadyMember = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), currentUserId).isPresent();
        // 거절 후 재요청으로 이력이 쌓이므로 최신 1건만 화면 분기의 근거로 쓴다(스펙 6).
        JoinRequestStatus myRequestStatus = clubJoinRequestRepository
                .findTopByClubIdAndUserIdOrderByIdDesc(club.getId(), currentUserId)
                .map(ClubJoinRequest::getStatus)
                .orElse(null);
        return new JoinCodeCheckQuery(club.getId(), club.getName(), joinCode.getGeneration(),
                usable, alreadyMember, myRequestStatus);
    }

    @Override
    @Transactional
    public void createRequest(CreateJoinRequestCommand createCommand) {
        joinCodeRateLimiter.assertAndRecordRequestCreation(createCommand.clientIp(), LocalDateTime.now(clock));
        ClubJoinCode joinCode = clubJoinCodeRepository.findByCode(normalizeCode(createCommand.rawCode()))
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        if (!isUsable(joinCode)) {
            throw new JoinRequestException.UnusableJoinCodeException();
        }
        Long clubId = joinCode.getClub().getId();
        if (clubMemberRepository.findByClubIdAndUserId(clubId, createCommand.userId()).isPresent()) {
            throw new JoinRequestException.AlreadyMemberException();
        }
        if (clubJoinRequestRepository.existsByClubIdAndUserIdAndStatus(
                clubId, createCommand.userId(), JoinRequestStatus.PENDING)) {
            throw new JoinRequestException.DuplicatePendingRequestException();
        }
        User requester = userRepository.findById(createCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        try {
            clubJoinRequestRepository.save(ClubJoinRequest.pending(joinCode.getClub(), requester, joinCode));
            clubJoinRequestRepository.flush();
        } catch (DataIntegrityViolationException racedDuplicate) {
            // 동시 중복 요청: uk_club_join_request_pending 충돌만 409 로 변환한다.
            if (!isDuplicatePendingRequest(racedDuplicate)) {
                throw racedDuplicate;
            }
            throw new JoinRequestException.DuplicatePendingRequestException();
        }
    }

    /**
     * 동시 요청으로 인한 PENDING 중복 삽입에만 true 를 반환한다
     * (enrollment 서비스의 23505 판정 패턴). 향후 club_join_request 에 새 unique / CHECK / FK 가
     * 추가되어도 그 위반은 409 로 둔갑하지 않고 그대로 위로 전파된다.
     */
    private static boolean isDuplicatePendingRequest(DataIntegrityViolationException exception) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof SQLException sqlException)) {
            return false;
        }
        if (!POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(PENDING_REQUEST_UNIQUE_CONSTRAINT);
    }

    /**
     * 비 ACTIVE 동아리는 코드 무효 취급 — 승인측 requireActiveClub 과 대칭
     * (처리 불가 PENDING 누적 방지, 스펙 4.2). recruitment 가 LAZY 이므로 트랜잭션 안에서만 호출한다.
     */
    private boolean isUsable(ClubJoinCode joinCode) {
        return joinCode.isUsable(LocalDateTime.now(clock))
                && joinCode.getClub().getStatus() == ClubStatus.ACTIVE;
    }

    private String normalizeCode(String rawCode) {
        return rawCode.trim().toUpperCase(Locale.ROOT);
    }
}
