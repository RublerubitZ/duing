package com.duing.domain.user.profilecheck.repository;

import static com.duing.domain.user.entity.QUser.user;
import static com.duing.domain.user.profilecheck.entity.QProfileCheckConfirmation.profileCheckConfirmation;

import com.duing.domain.user.entity.Grade;
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
     * 확인 완료를 대상과 같은 조건 안에서 세므로, 대상 밖 사용자(졸업생·정지·탈퇴)의 기록이 섞여 미확인이
     * 음수가 되지 않는다. 탈퇴 제외는 User 의 soft delete 조건에 기대지 않고 명시한다(조인 문맥별로 적용이 달라서).
     * 대상 조건은 ProfileCheckPolicy.isTarget 과 같아야 한다 — 팝업 노출과 콘솔 숫자가 어긋나지 않게.
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
                        user.status.eq(UserStatus.ACTIVE),
                        user.grade.ne(Grade.GRADUATED),
                        user.deletedAt.isNull()
                )
                .fetchOne();
        return new ProfileCheckCounts(
                counts.get(user.count()),
                counts.get(profileCheckConfirmation.id.count()));
    }
}
