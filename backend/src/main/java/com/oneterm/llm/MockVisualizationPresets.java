package com.oneterm.llm;

/**
 * Mock 模式下预置的知识点单文件交互式 HTML 模板。
 * 严格遵守 PRD F5 规范：
 * 1. 体积远小于 100KB
 * 2. 零外部网络请求（不含 http/https、fetch、XMLHttpRequest、WebSocket、外链 import）
 * 3. 包含滑块（input[type=range]）与交互控制按钮（播放/暂停/单步/重置）
 */
public final class MockVisualizationPresets {

    private MockVisualizationPresets() {
    }

    public static String getHtmlForTopic(String rawTopic) {
        String topic = rawTopic == null ? "" : rawTopic.trim().toLowerCase();
        if (topic.contains("冒泡") || topic.contains("bubble")) {
            return BUBBLE_SORT_HTML;
        }
        if (topic.contains("三次握手") || topic.contains("handshake") || topic.contains("tcp")) {
            return TCP_HANDSHAKE_HTML;
        }
        return buildGenericAlgorithmHtml(rawTopic == null || rawTopic.isBlank() ? "算法状态机演示" : rawTopic.trim());
    }

    public static final String BUBBLE_SORT_HTML = """
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
            <meta charset="UTF-8" />
            <title>冒泡排序 (Bubble Sort) 交互式可视化</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 20px; }
              .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(15,23,42,0.04); }
              h2 { color: #0f766e; font-size: 18px; margin-bottom: 6px; }
              .subtitle { color: #64748b; font-size: 13px; margin-bottom: 16px; }
              .controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; background: #f1f5f9; padding: 12px; border-radius: 8px; }
              button { background: #0d9488; color: #fff; border: none; border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; transition: opacity 0.15s; }
              button:hover { opacity: 0.9; }
              button.secondary { background: #475569; }
              .slider-group { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #334155; margin-left: auto; }
              .stage { height: 220px; display: flex; align-items: flex-end; justify-content: center; gap: 10px; padding: 20px 12px 8px; border-bottom: 2px solid #cbd5e1; margin-bottom: 14px; }
              .bar-wrap { display: flex; flex-direction: column; align-items: center; width: 42px; }
              .bar { width: 100%; background: #38bdf8; border-radius: 6px 6px 0 0; transition: height 0.25s ease, background-color 0.2s ease; display: flex; align-items: flex-start; justify-content: center; color: #fff; font-weight: 600; font-size: 12px; padding-top: 4px; }
              .bar.comparing { background: #f59e0b; transform: translateY(-4px); }
              .bar.swapping { background: #ef4444; }
              .bar.sorted { background: #10b981; }
              .idx { font-size: 11px; color: #64748b; margin-top: 4px; }
              .status { font-size: 13px; background: #ecfdf5; border-left: 4px solid #10b981; padding: 10px 12px; border-radius: 4px; color: #065f46; }
            </style>
            </head>
            <body>
            <div class="card">
              <h2>冒泡排序（Bubble Sort）交互式演示</h2>
              <p class="subtitle">时间复杂度 O(n²) · 空间复杂度 O(1) · 稳定排序算法</p>
              <div class="controls">
                <button id="btnPlay">自动播放</button>
                <button id="btnStep" class="secondary">单步执行</button>
                <button id="btnReset" class="secondary">重置数组</button>
                <div class="slider-group">
                  <label for="speedSlider">动画速度</label>
                  <input id="speedSlider" type="range" min="100" max="900" step="100" value="500" />
                </div>
              </div>
              <div class="stage" id="stage"></div>
              <div class="status" id="statusText">点击「单步执行」或「自动播放」开始观察相邻元素比较与交换过程。</div>
            </div>
            <script>
              const initialData = [64, 34, 25, 12, 22, 11, 90, 45];
              let arr = [...initialData];
              let steps = [];
              let stepIdx = 0;
              let timer = null;

              function buildSteps(source) {
                const a = [...source];
                const list = [];
                const n = a.length;
                for (let i = 0; i < n - 1; i++) {
                  for (let j = 0; j < n - 1 - i; j++) {
                    list.push({ arr: [...a], cmp: [j, j + 1], swap: false, sortedFrom: n - i, msg: `比较索引 [${j}] (${a[j]}) 与 [${j+1}] (${a[j+1]})` });
                    if (a[j] > a[j + 1]) {
                      const tmp = a[j]; a[j] = a[j + 1]; a[j + 1] = tmp;
                      list.push({ arr: [...a], cmp: [j, j + 1], swap: true, sortedFrom: n - i, msg: `${a[j+1]} > ${a[j]}，交换相邻元素位置` });
                    }
                  }
                }
                list.push({ arr: [...a], cmp: [], swap: false, sortedFrom: 0, msg: '冒泡排序全部完成！所有元素已按升序排列。' });
                return list;
              }

              function render(state) {
                const stage = document.getElementById('stage');
                stage.innerHTML = '';
                const maxVal = Math.max(...state.arr, 100);
                state.arr.forEach((val, idx) => {
                  const wrap = document.createElement('div');
                  wrap.className = 'bar-wrap';
                  const bar = document.createElement('div');
                  bar.className = 'bar';
                  if (idx >= state.sortedFrom) bar.classList.add('sorted');
                  if (state.cmp.includes(idx)) {
                    bar.classList.add(state.swap ? 'swapping' : 'comparing');
                  }
                  bar.style.height = Math.max(28, Math.round((val / maxVal) * 170)) + 'px';
                  bar.textContent = val;
                  const label = document.createElement('div');
                  label.className = 'idx';
                  label.textContent = '[' + idx + ']';
                  wrap.appendChild(bar);
                  wrap.appendChild(label);
                  stage.appendChild(wrap);
                });
                document.getElementById('statusText').textContent = `步骤 ${stepIdx}/${steps.length - 1}：` + state.msg;
              }

              function reset() {
                stopPlay();
                arr = [...initialData];
                steps = buildSteps(arr);
                stepIdx = 0;
                render(steps[0]);
              }

              function nextStep() {
                if (stepIdx < steps.length - 1) {
                  stepIdx++;
                  render(steps[stepIdx]);
                } else {
                  stopPlay();
                }
              }

              function stopPlay() {
                if (timer) { clearInterval(timer); timer = null; }
                document.getElementById('btnPlay').textContent = '自动播放';
              }

              document.getElementById('btnStep').addEventListener('click', () => { stopPlay(); nextStep(); });
              document.getElementById('btnReset').addEventListener('click', reset);
              document.getElementById('btnPlay').addEventListener('click', () => {
                if (timer) { stopPlay(); return; }
                document.getElementById('btnPlay').textContent = '暂停';
                const delay = 1000 - Number(document.getElementById('speedSlider').value);
                timer = setInterval(nextStep, Math.max(100, delay));
              });

              reset();
            </script>
            </body>
            </html>
            """;

