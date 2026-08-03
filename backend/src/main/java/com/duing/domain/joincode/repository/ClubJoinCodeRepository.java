package com.duing.domain.joincode.repository;

import com.duing.domain.joincode.entity.ClubJoinCode;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubJoinCodeRepository extends JpaRepository<ClubJoinCode, Long> {

    /**
     * 동아리의 활성(미폐기) 코드. 부분 유니크 인덱스가 최대 1건을 보장하므로 Optional 이 안전하다.
     * 만료된 코드도 폐기 전이면 활성으로 조회된다(운영 콘솔이 만료 사실을 그대로 보여준다).
     */
    Optional<ClubJoinCode> findByClubIdAndRevokedAtIsNull(Long clubId);

    /** 코드 문자열 전역 중복 검사. 코드 행은 soft-delete 하지 않으므로 폐기·만료 행도 함께 걸린다. */
    boolean existsByCode(String code);
}
