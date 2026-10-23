package com.oneterm.common;

public enum EventType {
    course("课程", 2),
    exam("考试", 5),
    deadline("作业截止", 3),
    notice("通知", 1),
    activity("活动", 1);

    private final String label;
    private final int densityWeight;

    EventType(String label, int densityWeight) {
        this.label = label;
        this.densityWeight = densityWeight;
    }

    public String getLabel() {
        return label;
    }

    public int getDensityWeight() {
        return densityWeight;
    }

    public static EventType fromValue(String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "事件类型不能为空");
        }
        try {
            return EventType.valueOf(value.trim().toLowerCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "不支持的事件类型: " + value);
        }
    }
}
