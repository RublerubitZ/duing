package com.duing.domain.club.heroactivity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.heroactivity.exception.ClubHeroActivityException;
import com.duing.domain.club.heroactivity.repository.ClubHeroActivityRepository;
import com.duing.domain.club.heroactivity.service.dto.command.CreateHeroActivityCommand;
import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand;
import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand.HeroOrder;
import com.duing.domain.club.heroactivity.service.dto.command.UpdateHeroActivityCommand;
import com.duing.domain.club.heroactivity.service.dto.query.HeroActivityQuery;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubHeroActivityServiceTest {

    @Autowired ClubHeroActivityService clubHeroActivityService;
    @Autowired ClubHeroActivityRepository clubHeroActivityRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("리더가 사진·제목·설명·슬롯3으로 생성하면 storageKey 조인이 포함된 쿼리가 반환된다")
    void createReturnsQueryWithJoinedStorageKey() throws Exception {
        User leader = saveUser("리더생성");
        Club club = saveActiveClub("두잉히어로1");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo = savePhoto(club, "hero1.jpg", 0);

        HeroActivityQuery created = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo.getId(), "대표활동", "설명입니다", 3));

        assertThat(created.storageKey()).isEqualTo("hero1.jpg");
        assertThat(created.clubPhotoId()).isEqualTo(photo.getId());
        assertThat(created.title()).isEqualTo("대표활동");
        assertThat(created.description()).isEqualTo("설명입니다");
        assertThat(created.displayOrder()).isEqualTo(3);
    }

    @Test
    @DisplayName("슬롯 범위 밖(0, 7)으로 생성하면 SlotOutOfRange 가 발생한다")
    void createRejectsSlotOutOfRange() throws Exception {
        User leader = saveUser("리더범위");
        Club club = saveActiveClub("두잉히어로2");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photoLow = savePhoto(club, "low.jpg", 0);
        ClubPhoto photoHigh = savePhoto(club, "high.jpg", 1);

        assertThatThrownBy(() -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photoLow.getId(), "t", "d", 0)))
                .isInstanceOf(ClubHeroActivityException.SlotOutOfRange.class);
        assertThatThrownBy(() -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photoHigh.getId(), "t", "d", 7)))
                .isInstanceOf(ClubHeroActivityException.SlotOutOfRange.class);
    }

    @Test
    @DisplayName("이미 점유된 슬롯으로 생성하면 SlotOccupied 가 발생한다")
    void createRejectsOccupiedSlot() throws Exception {
        User leader = saveUser("리더점유");
        Club club = saveActiveClub("두잉히어로3");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto first = savePhoto(club, "occ1.jpg", 0);
        ClubPhoto second = savePhoto(club, "occ2.jpg", 1);
        clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), first.getId(), "t", "d", 3));

        assertThatThrownBy(() -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), second.getId(), "t", "d", 3)))
                .isInstanceOf(ClubHeroActivityException.SlotOccupied.class);
    }

    @Test
    @DisplayName("같은 사진을 두 슬롯에 중복 등록하면 PhotoAlreadyFeatured 가 발생한다")
    void createRejectsDuplicatePhoto() throws Exception {
        User leader = saveUser("리더중복");
        Club club = saveActiveClub("두잉히어로4");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo = savePhoto(club, "dup.jpg", 0);
        clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo.getId(), "t", "d", 1));

        assertThatThrownBy(() -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo.getId(), "t", "d", 2)))
                .isInstanceOf(ClubHeroActivityException.PhotoAlreadyFeatured.class);
    }

    @Test
    @DisplayName("타 클럽 사진을 참조해 생성하면 PhotoNotFound 가 발생한다")
    void createRejectsForeignPhoto() throws Exception {
        User leader = saveUser("리더타클럽");
        Club clubA = saveActiveClub("두잉히어로5A");
        Club clubB = saveActiveClub("두잉히어로5B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        ClubPhoto photoInB = savePhoto(clubB, "foreign.jpg", 0);

        assertThatThrownBy(() -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                clubA.getId(), leader.getId(), photoInB.getId(), "t", "d", 1)))
                .isInstanceOf(ClubHeroActivityException.PhotoNotFound.class);
    }

    @Test
    @DisplayName("update 로 제목만 바꾸면 설명은 그대로 유지된다")
    void updatePartiallyChangesTitleOnly() throws Exception {
        User leader = saveUser("리더부분");
        Club club = saveActiveClub("두잉히어로6");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo = savePhoto(club, "u.jpg", 0);
        Long heroId = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo.getId(), "원래제목", "원래설명", 1)).id();

        clubHeroActivityService.update(new UpdateHeroActivityCommand(
                club.getId(), leader.getId(), heroId, null, "바뀐제목", null));

        var reloaded = clubHeroActivityRepository.findById(heroId).orElseThrow();
        assertThat(reloaded.getTitle()).isEqualTo("바뀐제목");
        assertThat(reloaded.getDescription()).isEqualTo("원래설명");
    }

    @Test
    @DisplayName("update 사진 교체 시 자기 사진 재지정은 허용되고, 타 활동 사진은 PhotoAlreadyFeatured, 미소속 사진은 PhotoNotFound 다")
    void updatePhotoValidatesClubAndDuplicate() throws Exception {
        User leader = saveUser("리더교체");
        Club club = saveActiveClub("두잉히어로7");
        Club otherClub = saveActiveClub("두잉히어로7X");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.asLeader(otherClub, leader));
        ClubPhoto photo1 = savePhoto(club, "p1.jpg", 0);
        ClubPhoto photo2 = savePhoto(club, "p2.jpg", 1);
        ClubPhoto fresh = savePhoto(club, "fresh.jpg", 2);
        ClubPhoto foreign = savePhoto(otherClub, "foreign.jpg", 0);
        Long hero1 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo1.getId(), "t1", "d1", 1)).id();
        clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo2.getId(), "t2", "d2", 2));

        // 자기 사진 재지정 → 허용
        assertThatCode(() -> clubHeroActivityService.update(new UpdateHeroActivityCommand(
                club.getId(), leader.getId(), hero1, photo1.getId(), null, null)))
                .doesNotThrowAnyException();
        // 타 활동이 쓰는 사진 → 중복
        assertThatThrownBy(() -> clubHeroActivityService.update(new UpdateHeroActivityCommand(
                club.getId(), leader.getId(), hero1, photo2.getId(), null, null)))
                .isInstanceOf(ClubHeroActivityException.PhotoAlreadyFeatured.class);
        // 타 클럽 사진 → 미발견
        assertThatThrownBy(() -> clubHeroActivityService.update(new UpdateHeroActivityCommand(
                club.getId(), leader.getId(), hero1, foreign.getId(), null, null)))
                .isInstanceOf(ClubHeroActivityException.PhotoNotFound.class);
        // 미사용 같은 클럽 사진 → 교체 성공
        clubHeroActivityService.update(new UpdateHeroActivityCommand(
                club.getId(), leader.getId(), hero1, fresh.getId(), null, null));
        assertThat(clubHeroActivityRepository.findById(hero1).orElseThrow()
                .getClubPhoto().getId()).isEqualTo(fresh.getId());
    }

    @Test
    @DisplayName("reorder 로 1번과 2번 슬롯을 스왑해도 유니크 충돌 없이 성공한다")
    void reorderSwapsSlotsWithoutUniqueViolation() throws Exception {
        User leader = saveUser("리더스왑");
        Club club = saveActiveClub("두잉히어로8");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo1 = savePhoto(club, "s1.jpg", 0);
        ClubPhoto photo2 = savePhoto(club, "s2.jpg", 1);
        Long hero1 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo1.getId(), "t1", "d1", 1)).id();
        Long hero2 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo2.getId(), "t2", "d2", 2)).id();

        clubHeroActivityService.reorder(new ReorderHeroActivitiesCommand(
                club.getId(), leader.getId(),
                List.of(new HeroOrder(hero1, 2), new HeroOrder(hero2, 1))));

        assertThat(clubHeroActivityRepository.findById(hero1).orElseThrow().getDisplayOrder()).isEqualTo(2);
        assertThat(clubHeroActivityRepository.findById(hero2).orElseThrow().getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("reorder 페이로드 집합이 다르면 OrderMismatch, 슬롯 범위 밖이면 SlotOutOfRange 다")
    void reorderRejectsMismatchAndOutOfRange() throws Exception {
        User leader = saveUser("리더정렬오류");
        Club club = saveActiveClub("두잉히어로9");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo1 = savePhoto(club, "r1.jpg", 0);
        ClubPhoto photo2 = savePhoto(club, "r2.jpg", 1);
        Long hero1 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo1.getId(), "t1", "d1", 1)).id();
        Long hero2 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo2.getId(), "t2", "d2", 2)).id();

        assertThatThrownBy(() -> clubHeroActivityService.reorder(new ReorderHeroActivitiesCommand(
                club.getId(), leader.getId(), List.of(new HeroOrder(hero1, 1)))))
                .isInstanceOf(ClubHeroActivityException.OrderMismatch.class);
        assertThatThrownBy(() -> clubHeroActivityService.reorder(new ReorderHeroActivitiesCommand(
                club.getId(), leader.getId(),
                List.of(new HeroOrder(hero1, 1), new HeroOrder(hero2, 7)))))
                .isInstanceOf(ClubHeroActivityException.SlotOutOfRange.class);
    }

    @Test
    @DisplayName("delete 후 남은 슬롯 순서는 당겨지지 않고 유지된다")
    void deleteDoesNotShiftRemainingSlots() throws Exception {
        User leader = saveUser("리더삭제");
        Club club = saveActiveClub("두잉히어로10");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo1 = savePhoto(club, "d1.jpg", 0);
        ClubPhoto photo2 = savePhoto(club, "d2.jpg", 1);
        ClubPhoto photo3 = savePhoto(club, "d3.jpg", 2);
        Long hero1 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo1.getId(), "t1", "d1", 1)).id();
        Long hero2 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo2.getId(), "t2", "d2", 2)).id();
        Long hero3 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo3.getId(), "t3", "d3", 3)).id();

        clubHeroActivityService.delete(club.getId(), leader.getId(), hero2);

        assertThat(clubHeroActivityRepository.findById(hero1).orElseThrow().getDisplayOrder()).isEqualTo(1);
        assertThat(clubHeroActivityRepository.findById(hero3).orElseThrow().getDisplayOrder()).isEqualTo(3);
        assertThat(clubHeroActivityRepository.findByClubId(club.getId())).hasSize(2);
    }

    @Test
    @DisplayName("비관리자(MEMBER)가 생성을 호출하면 AccessDeniedException 이 발생한다")
    void memberCannotCreate() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉히어로11");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        ClubPhoto photo = savePhoto(club, "m.jpg", 0);

        assertThatThrownBy(() -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), memberUser.getId(), photo.getId(), "t", "d", 1)))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("대표 활동을 삭제한 뒤 같은 슬롯·같은 사진으로 다시 생성하면 부분 유니크 위반 없이 성공한다")
    void recreateAfterDeleteWithSameSlotAndPhotoSucceeds() throws Exception {
        User leader = saveUser("리더재등록");
        Club club = saveActiveClub("두잉히어로재등록");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo = savePhoto(club, "recreate.jpg", 0);
        Long firstHeroId = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo.getId(), "처음제목", "처음설명", 2)).id();

        clubHeroActivityService.delete(club.getId(), leader.getId(), firstHeroId);
        // soft-delete UPDATE 를 재생성 INSERT 보다 먼저 밀어내 두 요청(두 트랜잭션) 흐름을 재현한다.
        clubHeroActivityRepository.flush();

        HeroActivityQuery recreated = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo.getId(), "다시제목", "다시설명", 2));

        assertThat(recreated.id()).isNotEqualTo(firstHeroId);
        assertThat(recreated.clubPhotoId()).isEqualTo(photo.getId());
        assertThat(recreated.displayOrder()).isEqualTo(2);
        assertThat(clubHeroActivityRepository.findByClubId(club.getId())).hasSize(1);
    }

    @Test
    @DisplayName("자기 clubId 에 타 클럽 대표 활동 id 로 update·delete 하면 NotInClub 이 발생한다")
    void updateAndDeleteRejectForeignHeroActivity() throws Exception {
        User leader = saveUser("리더타활동");
        Club clubA = saveActiveClub("두잉히어로타A");
        Club clubB = saveActiveClub("두잉히어로타B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        clubMemberRepository.save(ClubMember.asLeader(clubB, leader));
        ClubPhoto photoInB = savePhoto(clubB, "inB.jpg", 0);
        Long heroInB = clubHeroActivityService.create(new CreateHeroActivityCommand(
                clubB.getId(), leader.getId(), photoInB.getId(), "b제목", "b설명", 1)).id();

        assertThatThrownBy(() -> clubHeroActivityService.update(new UpdateHeroActivityCommand(
                clubA.getId(), leader.getId(), heroInB, null, "바꿈", null)))
                .isInstanceOf(ClubHeroActivityException.NotInClub.class);
        assertThatThrownBy(() -> clubHeroActivityService.delete(clubA.getId(), leader.getId(), heroInB))
                .isInstanceOf(ClubHeroActivityException.NotInClub.class);
    }

    @Test
    @DisplayName("reorder 페이로드에 중복 슬롯 또는 중복 id 가 있으면 OrderMismatch 가 발생한다")
    void reorderRejectsDuplicateSlotAndDuplicateId() throws Exception {
        User leader = saveUser("리더중복정렬");
        Club club = saveActiveClub("두잉히어로중복정렬");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo1 = savePhoto(club, "dq1.jpg", 0);
        ClubPhoto photo2 = savePhoto(club, "dq2.jpg", 1);
        Long hero1 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo1.getId(), "t1", "d1", 1)).id();
        Long hero2 = clubHeroActivityService.create(new CreateHeroActivityCommand(
                club.getId(), leader.getId(), photo2.getId(), "t2", "d2", 2)).id();

        // 서로 다른 대표 활동이 같은 슬롯 1 을 요구 → 중복 슬롯
        assertThatThrownBy(() -> clubHeroActivityService.reorder(new ReorderHeroActivitiesCommand(
                club.getId(), leader.getId(),
                List.of(new HeroOrder(hero1, 1), new HeroOrder(hero2, 1)))))
                .isInstanceOf(ClubHeroActivityException.OrderMismatch.class);
        // 같은 대표 활동 id 가 두 번, 다른 id 는 누락 → 중복 id
        assertThatThrownBy(() -> clubHeroActivityService.reorder(new ReorderHeroActivitiesCommand(
                club.getId(), leader.getId(),
                List.of(new HeroOrder(hero1, 1), new HeroOrder(hero1, 2)))))
                .isInstanceOf(ClubHeroActivityException.OrderMismatch.class);
    }

    private ClubPhoto savePhoto(Club club, String storageKey, int displayOrder) {
        return clubPhotoRepository.save(
                ClubPhoto.create(club, storageKey, "캡션", 100, 100, displayOrder));
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
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
