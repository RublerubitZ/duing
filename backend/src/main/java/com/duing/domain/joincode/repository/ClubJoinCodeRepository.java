package com.duing.domain.joincode.repository;

import com.duing.domain.joincode.entity.ClubJoinCode;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
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
     * 귀속 모집이 삭제될 때 그 모집의 활성 코드를 폐기한다 (스펙 v2 4.2).
     *
     * <p>엔티티 로딩 대신 벌크 UPDATE 를 쓰는 이유: 코드 엔티티를 영속성 컨텍스트에 올려 두면
     * 같은 트랜잭션에서 모집이 remove 될 때 "제거된 엔티티 참조"(TransientObjectException)로 커밋이
     * 깨진다(RecruitmentRepository.softDeleteByIds 와 같은 함정). 벌크 UPDATE 에는 @SQLRestriction 이
     * 적용되지 않으므로 deletedAt IS NULL 을 명시한다. 이 UPDATE 가 코드 행을 잠그므로 가입 요청
     * 생성(findWithLockByCode)과 직렬화된다.
     */
    @Modifying
    @Query("UPDATE ClubJoinCode joinCode SET joinCode.revokedAt = :revokedAt "
            + "WHERE joinCode.recruitment.id = :recruitmentId "
            + "AND joinCode.revokedAt IS NULL AND joinCode.deletedAt IS NULL")
    int revokeActiveByRecruitmentId(@Param("recruitmentId") Long recruitmentId,
                                    @Param("revokedAt") LocalDateTime revokedAt);

    /** 학생의 코드 확인 진입점(읽기 전용). 유효성(미폐기·미만료·미소진) 판정은 호출 측 책임이다. */
    Optional<ClubJoinCode> findByCode(String code);

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
     * 거절·자동 거절의 환급({@code releaseUse})이 같은 코드 행에 대해 직렬화되도록 비관적 쓰기
     * 잠금으로 조회한다. 요청의 joinCode 는 지연 프록시라 이 조회가 최신 행 상태를 실어온다.
     * 단일 코드 행만 잠그므로 잠금 순서 사이클이 없어 교착이 불가능하다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode WHERE joinCode.id = :joinCodeId")
    Optional<ClubJoinCode> findWithLockById(@Param("joinCodeId") Long joinCodeId);
}
