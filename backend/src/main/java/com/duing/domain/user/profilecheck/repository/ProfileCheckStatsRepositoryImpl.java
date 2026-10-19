package com.duing.domain.user.profilecheck.repository;

import static com.duing.domain.user.entity.QUser.user;
import static com.duing.domain.user.profilecheck.entity.QProfileCheckConfirmation.profileCheckConfirmation;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ProfileCheckStatsRepositoryImpl implements ProfileCheckStatsRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    /**
     * 대상자를 루트로 그 학기 확인 기록을 LEFT JOIN 한다 — (학기, 사용자) UNIQUE 라 대상자당 행은 하나다.
     * 확인 완료를 대상과 같은 조건 안에서 세므로, 대상 밖 사용자(졸업생·운영진·탈퇴)의 기록이 섞여 미확인이
     * 음수가 되지 않는다. 탈퇴 제외는 User 의 soft delete 조건에 기대지 않고 명시한다(조인 문맥별로 적용이 달라서).
     */
    @Override
    public ProfileCheckCounts countTargetsAndConfirmed(Semester semester) {
        Tuple counts = queryFactory
                .select(user.count(), profileCheckConfirmation.id.count())
                .from(user)
                .leftJoin(profileCheckConfirmation)
                .on(profileCheckConfirmation.userId.eq(user.id),
                        profileCheckConfirmation.semesterYear.eq(semester.year()),
                        profileCheckConfirmation.semesterTerm.eq(semester.term()))
                .where(
                        user.role.eq(UserRole.STUDENT),
                        user.status.eq(UserStatus.ACTIVE),
                        user.grade.ne(Grade.GRADUATED),
                        user.deletedAt.isNull()
                )
                .fetchOne();
        if (counts == null) {
            return new ProfileCheckCounts(0, 0);
        }
        Long targetCount = counts.get(user.count());
        Long confirmedCount = counts.get(profileCheckConfirmation.id.count());
        return new ProfileCheckCounts(
                targetCount == null ? 0 : targetCount,
                confirmedCount == null ? 0 : confirmedCount);
    }
}
