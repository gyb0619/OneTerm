import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  FileUp,
  MessageSquareText,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  LogOut,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { httpClient } from '../api/httpClient';

export const AppLayout: React.FC = () => {
  const { currentUser, setCurrentUser, isRefreshingQuota, refreshCurrentUser } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  // 1. 路由变化或初次挂载时，静默拉取并刷新当前用户；若未登录则平滑重定向到登录页
  useEffect(() => {
    void refreshCurrentUser().then((user) => {
      if (!user && location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    });
  }, [location.pathname, refreshCurrentUser, navigate]);

  // 2. 窗口重获焦点或页面切回前台时自动刷新额度，并设置 15 秒定时轮询保活
  useEffect(() => {
    const handleFocus = () => {
      void refreshCurrentUser();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshCurrentUser();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshCurrentUser();
      }
    }, 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [refreshCurrentUser]);

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
          <div
            onClick={() => navigate('/calendar')}
            className="flex items-center gap-3 shrink-0 group cursor-pointer hover:scale-[1.02] transition-transform duration-200"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-teal-500/20 group-hover:rotate-6 group-hover:scale-105 transition-all duration-200">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-bold text-lg tracking-tight text-slate-900 group-hover:text-teal-700 transition-colors">
                一学期 OneTerm
              </span>
              <span className="hidden md:inline-block text-xs text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full font-medium border border-teal-100 group-hover:border-teal-200 transition-colors">
                一学期，一张图
              </span>
            </div>
          </div>

          {/* 顶栏主导航：胶囊分段风格 */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 shadow-2xs">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 active:scale-95 ${
                      isActive
                        ? 'bg-white text-teal-700 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 transition-transform duration-200" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* 状态与用户信息 */}
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            {currentUser?.mockMode && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/70 text-xs font-medium hover:scale-105 transition-transform">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Mock 模式
              </span>
            )}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-white hover:border-teal-300 hover:shadow-xs border border-slate-200/80 transition-all duration-150 text-xs cursor-default"
                  title={`当日已消耗 ${currentUser.todayTokensUsed.toLocaleString()} / 上限 ${currentUser.dailyTokenLimit.toLocaleString()} Tokens`}
                >
                  <div className="flex flex-col text-right sm:text-left">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <NavLink
                        to="/login"
                        className="font-semibold text-slate-900 hover:text-teal-700 transition-colors"
                        title="点击查看账号与模型偏好详情"
                      >
                        {currentUser.username}
                      </NavLink>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-100/80 text-teal-800 font-mono font-medium hover:scale-105 transition-transform">
                        {Math.min(
                          100,
                          Math.round(
                            (currentUser.todayTokensUsed /
                              Math.max(1, currentUser.dailyTokenLimit)) *
                              100
                          )
                        )}
                        %
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {currentUser.todayTokensUsed.toLocaleString()} / {currentUser.dailyTokenLimit.toLocaleString()}
                    </span>
                  </div>

                  {/* 手动刷新额度按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void refreshCurrentUser();
                    }}
                    disabled={isRefreshingQuota}
                    className="p-1 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-all duration-200 ml-0.5 disabled:opacity-50 hover:rotate-180 active:scale-90"
                    title="点击立即刷新 Token 额度"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isRefreshingQuota ? 'animate-spin text-teal-600' : ''
                      }`}
                    />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:scale-110 active:scale-90 transition-all duration-150"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <NavLink
                to="/login"
                className="px-3.5 py-1.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm text-sm"
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
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-150 active:scale-95 ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-xs font-semibold'
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
        <div key={location.pathname} className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
