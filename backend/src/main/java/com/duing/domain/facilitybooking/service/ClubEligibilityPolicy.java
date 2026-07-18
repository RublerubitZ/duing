package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;

/** 신청 자격 정책 — 중앙동아리(Club.centralClub)만 시설 예약을 신청할 수 있다(설계 spec 2026-07-18 §2). */
public class ClubEligibilityPolicy {

    public void validate(Club club) {
        if (!club.isCentralClub()) {
            throw new FacilityBookingException.CentralClubOnlyException();
        }
    }
}
