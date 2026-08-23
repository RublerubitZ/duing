package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.user.repository.UserRepository;
import java.sql.SQLException;
import java.time.Clock;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * 선조회(existsByName)를 함께 통과한 동시 동아리 등록·개명 경합이 전역 핸들러의 generic 409 가 아니라
 * 사전 검사와 같은 중복 이름 409 로 표면화되는지 고정한다 (PR-10 로컬 catch 정비, uk_club_name_active V109).
 */
class ClubNameRaceGuardTest {

    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final GeneralClubService clubService = new GeneralClubService(
            clubRepository,
            new ClubVisibilityPolicy(clubRepository),
            userRepository,
            mock(ClubMemberRepository.class),
            mock(ClubPhotoRepository.class),
            mock(ClubAuthService.class),
            mock(RecruitmentRepository.class),
            mock(RecruitmentService.class),
            mock(ApplicationRepository.class),
            // 실제 빈(seoulClock)과 동일한 Asia/Seoul 존 — systemDefaultZone 은 환경 의존.
            Clock.system(ZoneId.of("Asia/Seoul")),
            mock(ApplicationEventPublisher.class));

    @Test
    @DisplayName("선조회를 함께 통과한 동시 등록이 uk_club_name_active 에 걸리면 사전 검사와 같은 중복 이름 409 로 표면화된다")
    void racedClubCreateSurfacesAsDuplicateClubName() {
        when(clubRepository.existsByName("두잉")).thenReturn(false);
        when(userRepository.findById(5L)).thenReturn(Optional.of(UserFixture.unique()));
        when(clubRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(uniqueViolation("uk_club_name_active")).when(clubRepository).flush();

        CreateClubCommand createCommand = new CreateClubCommand(
                "두잉", ClubCategory.ACADEMIC, null, "설명", null, 5L, false, null, null);

        assertThatThrownBy(() -> clubService.create(createCommand))
                .isInstanceOf(ClubException.DuplicateClubNameException.class);
    }

    @Test
    @DisplayName("동시 등록 경로의 다른 제약 위반은 중복 이름 409 로 둔갑하지 않고 그대로 전파된다")
    void unrelatedViolationIsRethrown() {
        when(clubRepository.existsByName("두잉")).thenReturn(false);
        when(userRepository.findById(5L)).thenReturn(Optional.of(UserFixture.unique()));
        when(clubRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        DataIntegrityViolationException foreignViolation = uniqueViolation("uk_other_constraint");
        doThrow(foreignViolation).when(clubRepository).flush();

        CreateClubCommand createCommand = new CreateClubCommand(
                "두잉", ClubCategory.ACADEMIC, null, "설명", null, 5L, false, null, null);

        assertThatThrownBy(() -> clubService.create(createCommand)).isSameAs(foreignViolation);
    }

    @Test
    @DisplayName("선조회를 함께 통과한 동시 개명이 uk_club_name_active 에 걸리면 사전 검사와 같은 중복 이름 409 로 표면화된다")
    void racedClubRenameSurfacesAsDuplicateClubName() {
        Club club = ClubFixture.academic("기존이름");
        when(clubRepository.findById(1L)).thenReturn(Optional.of(club));
        when(clubRepository.existsByName("새이름")).thenReturn(false);
        doThrow(uniqueViolation("uk_club_name_active")).when(clubRepository).flush();

        // 개명 경합 catch 는 applyProfileUpdate 단일 지점 — 리더 update()·총동연 updateAsAdmin() 이 공유한다.
        UpdateClubCommand renameCommand = new UpdateClubCommand(
                1L, null, "새이름", null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null);

        assertThatThrownBy(() -> clubService.updateAsAdmin(renameCommand))
                .isInstanceOf(ClubException.DuplicateClubNameException.class);
    }

    private static DataIntegrityViolationException uniqueViolation(String constraintName) {
        return new DataIntegrityViolationException("wrapper", new SQLException(
                "duplicate key value violates unique constraint \"" + constraintName + "\"", "23505"));
    }
}
