package com.duing.common.fixture;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 운영 중(ACTIVE) 동아리와 회장·임원·일반 부원 구성 — 운영진(회장·임원) 대상 알림 테스트 공용.
 * 수신자 조회가 DB 의 club_member·club.status 를 읽으므로, 다른 픽스처와 달리 저장까지 한다(리포지토리는 호출 측이 넘긴다).
 */
public final class ClubStaffFixture {

    // 동아리 이름이 테스트 안에서 겹치지 않게 하는 시퀀스(UserFixture 와 같은 방식).
    private static final AtomicLong SEQUENCE = new AtomicLong(System.nanoTime());

    private ClubStaffFixture() {
    }

    public record Staff(Club club, User leader, User officer, User member) {}

    /** 이름이 유일한 ACTIVE 동아리를 생성한다 — 승인 절차를 건너뛰고 상태만 바꾼다(저장은 호출 측). */
    public static Club activeClub() {
        Club club = ClubFixture.academic("운영진알림동아리" + SEQUENCE.incrementAndGet());
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return club;
    }

    /** ACTIVE 동아리와 회장·임원·일반 부원 각 1명을 저장한다. */
    public static Staff saveWithStaff(ClubRepository clubRepository, UserRepository userRepository,
                                      ClubMemberRepository clubMemberRepository) {
        Club club = clubRepository.save(activeClub());
        User leader = userRepository.save(UserFixture.unique());
        User officer = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, member));
        return new Staff(club, leader, officer, member);
    }
}
