import { httpClient } from '../../shared/api/httpClient';
import type { EventDto, ReviewTopicDto, VisualizationDto } from '../../shared/types/api';

export interface GenerateVisualizePayload {
  topicId?: number | null;
  eventId?: number | null;
  topic: string;
}

export const visualizeApi = {
  /**
   * 获取当前登录用户的可视化历史记录列表（支持按 topicId 过滤）
   */
  list: (topicId?: number | null) => {
    const query = topicId != null ? `?topicId=${encodeURIComponent(String(topicId))}` : '';
    return httpClient.get<VisualizationDto[]>(`/api/visualize${query}`);
  },

  /**
   * 获取单条可视化详情（含完整 HTML）
   */
  getById: (id: number) => {
    return httpClient.get<VisualizationDto>(`/api/visualize/${id}`);
  },

  /**
   * 删除指定可视化记录
   */
  remove: (id: number) => {
    return httpClient.delete<{ success: boolean; message?: string }>(`/api/visualize/${id}`);
  },

  /**
   * 获取当前用户的事件列表（用于选择关联考试或课程）
   */
  listEvents: () => {
    return httpClient.get<EventDto[]>('/api/events');
  },

  /**
   * 获取当前用户的复习知识点列表
   */
  listReviewTopics: (eventId?: number | null) => {
    const query = eventId != null ? `?eventId=${encodeURIComponent(String(eventId))}` : '';
    return httpClient.get<ReviewTopicDto[]>(`/api/calendar/review-topics${query}`);
  },
};
