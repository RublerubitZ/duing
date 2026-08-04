package com.duing.domain.joincode.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralJoinCodeService implements JoinCodeService {

    private static final int MAX_CODE_GENERATION_ATTEMPTS = 5;

    private final ClubJoinCodeRepository clubJoinCodeRepository;
    // 상태 카드의 누적·대기 수치(스펙 v2 7.2)를 링크 응답에 함께 싣는다.
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final JoinCodeGenerator joinCodeGenerator;
    private final Clock clock;

    @Override
    @Transactional
    public JoinCodeQuery create(CreateJoinCodeCommand createCommand) {
        clubAuthService.requireManager(createCommand.requesterId(), createCommand.clubId());
        // 모집 행을 잠근 뒤 발급한다 — 발급(OPEN 전제)과 삭제(CLOSED 전제)는 정책상 상호 배타지만,
        // 마감·삭제와의 경쟁으로 삭제된 모집에 코드가 매달리는 것을 막는 심층 방어로 잠금을 유지한다.
        // 삭제가 먼저 커밋됐다면 soft-delete 된 모집은 조회되지 않아 404 가 된다.
        Recruitment recruitment = recruitmentRepository.findByIdForUpdate(createCommand.recruitmentId())
                .filter(locked -> locked.getClub().getId().equals(createCommand.clubId()))
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        // 외부 폼 모집 + 진행 중 한정(스펙 v2 4.2). 마감된 모집에서도 발급할 수 있으면
        // "모집 생성 → 즉시 마감 → 링크만 발급"으로 모집 절차를 건너뛸 수 있다. 최초 생성·재생성이
        // 같은 경로라 재생성도 함께 막힌다.
        if (recruitment.getApplicationMode() != ApplicationMode.EXTERNAL) {
            throw new JoinCodeException.ExternalRecruitmentRequiredException();
        }
        // 지원서 제출과 같은 기준(isEffectivelyOpen)을 쓴다 — 마감일이 지났는데 마감 처리만 안 된
        // 모집에서 새 링크가 발급되는 비대칭을 없앤다. 이미 발급된 링크의 사용 판정은 status 기준이라
        // 이 경우에도 계속 유효하다(의도된 비대칭 — 상시 운영과 실질이 같다).
        if (!recruitment.isEffectivelyOpen(LocalDate.now(clock))) {
            throw new JoinCodeException.OpenRecruitmentRequiredException();
        }

        LocalDateTime now = LocalDateTime.now(clock);
        Long clubId = recruitment.getClub().getId();

        // Hibernate 는 INSERT 를 UPDATE 보다 먼저 flush 하므로, 폐기를 먼저 flush 하지 않으면
        // 신규 INSERT 가 uk_club_join_code_active_per_recruitment 에 걸린다.
        Optional<ClubJoinCode> replacedCode = clubJoinCodeRepository
                .findByRecruitmentIdAndRevokedAtIsNull(createCommand.recruitmentId());
        replacedCode.ifPresent(activeCode -> {
            activeCode.revoke(now, createCommand.requesterId());
            clubJoinCodeRepository.flush();
            recordJoinLinkEvent(ClubAuditEventType.JOIN_LINK_REVOKED, clubId,
                    createCommand.recruitmentId(), activeCode.getId(), createCommand.requesterId());
        });

        try {
            ClubJoinCode issued = clubJoinCodeRepository.save(ClubJoinCode.issue(
                    recruitment.getClub(), recruitment, generateUniqueCode(), createCommand.generation(),
                    createCommand.maxUses(), createCommand.joinWindowDays(),
                    createCommand.requesterId()));
            clubJoinCodeRepository.flush();
            // 재생성은 최초 생성과 구분해 남긴다 — 행만 봐서는 "새로 만들었다"와 "갈아끼웠다"가 같아 보인다.
            recordJoinLinkEvent(replacedCode.isPresent()
                            ? ClubAuditEventType.JOIN_LINK_REGENERATED
                            : ClubAuditEventType.JOIN_LINK_CREATED,
                    clubId, createCommand.recruitmentId(), issued.getId(), createCommand.requesterId());
            // 방금 발급된 링크라 접수된 가입 신청이 아직 없다(상태 카드 초기값, 스펙 v2 7.2).
            return JoinCodeQuery.from(issued, 0, 0);
        } catch (DataIntegrityViolationException concurrentIssue) {
            // 동시 재생성: partial unique 충돌 → 409 로 변환해 재시도 유도
            throw new JoinCodeException.ConcurrentJoinCodeOperationException();
        }
    }

    @Override
    public Optional<JoinCodeQuery> findActive(Long clubId, Long recruitmentId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        getOwnedRecruitment(clubId, recruitmentId);
        return clubJoinCodeRepository.findByRecruitmentIdAndRevokedAtIsNull(recruitmentId)
                .map(activeCode -> JoinCodeQuery.from(activeCode,
                        clubJoinRequestRepository.countByJoinCodeId(activeCode.getId()),
                        clubJoinRequestRepository.countByJoinCodeIdAndStatus(
                                activeCode.getId(), JoinRequestStatus.PENDING)));
    }

    @Override
    @Transactional
    public void revoke(Long clubId, Long recruitmentId, Long joinCodeId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        getOwnedRecruitment(clubId, recruitmentId);
        ClubJoinCode joinCode = clubJoinCodeRepository.findById(joinCodeId)
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        // 다른 모집(=다른 동아리 포함)의 코드는 존재 여부를 알리지 않는다(403 이 아닌 404 로 열거 차단).
        if (!joinCode.getRecruitment().getId().equals(recruitmentId)) {
            throw new JoinCodeException.JoinCodeNotFoundException();
        }
        if (joinCode.isRevoked()) {
            // 멱등 — 최초 폐기 시각(감사 이력)을 덮어쓰지 않는다. 아무 일도 일어나지 않았으므로
            // 감사 이벤트도 남기지 않는다(같은 폐기가 호출 횟수만큼 늘어나 보이면 이력이 거짓말이 된다).
            return;
        }
        joinCode.revoke(LocalDateTime.now(clock), requesterId);
        // 코드의 club 프록시 대신 경로의 clubId 를 쓴다 — 위에서 소속(clubId ↔ recruitmentId ↔ joinCodeId)이
        // 이미 대조됐고, 감사 기록 때문에 LAZY 연관을 초기화할 이유가 없다.
        recordJoinLinkEvent(ClubAuditEventType.JOIN_LINK_REVOKED, clubId,
                recruitmentId, joinCodeId, requesterId);
    }

    /**
     * 감사 이벤트를 본 트랜잭션에 함께 기록한다 — 기록 실패는 삼키지 않는다.
     * 남지 않은 이력은 없는 이력이고, 그 상태로 커밋된 운영 행위는 나중에 설명할 수 없다.
     */
    private void recordJoinLinkEvent(ClubAuditEventType eventType, Long clubId, Long recruitmentId,
                                     Long joinCodeId, Long actorUserId) {
        clubAuditEventRepository.save(ClubAuditEvent.joinLink(
                eventType, clubId, recruitmentId, joinCodeId, actorUserId));
    }

    /**
     * 경로의 clubId 와 recruitmentId 소속을 대조한다 — 타 동아리 모집은 존재를 알리지 않고 404 로 막는다
     * (스펙 v2 4.3). 운영진 권한은 clubId 기준으로 이미 확인됐으므로, 이 대조가 없으면 자기 동아리
     * 경로에 남의 모집 id 를 끼워 넣는 IDOR 이 열린다.
     */
    private Recruitment getOwnedRecruitment(Long clubId, Long recruitmentId) {
        return recruitmentRepository.findByIdAndClubId(recruitmentId, clubId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    }

    /** 코드 행은 soft-delete 하지 않으므로 폐기·만료 코드까지 포함해 전역 중복을 피한다. */
    private String generateUniqueCode() {
        for (int attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
            String candidate = joinCodeGenerator.generate();
            if (!clubJoinCodeRepository.existsByCode(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("가입 코드 생성이 반복 충돌했습니다.");
    }
}
