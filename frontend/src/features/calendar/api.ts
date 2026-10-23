import { httpClient } from '../../shared/api/httpClient';
import type {
  CalendarOverviewResponse,
  ConflictPairDto,
  ReviewTopicDto,
  UserProfileResponse,
} from '../../shared/types/api';

export interface CreateReviewTopicPayload {
  eventId: number;
  topic: string;
  plannedDate?: string | null;
}

export interface UpdateReviewTopicPayload {
  topic?: string;
  plannedDate?: string | null;
  done?: boolean;
}

export interface SuggestCourseTopicsPayload {
  eventId?: number;
  courseName?: string;
}

export interface SuggestCourseTopicsResponse {
  eventId?: number;
  courseName: string;
  topics: string[];
}

export interface BatchCreateReviewTopicsPayload {
  eventId: number;
  topics: string[];
  autoSchedule?: boolean;
}

export const calendarApi = {
  getOverview: (semesterStart?: string, semesterEnd?: string) => {
    const params = new URLSearchParams();
    if (semesterStart) params.set('semesterStart', semesterStart);
    if (semesterEnd) params.set('semesterEnd', semesterEnd);
    const query = params.toString();
    return httpClient.get<CalendarOverviewResponse>(
      `/api/calendar/overview${query ? `?${query}` : ''}`
    );
  },

  getConflicts: () => httpClient.get<ConflictPairDto[]>('/api/calendar/conflicts'),

  getReviewTopics: (eventId?: number) => {
    const query = eventId !== undefined ? `?eventId=${eventId}` : '';
    return httpClient.get<ReviewTopicDto[]>(`/api/calendar/review-topics${query}`);
  },

  createReviewTopic: (payload: CreateReviewTopicPayload) =>
    httpClient.post<ReviewTopicDto>('/api/calendar/review-topics', payload),

  batchCreateReviewTopics: (payload: BatchCreateReviewTopicsPayload) =>
    httpClient.post<ReviewTopicDto[]>('/api/calendar/review-topics/batch', payload),

  suggestCourseTopics: (payload: SuggestCourseTopicsPayload) =>
    httpClient.post<SuggestCourseTopicsResponse>('/api/calendar/courses/suggest-topics', payload),

  scheduleReviewTopics: (startDate?: string) =>
    httpClient.post<ReviewTopicDto[]>(
      '/api/calendar/review-topics/schedule',
      startDate ? { startDate } : {}
    ),

  updateReviewTopic: (id: number, payload: UpdateReviewTopicPayload) =>
    httpClient.put<ReviewTopicDto>(`/api/calendar/review-topics/${id}`, payload),

  deleteReviewTopic: (id: number) =>
    httpClient.delete<{ success: boolean; message?: string }>(`/api/calendar/review-topics/${id}`),

  downloadIcsFile: async (): Promise<void> => {
    const icsText = await httpClient.get<string>('/api/calendar/export.ics', {
      headers: { Accept: 'text/calendar, text/plain, */*' },
    });
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oneterm-calendar.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  loadDemoData: () => httpClient.post<UserProfileResponse>('/api/auth/demo-load'),
};
