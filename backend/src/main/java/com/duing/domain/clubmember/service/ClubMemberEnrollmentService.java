package com.duing.domain.clubmember.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.User;

/**
 * 동아리 회원 등록(upgrade-or-insert)의 단일 소스.
 * 지원 합격 처리·가입 코드 승인 등 기존 회원일 수 있는 사용자를 받아들이는 등록(enrollment) 경로는 이 서비스만 호출한다
 * — 같은 로직을 두 곳에 두는 것을 금지한다.
 * (동아리 생성 시 개설자를 리더로 넣는 것처럼, 회원이 없음이 보장된 최초 생성 경로는 여기에 해당하지 않는다.)
 */
public interface ClubMemberEnrollmentService {

    /**
     * 호출측 트랜잭션 안에서({@code Propagation.MANDATORY}) 회원을 등록한다.
     * <ul>
     *   <li>활성 멤버십이 없으면 신규 생성 — {@code generation} 이 그대로 반영된다.</li>
     *   <li>활성 멤버십이 있으면 상위 역할로만 승급한다 (강등 금지, 멱등성 보장).
     *       이 경우 기존 기수는 건드리지 않는다.</li>
     * </ul>
     * 동시 등록 경합은 club_member (club_id, user_id) WHERE deleted_at IS NULL partial unique 인덱스(V7)로
     * DB 레벨에서 차단된다. flush 로 트랜잭션 안에서 충돌을 트리거하고,
     * 23505 + uk_club_member_club_user_active 만 멱등 처리, 나머지는 전파한다.
     */
    void enroll(Club club, User user, ClubMemberRole grantedRole, Integer generation);
}
