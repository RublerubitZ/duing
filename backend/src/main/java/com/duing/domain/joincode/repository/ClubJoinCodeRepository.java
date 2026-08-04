package com.duing.domain.joincode.repository;

import com.duing.domain.joincode.entity.ClubJoinCode;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubJoinCodeRepository extends JpaRepository<ClubJoinCode, Long> {

    /**
     * 동아리의 활성(미폐기) 코드. 부분 유니크 인덱스가 최대 1건을 보장하므로 Optional 이 안전하다.
     * 만료된 코드도 폐기 전이면 활성으로 조회된다(운영 콘솔이 만료 사실을 그대로 보여준다).
     */
    Optional<ClubJoinCode> findByClubIdAndRevokedAtIsNull(Long clubId);

    /** 학생의 코드 확인·가입 요청 진입점. 유효성(미폐기·미만료·미소진·모집 OPEN) 판정은 호출 측 책임이다. */
    Optional<ClubJoinCode> findByCode(String code);

    /** 코드 문자열 전역 중복 검사. 코드 행은 soft-delete 하지 않으므로 폐기·만료 행도 함께 걸린다. */
    boolean existsByCode(String code);

    /**
     * 가입 요청 승인의 잔여 인원 확인·차감({@code tryConsume})이 같은 코드 행에 대해 직렬화되도록
     * 비관적 쓰기 잠금으로 조회한다 — 동시 승인의 이중 차감(max_uses 초과 등록)을 막는다.
     * 단일 코드 행만 잠그므로 잠금 순서 사이클이 없어 교착이 불가능하다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT joinCode FROM ClubJoinCode joinCode WHERE joinCode.id = :joinCodeId")
    Optional<ClubJoinCode> findWithLockById(@Param("joinCodeId") Long joinCodeId);
}
