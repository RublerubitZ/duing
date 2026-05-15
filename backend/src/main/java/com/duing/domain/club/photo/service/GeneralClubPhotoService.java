package com.duing.domain.club.photo.service;

import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubPhotoService implements ClubPhotoService {

    private final ClubPhotoRepository clubPhotoRepository;

    @Override
    public List<ClubPhotoQuery> getPhotosByClubId(Long clubId) {
        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }
}
