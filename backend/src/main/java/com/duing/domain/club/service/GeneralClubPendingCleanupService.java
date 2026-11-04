package com.duing.domain.club.service;

import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubPendingCleanupResult;
import com.duing.domain.joincode.service.JoinRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운영 중단 동아리 남은 미결 정리 조립(스펙 §4-1) — 잠금·상태 확인·두 도메인 호출·결과 조립만 한다.
 * 폐쇄(GeneralClubClosureService)와 같은 자리·같은 의존 방향이고, 지원서·가입 신청 처리는 각 도메인 서비스가 가진다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubPendingCleanupService implements ClubPendingCleanupService {

    private final ClubRepository clubRepository;
    private final ApplicationService applicationService;
    private final JoinRequestService joinRequestService;

    @Override
    @Transactional
    public ClubPendingCleanupResult cleanup(Long clubId, Long actorUserId) {
        // 이 트랜잭션의 첫 동아리 조회여야 한다 — 무잠금 선조회가 1차 캐시를 오염시키면 잠금이 stale 을 돌려준다.
        // 재활성화(GeneralClubService#updateStatus)도 같은 행을 첫 조회로 잠그므로 늦게 온 쪽이 기다렸다가 바뀐 상태를 본다.
        Club club = clubRepository.findByIdForUpdate(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.validatePendingCleanable();
        // 잠금 순서 club → club_join_code(가입 신청 거절의 자리 반환) — 폐쇄·가입 요청 생성(#905)과 같다.
        // 두 처리는 한 트랜잭션이라 하나가 실패하면 둘 다 되돌아간다.
        int rejectedApplicationCount = applicationService.rejectActiveOnClubDeactivation(clubId, actorUserId);
        int rejectedJoinRequestCount = joinRequestService.rejectAllPendingOnClubDeactivation(clubId, actorUserId);
        return new ClubPendingCleanupResult(rejectedApplicationCount, rejectedJoinRequestCount);
    }
}
