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
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo 与主标题 */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-teal-500/20">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-bold text-lg tracking-tight text-slate-900">
                一学期 OneTerm
              </span>
              <span className="hidden md:inline-block text-xs text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full font-medium border border-teal-100">
                一学期，一张图
              </span>
            </div>
          </div>

          {/* 顶栏主导航：胶囊分段风格 */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white text-teal-700 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* 状态与用户信息 */}
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            {currentUser?.mockMode && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/70 text-xs font-medium">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Mock 模式
              </span>
            )}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <NavLink
                  to="/login"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-700 transition-colors"
                  title="点击切换偏好模型或查看详情"
                >
                  <span className="font-semibold text-slate-900">{currentUser.username}</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {currentUser.todayTokensUsed} / {currentUser.dailyTokenLimit}
                  </span>
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <NavLink
                to="/login"
                className="px-3.5 py-1.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors shadow-sm text-sm"
              >
                登录体验
              </NavLink>
            )}
          </div>
        </div>

        {/* 移动端次级导航 */}
        <div className="flex md:hidden border-t border-slate-100 overflow-x-auto px-4 py-2 gap-2 bg-slate-50/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
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
