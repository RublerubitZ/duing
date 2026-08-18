package com.duing.domain.club.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 학생/공개 경로의 동아리 노출 게이트 — "비공개 상태 동아리는 존재 자체를 숨긴다(404)" 규칙을
 * 메서드 안에 가둔다({@link ClubStatus#isPubliclyVisible} 가 규칙의 정의).
 *
 * <p>멤버·운영진 경로의 상태 게이트는 ClubAuthService(requireActiveClub) 소관으로 별개다 —
 * 그쪽은 소속을 확인한 뒤라 상태별 안내 메시지를 노출하지만, 이 게이트는 열거 방지를 위해
 * 어떤 상태 정보도 흘리지 않는 ClubNotFound 하나로만 응답한다.
 *
 * <p>동아리가 아닌 하위 리소스(모집 등)를 묻는 경로는 그 리소스에 맞는 404 가 은닉 의미론이므로
 * 이 게이트 대신 {@link ClubStatus#isPubliclyVisible} 판정 + 도메인 예외를 직접 쓴다.
 */
@Component
@RequiredArgsConstructor
public class ClubVisibilityPolicy {

    private final ClubRepository clubRepository;

    /**
     * 공개 경로에서 clubId 로 접근할 때의 게이트. 비공개 상태(또는 미존재)는 동일하게 404.
     * existsByIdAndStatus(ACTIVE) 는 isPubliclyVisible 과 동치 — ClubStatusVisibilityTest 가 고정한다.
     */
    public void requirePubliclyVisible(Long clubId) {
        if (!clubRepository.existsByIdAndStatus(clubId, ClubStatus.ACTIVE)) {
            throw new ClubException.ClubNotFoundException();
        }
    }

    /**
     * 이미 로드한 동아리에 대한 같은 게이트 — 추가 조회 없이 판정한다.
     */
    public void requirePubliclyVisible(Club club) {
        if (!club.getStatus().isPubliclyVisible()) {
            throw new ClubException.ClubNotFoundException();
        }
    }
}
