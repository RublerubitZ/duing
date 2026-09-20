package com.duing.domain.joincode.repository;

import com.duing.domain.joincode.entity.ClubJoinCode;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubJoinCodeRepository extends JpaRepository<ClubJoinCode, Long> {

    /**
     * 모집의 활성(미폐기) 코드. 부분 유니크 인덱스(V99)가 최대 1건을 보장하므로 Optional 이 안전하다.
     * 만료된 코드도 폐기 전이면 활성으로 조회된다(운영 콘솔이 만료 사실을 그대로 보여준다).
     */
    Optional<ClubJoinCode> findByRecruitmentIdAndRevokedAtIsNull(Long recruitmentId);

    /**
     * 동아리의 활성(미폐기) 부원 초대 링크. 부분 유니크 인덱스
     * {@code uk_club_join_code_active_invite_per_club}(V107)가 최대 1건을 보장한다.
     * 모집 귀속 링크는 {@code recruitment IS NULL} 조건에서 제외된다 — 두 형태는 서로 다른 단위로 산다.
     */
    Optional<ClubJoinCode> findByClubIdAndRecruitmentIsNullAndRevokedAtIsNull(Long clubId);

    /**
     * 총동연 가입 링크 목록 — 동아리의 링크 2종을 폐기·만료·소진까지 전부, 최신순으로 읽는다.
     * created_at 이 같은 마이크로초에 몰려도 순서가 흔들리지 않도록 id 를 보조 키로 둔다.
     *
     * <p>귀속 모집을 fetch join 하지 않고 FK 를 스칼라로 함께 뽑는 이유: 코드 행은 soft-delete 하지
     * 않으므로 삭제된 모집의 링크도 함께 조회되는데, {@code @SQLRestriction} 이 붙는 fetch join 은 죽은
     * 모집을 매칭하지 못해 연관을 null 로 채운다 — 그러면 모집 링크가 "귀속 모집 없음"(=부원 초대 링크)으로
     * 둔갑한다. 또 필드 접근 매핑에서는 LAZY 프록시의 {@code getId()} 조차 초기화를 유발해 죽은 모집이면
     * 그 자리에서 터진다. 조인 별칭을 만들지 않아야 {@code joinCode.recruitment.id} 가 FK 컬럼
     * (recruitment_id) 그대로 번역된다(findByCode 주석과 같은 규약). 모집 제목은 호출부가 살아 있는
     * 모집만 한 번에 모아 해석한다.
     */
    @Query("SELECT joinCode AS joinCode, joinCode.recruitment.id AS recruitmentId "
            + "FROM ClubJoinCode joinCode "
            + "WHERE joinCode.club.id = :clubId "
            + "ORDER BY joinCode.createdAt DESC, joinCode.id DESC")
    List<AdminJoinCodeProjection> findAllForAdminByClubId(@Param("clubId") Long clubId);

    /** 링크 행 + 귀속 모집 FK — 모집이 삭제돼도 FK 는 남으므로 링크 형태 판정이 흔들리지 않는다. */
    interface AdminJoinCodeProjection {

        ClubJoinCode getJoinCode();

        Long getRecruitmentId();
    }

    /**
     * 귀속 모집이 삭제될 때 그 모집의 활성 코드를 폐기한다 (스펙 v2 4.2).
     *
     * <p>엔티티 로딩 대신 벌크 UPDATE 를 쓰는 이유: 코드 엔티티를 영속성 컨텍스트에 올려 두면
     * 같은 트랜잭션에서 모집이 remove 될 때 "제거된 엔티티 참조"(TransientObjectException)로 커밋이
     * 깨진다(RecruitmentRepository.softDeleteByIds 와 같은 함정). 벌크 UPDATE 에는 @SQLRestriction 이
     * 적용되지 않으므로 deletedAt IS NULL 을 명시한다. 이 UPDATE 가 코드 행을 잠그므로 가입 요청
     * 생성(findWithLockByCode)과 직렬화된다.
     */
    @Modifying
    @Query("UPDATE ClubJoinCode joinCode "
            + "SET joinCode.revokedAt = :revokedAt, joinCode.revokedById = :revokedById "
            + "WHERE joinCode.recruitment.id = :recruitmentId "
            + "AND joinCode.revokedAt IS NULL AND joinCode.deletedAt IS NULL")
    int revokeActiveByRecruitmentId(@Param("recruitmentId") Long recruitmentId,
                                    @Param("revokedAt") LocalDateTime revokedAt,
                                    @Param("revokedById") Long revokedById);

    /**
     * 모집 삭제가 자동 폐기할 대상 링크의 id (위 벌크 UPDATE 와 같은 조건) — 링크마다 감사 이벤트를
     * 남기려면 무엇을 폐기했는지 알아야 한다. 엔티티가 아닌 id 만 읽는 이유는 위 주석과 같다:
     * 삭제 트랜잭션에서 코드 엔티티를 영속성 컨텍스트에 올리면 커밋이 깨진다.
     */
    @Query("SELECT joinCode.id FROM ClubJoinCode joinCode "
            + "WHERE joinCode.recruitment.id = :recruitmentId "
            + "AND joinCode.revokedAt IS NULL AND joinCode.deletedAt IS NULL")
    List<Long> findActiveIdsByRecruitmentId(@Param("recruitmentId") Long recruitmentId);

    /**
     * 동아리가 폐쇄될 때 그 동아리의 활성 부원 초대 링크를 폐기한다 (V107).
     *
     * <p>모집 링크와 같은 이유로 벌크 UPDATE 를 쓴다 — 폐쇄 트랜잭션에서 코드 엔티티를 영속성
     * 컨텍스트에 올리면 같은 트랜잭션의 동아리·모집 soft-delete 와 충돌해 커밋이 깨진다. 벌크
     * UPDATE 에는 @SQLRestriction 이 적용되지 않으므로 deletedAt IS NULL 을 명시한다.
     * {@code recruitment IS NULL} 로 모집 링크를 제외하는 이유는 그쪽이 모집 id 체인으로 이미
     * 폐기되기 때문이다 — 두 경로가 같은 행을 두 번 폐기하면 감사 이력이 중복된다.
     */
    @Modifying
    @Query("UPDATE ClubJoinCode joinCode "
            + "SET joinCode.revokedAt = :revokedAt, joinCode.revokedById = :revokedById "
            + "WHERE joinCode.club.id = :clubId AND joinCode.recruitment.id IS NULL "
            + "AND joinCode.revokedAt IS NULL AND joinCode.deletedAt IS NULL")
    int revokeActiveClubInviteByClubId(@Param("clubId") Long clubId,
                                       @Param("revokedAt") LocalDateTime revokedAt,
                                       @Param("revokedById") Long revokedById);

    /**
     * 폐쇄가 자동 폐기할 부원 초대 링크의 id (위 벌크 UPDATE 와 같은 조건) — 감사 이벤트를 남기려면
     * 무엇을 폐기했는지 알아야 한다. 엔티티가 아닌 id 만 읽는 이유는 위 주석과 같다. 동아리당 활성
     * 초대 링크는 부분 유니크 인덱스가 최대 1건으로 묶으므로 Optional 이 안전하다.
     */
    @Query("SELECT joinCode.id FROM ClubJoinCode joinCode "
            + "WHERE joinCode.club.id = :clubId AND joinCode.recruitment.id IS NULL "
            + "AND joinCode.revokedAt IS NULL AND joinCode.deletedAt IS NULL")
    Optional<Long> findActiveClubInviteIdByClubId(@Param("clubId") Long clubId);

    /**
     * 학생의 코드 확인 진입점(읽기 전용). 유효성(미폐기·미만료·미소진) 판정은 호출 측 책임이다.
     *
     * <p>동아리·모집의 생존을 직접 확인하는 이유: 코드 행은 soft-delete 하지 않으므로 폐쇄된 동아리의
     * 링크도 그대로 조회되는데, 확인 응답은 동아리명을, 사용 판정은 모집 상태를 읽어야 한다. 둘 다
     * LAZY 프록시라 대상이 soft-delete 됐으면 초기화 시점에 EntityNotFoundException 이 나 5xx 가 된다(#869).
     * 죽은 부모를 가진 코드는 아예 조회되지 않아 "유효하지 않은 가입 링크"(404)로 떨어진다(fail-closed).
     *
     * <p>{@code deletedAt IS NULL} 을 직접 적는 이유: 조인·서브쿼리 대상에 {@code @SQLRestriction} 이
     * 붙는지는 Hibernate 버전 동작에 달려 있다(벌크 UPDATE 에는 붙지 않는다 — 위 주석과 같은 함정).
     * 버전 동작에 기대지 않도록 명시하는 것이므로 중복 조건이 아니다.
     *
     * <p>모집을 조인이 아니라 EXISTS 로 확인하는 이유(V107): 부원 초대 링크는 귀속 모집이 없어
     * INNER JOIN 이면 조회 자체가 되지 않는데, LEFT JOIN 으로 바꾸면 "모집이 없는 링크"와 "죽은 모집의
     * 링크"가 똑같이 조인 미매칭이 되어 fail-closed(#869)가 뚫린다(현재 버전은 조인 ON 절에
     * {@code @SQLRestriction} 을 붙이므로 죽은 모집은 매칭되지 않는다). 조인 별칭이 있으면
     * {@code joinCode.recruitment.id} 조차 FK 컬럼이 아니라 그 별칭으로 번역돼 둘을 구분할 수 없다 —
     * 별칭을 두지 않아야 FK 컬럼(recruitment_id)이 그대로 남아 "모집 없음"과 "모집이 죽음"이 갈린다.
     */
    @Query("SELECT joinCode FROM ClubJoinCode joinCode "
            + "JOIN joinCode.club club "
            + "WHERE joinCode.code = :code "
            + "AND club.deletedAt IS NULL "
            + "AND (joinCode.recruitment.id IS NULL "
            + "OR EXISTS (SELECT 1 FROM Recruitment recruitment "
            + "WHERE recruitment.id = joinCode.recruitment.id AND recruitment.deletedAt IS NULL))")
    Optional<ClubJoinCode> findByCode(@Param("code") String code);

    /**
     * 가입 요청 생성의 잠금 순서(club → code, #905)를 위해 코드가 속한 동아리 id 만 스칼라로 읽는다 —
     * 엔티티를 잠금 없이 먼저 로딩하면 1차 캐시 때문에 뒤의 {@code findWithLockByCode} 가 낡은
     * usedCount 를 돌려준다(그 메서드 주석의 함정). id 만 뽑는 스칼라 조회는 1차 캐시를 만들지 않는다.
     *
     * <p>필터 조건은 {@code findByCode} 와 동일해야 한다 — 죽은 모집·삭제된 동아리의 코드는 두 경로
     * 모두에서 "없음"(404)이어야 학생이 보는 판정이 갈리지 않는다.
     */
    @Query("SELECT joinCode.club.id FROM ClubJoinCode joinCode "
            + "JOIN joinCode.club club "
            + "WHERE joinCode.code = :code "
            + "AND club.deletedAt IS NULL "
            + "AND (joinCode.recruitment.id IS NULL "
            + "OR EXISTS (SELECT 1 FROM Recruitment recruitment "
            + "WHERE recruitment.id = joinCode.recruitment.id AND recruitment.deletedAt IS NULL))")
    Optional<Long> findClubIdByCode(@Param("code") String code);

    /**
     * 가입 요청 생성의 잔여 확인·차감({@code tryConsume})이 같은 코드 행에 대해 직렬화되도록
     * 비관적 쓰기 잠금으로 조회한다 — 동시 신청의 이중 차감(max_uses 초과 접수)을 막는다.
     *
     * <p>요청 생성 경로는 반드시 <b>이 메서드로 코드를 처음 읽어야</b> 한다. 잠그지 않은
     * {@code findByCode} 로 먼저 로딩한 뒤 잠금 조회를 덧붙이면, 이미 영속성 컨텍스트에 올라온
     * 엔티티는 잠금만 걸릴 뿐 필드가 갱신되지 않아 낡은 usedCount 로 차감하게 된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode WHERE joinCode.code = :code")
    Optional<ClubJoinCode> findWithLockByCode(@Param("code") String code);

    /** 코드 문자열 전역 중복 검사. 코드 행은 soft-delete 하지 않으므로 폐기·만료 행도 함께 걸린다. */
    boolean existsByCode(String code);

    /**
     * 거절·자동 거절의 환급({@code releaseUse})과 운영진의 수동 폐기가 같은 코드 행에 대해
     * 직렬화되도록 비관적 쓰기 잠금으로 조회한다. 요청의 joinCode 는 지연 프록시라 이 조회가 최신 행
     * 상태를 실어온다. 단일 코드 행만 잠그므로 잠금 순서 사이클이 없어 교착이 불가능하다.
     *
     * <p>수동 폐기는 반드시 <b>이 메서드로 코드를 처음 읽어야</b> 한다 — 무잠금 {@code findById} 로
     * 읽으면 경쟁 재발급이 이미 폐기한 행을 낡은 스냅샷으로 보고 멱등 분기를 지나쳐, 최초 폐기 시각·
     * 폐기자를 덮어쓰면서 감사 이벤트를 한 번 더 남긴다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode WHERE joinCode.id = :joinCodeId")
    Optional<ClubJoinCode> findWithLockById(@Param("joinCodeId") Long joinCodeId);

    /**
     * 총동연 강제 폐기가 대상 링크를 잠그고 읽는다 — 소속 대조를 조회 술어에 실어, 타 동아리 링크와
     * 없는 링크가 똑같이 빈 결과가 된다(존재 여부를 알리지 않는 404 로 수렴).
     *
     * <p>소속을 {@code joinCode.getClub().getId()} 로 비교하지 않는 이유: 필드 접근 매핑에서는 LAZY
     * 프록시의 id 접근조차 초기화를 유발하는데, 폐쇄된 동아리의 링크는 폐기된 채 그대로 남아 있어
     * ({@code revokeActiveClubInviteByClubId}) 그 초기화가 EntityNotFoundException 으로 터진다(#869 계열).
     * 조인 별칭 없이 FK 컬럼(club_id)으로 비교하면 잠금 조회에 조인이 섞이지도 않는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode "
            + "WHERE joinCode.id = :joinCodeId AND joinCode.club.id = :clubId")
    Optional<ClubJoinCode> findWithLockByIdAndClubId(@Param("joinCodeId") Long joinCodeId,
                                                     @Param("clubId") Long clubId);

    /**
     * 모집 가입 링크 재생성이 교체 대상(활성 코드)을 잠그고 읽는다 — 발급과 수동 폐기가 같은
     * 모집에 대해 직렬화된다(부원 초대 링크의 형제 메서드와 같은 규약).
     *
     * <p>재생성 경로는 반드시 <b>이 메서드로 활성 코드를 처음 읽어야</b> 한다. 잠그지 않은
     * {@code findByRecruitmentIdAndRevokedAtIsNull} 로 먼저 로딩하면 이미 영속성 컨텍스트에 올라온
     * 엔티티는 잠금만 걸릴 뿐 필드가 갱신되지 않아, 그 사이 커밋된 수동 폐기를 보지 못한 채 낡은
     * {@code revokedAt} 으로 판단하게 된다({@code findWithLockByCode} 와 같은 함정).
     *
     * <p>활성 술어를 잠금 조회 자체에 두는 이유: READ COMMITTED 는 잠금 대기 후 술어를 재평가하므로,
     * 먼저 커밋된 폐기가 있으면 빈 결과가 되어 호출부가 "교체할 것이 없다"를 그대로 읽는다 —
     * 폐기 여부를 다시 검사하는 분기 없이 최초 폐기 시각·폐기자와 감사 이력이 보존된다.
     *
     * <p>조인 별칭 없이 FK 컬럼({@code recruitment_id})으로 비교하는 이유: 조인이 섞인 SELECT 에는
     * PostgreSQL 의 {@code FOR UPDATE} 를 그대로 붙일 수 없다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode "
            + "WHERE joinCode.recruitment.id = :recruitmentId AND joinCode.revokedAt IS NULL")
    Optional<ClubJoinCode> findWithLockByRecruitmentIdAndRevokedAtIsNull(
            @Param("recruitmentId") Long recruitmentId);

    /**
     * 부원 초대 링크 재발급이 교체 대상(활성 링크)을 잠그고 읽는다 — 발급과 수동 폐기가 같은
     * 동아리에 대해 직렬화된다.
     *
     * <p>재발급 경로는 반드시 <b>이 메서드로 활성 링크를 처음 읽어야</b> 한다. 잠그지 않은
     * {@code findByClubIdAndRecruitmentIsNullAndRevokedAtIsNull} 로 먼저 로딩하면 이미 영속성
     * 컨텍스트에 올라온 엔티티는 잠금만 걸릴 뿐 필드가 갱신되지 않아, 그 사이 커밋된 수동 폐기를
     * 보지 못한 채 낡은 {@code revokedAt} 으로 판단하게 된다({@code findWithLockByCode} 와 같은 함정).
     *
     * <p>활성 술어를 잠금 조회 자체에 두는 이유: READ COMMITTED 는 잠금 대기 후 술어를 재평가하므로,
     * 먼저 커밋된 폐기가 있으면 빈 결과가 되어 호출부가 "교체할 것이 없다"를 그대로 읽는다 —
     * 폐기 여부를 다시 검사하는 분기 없이 최초 폐기 시각·폐기자와 감사 이력이 보존된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode "
            + "WHERE joinCode.club.id = :clubId "
            + "AND joinCode.recruitment.id IS NULL AND joinCode.revokedAt IS NULL")
    Optional<ClubJoinCode> findWithLockByClubIdAndRecruitmentIsNullAndRevokedAtIsNull(
            @Param("clubId") Long clubId);
}
