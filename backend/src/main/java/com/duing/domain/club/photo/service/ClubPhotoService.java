package com.duing.domain.club.photo.service;

import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;

public interface ClubPhotoService {
    List<ClubPhotoQuery> getPhotosByClubId(Long clubId);
}
