package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.domain.fee.service.dto.query.FeeAccountQuery;

public interface FeeAccountService {

    /** 운영진: 동아리 회비 계좌를 등록(없으면 생성)하거나 수정한다. 동아리당 활성 1건. */
    Long upsert(UpsertFeeAccountCommand command);

    /** 운영진: 동아리 회비 계좌를 복호화된 평문으로 조회한다. */
    FeeAccountQuery getForManager(Long clubId, Long actorId);

    /** 동아리원: 입금에 필요한 회비 계좌를 복호화된 평문으로 조회한다. */
    FeeAccountQuery getForMember(Long clubId, Long actorId);

    /** 운영진: 동아리 회비 계좌를 소프트 삭제한다. */
    void delete(Long clubId, Long actorId);
}
