package com.duing.domain.club.heroactivity.service;

import com.duing.domain.club.heroactivity.service.dto.command.CreateHeroActivityCommand;
import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand;
import com.duing.domain.club.heroactivity.service.dto.command.UpdateHeroActivityCommand;
import com.duing.domain.club.heroactivity.service.dto.query.HeroActivityQuery;
import java.util.List;

public interface ClubHeroActivityService {
    List<HeroActivityQuery> getByClubId(Long clubId);

    HeroActivityQuery create(CreateHeroActivityCommand command);

    void update(UpdateHeroActivityCommand command);

    List<HeroActivityQuery> reorder(ReorderHeroActivitiesCommand command);

    void delete(Long clubId, Long requesterId, Long heroActivityId);
}
