package com.duing.domain.clubmember.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.global.exception.PostgresConstraintViolations;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GeneralClubMemberEnrollmentService implements ClubMemberEnrollmentService {

    // V7 partial unique 인덱스. (club_id, user_id) WHERE deleted_at IS NULL.
    private static final String CLUB_MEMBER_UNIQUE_CONSTRAINT = "uk_club_member_club_user_active";

    private final ClubMemberRepository clubMemberRepository;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void enroll(Club club, User user, ClubMemberRole grantedRole, Integer generation) {
        clubMemberRepository.findByClubIdAndUserId(club.getId(), user.getId())
                .ifPresentOrElse(
                        existingMembership -> {
                            if (shouldUpgrade(existingMembership.getRole(), grantedRole)) {
                                existingMembership.changeRole(grantedRole);
                            }
                        },
                        () -> {
                            try {
                                clubMemberRepository.save(ClubMember.of(club, user, grantedRole, generation));
                                clubMemberRepository.flush();
                            } catch (DataIntegrityViolationException racedInsertion) {
                                if (!isClubMemberDuplicateMembership(racedInsertion)) {
                                    throw racedInsertion;
                                }
                                // 다른 트랜잭션이 (club, user) 멤버십을 먼저 커밋했다. 여기서 삼키고 진행할 수는
                                // 없다 — 23505 로 PostgreSQL 트랜잭션이 이미 aborted 라 후속 쿼리도, 커밋도
                                // 전부 실패한다(#921). 호출측 전체를 롤백시키고 409 로 표면화한다.
                                // 이 예외가 이 트랜잭션의 마지막 문장이라 aborted 커넥션에는 ROLLBACK 만 나간다.
                                throw new ClubMemberException.DuplicateMembershipException();
                            }
                        });
    }

    /**
     * 현재 역할보다 부여할 역할이 상위일 때만 true 를 반환한다.
     * 역할 서열: MEMBER(0) < OFFICER(1) < LEADER(2).
     * LEADER 는 이 경로에서 부여되지 않으며, 강등은 절대 허용하지 않는다.
     */
    private boolean shouldUpgrade(ClubMemberRole currentRole, ClubMemberRole grantedRole) {
        return grantedRole.ordinal() > currentRole.ordinal();
    }

    /**
     * 동시 등록으로 인한 club_member 중복 삽입 only true.
     * 향후 club_member 에 새 unique / CHECK / FK 가 추가되어도 그 위반은 409 로 둔갑하지 않고
     * 그대로 위로 전파된다.
     */
    private static boolean isClubMemberDuplicateMembership(DataIntegrityViolationException exception) {
        return PostgresConstraintViolations.isUniqueViolationOf(exception, CLUB_MEMBER_UNIQUE_CONSTRAINT);
    }
}
