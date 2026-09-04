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

    /**
     * 모집 삭제 가드(스펙 v2 4.2) — 그 모집의 코드로 접수돼 아직 처리되지 않은 요청이 있는지 본다.
     * 요청은 코드를 거쳐 모집에 연결되므로 조인으로 거슬러 올라간다.
     */
    @Query("SELECT COUNT(joinRequest) > 0 FROM ClubJoinRequest joinRequest "
            + "WHERE joinRequest.joinCode.recruitment.id = :recruitmentId "
            + "AND joinRequest.status = com.duing.domain.joincode.entity.JoinRequestStatus.PENDING")
    boolean existsPendingByRecruitmentId(@Param("recruitmentId") Long recruitmentId);

    /**
     * 가입 링크 상태 카드의 "누적 가입 신청"(스펙 v2 7.2) — 거절 후 재요청도 별개 행이라 함께 센다.
     * 카운트는 링크 응답에 실어 한 곳에서만 계산한다(화면 합산 금지).
     */
    long countByJoinCodeId(Long joinCodeId);

    /** 상태 카드의 "승인 대기" — 위 누적과 같은 링크 기준이라 두 수치의 출처가 어긋나지 않는다. */
    long countByJoinCodeIdAndStatus(Long joinCodeId, JoinRequestStatus status);

    /** 운영진 상세 조회 — 타 동아리 요청은 조회되지 않아야 하므로 clubId 를 조건에 포함한다. */
    Optional<ClubJoinRequest> findByIdAndClubId(Long joinRequestId, Long clubId);

    /** 학생의 코드 확인 화면이 보여줄 "내 최근 요청 상태" — 재요청 이력이 쌓이므로 최신 1건만 본다. */
    Optional<ClubJoinRequest> findTopByClubIdAndUserIdOrderByIdDesc(Long clubId, Long userId);

    /** 회원의 요청을 상태별로 전부 — 계정 탈퇴가 본인의 대기 요청을 자동 거절할 때 쓴다(#1142). @SQLRestriction 적용. */
    List<ClubJoinRequest> findAllByUserIdAndStatus(Long userId, JoinRequestStatus status);

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
