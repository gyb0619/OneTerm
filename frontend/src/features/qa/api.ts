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

/**
 * 带有动态变量插值的智能问答推荐问题模板库
 */
export interface DynamicPromptTemplate {
  category: string;
  generate: () => string;
}

export const DYNAMIC_PROMPT_POOL: readonly DynamicPromptTemplate[] = [
  {
    category: '时间空闲',
    generate: () => {
      const weekdays = ['周一', '周二', '周三', '周四', '周五'];
      const target = weekdays[Math.floor(Math.random() * weekdays.length)];
      return `${target}下午我有空吗？有几节课？`;
    },
  },
  {
    category: '课程教室',
    generate: () => {
      const courses = ['算法设计与分析', '操作系统', '计算机网络'];
      const c = courses[Math.floor(Math.random() * courses.length)];
      return `《${c}》平时在哪个教室上课？主讲是谁？`;
    },
  },
  {
    category: '考试冲刺',
    generate: () => {
      const exams = ['算法设计与分析期中随堂测验', '计算机网络期末考试', '操作系统期中上机考核'];
      const e = exams[Math.floor(Math.random() * exams.length)];
      return `距离《${e}》还有几天？在什么考场？`;
    },
  },
  {
    category: '冲突预警',
    generate: () => {
      const dates = ['11月4日', '11月6日', '本周三', '本周五'];
      const d = dates[Math.floor(Math.random() * dates.length)];
      return `${d}有哪些日程重叠或时间冲突？`;
    },
  },
  {
    category: '考点复习',
    generate: () => {
      const subjects = ['计算机网络', '算法设计与分析', '操作系统'];
      const s = subjects[Math.floor(Math.random() * subjects.length)];
      return `《${s}》考前建议重点复习哪几个核心考点？`;
    },
  },
  {
    category: '作业截止',
    generate: () => {
      const homeworks = ['算法第二次实验报告', '计网抓包分析报告', '操作系统页面置换模拟'];
      const hw = homeworks[Math.floor(Math.random() * homeworks.length)];
      return `最近《${hw}》的最晚提交截止时间是什么时候？`;
    },
  },
  {
    category: '学期周次',
    generate: () => {
      const weeks = [11, 12, 13];
      const w = weeks[Math.floor(Math.random() * weeks.length)];
      return `第 ${w} 教学周有哪些重要考试和复习规划？`;
    },
  },
];

export function getRandomPrompts(count = 3): { category: string; text: string }[] {
  const shuffled = [...DYNAMIC_PROMPT_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => ({
    category: item.category,
    text: item.generate(),
  }));
}

export const QUICK_QUESTION_GROUPS: readonly QuickQuestionGroup[] = [
  {
    tag: '时间与空闲排查',
    questions: [
      '下周三有空吗？',
      '今天我有课吗？',
      '本周有哪些日程冲突？',
    ],
  },
  {
    tag: '考试与作业截止',
    questions: [
      '期末前哪几门最紧？',
      '下周有哪些考试或随堂测验？',
      '计算机网络期末考试在什么时间和考场？',
    ],
  },
  {
    tag: '课程地点与复习',
    questions: [
      '算法设计与分析平时在哪个教室上课？',
      '操作系统机考前建议重点复习哪些考点？',
    ],
  },
] as const;

export const QUICK_QUESTIONS: readonly string[] = [
  '下周三有空吗？',
  '期末前哪几门最紧？',
  '本周有哪些日程冲突？',
  '计算机网络期末考试在什么时间和考场？',
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
