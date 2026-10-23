import { httpClient } from '../../shared/api/httpClient';
import type { QaCitationDto } from '../../shared/types/api';

export type RetrievalMode = 'embedding' | 'bm25';

export interface QaIndexResponse {
  chunkCount: number;
  mode: RetrievalMode;
}

export interface QaAskDoneResult {
  answer: string;
  retrievalMode: RetrievalMode;
  citations: QaCitationDto[];
}

export interface QaHistoryItem {
  id: number;
  question: string;
  answer: string;
  retrievalMode: RetrievalMode;
  citations: QaCitationDto[];
  createdAt: string;
}

export interface QuickQuestionGroup {
  tag: string;
  questions: readonly string[];
}

export const QUICK_QUESTION_GROUPS: readonly QuickQuestionGroup[] = [
  {
    tag: '时间与空闲排查',
    questions: [
      '下周三有空吗？',
      '今天我有课吗？',
      '本周有哪些日程冲突？',
      '这学期最忙的是哪一周？',
    ],
  },
  {
    tag: '考试与作业截止',
    questions: [
      '期末前哪几门最紧？',
      '下周有哪些考试或随堂测验？',
      '最近有什么作业或实验报告要交？',
      '计算机网络期末考试在什么时间和考场？',
    ],
  },
  {
    tag: '课程地点与复习',
    questions: [
      '算法设计与分析平时在哪个教室上课？',
      '帮我梳理一下考前需要复习的重点科目',
      '操作系统机考前建议重点复习哪些考点？',
    ],
  },
] as const;

export const QUICK_QUESTIONS: readonly string[] = [
  '下周三有空吗？',
  '期末前哪几门最紧？',
  '本周有哪些日程冲突？',
  '下周有哪些考试或测验？',
  '最近有什么作业或实验报告要交？',
  '计算机网络期末考试在什么时间和考场？',
  '算法设计与分析平时在哪个教室上课？',
  '帮我梳理一下考前需要复习的重点科目',
] as const;

/**
 * 调用 POST /api/qa/index 重建当前登录用户的事件原文切片与向量索引
 */
export async function rebuildQaIndex(): Promise<QaIndexResponse> {
  return httpClient.post<QaIndexResponse>('/api/qa/index');
}

/**
 * 获取当前用户的问答历史记录
 */
export async function fetchQaHistory(limit = 50): Promise<QaHistoryItem[]> {
  return httpClient.get<QaHistoryItem[]>(`/api/qa/history?limit=${limit}`);
}

/**
 * 删除单条问答历史记录
 */
export async function deleteQaHistoryItem(id: number): Promise<void> {
  return httpClient.delete<void>(`/api/qa/history/${id}`);
}

/**
 * 清空当前用户的问答历史记录
 */
export async function clearQaHistory(): Promise<void> {
  return httpClient.delete<void>('/api/qa/history');
}
