import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Calendar,
  FileUp,
  MessageSquareText,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  LogOut,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { httpClient } from '../api/httpClient';
import type { UserProfileResponse } from '../types/api';

export const AppLayout: React.FC = () => {
  const { currentUser, setCurrentUser } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    httpClient
      .get<UserProfileResponse>('/api/auth/me')
      .then((user) => setCurrentUser(user))
      .catch(() => {
        setCurrentUser(null);
      });
  }, [setCurrentUser]);

  const handleLogout = async () => {
    try {
      await httpClient.post('/api/auth/logout');
    } catch {
      // ignore
    }
    setCurrentUser(null);
    navigate('/login');
  };

  const navItems = [
    { to: '/calendar', label: '学期日历', icon: Calendar },
    { to: '/extract', label: '课表导入', icon: FileUp },
    { to: '/qa', label: '智能问答', icon: MessageSquareText },
    { to: '/visualize', label: '可视化工坊', icon: Sparkles },
  ];

  if (currentUser?.role === 'ADMIN') {
    navItems.push({ to: '/admin', label: '管理后台', icon: ShieldCheck });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60 text-slate-800 antialiased">
      {/* 极简轻量顶栏 */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/70 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo 与主标题 */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-teal-500/20">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-base tracking-tight text-slate-900">
                一学期 OneTerm
              </span>
              <span className="hidden md:inline-block text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full font-medium border border-teal-100">
                一学期，一张图
              </span>
            </div>
          </div>

          {/* 顶栏主导航：胶囊分段风格 */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200/60">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white text-teal-700 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* 状态与用户信息 */}
          <div className="flex items-center gap-2 text-xs">
            {currentUser?.mockMode && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/70 text-[11px] font-medium">
                <Zap className="w-3 h-3 text-amber-500" />
                Mock 模式
              </span>
            )}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <NavLink
                  to="/login"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-slate-700 transition-colors"
                  title="点击切换偏好模型或查看详情"
                >
                  <span className="font-semibold text-slate-900">{currentUser.username}</span>
                  <span className="text-[10px] text-slate-500">
                    {currentUser.todayTokensUsed} / {currentUser.dailyTokenLimit}
                  </span>
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <NavLink
                to="/login"
                className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors shadow-sm text-xs"
              >
                登录体验
              </NavLink>
            )}
          </div>
        </div>

        {/* 移动端次级导航 */}
        <div className="flex md:hidden border-t border-slate-100 overflow-x-auto px-3 py-1.5 gap-1.5 bg-slate-50/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
