import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  AlertTriangle,
  Clock,
  Calendar,
  Sparkles,
  Volume2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  X,
  BookOpen,
} from 'lucide-react';
import { calendarApi } from '../../features/calendar/api';
import type { ReminderItemDto, RemindersSummaryResponse } from '../types/api';
import { useAppStore } from '../store/useAppStore';

export const ReminderCenter: React.FC = () => {
  const navigate = useNavigate();
  const { setHighlightedEventId } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RemindersSummaryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'today' | 'review'>('all');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [desktopTestSent, setDesktopTestSent] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const loadReminders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await calendarApi.getReminders();
      setData(res);
    } catch {
      // 静默失败，保持可用
    } finally {
      setLoading(false);
    }
  }, []);

  // 挂载及周期刷新
  useEffect(() => {
    void loadReminders();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadReminders();
      }
    }, 30000); // 30秒轮询
    return () => window.clearInterval(interval);
  }, [loadReminders]);

  // 点击外部自动关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 检查浏览器通知权限状态
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestDesktopPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('当前浏览器不支持 Web Notifications 桌面通知功能');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        new Notification('🔔 OneTerm 智能提醒中心已开启', {
          body: '您将在此浏览器中接收临期考试、作业截止与日程冲突的桌面强提醒！',
          icon: '/favicon.ico',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerTestNotification = () => {
    if (typeof Notification === 'undefined' || notificationPermission !== 'granted') {
      return;
    }
    setDesktopTestSent(true);
    const notif = new Notification('🚨 [考试临期强提醒] OneTerm 教务中心', {
      body: '《算法分析与设计》期末机试将于 2 天后（11-06 09:00）开考！考场：计算中心 302',
      tag: 'oneterm-exam-test',
    });
    notif.onclick = () => {
      window.focus();
      navigate('/calendar');
    };
    window.setTimeout(() => setDesktopTestSent(false), 3000);
  };

  const handleItemClick = (item: ReminderItemDto) => {
    setIsOpen(false);
    if (item.relatedEventId) {
      setHighlightedEventId(item.relatedEventId);
      navigate('/calendar');
    } else if (item.relatedTopicId) {
      navigate('/calendar');
    }
  };

  const totalCount = data?.totalCount ?? 0;
  const urgentCount = data?.urgentCount ?? 0;

  const urgentItems = [
    ...(data?.conflictAlerts ?? []),
    ...(data?.upcomingExams ?? []),
    ...(data?.upcomingDeadlines ?? []),
  ];

  const todayItems = data?.todayEvents ?? [];
  const reviewItems = data?.todayReviewTopics ?? [];

  const displayedItems = (() => {
    if (activeTab === 'urgent') return urgentItems;
    if (activeTab === 'today') return todayItems;
    if (activeTab === 'review') return reviewItems;
    return [...urgentItems, ...todayItems, ...reviewItems];
  })();

  const renderBadge = (urgency: ReminderItemDto['urgencyLevel']) => {
    if (urgency === 'critical') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
          紧急
        </span>
      );
    }
    if (urgency === 'warning') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          注意
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-100 text-teal-800 border border-teal-200">
        日常
      </span>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* 铃铛触发按钮 */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) {
            void loadReminders();
          }
        }}
        className={`relative p-2 rounded-xl transition-all duration-200 active:scale-95 ${
          isOpen
            ? 'bg-teal-50 text-teal-700 ring-2 ring-teal-500/30'
            : 'text-slate-500 hover:text-teal-700 hover:bg-slate-100'
        }`}
        title={`智能提醒中心 (${totalCount} 项待办/提醒)`}
        aria-label="智能提醒中心"
      >
        {urgentCount > 0 ? (
          <BellRing className="w-4 h-4 text-rose-600 animate-pulse" />
        ) : (
          <Bell className="w-4 h-4" />
        )}

        {totalCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full flex items-center justify-center shadow-xs transition-transform ${
              urgentCount > 0 ? 'bg-rose-500 animate-bounce' : 'bg-teal-600'
            }`}
          >
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {/* 提醒浮层 Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* 顶栏 */}
          <div className="p-3.5 bg-gradient-to-r from-teal-50/70 via-white to-indigo-50/40 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
                <BellRing className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-slate-900">智能教务提醒中心</h3>
                  {urgentCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                      {urgentCount} 紧急
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {data?.referenceDate ? `基准周: ${data.referenceDate}` : '多级提醒覆盖'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={loadReminders}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                title="刷新提醒"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-600' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 桌面通知开关栏 */}
          <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px]">
                {notificationPermission === 'granted'
                  ? '浏览器桌面强提醒：已开启'
                  : notificationPermission === 'denied'
                  ? '桌面通知权限已禁用'
                  : '桌面通知：未开启'}
              </span>
            </div>

            {notificationPermission === 'granted' ? (
              <button
                type="button"
                onClick={triggerTestNotification}
                className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 font-medium hover:bg-teal-100 transition-colors text-[11px]"
              >
                {desktopTestSent ? '已发送弹窗' : '测试弹窗'}
              </button>
            ) : notificationPermission === 'default' ? (
              <button
                type="button"
                onClick={requestDesktopPermission}
                className="px-2 py-0.5 rounded-md bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors text-[11px] shadow-2xs"
              >
                开启桌面提醒
              </button>
            ) : null}
          </div>

          {/* 分类选项卡 */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              全部 ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('urgent')}
              className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                activeTab === 'urgent'
                  ? 'bg-white text-rose-700 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              临期预警 ({urgentItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                activeTab === 'today'
                  ? 'bg-white text-teal-700 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              今日日程 ({todayItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                activeTab === 'review'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              复习 ({reviewItems.length})
            </button>
          </div>

          {/* 提醒列表滚动区 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[380px] divide-y-0">
            {displayedItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-400/80" />
                <span>暂无待处理提醒，安排井井有条！</span>
              </div>
            ) : (
              displayedItems.map((item) => {
                const isExam = item.type === 'upcoming_exam';
                const isConflict = item.type === 'conflict_alert';
                const isDeadline = item.type === 'upcoming_deadline';
                const isReview = item.type === 'today_review';

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleItemClick(item);
                    }}
                    className={`group p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.99] ${
                      item.urgencyLevel === 'critical'
                        ? 'bg-rose-50/50 border-rose-200/90 hover:bg-rose-50'
                        : item.urgencyLevel === 'warning'
                        ? 'bg-amber-50/40 border-amber-200/90 hover:bg-amber-50'
                        : 'bg-white border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {renderBadge(item.urgencyLevel)}
                        <span className="font-semibold text-xs text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-1">
                          {item.title}
                        </span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-600 shrink-0 transition-colors" />
                    </div>

                    <div className="mt-1 text-xs text-slate-600 flex items-center gap-2">
                      <span className="font-medium text-slate-800">{item.subtitle}</span>
                      {item.location && (
                        <span className="text-[11px] text-slate-500 truncate">
                          📍 {item.location}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {item.timeDisplay}
                      </span>

                      {/* 提醒策略标牌 */}
                      <span className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded font-mono">
                        {isExam
                          ? '🔔 提前1天+2h'
                          : isDeadline
                          ? '🔔 提前1天+3h'
                          : isConflict
                          ? '⚠️ 时间重叠'
                          : isReview
                          ? '🔔 提前15m'
                          : '🔔 提前15m'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 底部手机日历与功能指引 */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="truncate">
              📱 导出 .ics 即可将 VALARM 闹钟同步至 iPhone/安卓手机
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/calendar');
              }}
              className="font-medium text-teal-700 hover:underline shrink-0 ml-2"
            >
              完整日历 &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
