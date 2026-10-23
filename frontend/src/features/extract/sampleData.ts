import type { EventType } from '../../shared/types/api';

export interface EventTypeMeta {
  label: string;
  badgeClass: string;
  borderClass: string;
  dotClass: string;
  weight: number;
}

export const EVENT_TYPE_META: Record<EventType, EventTypeMeta> = {
  exam: {
    label: '考试/测验',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    borderClass: 'border-l-4 border-l-red-500',
    dotClass: 'bg-red-500',
    weight: 5,
  },
  deadline: {
    label: '作业截止',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    borderClass: 'border-l-4 border-l-amber-500',
    dotClass: 'bg-amber-500',
    weight: 3,
  },
  course: {
    label: '常规课程',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    borderClass: 'border-l-4 border-l-teal-600',
    dotClass: 'bg-teal-600',
    weight: 2,
  },
  activity: {
    label: '社团/活动',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    borderClass: 'border-l-4 border-l-sky-500',
    dotClass: 'bg-sky-500',
    weight: 1,
  },
  notice: {
    label: '教务通知',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    borderClass: 'border-l-4 border-l-slate-400',
    dotClass: 'bg-slate-500',
    weight: 1,
  },
};

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'course', label: '常规课程 (course)' },
  { value: 'exam', label: '考试/测验 (exam)' },
  { value: 'deadline', label: '作业截止 (deadline)' },
  { value: 'activity', label: '社团/活动 (activity)' },
  { value: 'notice', label: '教务通知 (notice)' },
];

export const SAMPLE_SEMESTER_TEXT = `【教务处课表导出 - 2026秋季学期第10周课程安排】
1. 课程名称：《算法设计与分析》
上课时间：2026-11-04 08:00 至 2026-11-04 09:40
上课地点：教学楼 A302
备注：主讲林教授，本周讲授冒泡排序、快速排序复杂度分析与分治策略。

2. 课程名称：《操作系统》
上课时间：2026-11-04 09:40 至 2026-11-04 11:20
上课地点：教学楼 A302
备注：主讲陈老师，本节紧接算法课之后上课，讲授进程同步与死锁避免。

3. 课程名称：《计算机网络》实验课
上课时间：2026-11-04 14:00 至 2026-11-04 16:00
上课地点：实验楼 B205
备注：主讲王老师，实验主题为 TCP 三次握手连接建立与报文分析，请提前安装抓包工具。

【班级群置顶通知 - 考试安排（共3条）】
4. 【教务考试通知】《算法设计与分析》期中随堂测验定于 2026-11-04 15:00 至 2026-11-04 17:00 在教学楼 C101 举行。考试形式为闭卷笔试，重点考查冒泡排序、归并排序及贪心算法证明，请同学们携带学生证准时参加。

5. 【机考通知】《操作系统》期中上机考核定于 2026-11-06 19:00 至 2026-11-06 21:00 在信息中心机房 D401 进行，主要考查银行家算法与页面置换模拟实现。

6. 【期末统考预告】《计算机网络》课程期末考试将于 2026-11-13 09:00 至 2026-11-13 11:00 在第一教学楼 A105 考场进行。核心复习范围包括 TCP 三次握手与四次挥手状态机、滑动窗口流量控制与 OSPF 路由协议。

【课程平台提醒 - 作业截止（共2条）】
7. 【作业截止提醒】《算法设计与分析》第二次实验报告（冒泡排序与快速排序基准测试对比）提交窗口将于 2026-11-11 22:00 至 2026-11-11 23:59 截止，请登录课程中心上传 PDF 报告。

8. 【作业截止提醒】《计算机网络》TCP 三次握手抓包实验分析报告最后提交时段为 2026-11-12 20:00 至 2026-11-12 22:00，请务必在期末考试前一天完成提交，逾期系统自动关闭。

【校园社团公告（共1条）】
9. 【ACM协会通知】ACM 程序设计竞赛协会秋季招新沙龙暨算法分享会将于 2026-11-06 19:00 至 2026-11-06 21:00 在学生活动中心 203 室举行，欢迎对算法竞赛感兴趣的同学参加。`;

/**
 * 将 ISO 8601 字符串（如 2026-11-04T08:00:00+08:00）转为 input[type=datetime-local] 所需的 YYYY-MM-DDTHH:mm 格式
 */
export function isoToDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const cleaned = iso.trim().replace(' ', 'T');
  const match = cleaned.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }
  return cleaned.slice(0, 16);
}

/**
 * 将 input[type=datetime-local] 的值（YYYY-MM-DDTHH:mm）转为标准 Asia/Shanghai ISO 8601 格式
 */
export function datetimeLocalToIso(localValue: string): string {
  if (!localValue) return '';
  const trimmed = localValue.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00+08:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}+08:00`;
  }
  return trimmed;
}

/**
 * 格式化时间用于界面友好展示
 */
export function formatDisplayDateTime(iso: string): string {
  if (!iso) return '-';
  const local = isoToDatetimeLocal(iso);
  return local.replace('T', ' ');
}
