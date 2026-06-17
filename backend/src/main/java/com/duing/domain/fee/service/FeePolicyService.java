package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.command.CreateFeePolicyCommand;
import com.duing.domain.fee.service.dto.command.UpdateFeePolicyCommand;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;
import java.util.List;

public interface FeePolicyService {
    Long create(CreateFeePolicyCommand command);

    void update(UpdateFeePolicyCommand command);

    void delete(Long clubId, Long actorId, Long policyId);

    List<FeePolicyQuery> getPolicies(Long clubId, Long actorId);
}
