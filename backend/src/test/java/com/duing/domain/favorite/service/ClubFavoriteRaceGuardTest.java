package com.duing.domain.favorite.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.favorite.exception.FavoriteException;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.user.repository.UserRepository;
import java.sql.SQLException;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * 선조회(existsByUserIdAndClubId)를 함께 통과한 동시 찜 경합이 전역 핸들러의 generic 409 가 아니라
 * 사전 검사와 같은 도메인 409 로 표면화되는지 고정한다 (PR-10 로컬 catch 정비).
 */
class ClubFavoriteRaceGuardTest {

    private final ClubFavoriteRepository favoriteRepository = mock(ClubFavoriteRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final GeneralClubFavoriteService favoriteService = new GeneralClubFavoriteService(
            favoriteRepository, clubRepository, userRepository, new ClubVisibilityPolicy(clubRepository));

    @Test
    @DisplayName("선조회를 함께 통과한 동시 찜이 uq_club_favorite 에 걸리면 사전 검사와 같은 중복 찜 409 로 표면화된다")
    void racedFavoriteInsertSurfacesAsAlreadyFavorited() {
        stubHappyPathUntilInsert();
        doThrow(uniqueViolation("uq_club_favorite")).when(favoriteRepository).flush();

        assertThatThrownBy(() -> favoriteService.add(10L, 1L))
                .isInstanceOf(FavoriteException.AlreadyFavoritedException.class);
    }

    @Test
    @DisplayName("찜 경로의 다른 제약 위반은 중복 찜 409 로 둔갑하지 않고 그대로 전파된다")
    void unrelatedViolationIsRethrown() {
        stubHappyPathUntilInsert();
        DataIntegrityViolationException foreignViolation = uniqueViolation("uk_other_constraint");
        doThrow(foreignViolation).when(favoriteRepository).flush();

        assertThatThrownBy(() -> favoriteService.add(10L, 1L)).isSameAs(foreignViolation);
    }

    private void stubHappyPathUntilInsert() {
        when(clubRepository.existsByIdAndStatus(1L, ClubStatus.ACTIVE)).thenReturn(true);
        when(favoriteRepository.existsByUserIdAndClubId(10L, 1L)).thenReturn(false);
        when(clubRepository.findById(1L)).thenReturn(Optional.of(ClubFixture.academic("두잉")));
        when(favoriteRepository.reactivateSoftDeleted(10L, 1L)).thenReturn(0);
        when(userRepository.getReferenceById(10L)).thenReturn(UserFixture.unique());
        when(favoriteRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static DataIntegrityViolationException uniqueViolation(String constraintName) {
        return new DataIntegrityViolationException("wrapper", new SQLException(
                "duplicate key value violates unique constraint \"" + constraintName + "\"", "23505"));
    }
}
