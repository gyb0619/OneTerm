import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Sparkles,
  Lock,
  User,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Cpu,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { ApiClientError, httpClient } from '../../shared/api/httpClient';
import { useAppStore } from '../../shared/store/useAppStore';
import type { AvailableModelDto, UserProfileResponse } from '../../shared/types/api';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useAppStore();

  const [username, setUsername] = useState('示例信息');
  const [password, setPassword] = useState('Demo@123456');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [models, setModels] = useState<AvailableModelDto[]>([]);
  const [switchingModel, setSwitchingModel] = useState(false);

  useEffect(() => {
    let mounted = true;
    httpClient
      .get<UserProfileResponse>('/api/auth/me')
      .then((profile) => {
        if (mounted) {
          setCurrentUser(profile);
        }
      })
      .catch(() => {
        // 未登录时静默处理
      });
    return () => {
      mounted = false;
    };
  }, [setCurrentUser]);

  useEffect(() => {
    if (!currentUser) {
      setModels([]);
      return;
    }
    httpClient
      .get<AvailableModelDto[]>('/api/auth/models')
      .then((list) => setModels(list))
      .catch(() => setModels([]));
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorCode(null);
    setSuccessMsg(null);

    if (!username.trim() || !password) {
      setErrorMsg('请输入用户名和密码');
      return;
    }

    setLoadingLogin(true);
    try {
      const profile = await httpClient.post<UserProfileResponse>('/api/auth/login', {
        username: username.trim(),
        password,
      });
      setCurrentUser(profile);
      setSuccessMsg(`欢迎回来，${profile.username}！正在进入学期工作台...`);
      navigate('/calendar');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorCode(err.code);
        setErrorMsg(err.message);
      } else {
        setErrorMsg('登录请求异常，请检查网络连接');
      }
    } finally {
      setLoadingLogin(false);
    }
  };


  const handleLogout = async () => {
    try {
      await httpClient.post('/api/auth/logout');
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setSuccessMsg('已安全退出登录');
  };

  const handleSelectModel = async (modelId: number) => {
    setSwitchingModel(true);
    try {
      await httpClient.put('/api/auth/preferred-model', { modelId });
      const profile = await httpClient.get<UserProfileResponse>('/api/auth/me');
      setCurrentUser(profile);
      setSuccessMsg('偏好对话模型已更新');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('切换模型失败');
      }
    } finally {
      setSwitchingModel(false);
    }
  };

  const isLockedError = errorCode === 'ACCOUNT_LOCKED';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8 bg-slate-50/70">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        {/* 品牌标识 */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-sm shadow-teal-600/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">一学期 OneTerm</h1>
          <p className="text-xs text-slate-500">
            智慧教务规划工作台 · 一学期，一张图
          </p>
        </div>



        {/* 错误提示 */}
        {errorMsg && (
          <div
            role="alert"
            className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
              isLockedError
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {isLockedError ? (
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold">{isLockedError ? '账号已锁定' : '提示'}</div>
              <div>{errorMsg}</div>
            </div>
          </div>
        )}

        {/* 成功提示 */}
        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              用户名
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin 或用户账号"
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              密码
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loadingLogin}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-60"
          >
            {loadingLogin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {loadingLogin ? '验证中...' : '登录'}
          </button>
        </form>

        {/* 当前登录状态卡片（若已登录） */}
        {currentUser && (
          <div className="pt-4 border-t border-slate-100 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                  {currentUser.role}
                </span>
                <span className="font-semibold text-slate-900">{currentUser.username}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-600 flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                退出
              </button>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 space-y-1">
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>今日 Token 额度</span>
                <span className="font-mono">
                  {currentUser.todayTokensUsed} / {currentUser.dailyTokenLimit}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (currentUser.todayTokensUsed /
                          Math.max(1, currentUser.dailyTokenLimit)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            {models.length > 0 && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">切换偏好模型</label>
                <select
                  value={currentUser.preferredModelId ?? ''}
                  disabled={switchingModel}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val !== 0) {
                      handleSelectModel(val);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">默认模型 ({models[0]?.name})</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="flex-1 btn-primary bg-teal-600 hover:bg-teal-700 py-2 text-xs"
              >
                进入学期日历
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              {currentUser.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="btn-secondary py-2 px-3 text-xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                  管理
                </button>
              )}
            </div>
          </div>
        )}

        <div className="pt-2 text-center text-[11px] text-slate-400">
          时区：Asia/Shanghai · 安全沙箱隔离
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
