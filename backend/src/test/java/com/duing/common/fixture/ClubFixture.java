package com.duing.common.fixture;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;

public final class ClubFixture {

    private ClubFixture() {
    }

    public static Club academic(String name) {
        return Club.create(name, ClubCategory.ACADEMIC, null, "설명", null);
    }
}
