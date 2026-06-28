package com.duing.domain.publicactivity.service;

import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.util.List;

public interface PublicActivityService {
    List<ActivityItem> getRecentActivities(Integer limitParam);
}
