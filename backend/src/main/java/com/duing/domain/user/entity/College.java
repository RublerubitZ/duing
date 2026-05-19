package com.duing.domain.user.entity;

public enum College {
    PUBLIC_LEADERS("공공인재대학"),
    GLOBAL_BUSINESS("글로벌경영대학"),
    SOCIAL_SCIENCE("사회과학대학"),
    HEALTH_BIO("보건바이오대학"),
    IT_ENGINEERING("IT·공과대학"),
    DESIGN_ART("디자인예술대학"),
    EDUCATION("사범대학"),
    REHABILITATION("재활과학대학"),
    NURSING("간호대학"),
    GLOCAL_LIFE("글로컬라이프대학"),
    INTERNATIONAL("국제대학"),
    SPORTS_LEISURE("체육레저학부"),
    CULTURE_CONTENTS("문화콘텐츠학부"),
    FREE_MAJOR("자유전공학부");

    private final String displayName;

    College(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
