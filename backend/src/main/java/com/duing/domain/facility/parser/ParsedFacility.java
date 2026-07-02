package com.duing.domain.facility.parser;

/** 시설 목록 파싱 산출물. sortOrder 는 탭 노출 순서(0-based). location 은 없을 수 있다(null). */
public record ParsedFacility(int roomSeq, String roomName, String location, int sortOrder) {}
