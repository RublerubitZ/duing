package com.duing.domain.joincode.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
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
    private final ClubRepository clubRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final JoinCodeGenerator joinCodeGenerator;
    private final Clock clock;

    @Override
    @Transactional
    public JoinCodeQuery create(CreateJoinCodeCommand createCommand) {
        clubAuthService.requireManager(createCommand.requesterId(), createCommand.clubId());
        Club club = clubRepository.findById(createCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        // 외부 폼 모집 한정(스펙 4.1): OPEN + EXTERNAL 모집이 있을 때만 생성, 복수면 최신 1건에 귀속
        Recruitment openExternalRecruitment = recruitmentRepository
                .findTopByClubIdAndStatusAndApplicationModeOrderByIdDesc(
                        createCommand.clubId(), RecruitmentStatus.OPEN, ApplicationMode.EXTERNAL)
                .orElseThrow(JoinCodeException.ExternalRecruitmentRequiredException::new);

        LocalDateTime now = LocalDateTime.now(clock);

        // Hibernate 는 INSERT 를 UPDATE 보다 먼저 flush 하므로, 폐기를 먼저 flush 하지 않으면
        // 신규 INSERT 가 uk_club_join_code_active_per_club 에 걸린다.
        clubJoinCodeRepository.findByClubIdAndRevokedAtIsNull(createCommand.clubId())
                .ifPresent(activeCode -> {
                    activeCode.revoke(now);
                    clubJoinCodeRepository.flush();
                });

        try {
            ClubJoinCode issued = clubJoinCodeRepository.save(ClubJoinCode.issue(
                    club, openExternalRecruitment, generateUniqueCode(), createCommand.generation(),
                    createCommand.maxUses(), now.plusDays(createCommand.expiresInDays())));
            clubJoinCodeRepository.flush();
            return JoinCodeQuery.from(issued);
        } catch (DataIntegrityViolationException concurrentIssue) {
            // 동시 재생성: partial unique 충돌 → 409 로 변환해 재시도 유도
            throw new JoinCodeException.ConcurrentJoinCodeOperationException();
        }
    }

    @Override
    public Optional<JoinCodeQuery> findActive(Long clubId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        return clubJoinCodeRepository.findByClubIdAndRevokedAtIsNull(clubId)
                .map(JoinCodeQuery::from);
    }

    @Override
    @Transactional
    public void revoke(Long clubId, Long joinCodeId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        ClubJoinCode joinCode = clubJoinCodeRepository.findById(joinCodeId)
                .orElseThrow(JoinCodeException.JoinCodeNotFoundException::new);
        // 타 동아리 코드는 존재 여부를 알리지 않는다(403 이 아닌 404 로 열거 차단).
        if (!joinCode.getClub().getId().equals(clubId)) {
            throw new JoinCodeException.JoinCodeNotFoundException();
        }
        if (joinCode.isRevoked()) {
            // 멱등 — 최초 폐기 시각(감사 이력)을 덮어쓰지 않는다.
            return;
        }
        joinCode.revoke(LocalDateTime.now(clock));
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
