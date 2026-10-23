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
    { to: '/extract', label: '导入与抽取', icon: FileUp },
    { to: '/calendar', label: '日历与热力图', icon: Calendar },
    { to: '/qa', label: '智能问答', icon: MessageSquareText },
    { to: '/visualize', label: '可视化工坊', icon: Sparkles },
  ];

  if (currentUser?.role === 'ADMIN') {
    navItems.push({ to: '/admin', label: '管理后台', icon: ShieldCheck });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-academic-600 flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-900">
                一学期 OneTerm
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                一学期，一张图
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 text-xs text-slate-600">
            {currentUser?.mockMode && (
              <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                Mock 演示模式
              </span>
            )}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <NavLink
                  to="/login"
                  className="font-medium text-slate-700 hover:text-brand-600 transition-colors"
                  title="查看账号与模型偏好"
                >
                  {currentUser.username} ({currentUser.todayTokensUsed}/
                  {currentUser.dailyTokenLimit} tokens)
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">退出</span>
                </button>
              </div>
            ) : (
              <NavLink to="/login" className="btn-primary py-1.5 px-3 text-xs">
                登录体验
              </NavLink>
            )}
          </div>
        </div>

        {/* 移动端底部/次级导航栏 */}
        <div className="flex md:hidden border-t border-slate-100 overflow-x-auto px-2 py-1.5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100'
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
};
