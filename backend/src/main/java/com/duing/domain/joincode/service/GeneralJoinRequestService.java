package com.duing.domain.joincode.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.clubmember.service.ClubMemberEnrollmentService;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.dto.command.BulkApproveJoinRequestsCommand;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.joincode.service.dto.command.DecideJoinRequestCommand;
import com.duing.domain.joincode.service.dto.query.BulkApproveJoinRequestsResult;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;
import com.duing.domain.joincode.service.dto.query.JoinRequestDecisionResult;
import com.duing.domain.joincode.service.dto.query.JoinRequestDetailQuery;
import com.duing.domain.joincode.service.dto.query.JoinRequestSummaryQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.exception.ApplicationException;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralJoinRequestService implements JoinRequestService {

    private static final Logger log = LoggerFactory.getLogger(GeneralJoinRequestService.class);

    private static final String PENDING_REQUEST_UNIQUE_CONSTRAINT = "uk_club_join_request_pending";
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";
    // 일괄 승인의 건별 실패 사유 — 미존재와 타 동아리 요청을 같은 문구로 합쳐, 임의 ID 로 요청의
    // 존재·소속 여부를 알아내는 열거(oracle)를 막는다.
    private static final String BULK_ITEM_GENERIC_FAILURE = "해당 가입 요청을 처리할 권한이 없거나 존재하지 않습니다.";
    private static final String AUTO_REJECTED_FAILURE = "이미 가입된 회원이라 자동 거절 처리되었습니다.";

    private final ClubJoinCodeRepository clubJoinCodeRepository;
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final ClubMemberEnrollmentService clubMemberEnrollmentService;
    private final UserRepository userRepository;
    private final JoinCodeRateLimiter joinCodeRateLimiter;
    private final Clock clock;

    /**
     * 일괄 승인의 건별 트랜잭션을 위해 자기 자신의 프록시를 lazy 주입한다.
     * 생성자에 self-reference 를 넣으면 순환 의존이 되므로 필드 주입을 쓴다(GeneralApplicationService 전례).
     */
    @Autowired
    private ObjectProvider<JoinRequestService> selfProvider;

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

    @Override
    public List<JoinRequestSummaryQuery> getRequests(Long clubId, Long requesterId, JoinRequestStatus status) {
        clubAuthService.requireManager(requesterId, clubId);
        return clubJoinRequestRepository.findAllByClubIdAndStatusOrderByIdDesc(clubId, status).stream()
                .map(JoinRequestSummaryQuery::from)
                .toList();
    }

    @Override
    public JoinRequestDetailQuery getRequest(Long clubId, Long joinRequestId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        // clubId 를 조건에 포함해 타 동아리 요청은 조회 자체가 되지 않게 한다(IDOR 차단, 불일치는 404).
        return JoinRequestDetailQuery.from(clubJoinRequestRepository
                .findByIdAndClubId(joinRequestId, clubId)
                .orElseThrow(JoinRequestException.JoinRequestNotFoundException::new));
    }

    @Override
    @Transactional
    public JoinRequestDecisionResult decide(DecideJoinRequestCommand decideCommand) {
        clubAuthService.requireManager(decideCommand.requesterId(), decideCommand.clubId());
        ClubJoinRequest joinRequest = clubJoinRequestRepository
                .findByIdAndClubId(decideCommand.joinRequestId(), decideCommand.clubId())
                .orElseThrow(JoinRequestException.JoinRequestNotFoundException::new);
        if (!joinRequest.isPending()) {
            throw new JoinRequestException.AlreadyProcessedException();
        }
        User reviewer = userRepository.findById(decideCommand.requesterId())
                .orElseThrow(UserException.UserNotFoundException::new);

        JoinRequestDecisionResult decisionResult =
                applyDecision(joinRequest, reviewer, decideCommand.status());

        // 위 isPending() 검사는 TOCTOU 이므로 @Version 이 최후 방어선이다. 충돌을 커밋까지 미루면
        // GlobalExceptionHandler fallthrough 로 빠져 일괄 승인의 실패 사유가 뭉개지므로,
        // 모든 리턴 경로 공통으로 여기서 flush 해 트랜잭션 안에서 409 로 변환한다.
        try {
            clubJoinRequestRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentDecision) {
            throw new JoinRequestException.ConcurrentDecisionException();
        }
        return decisionResult;
    }

    private JoinRequestDecisionResult applyDecision(ClubJoinRequest joinRequest, User reviewer,
                                                    JoinRequestStatus decidedStatus) {
        LocalDateTime now = LocalDateTime.now(clock);
        return switch (decidedStatus) {
            case REJECTED -> {
                joinRequest.reject(reviewer, now);
                yield JoinRequestDecisionResult.REJECTED;
            }
            case APPROVED -> approveOrAutoReject(joinRequest, reviewer, now);
            // 경계(DecideJoinRequestRequest)에서 걸러지므로 도달하면 호출 계약 위반이다.
            case PENDING -> throw new IllegalArgumentException(
                    "처리 결과가 아닌 상태로는 가입 요청을 처리할 수 없습니다: " + decidedStatus);
        };
    }

    private JoinRequestDecisionResult approveOrAutoReject(ClubJoinRequest joinRequest, User reviewer,
                                                          LocalDateTime now) {
        // 승인 시점에 이미 다른 경로로 활성 회원이 됐다면 인원 차감 없이 자동 거절한다
        // (PENDING 방치 금지, 스펙 4.3). 예외가 아닌 정상 리턴이어야 상태 전이가 커밋된다.
        if (clubMemberRepository.findByClubIdAndUserId(
                joinRequest.getClub().getId(), joinRequest.getUser().getId()).isPresent()) {
            joinRequest.rejectAutomatically(reviewer, now);
            return JoinRequestDecisionResult.AUTO_REJECTED;
        }
        // 코드 행 잠금 하에 원자 차감 — 동시 승인의 초과 사용을 막는다. 만료·폐기·모집 마감 코드도
        // 승인은 허용한다(요청 생성 시점에 이미 코드 검증을 통과했으므로, 스펙 4.3).
        ClubJoinCode joinCode = clubJoinCodeRepository
                .findWithLockById(joinRequest.getJoinCode().getId())
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        if (!joinCode.tryConsume()) {
            throw new JoinCodeException.InsufficientRemainingUsesException();
        }
        clubMemberEnrollmentService.enroll(joinRequest.getClub(), joinRequest.getUser(),
                ClubMemberRole.MEMBER, joinRequest.getGeneration());
        joinRequest.approve(reviewer, now);
        return JoinRequestDecisionResult.APPROVED;
    }

    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public BulkApproveJoinRequestsResult bulkApprove(BulkApproveJoinRequestsCommand bulkCommand) {
        // 권한은 요청 단위로 먼저 확인한다 — 비운영진에게 건별 실패 목록 대신 403 을 돌려준다.
        clubAuthService.requireManager(bulkCommand.requesterId(), bulkCommand.clubId());
        // 입력 ID 중복은 클라이언트 실수 보호 차원에서 제거하되 순서는 유지한다.
        Set<Long> uniqueJoinRequestIds = new LinkedHashSet<>(bulkCommand.joinRequestIds());

        // 건별 트랜잭션을 얻기 위해 자기 자신의 프록시를 통해 decide 를 호출한다. 본 메서드는
        // NOT_SUPPORTED 로 클래스 레벨 readOnly TX 를 일시중단하므로 각 호출이 REQUIRED 로 신규 쓰기 TX 를 연다.
        JoinRequestService self = selfProvider.getObject();

        int approvedCount = 0;
        List<BulkApproveJoinRequestsResult.Failure> failures = new ArrayList<>();
        for (Long joinRequestId : uniqueJoinRequestIds) {
            try {
                JoinRequestDecisionResult decisionResult = self.decide(new DecideJoinRequestCommand(
                        bulkCommand.clubId(), joinRequestId, bulkCommand.requesterId(),
                        JoinRequestStatus.APPROVED));
                // 자동 거절은 커밋된 정상 결과지만 "승인됨"이 아니므로 운영진에게 사유와 함께 알린다.
                if (decisionResult == JoinRequestDecisionResult.AUTO_REJECTED) {
                    failures.add(new BulkApproveJoinRequestsResult.Failure(
                            joinRequestId, AUTO_REJECTED_FAILURE));
                    continue;
                }
                approvedCount++;
            } catch (ApplicationException domainFailure) {
                // 미존재/타 동아리 요청은 열거 방지를 위해 일반 메시지로 합치고, 그 외(잔여 부족·이미 처리 등
                // 이미 권한이 확인된 운영진에게 정당한 정보)는 구체 메시지를 그대로 노출한다.
                String reason = isExistenceOrAuthorizationFailure(domainFailure)
                        ? BULK_ITEM_GENERIC_FAILURE
                        : domainFailure.getMessage();
                failures.add(new BulkApproveJoinRequestsResult.Failure(joinRequestId, reason));
            } catch (AccessDeniedException authorizationFailure) {
                // 운영진 역할 부족 — 존재/소속 정보가 새지 않도록 동일한 일반 메시지로 응답한다.
                failures.add(new BulkApproveJoinRequestsResult.Failure(
                        joinRequestId, BULK_ITEM_GENERIC_FAILURE));
            } catch (RuntimeException unexpected) {
                // 시스템성 실패 — 로그는 남기되 응답에는 일반화된 메시지로 노출한다.
                log.warn("[가입 요청 일괄 승인 실패] clubId={}, joinRequestId={}",
                        bulkCommand.clubId(), joinRequestId, unexpected);
                failures.add(new BulkApproveJoinRequestsResult.Failure(
                        joinRequestId, "일시적 오류로 처리하지 못했습니다."));
            }
        }
        return new BulkApproveJoinRequestsResult(approvedCount, failures);
    }

    /**
     * 요청 미존재와 타 동아리 멤버십 없음만 일반 메시지로 합칠 대상으로 분류한다
     * (메시지 문자열이 아닌 예외 타입으로 판별 — 향후 메시지 변경에도 안전).
     */
    private static boolean isExistenceOrAuthorizationFailure(ApplicationException domainFailure) {
        return domainFailure instanceof JoinRequestException.JoinRequestNotFoundException
                || domainFailure instanceof ClubMemberException.NotAMember;
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
