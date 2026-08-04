package com.duing.domain.joincode.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
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
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final JoinCodeGenerator joinCodeGenerator;
    private final Clock clock;

    @Override
    @Transactional
    public JoinCodeQuery create(CreateJoinCodeCommand createCommand) {
        clubAuthService.requireManager(createCommand.requesterId(), createCommand.clubId());
        // 모집 행을 잠근 뒤 발급한다 — 모집 삭제와 직렬화해, 삭제가 "활성 코드 0건"을 확인한 직후
        // 발급된 코드가 삭제된 모집에 매달린 채 살아남는 것을 막는다. 삭제가 먼저 커밋됐다면
        // soft-delete 된 모집은 조회되지 않아 404 가 된다.
        Recruitment recruitment = recruitmentRepository.findByIdForUpdate(createCommand.recruitmentId())
                .filter(locked -> locked.getClub().getId().equals(createCommand.clubId()))
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        // 외부 폼 모집 한정(스펙 v2 4.2). 모집 상태(OPEN/CLOSED)는 보지 않는다 —
        // 회원 등록의 최종 게이트는 운영진 승인이고, 코드는 만료·인원·폐기로 통제한다.
        if (recruitment.getApplicationMode() != ApplicationMode.EXTERNAL) {
            throw new JoinCodeException.ExternalRecruitmentRequiredException();
        }

        LocalDateTime now = LocalDateTime.now(clock);

        // Hibernate 는 INSERT 를 UPDATE 보다 먼저 flush 하므로, 폐기를 먼저 flush 하지 않으면
        // 신규 INSERT 가 uk_club_join_code_active_per_recruitment 에 걸린다.
        clubJoinCodeRepository.findByRecruitmentIdAndRevokedAtIsNull(createCommand.recruitmentId())
                .ifPresent(activeCode -> {
                    activeCode.revoke(now);
                    clubJoinCodeRepository.flush();
                });

        try {
            ClubJoinCode issued = clubJoinCodeRepository.save(ClubJoinCode.issue(
                    recruitment.getClub(), recruitment, generateUniqueCode(), createCommand.generation(),
                    createCommand.maxUses(), now.plusDays(createCommand.expiresInDays())));
            clubJoinCodeRepository.flush();
            return JoinCodeQuery.from(issued);
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
                .map(JoinCodeQuery::from);
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
            // 멱등 — 최초 폐기 시각(감사 이력)을 덮어쓰지 않는다.
            return;
        }
        joinCode.revoke(LocalDateTime.now(clock));
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
