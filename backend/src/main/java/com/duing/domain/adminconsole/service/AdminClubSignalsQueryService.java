package com.duing.domain.adminconsole.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSignalSummaryQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연 홈 동아리 현황 — 판정·기준 시각은 모두 동아리 저장소(ClubRepositoryImpl#summarizeSignals)가 정한다.
 * 목록 신호 필터와 같은 행 술어라 같은 순간이면 카드 숫자 = 목록 건수다(동아리 신호 스펙 §1 성공 기준 1). 서비스는 시각을 다루지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminClubSignalsQueryService {

    private final ClubRepository clubRepository;

    public ClubSignalSummaryQuery getClubSignals() {
        return clubRepository.summarizeSignals();
    }
}
