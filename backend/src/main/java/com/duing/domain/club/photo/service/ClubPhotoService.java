package com.duing.domain.club.photo.service;

import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;

public interface ClubPhotoService {
    List<ClubPhotoQuery> getPhotosByClubId(Long clubId);

    Long create(CreateClubPhotoCommand command);

    void updateCaption(UpdateClubPhotoCommand command);

    List<ClubPhotoQuery> reorder(ReorderClubPhotosCommand command);

    void delete(Long clubId, Long requesterId, Long photoId);
}
