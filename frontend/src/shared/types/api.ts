export type EventType = 'course' | 'exam' | 'deadline' | 'notice' | 'activity';

export type LlmRole = 'chat' | 'vision' | 'embedding';

export interface ApiError {
  code: string;
  message: string;
}

export interface UserProfileResponse {
  id: number;
  username: string;
  role: 'ADMIN' | 'USER';
  enabled: boolean;
  dailyTokenLimit: number;
  todayTokensUsed: number;
  preferredModelId?: number | null;
  mockMode: boolean;
}

export interface AvailableModelDto {
  id: number;
  role: LlmRole;
  name: string;
  model: string;
}

export interface EventInputDto {
  type: EventType;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  courseName?: string;
  sourceText: string;
}

export interface EventDto extends EventInputDto {
  id: number;
  userId: number;
}

export interface ConflictPairDto {
  eventA: EventDto;
  eventB: EventDto;
  conflictType: 'FULL_OVERLAP' | 'PARTIAL_OVERLAP';
  overlapStart: string;
  overlapEnd: string;
}

export interface DailyHeatmapItemDto {
  date: string;
  score: number;
  eventCount: number;
}

export interface WeeklyDensityItemDto {
  weekStart: string;
  weekEnd: string;
  totalScore: number;
  examCount: number;
  deadlineCount: number;
  courseCount: number;
  activityCount: number;
}

export interface ReviewTopicDto {
  id: number;
  userId: number;
  eventId: number;
  eventTitle?: string;
  courseName?: string;
  examDate?: string;
  topic: string;
  plannedDate?: string | null;
  done: boolean;
  visualizationId?: number | null;
}

export interface CalendarOverviewResponse {
  events: EventDto[];
  reviewTopics: ReviewTopicDto[];
  conflicts: ConflictPairDto[];
  dailyHeatmap: DailyHeatmapItemDto[];
  weeklyDensity: WeeklyDensityItemDto[];
  freestDay?: DailyHeatmapItemDto | null;
  busiestDay?: DailyHeatmapItemDto | null;
  busiestWeek?: WeeklyDensityItemDto | null;
}

export interface QaCitationDto {
  chunkId: number;
  eventId: number;
  eventTitle?: string;
  text: string;
  score: number;
}

export interface VisualizationDto {
  id: number;
  userId: number;
  topicId: number;
  topic?: string;
  html: string;
  promptVersion: string;
  createdAt: string;
}

export interface SseProgressEvent {
  step: string;
  current: number;
  total: number;
  message: string;
}

export interface SseDeltaEvent {
  content: string;
}

export interface SseDoneEvent<T = unknown> {
  result: T;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}
