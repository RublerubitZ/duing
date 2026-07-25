package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MemberFeeStatus;
import com.duing.common.fixture.FeeBillFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.common.TestcontainersConfiguration;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubMemberQueryServiceTest {

    @Autowired ClubMemberQueryService clubMemberQueryService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired EntityManagerFactory entityManagerFactory;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("LEADER 가 호출하면 LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순으로 반환된다")
    void leaderGetsOrderedList() throws Exception {
        User leader = saveUser("리더1");
        User officerA = saveUser("운영A");
        User officerB = saveUser("운영B");
        User memberA = saveUser("일반A");
        User memberB = saveUser("일반B");
        Club club = saveActiveClub("두잉멤버1");
        // 저장 순서대로 createdAt 이 오름차순으로 부여된다 (BaseEntity @CreatedDate)
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officerA, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, officerB, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberA));
        clubMemberRepository.save(ClubMember.asMember(club, memberB));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).extracting(ClubMemberQuery::name)
                .containsExactly("리더1", "운영A", "운영B", "일반A", "일반B");
        assertThat(result).extracting(ClubMemberQuery::role)
                .containsExactly(
                        ClubMemberRole.LEADER,
                        ClubMemberRole.OFFICER, ClubMemberRole.OFFICER,
                        ClubMemberRole.MEMBER, ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("OFFICER 도 멤버 목록을 조회할 수 있다")
    void officerCanGetList() throws Exception {
        User leader = saveUser("리더2");
        User officer = saveUser("운영2");
        Club club = saveActiveClub("두잉멤버2");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), officer.getId());

        assertThat(result).hasSize(2);
    }

    @Test
    @DisplayName("MEMBER 가 호출하면 AccessDenied 가 발생한다")
    void memberIsRejected() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉멤버3");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubMemberQueryService.getMembers(club.getId(), memberUser.getId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("비멤버가 호출하면 NotAMember 가 발생한다")
    void nonMemberIsRejected() throws Exception {
        User stranger = saveUser("외부인");
        Club club = saveActiveClub("두잉멤버4");

        assertThatThrownBy(() -> clubMemberQueryService.getMembers(club.getId(), stranger.getId()))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("soft-delete 된 멤버는 결과에 포함되지 않는다")
    void softDeletedExcluded() throws Exception {
        User leader = saveUser("리더5");
        User leftMember = saveUser("탈퇴자");
        Club club = saveActiveClub("두잉멤버5");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember leftMembership = clubMemberRepository.save(ClubMember.asMember(club, leftMember));

        clubMemberRepository.delete(leftMembership);

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).extracting(ClubMemberQuery::name).containsExactly("리더5");
    }

    @Test
    @DisplayName("멤버 조회 결과에 학과·학년·전화번호가 사용자 정보에서 채워진다")
    void memberRowsCarryUserProfileFields() throws Exception {
        User leader = saveUser("리더프로필");
        Club club = saveActiveClub("프로필동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).hasSize(1);
        ClubMemberQuery row = result.get(0);
        assertThat(row.major()).isEqualTo("미설정");
        assertThat(row.grade()).isEqualTo(Grade.FRESHMAN);
        assertThat(row.phone()).isEqualTo("010-0000-0000");
    }

    @Test
    @DisplayName("멤버 목록의 회비 상태는 최신 비-CANCELLED 청구로 판정된다: PAID→PAID, OVERDUE→UNPAID, 청구없음/CANCELLED→NONE")
    void feeStatusReflectsLatestNonCancelledBill() throws Exception {
        User leader = saveUser("회비리더");
        User paidMember = saveUser("완납회원");
        User unpaidMember = saveUser("미납회원");
        User noneMember = saveUser("무청구회원");
        Club club = saveActiveClub("회비동아리");
        Long clubId = club.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.asMember(club, paidMember));
        clubMemberRepository.save(ClubMember.asMember(club, unpaidMember));
        clubMemberRepository.save(ClubMember.asMember(club, noneMember));
        Long policyId = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L)).getId();

        // ① 최신 청구가 PAID → PAID
        saveBill(clubId, paidMember.getId(), policyId, "2026-06", FeeStatus.PAID);
        // ② 과거에 PAID 가 있어도 최신 청구가 OVERDUE → UNPAID (오래된 것부터 저장해 최신이 OVERDUE 가 되게)
        saveBill(clubId, unpaidMember.getId(), policyId, "2026-05", FeeStatus.PAID);
        saveBill(clubId, unpaidMember.getId(), policyId, "2026-06", FeeStatus.OVERDUE);
        // ③ 비-CANCELLED 청구 없음(있는 건 CANCELLED 뿐) → NONE
        saveBill(clubId, noneMember.getId(), policyId, "2026-06", FeeStatus.CANCELLED);

        Map<String, ClubMemberQuery> byName = clubMemberQueryService.getMembers(clubId, leader.getId()).stream()
                .collect(Collectors.toMap(ClubMemberQuery::name, row -> row));

        assertThat(byName.get("완납회원").feeStatus()).isEqualTo(MemberFeeStatus.PAID);
        assertThat(byName.get("미납회원").feeStatus()).isEqualTo(MemberFeeStatus.UNPAID);
        assertThat(byName.get("무청구회원").feeStatus()).isEqualTo(MemberFeeStatus.NONE);
        // 청구가 전혀 없는 리더도 NONE
        assertThat(byName.get("회비리더").feeStatus()).isEqualTo(MemberFeeStatus.NONE);
    }

    @Test
    @DisplayName("멤버 목록에 회원 기수(generation)가 반영되고, 미설정 회원은 null 로 내려온다")
    void memberRowsCarryGeneration() throws Exception {
        User leader = saveUser("기수리더");
        User genMember = saveUser("기수회원");
        Club club = saveActiveClub("기수동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember genMembership = clubMemberRepository.save(ClubMember.asMember(club, genMember));
        genMembership.changeGeneration(7);
        clubMemberRepository.save(genMembership);

        Map<String, ClubMemberQuery> byName = clubMemberQueryService.getMembers(club.getId(), leader.getId()).stream()
                .collect(Collectors.toMap(ClubMemberQuery::name, row -> row));

        assertThat(byName.get("기수회원").generation()).isEqualTo(7);
        assertThat(byName.get("기수리더").generation()).isNull();
    }

    @Test
    @DisplayName("export 목록에도 회원 기수와 최신 청구 기준 회비 상태가 실린다")
    void exportCarriesGenerationAndFeeStatus() throws Exception {
        User leader = saveUser("export리더");
        User paidMember = saveUser("export완납");
        Club club = saveActiveClub("export동아리");
        Long clubId = club.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember paidMembership = clubMemberRepository.save(ClubMember.asMember(club, paidMember));
        paidMembership.changeGeneration(2);
        clubMemberRepository.save(paidMembership);
        Long policyId = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L)).getId();
        saveBill(clubId, paidMember.getId(), policyId, "2026-06", FeeStatus.PAID);

        Map<String, ClubMemberExportQuery> byName = clubMemberQueryService
                .getMembersForExport(clubId, leader.getId(), false, null).stream()
                .collect(Collectors.toMap(ClubMemberExportQuery::name, row -> row));

        assertThat(byName.get("export완납").generation()).isEqualTo(2);
        assertThat(byName.get("export완납").feeStatus()).isEqualTo(MemberFeeStatus.PAID);
        assertThat(byName.get("export리더").generation()).isNull();
        assertThat(byName.get("export리더").feeStatus()).isEqualTo(MemberFeeStatus.NONE);
    }

    @Test
    @DisplayName("멤버 목록 조회 쿼리 수는 회원 수와 무관하게 일정하다 — 회비 상태는 멤버당이 아닌 단일 배치 쿼리")
    void memberListQueryCountIsConstantRegardlessOfMemberCount() throws Exception {
        User smallLeader = saveUser("소규모리더");
        Club smallClub = saveActiveClub("소규모동아리");
        clubMemberRepository.save(ClubMember.asLeader(smallClub, smallLeader));
        clubMemberRepository.save(ClubMember.asMember(smallClub, saveUser("소규모회원1")));

        User bigLeader = saveUser("대규모리더");
        Club bigClub = saveActiveClub("대규모동아리");
        clubMemberRepository.save(ClubMember.asLeader(bigClub, bigLeader));
        for (int index = 0; index < 6; index++) {
            clubMemberRepository.save(ClubMember.asMember(bigClub, saveUser("대규모회원" + index)));
        }

        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        // 워밍업: 세션 최초 쿼리에서 일어나는 1회성 준비 비용을 계측에서 배제한다.
        clubMemberQueryService.getMembers(smallClub.getId(), smallLeader.getId());

        long beforeSmall = statistics.getPrepareStatementCount();
        clubMemberQueryService.getMembers(smallClub.getId(), smallLeader.getId());
        long smallQueries = statistics.getPrepareStatementCount() - beforeSmall;

        long beforeBig = statistics.getPrepareStatementCount();
        clubMemberQueryService.getMembers(bigClub.getId(), bigLeader.getId());
        long bigQueries = statistics.getPrepareStatementCount() - beforeBig;

        // 회원 2명과 7명의 쿼리 수가 동일 = 멤버당 추가 쿼리(N+1) 없음.
        assertThat(bigQueries).isEqualTo(smallQueries);
        // 인가 검증 + 멤버 목록 + 회비 배치로 상수 범위에 머문다.
        assertThat(smallQueries).isLessThanOrEqualTo(4);
    }

    /** period(회차) 로 청구를 만들고 PAID/OVERDUE 등 비-PENDING 상태를 실제로 반영한다(픽스처는 CANCELLED 만 전이). */
    private void saveBill(Long clubId, Long userId, Long policyId, String period, FeeStatus status) {
        FeeBill bill = feeBillRepository.save(FeeBillFixture.withStatus(clubId, userId, policyId, period, status));
        if (status != FeeStatus.PENDING && status != FeeStatus.CANCELLED) {
            bill.updateStatus(status);
            feeBillRepository.save(bill);
        }
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
