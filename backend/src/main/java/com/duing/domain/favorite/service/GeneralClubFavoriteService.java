package com.duing.domain.favorite.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
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

    @Override
    @Transactional
    public Long add(Long userId, Long clubId) {
        if (favoriteRepository.existsByUserIdAndClubId(userId, clubId)) {
            throw new FavoriteException.AlreadyFavoritedException();
        }
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
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
    public List<Long> getMyFavoriteClubIds(Long userId) {
        return favoriteRepository.findAllByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(favorite -> favorite.getClub().getId())
                .toList();
    }
}