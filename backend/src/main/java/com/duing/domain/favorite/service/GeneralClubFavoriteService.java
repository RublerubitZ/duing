package com.duing.domain.favorite.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.exception.FavoriteException;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubFavoriteService implements ClubFavoriteService {

    private final ClubFavoriteRepository favoriteRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final ClubVisibilityPolicy clubVisibilityPolicy;

    @Override
    @Transactional
    public Long add(Long userId, Long clubId) {
        // 중복 찜 409 보다 먼저 게이트를 지나야 한다 — 기존 찜 여부로 비공개 동아리의 존재가 드러나지 않게.
        clubVisibilityPolicy.requirePubliclyVisible(clubId);
        if (favoriteRepository.existsByUserIdAndClubId(userId, clubId)) {
            throw new FavoriteException.AlreadyFavoritedException();
        }
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);

        // 과거에 찜했다가 해제(soft delete)한 이력이 있으면, 유니크 제약 충돌을 피하기 위해
        // 새 행을 INSERT 하는 대신 기존 행을 되살린다.
        if (favoriteRepository.reactivateSoftDeleted(userId, clubId) > 0) {
            return favoriteRepository.findByUserIdAndClubId(userId, clubId)
                    .map(ClubFavorite::getId)
                    .orElseThrow(() -> new IllegalStateException("재활성화한 찜을 조회하지 못했습니다."));
        }

        User user = userRepository.getReferenceById(userId);
        return favoriteRepository.save(ClubFavorite.create(user, club)).getId();
    }

    @Override
    @Transactional
    public void remove(Long userId, Long clubId) {
        favoriteRepository.findByUserIdAndClubId(userId, clubId)
                .ifPresent(favoriteRepository::delete);
    }

    @Override
    public Page<FavoriteClubQuery> getMyFavorites(Long userId, Pageable pageable) {
        return favoriteRepository.findFavoriteClubPage(userId, pageable);
    }

    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        favoriteRepository.deleteAll(favoriteRepository.findAllByClubId(clubId));
    }

    @Override
    public List<Long> getMyFavoriteClubIds(Long userId) {
        return favoriteRepository
                .findAllByUserIdAndClubStatusOrderByCreatedAtDesc(userId, ClubStatus.ACTIVE).stream()
                .map(favorite -> favorite.getClub().getId())
                .toList();
    }
}