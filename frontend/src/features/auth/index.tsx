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
} from 'lucide-react';
import { ApiClientError, httpClient } from '../../shared/api/httpClient';
import { useAppStore } from '../../shared/store/useAppStore';
import type { AvailableModelDto, UserProfileResponse } from '../../shared/types/api';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useAppStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
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
        // 未登录时忽略 401，同时已完成首次请求下发 XSRF-TOKEN Cookie
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

  const handleDemoLoad = async () => {
    setErrorMsg(null);
    setErrorCode(null);
    setSuccessMsg(null);
    setLoadingDemo(true);
    try {
      const profile = await httpClient.post<UserProfileResponse>('/api/auth/demo-load');
      setCurrentUser(profile);
      setSuccessMsg('示例数据已完整载入！正在跳转学期日历...');
      navigate('/calendar');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorCode(err.code);
        setErrorMsg(err.message);
      } else {
        setErrorMsg('载入示例数据失败，请稍后重试');
      }
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleSelectModel = async (modelId: number) => {
    setSwitchingModel(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await httpClient.put<UserProfileResponse>('/api/auth/preferred-model', {
        modelId,
      });
      setCurrentUser(updated);
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

  const handleLogout = async () => {
    try {
      await httpClient.post('/api/auth/logout');
    } finally {
      setCurrentUser(null);
      setSuccessMsg('您已安全退出登录');
    }
  };

  const isLockedError = errorCode === 'ACCOUNT_LOCKED';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 bg-gradient-to-b from-teal-50/60 via-slate-50 to-slate-100">
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* 左侧：品牌介绍与一键载入示例数据 */}
        <div className="lg:col-span-7 college-card p-6 sm:p-8 flex flex-col justify-between bg-gradient-to-br from-teal-900 via-teal-800 to-sky-900 text-white border-0 shadow-lg">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-teal-100 text-xs font-medium mb-5">
              <GraduationCap className="w-4 h-4" />
              一学期 OneTerm · 智慧教务规划工作台
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              一学期，一张图
            </h1>
            <p className="text-sm text-teal-100/90 leading-relaxed mb-6">
              把零散的课表截图、考试通知与作业截止提醒整理成一张学期全景图。自动检出时间冲突、支持带原文引用的智能问答，并将核心考点可视化与考前复习排期串成完整链路。
            </p>

            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm mb-2">
                <Sparkles className="w-4 h-4" />
                评委快速验收通道（免配置 API Key）
              </div>
              <p className="text-xs text-teal-100/90 leading-relaxed mb-4">
                点击下方按钮将自动使用演示学生账号（<code className="text-white font-mono">demo_student</code>）登录，并幂等写入：
                3 门课程、3 场考试、2 项作业截止、1 项社团活动（含 2 处预置冲突）、RAG 向量切片，以及「冒泡排序」「TCP 三次握手」交互式可视化与考前复习路径。
              </p>
              <button
                type="button"
                onClick={handleDemoLoad}
                disabled={loadingDemo}
                className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                {loadingDemo ? '正在初始化全链路示例数据...' : '一键载入示例数据（免配置直接体验）'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs text-teal-100/80 pt-4 border-t border-white/10">
            <div>
              <div className="font-semibold text-white">防暴力破解</div>
              <div>连续失败 5 次锁定 10 分钟</div>
            </div>
            <div>
              <div className="font-semibold text-white">HttpOnly + CSRF</div>
              <div>服务端安全会话与租户隔离</div>
            </div>
            <div>
              <div className="font-semibold text-white">Token 额度保护</div>
              <div>按日统计用量与模型切换</div>
            </div>
          </div>
        </div>

        {/* 右侧：登录表单与当前账号模型偏好设置 */}
        <div className="lg:col-span-5 college-card p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">账号登录</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  系统不开放公开注册，账号由管理员统一分配
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className={`mb-4 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                  isLockedError
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {isLockedError ? (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">
                    {isLockedError ? '账号处于安全锁定期 (HTTP 423)' : '认证提示'}
                  </div>
                  <div className="mt-0.5">{errorMsg}</div>
                </div>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
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
                    placeholder="请输入管理员或学生账号"
                    autoComplete="username"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  登录密码
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入登录密码"
                    autoComplete="current-password"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingLogin}
                className="w-full btn-primary py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium"
              >
                {loadingLogin ? '正在验证身份...' : '登录系统'}
              </button>
            </form>

            {/* 当前已登录会话与对话模型切换卡片 */}
            {currentUser && (
              <div className="mt-6 pt-5 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                      {currentUser.role === 'ADMIN' ? '管理员 ADMIN' : '学生 USER'}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {currentUser.username}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    退出
                  </button>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex justify-between mb-1">
                    <span>今日 Token 用量</span>
                    <span className="font-mono font-medium">
                      {currentUser.todayTokensUsed.toLocaleString()} /{' '}
                      {currentUser.dailyTokenLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full transition-all"
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

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
                    <Cpu className="w-3.5 h-3.5 text-teal-600" />
                    切换当前对话模型（仅展示管理员已启用模型）
                  </label>
                  {models.length === 0 ? (
                    <div className="text-xs text-slate-500 bg-amber-50/70 border border-amber-200 rounded-lg px-3 py-2">
                      当前未配置或未启用外部对话模型，系统自动运行于{' '}
                      <span className="font-medium text-amber-800">Mock 演示模式</span>。
                    </div>
                  ) : (
                    <select
                      value={currentUser.preferredModelId ?? ''}
                      disabled={switchingModel}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val) handleSelectModel(val);
                      }}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">默认启用模型 ({models[0]?.name})</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.model})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/calendar')}
                    className="flex-1 btn-secondary py-1.5 text-xs"
                  >
                    进入学期日历
                  </button>
                  {currentUser.role === 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => navigate('/admin')}
                      className="flex-1 btn-secondary py-1.5 text-xs text-teal-700 border-teal-200 bg-teal-50/50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      管理后台
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>默认管理员由环境变量 ONETERM_ADMIN_* 初始化</span>
            <span>时区：Asia/Shanghai</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
