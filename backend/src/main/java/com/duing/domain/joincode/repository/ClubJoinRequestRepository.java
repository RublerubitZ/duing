package com.duing.domain.joincode.repository;

import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubJoinRequestRepository extends JpaRepository<ClubJoinRequest, Long> {

    /** 요청 생성 전 중복 차단. 동시 유입은 uk_club_join_request_pending 이 백스톱이다. */
    boolean existsByClubIdAndUserIdAndStatus(Long clubId, Long userId, JoinRequestStatus status);

    /** 운영진 상세 조회 — 타 동아리 요청은 조회되지 않아야 하므로 clubId 를 조건에 포함한다. */
    Optional<ClubJoinRequest> findByIdAndClubId(Long joinRequestId, Long clubId);

    /** 학생의 코드 확인 화면이 보여줄 "내 최근 요청 상태" — 재요청 이력이 쌓이므로 최신 1건만 본다. */
    Optional<ClubJoinRequest> findTopByClubIdAndUserIdOrderByIdDesc(Long clubId, Long userId);

    /**
     * 운영진 가입 요청 목록(상태별, 최신순). 목록 항목이 학생 정보와 코드 문자열을 함께 보여주므로
     * LAZY 연관 두 개를 fetch join 해 N+1 을 없앤다.
     */
    @Query("SELECT joinRequest FROM ClubJoinRequest joinRequest "
            + "JOIN FETCH joinRequest.user "
            + "JOIN FETCH joinRequest.joinCode "
            + "WHERE joinRequest.club.id = :clubId AND joinRequest.status = :status "
            + "ORDER BY joinRequest.id DESC")
    List<ClubJoinRequest> findAllByClubIdAndStatusOrderByIdDesc(@Param("clubId") Long clubId,
                                                               @Param("status") JoinRequestStatus status);
}
