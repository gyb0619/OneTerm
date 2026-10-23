import { httpClient } from '../../shared/api/httpClient';
import type { EventDto, EventInputDto, EventType } from '../../shared/types/api';

export interface FileExtractResponse {
  fileName: string;
  sourceType: 'txt' | 'xlsx' | 'image';
  extractedText: string;
}

export interface SimpleSuccessResponse {
  success: boolean;
  message?: string;
}

/**
 * 上传文件（.txt / .xlsx / 图片）解析为待抽取的教务文本
 */
export async function uploadExtractFile(file: File): Promise<FileExtractResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return httpClient.post<FileExtractResponse>('/api/extract/file', formData);
}

/**
 * 批量确认入库已核对编辑的事件列表
 */
export async function batchSaveEvents(events: EventInputDto[]): Promise<EventDto[]> {
  return httpClient.post<EventDto[]>('/api/events/batch', { events });
}

/**
 * 获取当前登录用户的已入库事件列表
 */
export async function fetchUserEvents(params?: {
  type?: EventType | '';
  start?: string;
  end?: string;
}): Promise<EventDto[]> {
  const search = new URLSearchParams();
  if (params?.type) search.set('type', params.type);
  if (params?.start) search.set('start', params.start);
  if (params?.end) search.set('end', params.end);
  const qs = search.toString();
  return httpClient.get<EventDto[]>(`/api/events${qs ? `?${qs}` : ''}`);
}

/**
 * 手动新增单条已入库事件
 */
export async function createSingleEvent(event: EventInputDto): Promise<EventDto> {
  return httpClient.post<EventDto>('/api/events', event);
}

/**
 * 更新指定已入库事件
 */
export async function updateSingleEvent(
  id: number,
  event: EventInputDto
): Promise<EventDto> {
  return httpClient.put<EventDto>(`/api/events/${id}`, event);
}

/**
 * 删除指定已入库事件
 */
export async function deleteSingleEvent(id: number): Promise<SimpleSuccessResponse> {
  return httpClient.delete<SimpleSuccessResponse>(`/api/events/${id}`);
}
