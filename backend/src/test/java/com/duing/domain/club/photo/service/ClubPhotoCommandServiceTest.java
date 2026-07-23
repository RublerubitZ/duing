package com.duing.domain.club.photo.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.heroactivity.entity.ClubHeroActivity;
import com.duing.domain.club.heroactivity.repository.ClubHeroActivityRepository;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.exception.ClubPhotoException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.common.TestcontainersConfiguration;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
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
class ClubPhotoCommandServiceTest {

    @Autowired ClubPhotoService clubPhotoService;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubHeroActivityRepository clubHeroActivityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("create 는 displayOrder 를 MAX+1 로 부여한다 (첫 사진은 0)")
    void createAssignsNextDisplayOrder() throws Exception {
        User officer = saveUser("운영진");
        Club club = saveActiveClub("두잉포토1");
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        Long firstId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), officer.getId(), "k1.jpg", "첫번째", 100, 100)).id();
        Long secondId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), officer.getId(), "k2.jpg", "두번째", 100, 100)).id();

        assertThat(clubPhotoRepository.findById(firstId).orElseThrow().getDisplayOrder()).isEqualTo(0);
        assertThat(clubPhotoRepository.findById(secondId).orElseThrow().getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("MEMBER 는 사진을 생성할 수 없다")
    void memberCannotCreate() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉포토2");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), memberUser.getId(), "k.jpg", null, null, null
        ))).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("승인 대기(PENDING_APPROVAL) 동아리의 리더도 심사 보완을 위해 사진을 올릴 수 있다")
    void pendingClubLeaderCanUploadPhoto() throws Exception {
        User leader = saveUser("대기리더");
        Club club = saveClubWithStatus("두잉포토대기", ClubStatus.PENDING_APPROVAL);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "pending.jpg", "보완 사진", 100, 100)).id();

        assertThat(clubPhotoRepository.findById(photoId)).isPresent();
    }

    @Test
    @DisplayName("거절(REJECTED)된 동아리의 리더도 재심사 보완을 위해 사진을 올릴 수 있다")
    void rejectedClubLeaderCanUploadPhoto() throws Exception {
        User leader = saveUser("거절리더");
        Club club = saveClubWithStatus("두잉포토거절", ClubStatus.REJECTED);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "rejected.jpg", "보완 사진", 100, 100)).id();

        assertThat(clubPhotoRepository.findById(photoId)).isPresent();
    }

    @Test
    @DisplayName("운영 종료(INACTIVE)된 동아리의 리더는 사진을 올릴 수 없다")
    void inactiveClubLeaderCannotUploadPhoto() throws Exception {
        User leader = saveUser("종료리더");
        Club club = saveClubWithStatus("두잉포토종료", ClubStatus.INACTIVE);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "inactive.jpg", null, null, null
        )))
                .isInstanceOf(ClubMemberException.NotActiveClub.class)
                .hasMessage("운영 종료된 동아리입니다.");
    }

    @Test
    @DisplayName("updateCaption 은 caption 만 변경한다")
    void updateCaptionChangesOnlyCaption() throws Exception {
        User leader = saveUser("리더A");
        Club club = saveActiveClub("두잉포토3");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "k.jpg", "원본", 1, 1)).id();

        clubPhotoService.updateCaption(new UpdateClubPhotoCommand(
                club.getId(), leader.getId(), photoId, "수정됨"));

        ClubPhoto reloaded = clubPhotoRepository.findById(photoId).orElseThrow();
        assertThat(reloaded.getCaption()).isEqualTo("수정됨");
        assertThat(reloaded.getDisplayOrder()).isEqualTo(0);
    }

    @Test
    @DisplayName("다른 동아리의 photoId 로 수정하면 NotInClub 이 발생한다")
    void updateRejectsForeignPhoto() throws Exception {
        User leader = saveUser("리더B");
        Club clubA = saveActiveClub("두잉포토4A");
        Club clubB = saveActiveClub("두잉포토4B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        clubMemberRepository.save(ClubMember.asLeader(clubB, leader));
        Long photoInB = clubPhotoService.create(new CreateClubPhotoCommand(
                clubB.getId(), leader.getId(), "kb.jpg", null, null, null)).id();

        assertThatThrownBy(() -> clubPhotoService.updateCaption(new UpdateClubPhotoCommand(
                clubA.getId(), leader.getId(), photoInB, "x"
        ))).isInstanceOf(ClubPhotoException.NotInClub.class);
    }

    @Test
    @DisplayName("reorder 는 페이로드 photoId 집합이 동아리 photo 집합과 일치할 때만 성공한다")
    void reorderAppliesWhenSetsMatch() throws Exception {
        User leader = saveUser("리더C");
        Club club = saveActiveClub("두잉포토5");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null)).id();
        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "2.jpg", null, null, null)).id();
        Long p3 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "3.jpg", null, null, null)).id();

        clubPhotoService.reorder(new ReorderClubPhotosCommand(
                club.getId(), leader.getId(),
                List.of(new PhotoOrder(p3, 0), new PhotoOrder(p1, 1), new PhotoOrder(p2, 2))));

        assertThat(clubPhotoRepository.findById(p3).orElseThrow().getDisplayOrder()).isEqualTo(0);
        assertThat(clubPhotoRepository.findById(p1).orElseThrow().getDisplayOrder()).isEqualTo(1);
        assertThat(clubPhotoRepository.findById(p2).orElseThrow().getDisplayOrder()).isEqualTo(2);
    }

    @Test
    @DisplayName("reorder 페이로드에 사진이 빠지면 OrderMismatch 가 발생한다")
    void reorderRejectsMissingPhoto() throws Exception {
        User leader = saveUser("리더D");
        Club club = saveActiveClub("두잉포토6");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null)).id();
        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "2.jpg", null, null, null)).id();

        assertThatThrownBy(() -> clubPhotoService.reorder(new ReorderClubPhotosCommand(
                club.getId(), leader.getId(),
                List.of(new PhotoOrder(p1, 0))
        ))).isInstanceOf(ClubPhotoException.OrderMismatch.class);

        // 미적용 검증
        assertThat(clubPhotoRepository.findById(p2).orElseThrow().getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("reorder displayOrder 가 0..N-1 연속이 아니면 OrderMismatch 가 발생한다")
    void reorderRejectsNonContiguousOrder() throws Exception {
        User leader = saveUser("리더E");
        Club club = saveActiveClub("두잉포토7");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null)).id();
        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "2.jpg", null, null, null)).id();

        assertThatThrownBy(() -> clubPhotoService.reorder(new ReorderClubPhotosCommand(
                club.getId(), leader.getId(),
                List.of(new PhotoOrder(p1, 0), new PhotoOrder(p2, 5))
        ))).isInstanceOf(ClubPhotoException.OrderMismatch.class);
    }

    @Test
    @DisplayName("delete 는 soft delete 후 list 에서 빠진다")
    void deleteRemovesFromList() throws Exception {
        User leader = saveUser("리더F");
        Club club = saveActiveClub("두잉포토8");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "1.jpg", null, null, null)).id();

        clubPhotoService.delete(club.getId(), leader.getId(), p1);

        assertThat(clubPhotoRepository.findByClubId(club.getId())).isEmpty();
    }

    @Test
    @DisplayName("delete 후 동일 storageKey 로 재등록 가능하다")
    void recreateAfterDelete() throws Exception {
        User leader = saveUser("리더G");
        Club club = saveActiveClub("두잉포토9");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long p1 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "same.jpg", null, null, null)).id();
        clubPhotoService.delete(club.getId(), leader.getId(), p1);

        Long p2 = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "same.jpg", null, null, null)).id();

        assertThat(clubPhotoRepository.findById(p2).orElseThrow().getDisplayOrder()).isEqualTo(0);
    }

    @Test
    @DisplayName("대표 활동이 참조 중인 사진은 삭제하면 ReferencedByHeroActivity 가 발생한다")
    void deleteRejectsPhotoReferencedByHeroActivity() throws Exception {
        User leader = saveUser("리더H");
        Club club = saveActiveClub("두잉포토10");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "hero.jpg", null, null, null)).id();
        ClubPhoto photo = clubPhotoRepository.findById(photoId).orElseThrow();
        clubHeroActivityRepository.save(
                ClubHeroActivity.create(club, photo, "대표활동", "대표 활동 설명", 0));

        assertThatThrownBy(() -> clubPhotoService.delete(club.getId(), leader.getId(), photoId))
                .isInstanceOf(ClubPhotoException.ReferencedByHeroActivity.class);

        assertThat(clubPhotoRepository.findById(photoId)).isPresent();
    }

    @Test
    @DisplayName("대표 활동에서 해제한 뒤에는 참조되던 사진도 삭제할 수 있다")
    void deleteSucceedsAfterHeroActivityReleased() throws Exception {
        User leader = saveUser("리더I");
        Club club = saveActiveClub("두잉포토11");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "hero2.jpg", null, null, null)).id();
        ClubPhoto photo = clubPhotoRepository.findById(photoId).orElseThrow();
        ClubHeroActivity hero = clubHeroActivityRepository.save(
                ClubHeroActivity.create(club, photo, "대표활동", "대표 활동 설명", 0));

        clubHeroActivityRepository.delete(hero);
        clubPhotoService.delete(club.getId(), leader.getId(), photoId);

        assertThat(clubPhotoRepository.findByClubId(club.getId())).isEmpty();
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
        return saveClubWithStatus(name, ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }
}