    public static final String TCP_HANDSHAKE_HTML = """
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
            <meta charset="UTF-8" />
            <title>TCP 三次握手 (Three-Way Handshake) 交互式可视化</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 20px; }
              .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(15,23,42,0.04); }
              h2 { color: #0284c7; font-size: 18px; margin-bottom: 6px; }
              .subtitle { color: #64748b; font-size: 13px; margin-bottom: 16px; }
              .controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; background: #f1f5f9; padding: 12px; border-radius: 8px; }
              button { background: #0284c7; color: #fff; border: none; border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
              button.secondary { background: #475569; }
              .slider-group { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-left: auto; }
              .diagram { display: flex; justify-content: space-between; align-items: stretch; position: relative; min-height: 220px; padding: 16px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 14px; }
              .node { width: 150px; background: #fff; border: 2px solid #0d9488; border-radius: 10px; padding: 14px; text-align: center; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
              .node-title { font-weight: 700; color: #0f172a; font-size: 15px; }
              .badge { display: inline-block; padding: 5px 8px; border-radius: 6px; background: #ccfbf1; color: #115e59; font-weight: 700; font-size: 12px; }
              .channel { flex: 1; display: flex; flex-direction: column; justify-content: space-around; padding: 0 20px; }
              .packet { padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; opacity: 0.25; transition: all 0.3s ease; border: 1px dashed #94a3b8; text-align: center; }
              .packet.active { opacity: 1; border-style: solid; background: #e0f2fe; border-color: #0284c7; color: #0369a1; transform: scale(1.03); }
              .status { font-size: 13px; background: #f0f9ff; border-left: 4px solid #0284c7; padding: 10px 12px; border-radius: 4px; color: #0c4a6e; }
            </style>
            </head>
            <body>
            <div class="card">
              <h2>TCP 三次握手（Three-Way Handshake）状态机演示</h2>
              <p class="subtitle">同步双端序列号 (ISN) · 确认双向收发通道正常 · 防止历史失效连接初始化</p>
              <div class="controls">
                <button id="btnPlay">自动播放</button>
                <button id="btnNext" class="secondary">下一步</button>
                <button id="btnReset" class="secondary">重置状态</button>
                <div class="slider-group">
                  <label for="stepSlider">握手阶段</label>
                  <input id="stepSlider" type="range" min="0" max="3" step="1" value="0" />
                </div>
              </div>
              <div class="diagram">
                <div class="node">
                  <div class="node-title">客户端 (Client)</div>
                  <div class="badge" id="clientState">CLOSED</div>
                </div>
                <div class="channel">
                  <div class="packet" id="pkt1">① SYN=1, seq=x (100) ➔</div>
                  <div class="packet" id="pkt2">⬅ ② SYN=1, ACK=1, seq=y (300), ack=x+1 (101)</div>
                  <div class="packet" id="pkt3">③ ACK=1, seq=x+1 (101), ack=y+1 (301) ➔</div>
                </div>
                <div class="node">
                  <div class="node-title">服务端 (Server)</div>
                  <div class="badge" id="serverState">LISTEN</div>
                </div>
              </div>
              <div class="status" id="descBox">阶段 0：服务端处于 LISTEN 被动监听状态，客户端准备发起主动打开 (Active Open)。</div>
            </div>
            <script>
              const stages = [
                { c: 'CLOSED', s: 'LISTEN', active: 0, desc: '阶段 0：服务端处于 LISTEN 被动监听状态，客户端准备发起连接。' },
                { c: 'SYN_SENT', s: 'LISTEN ➔ SYN_RCVD', active: 1, desc: '第一次握手：客户端发送 SYN 报文（seq=100），进入 SYN_SENT 状态；服务端收到后进入 SYN_RCVD 状态。' },
                { c: 'SYN_SENT ➔ ESTABLISHED', s: 'SYN_RCVD', active: 2, desc: '第二次握手：服务端回传 SYN+ACK 报文（seq=300, ack=101），确认客户端发送能力正常。' },
                { c: 'ESTABLISHED', s: 'ESTABLISHED', active: 3, desc: '第三次握手：客户端发送 ACK 报文（seq=101, ack=301），双方均进入 ESTABLISHED 状态，可开始传输应用数据！' }
              ];
              let cur = 0;
              let timer = null;

              function updateView(idx) {
                cur = idx;
                document.getElementById('stepSlider').value = String(cur);
                document.getElementById('clientState').textContent = stages[cur].c;
                document.getElementById('serverState').textContent = stages[cur].s;
                document.getElementById('descBox').textContent = stages[cur].desc;
                for (let i = 1; i <= 3; i++) {
                  const el = document.getElementById('pkt' + i);
                  if (i <= stages[cur].active) el.classList.add('active');
                  else el.classList.remove('active');
                }
              }

              function stopTimer() {
                if (timer) { clearInterval(timer); timer = null; }
                document.getElementById('btnPlay').textContent = '自动播放';
              }

              document.getElementById('stepSlider').addEventListener('input', (e) => {
                stopTimer();
                updateView(Number(e.target.value));
              });
              document.getElementById('btnNext').addEventListener('click', () => {
                stopTimer();
                updateView((cur + 1) % stages.length);
              });
              document.getElementById('btnReset').addEventListener('click', () => {
                stopTimer();
                updateView(0);
              });
              document.getElementById('btnPlay').addEventListener('click', () => {
                if (timer) { stopTimer(); return; }
                document.getElementById('btnPlay').textContent = '暂停';
                timer = setInterval(() => {
                  if (cur < stages.length - 1) updateView(cur + 1);
                  else stopTimer();
                }, 1100);
              });

              updateView(0);
            </script>
            </body>
            </html>
            """;

    private static String buildGenericAlgorithmHtml(String safeTitle) {
        String escaped = safeTitle.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        return TCP_HANDSHAKE_HTML.replace("TCP 三次握手（Three-Way Handshake）状态机演示", escaped + " 交互式演示");
    }
}
