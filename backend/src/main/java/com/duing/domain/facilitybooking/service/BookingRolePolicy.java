package com.duing.domain.facilitybooking.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;

/**
 * 신청 역할 정책 — 회장(LEADER)/운영진(OFFICER)만 신청 가능(설계 spec 2026-07-18 §2).
 * create 경로 한정 — 조회·취소의 역할 거부는 기존 ClubAuthService.requireManager(AccessDenied)를 유지한다.
 */
public class BookingRolePolicy {

    public void validate(ClubMember applicant) {
        if (!applicant.canManageClub()) {
            throw new FacilityBookingException.PermissionDeniedException();
        }
    }
}
