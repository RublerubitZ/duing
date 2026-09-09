package com.duing.domain.joincode.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.joincode.entity.AdminJoinCodeStatus;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.JoinCodeLinkType;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository.AdminJoinCodeProjection;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository.JoinCodeRequestCountProjection;
import com.duing.domain.joincode.service.dto.query.AdminClubJoinCodeRow;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 동아리 가입 링크 조회·강제 폐기. 권한은 컨트롤러의 {@code @PreAuthorize} 와 URL 레이어
 * 백스톱이 담당하므로 운영진 가드({@code requireManager})는 호출하지 않는다 — admin 은 전 동아리 접근이 정당하다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminClubJoinCodeService implements AdminClubJoinCodeService {

    private final ClubJoinCodeRepository clubJoinCodeRepository;
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    /**
     * 활동 이력 조회와 같이 동아리 존재를 확인하지 않는다 — 폐쇄(soft-delete) 뒤에도 그 동아리가 뿌린
     * 링크의 감사 열람은 열려 있어야 한다. 미존재·폐쇄 동아리는 빈 목록이거나, 폐쇄가 벌크 폐기한
     * 링크들이 REVOKED 로 실린다.
     */
    @Override
    public List<AdminClubJoinCodeRow> getJoinCodes(Long clubId) {
        List<AdminJoinCodeProjection> joinCodes = clubJoinCodeRepository.findAllForAdminByClubId(clubId);
        if (joinCodes.isEmpty()) {
            return List.of();
        }
        // 살아 있는 모집만 한 번에 올린다 — 제목 해석용이자, 같은 영속성 컨텍스트에 실려
        // 아래 isUsable 이 읽는 LAZY 연관을 링크마다 다시 조회하지 않게 하는 역할도 한다.
        Map<Long, Recruitment> recruitments = aliveRecruitmentsOf(joinCodes);
        Map<Long, JoinCodeRequestCountProjection> requestCounts = requestCountsOf(joinCodes);
        Map<Long, String> userNames = userNamesOf(joinCodes);
        LocalDateTime now = LocalDateTime.now(clock);

        return joinCodes.stream()
                .map(joinCodeProjection -> toRow(joinCodeProjection, recruitments, requestCounts, userNames, now))
                .toList();
    }

    /**
     * 폐기는 {@code findWithLockByIdAndClubId} 로 처음 읽는다 — 무잠금 {@code findById} 로 읽으면 경쟁하는
     * 재발급이 이미 폐기한 행을 낡은 스냅샷으로 보고 멱등 분기를 지나쳐, 최초 폐기 시각·폐기자를
     * 덮어쓰면서 감사 이벤트를 한 번 더 남긴다(운영진 폐기 경로와 같은 규약).
     *
     * <p>대기 중 가입 요청은 그대로 둔다 — 회장 수동 폐기와 같은 동작이며, 이미 접수된 요청의 승인·거절은
     * 링크 유효성을 보지 않으므로 운영진이 계속 처리할 수 있다.
     */
    @Override
    @Transactional
    public void forceRevoke(Long clubId, Long joinCodeId, Long adminUserId, String reason) {
        // 소속 대조가 조회 술어에 실려 있어, 타 동아리 링크와 없는 링크가 똑같이 404 가 된다(열거 차단).
        ClubJoinCode joinCode = clubJoinCodeRepository.findWithLockByIdAndClubId(joinCodeId, clubId)
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        if (joinCode.isRevoked()) {
            // 멱등 — 최초 폐기 시각(감사 이력)을 덮어쓰지 않고 감사 이벤트도 남기지 않는다
            // (같은 폐기가 호출 횟수만큼 늘어나 보이면 이력이 거짓말이 된다).
            return;
        }
        joinCode.revoke(LocalDateTime.now(clock), adminUserId);
        // 미폐기 링크의 귀속 모집은 반드시 살아 있다 — 모집 삭제·동아리 폐쇄가 링크를 함께 폐기하므로
        // 죽은 모집의 링크는 위 멱등 분기에서 이미 돌아갔다. 그래서 여기서는 FK 를 읽어도 안전하다.
        clubAuditEventRepository.save(ClubAuditEvent.adminJoinLinkForceRevoke(
                clubId, joinCode.getRecruitmentIdOrNull(), joinCodeId, adminUserId, reason.trim()));
    }

    /** 삭제된 모집은 조회되지 않아 제목이 비고, 아래 상태 판정도 프록시를 건드리지 않는 쪽으로 갈린다. */
    private Map<Long, Recruitment> aliveRecruitmentsOf(List<AdminJoinCodeProjection> joinCodes) {
        Set<Long> recruitmentIds = joinCodes.stream()
                .map(AdminJoinCodeProjection::getRecruitmentId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (recruitmentIds.isEmpty()) {
            return Map.of();
        }
        return recruitmentRepository.findAllById(recruitmentIds).stream()
                .collect(Collectors.toMap(Recruitment::getId, recruitment -> recruitment));
    }

    /** 누적·대기 수치는 목록 전체를 한 번에 집계한다(N+1 방지). 요청이 없는 링크는 결과에 아예 없다. */
    private Map<Long, JoinCodeRequestCountProjection> requestCountsOf(List<AdminJoinCodeProjection> joinCodes) {
        return clubJoinRequestRepository.countByJoinCodeIdIn(joinCodes.stream()
                        .map(joinCodeProjection -> joinCodeProjection.getJoinCode().getId())
                        .toList()).stream()
                .collect(Collectors.toMap(JoinCodeRequestCountProjection::getJoinCodeId,
                        requestCount -> requestCount));
    }

    /** 발급자·폐기자 이름은 한 번에 모아 해석한다(N+1 방지). 탈퇴(soft delete) 회원은 조회되지 않아 이름이 비어 나간다. */
    private Map<Long, String> userNamesOf(List<AdminJoinCodeProjection> joinCodes) {
        List<Long> userIds = joinCodes.stream()
                .flatMap(joinCodeProjection -> Stream.of(
                        joinCodeProjection.getJoinCode().getCreatedById(),
                        joinCodeProjection.getJoinCode().getRevokedById()))
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    private static AdminClubJoinCodeRow toRow(AdminJoinCodeProjection joinCodeProjection,
                                              Map<Long, Recruitment> recruitments,
                                              Map<Long, JoinCodeRequestCountProjection> requestCounts,
                                              Map<Long, String> userNames,
                                              LocalDateTime now) {
        ClubJoinCode joinCode = joinCodeProjection.getJoinCode();
        Long recruitmentId = joinCodeProjection.getRecruitmentId();
        // 모집이 삭제됐으면 프록시 초기화가 EntityNotFoundException 으로 터지므로 연관을 아예 읽지 않는다.
        // 삭제된 모집의 링크는 삭제 트랜잭션이 함께 폐기하므로(revokeActiveByRecruitmentId) 아래 판정은
        // 사실상 REVOKED 로 수렴하지만, 그렇지 않은 이상 데이터는 만료로 본다(fail-closed).
        boolean recruitmentReadable = recruitmentId == null || recruitments.containsKey(recruitmentId);
        JoinCodeRequestCountProjection requestCount = requestCounts.get(joinCode.getId());
        Recruitment recruitment = recruitmentId == null ? null : recruitments.get(recruitmentId);

        return new AdminClubJoinCodeRow(
                joinCode.getId(),
                recruitmentId == null ? JoinCodeLinkType.CLUB_INVITE : JoinCodeLinkType.RECRUITMENT,
                joinCode.getCode(),
                recruitmentId,
                recruitment == null ? null : recruitment.getTitle(),
                joinCode.getGeneration(),
                joinCode.getMaxUses(),
                joinCode.getUsedCount(),
                requestCount == null ? 0L : requestCount.getTotalCount(),
                requestCount == null ? 0L : requestCount.getPendingCount(),
                joinCode.isAutoApprove(),
                joinCode.getJoinWindowDays(),
                recruitmentReadable ? joinCode.getJoinExpiresAt() : null,
                joinCode.getInviteExpiresAt(),
                resolveStatus(joinCode, recruitmentReadable, now),
                joinCode.getCreatedAt(),
                joinCode.getCreatedById(),
                userNames.get(joinCode.getCreatedById()),
                joinCode.getRevokedAt(),
                joinCode.getRevokedById(),
                userNames.get(joinCode.getRevokedById()));
    }

    /**
     * 폐기·소진은 기간과 무관하게 확정된 사실이라 먼저 본다. 기간 판정은 새 계산식을 만들지 않고
     * {@code isUsable} 을 그대로 쓴다 — 화면이 "사용 가능"으로 읽는 상태와 실제 사용 가능 여부가
     * 갈리면 안 된다(앞의 두 분기를 지난 뒤라 isUsable 안에서 남는 조건은 기간뿐이다).
     */
    private static AdminJoinCodeStatus resolveStatus(ClubJoinCode joinCode, boolean recruitmentReadable,
                                                     LocalDateTime now) {
        if (joinCode.isRevoked()) {
            return AdminJoinCodeStatus.REVOKED;
        }
        if (joinCode.isExhausted()) {
            return AdminJoinCodeStatus.EXHAUSTED;
        }
        if (!recruitmentReadable) {
            return AdminJoinCodeStatus.EXPIRED;
        }
        return joinCode.isUsable(now) ? AdminJoinCodeStatus.ACTIVE : AdminJoinCodeStatus.EXPIRED;
    }
}
