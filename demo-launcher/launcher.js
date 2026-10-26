#!/usr/bin/env node
/**
 * ==============================================================================
 * OneTerm (一学期) - 示例环境独立启动器 (BAT + JSON 驱动引擎)
 * 直接修改 SQLite 数据库文件 (data/oneterm.db) 写入全量拟造示例信息
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const scriptDir = __dirname;
const projectRoot = path.resolve(scriptDir, '..');
const configFile = path.join(scriptDir, 'config.json');

if (!fs.existsSync(configFile)) {
  console.error(`[ERROR] 找不到配置文件: ${configFile}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

// 颜色输出辅助
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

function log(text, color = 'white') {
  console.log(`${colors[color] || ''}${text}${colors.reset}`);
}

// 寻找 Maven 路径
function getMavenCommand() {
  if (config.maven && config.maven.customCommand && fs.existsSync(config.maven.customCommand)) {
    return config.maven.customCommand;
  }
  const fallback = 'D:\\Code\\SM\\.crush-tools\\apache-maven-3.9.16\\bin\\mvn.cmd';
  if (fs.existsSync(fallback)) {
    return fallback;
  }
  return 'mvn';
}

// 检查端口是否在监听
function isPortInUse(port) {
  try {
    const cmd = process.platform === 'win32'
      ? `netstat -ano | findstr :${port} | findstr LISTENING`
      : `lsof -i :${port}`;
    const stdout = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// 杀死指定端口的进程
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const stdout = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        log(`  正在终止端口 ${port} 进程 (PID: ${pid})...`, 'yellow');
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      }
    }
  } catch {
    // 忽略未找到进程错误
  }
}

// 等待端口就绪
async function waitForPort(port, timeoutSec = 35) {
  process.stdout.write(`  正在检测端口 ${port} 服务就绪... `);
  const start = Date.now();
  while (Date.now() - start < timeoutSec * 1000) {
    if (isPortInUse(port)) {
      console.log(`${colors.green}[成功]${colors.reset}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 600));
    process.stdout.write('.');
  }
  console.log(`${colors.yellow}[等待中]${colors.reset}`);
  return false;
}

// 计算与后端 MockLlmGateway.embed 一致的 64 维 Float32 BLOB 向量切片
function computeMockEmbedding(text) {
  const EMBEDDING_DIM = 64;
  const vec = new Float32Array(EMBEDDING_DIM);
  if (!text || !text.trim()) {
    vec[0] = 1.0;
    return Buffer.from(vec.buffer);
  }
  const normalized = text.toLowerCase();
  const keywords = [
    '周三', '11-04', '有空', '算法设计与分析', '操作系统', '计算机网络',
    '期末', '考试', '测验', '上机', '截止', '实验报告', '冒泡排序',
    '三次握手', 'tcp', 'acm', '社团', '11-06', '11-11', '11-12', '11-13'
  ];
  for (let i = 0; i < keywords.length && i < EMBEDDING_DIM / 2; i++) {
    if (normalized.includes(keywords[i])) {
      vec[i] += 3.0;
    }
  }
  if (normalized.includes('周三') || normalized.includes('11-04')) {
    vec[0] += 4.0;
    vec[1] += 4.0;
  }
  if (normalized.includes('期末') || normalized.includes('最紧') || normalized.includes('考试') || normalized.includes('截止')) {
    vec[6] += 3.5;
    vec[7] += 3.5;
    vec[10] += 3.0;
  }
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const nextCode = i + 1 < normalized.length ? normalized.charCodeAt(i + 1) : 0;
    const h = code * 31 + nextCode;
    const bucket = (Math.abs(h) % (EMBEDDING_DIM / 2)) + (EMBEDDING_DIM / 2);
    vec[bucket] += 1.0;
  }
  let norm = 0.0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-8) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = vec[i] / norm;
    }
  }
  return Buffer.from(vec.buffer);
}

// 直接修改 SQLite 数据库文件 (data/oneterm.db)，写入全套拟造示例信息
function seedDatabaseDirectly() {
  const dbRelPath = config.database?.dbPath || './data/oneterm.db';
  const dbFullPath = path.resolve(projectRoot, dbRelPath);
  const dbDir = path.dirname(dbFullPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  log(`[DB] 正在直接写入 SQLite 数据库文件: ${dbFullPath}...`, 'cyan');

  let db;
  try {
    db = new DatabaseSync(dbFullPath);
    db.exec('PRAGMA busy_timeout = 5000;');

    // 1. 确保表结构定义完整
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'USER',
          enabled INTEGER NOT NULL DEFAULT 1,
          daily_token_limit INTEGER NOT NULL DEFAULT 100000,
          failed_count INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          preferred_model_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS llm_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          model TEXT NOT NULL,
          api_key_encrypted TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          location TEXT NOT NULL DEFAULT '',
          course_name TEXT NOT NULL DEFAULT '',
          source_text TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          text TEXT NOT NULL,
          embedding BLOB,
          event_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS review_topics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          event_id INTEGER,
          topic TEXT NOT NULL,
          planned_date TEXT,
          done INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS visualizations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          topic_id INTEGER NOT NULL,
          html TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS qa_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          retrieval_mode TEXT NOT NULL DEFAULT 'bm25',
          citations TEXT,
          created_at TEXT NOT NULL
      );
    `);

    // 2. 彻底删除旧 admin 账户，并将「示例信息」直接设置为唯一的超级管理员 (ADMIN)
    db.prepare("DELETE FROM users WHERE username = 'admin'").run();

    const demoPassHash = '$2a$10$OqiKjvbe2JaQw73i6VwV.uVj3rzs3szRqqlJnqWh36/vKIa7IIIgG';  // Demo@123456

    const checkDemo = db.prepare('SELECT id FROM users WHERE username = ?').get('示例信息');
    let userId;
    if (checkDemo) {
      userId = checkDemo.id;
      db.prepare(`
        UPDATE users SET password_hash = ?, role = 'ADMIN', enabled = 1, failed_count = 0, locked_until = NULL WHERE id = ?
      `).run(demoPassHash, userId);
    } else {
      const insRes = db.prepare(`
        INSERT INTO users (username, password_hash, role, enabled, daily_token_limit, failed_count)
        VALUES ('示例信息', ?, 'ADMIN', 1, 100000, 0)
      `).run(demoPassHash);
      userId = insRes.lastInsertRowid;
    }

    // 3. 幂等清理该用户的历史数据
    db.prepare('DELETE FROM visualizations WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM review_topics WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM chunks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM events WHERE user_id = ?').run(userId);

    // 4. 插入 9 项全拟造标准教务事件与向量切片
    const eventsFile = path.resolve(projectRoot, config.demo?.sampleFiles?.structuredEvents || 'demo-launcher/dataset/expected-events.json');
    const rawEvents = JSON.parse(fs.readFileSync(eventsFile, 'utf-8'));

    const insertEvent = db.prepare(`
      INSERT INTO events (user_id, type, title, start_time, end_time, location, course_name, source_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertChunk = db.prepare(`
      INSERT INTO chunks (user_id, text, embedding, event_id)
      VALUES (?, ?, ?, ?)
    `);

    const insertedEvents = [];
    for (const item of rawEvents) {
      const res = insertEvent.run(
        userId,
        item.type || 'course',
        item.title || '',
        item.startTime || '',
        item.endTime || '',
        item.location || '',
        item.courseName || '',
        item.sourceText || ''
      );
      const eventId = res.lastInsertRowid;
      insertedEvents.push({ ...item, id: eventId });

      const chunkText = item.sourceText || item.title;
      const embeddingBuf = computeMockEmbedding((item.title || '') + ' ' + (item.startTime || '') + ' ' + chunkText);
      insertChunk.run(userId, chunkText, embeddingBuf, eventId);
    }

    // 5. 写入分科考前复习知识点 (review_topics)
    const algExam = insertedEvents.find((e) => e.type === 'exam' && e.title.includes('算法')) || insertedEvents[0];
    const netExam = insertedEvents.find((e) => e.type === 'exam' && e.title.includes('计算机网络')) || insertedEvents[insertedEvents.length - 1];
    const osExam = insertedEvents.find((e) => e.type === 'exam' && e.title.includes('操作系统'));

    const insertTopic = db.prepare(`
      INSERT INTO review_topics (user_id, event_id, topic, planned_date, done)
      VALUES (?, ?, ?, ?, ?)
    `);

    const bubbleTopicId = insertTopic.run(userId, algExam.id, '冒泡排序', '2026-11-03', 0).lastInsertRowid;
    const tcpTopicId = insertTopic.run(userId, netExam.id, 'TCP 三次握手', '2026-11-10', 0).lastInsertRowid;

    insertTopic.run(userId, algExam.id, '分治策略与归并/快排复杂度分析', '2026-11-02', 1);
    insertTopic.run(userId, algExam.id, '动态规划与0-1背包状态转移', '2026-11-03', 0);
    insertTopic.run(userId, algExam.id, '贪心算法核心证明与Dijkstra最短路径', '2026-11-04', 0);
    insertTopic.run(userId, netExam.id, 'OSI七层参考模型与TCP/IP体系结构', '2026-11-09', 0);
    insertTopic.run(userId, netExam.id, 'TCP滑动窗口协议与流量/拥塞控制', '2026-11-11', 0);
    insertTopic.run(userId, netExam.id, 'DNS域名解析与HTTPS对称加密握手', '2026-11-12', 0);
    if (osExam) {
      insertTopic.run(userId, osExam.id, '虚拟内存管理与LRU页面置换算法', '2026-11-05', 0);
      insertTopic.run(userId, osExam.id, '死锁产生的四个必要条件与银行家算法', '2026-11-06', 0);
    }

    // 6. 写入交互式可视化仿真 (visualizations)
    const bubbleHtmlPath = path.resolve(projectRoot, 'demo-launcher/dataset/bubble-sort.html');
    const tcpHtmlPath = path.resolve(projectRoot, 'demo-launcher/dataset/tcp-handshake.html');

    const bubbleHtml = fs.existsSync(bubbleHtmlPath) ? fs.readFileSync(bubbleHtmlPath, 'utf-8') : '<!-- bubble sort -->';
    const tcpHtml = fs.existsSync(tcpHtmlPath) ? fs.readFileSync(tcpHtmlPath, 'utf-8') : '<!-- tcp handshake -->';
    const nowIso = new Date().toISOString();

    const insertVis = db.prepare(`
      INSERT INTO visualizations (user_id, topic_id, html, prompt_version, created_at)
      VALUES (?, ?, ?, 'v1.0', ?)
    `);
    insertVis.run(userId, bubbleTopicId, bubbleHtml, nowIso);
    insertVis.run(userId, tcpTopicId, tcpHtml, nowIso);

    log(`[成功] 已直接向 SQLite 数据库 (${dbRelPath}) 写入全量拟造示例信息！`, 'green');
    log(`  默认用户名字段: 示例信息 (ID: ${userId})`, 'white');
    log(`  日程事件: ${insertedEvents.length} 条已入库`, 'white');
    log(`  向量切片: ${insertedEvents.length} 条 64-dim float32 BLOB 向量就绪`, 'white');
    log(`  复习考点: 10 项学科考点细点大纲已建档`, 'white');
    log(`  交互可视化: 冒泡排序与 TCP 三次握手仿真沙箱已预置`, 'white');

    // 双向同步确保 Maven 子模块模式与根目录模式使用完全一致的数据库文件
    const backendDbDir = path.resolve(projectRoot, 'backend/data');
    if (fs.existsSync(backendDbDir)) {
      try {
        // 清理旧 wal/shm 确保直接载入干净的主 db 文件
        const walFile = path.join(backendDbDir, 'oneterm.db-wal');
        const shmFile = path.join(backendDbDir, 'oneterm.db-shm');
        if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
        if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
        fs.copyFileSync(dbFullPath, path.join(backendDbDir, 'oneterm.db'));
      } catch {}
    }
    return true;
  } catch (err) {
    log(`[错误] 直接写入 SQLite 数据库失败: ${err.message}`, 'red');
    return false;
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }
}

// HTTP POST 请求通知后端 demo-load (可选，用于同步在线状态)
function notifyBackendDemoLoad() {
  return new Promise((resolve) => {
    const backendPort = config.server.port;
    if (!isPortInUse(backendPort)) {
      return resolve(false);
    }
    const req = http.request(
      {
        hostname: 'localhost',
        port: backendPort,
        path: '/api/auth/demo-load',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': 2,
        },
        timeout: 5000,
      },
      (res) => {
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.write('{}');
    req.end();
  });
}

// 打开默认浏览器
function openBrowser(url) {
  try {
    const startCmd = process.platform === 'win32' ? 'start' : 'open';
    execSync(`${startCmd} ${url}`, { stdio: 'ignore' });
  } catch {
    // 忽略浏览器启动错误
  }
}

// 1. 启动全套服务
async function startServices() {
  log('\n=======================================================================', 'cyan');
  log('             正在启动 OneTerm (一学期) 演示环境...', 'cyan');
  log('=======================================================================', 'cyan');

  // 1.1 直接修改 SQLite 数据库文件写入全量拟造示例信息
  log(`[1/4] 直接修改 SQLite 数据库 (${config.database?.dbPath || './data/oneterm.db'}) 写入拟造示例数据...`, 'green');
  seedDatabaseDirectly();

  const backendPort = config.server.port;
  const frontendPort = config.frontend.port;
  const mvnCmd = getMavenCommand();

  // 1.2 检查并启动后端
  if (isPortInUse(backendPort)) {
    log(`[提示] 后端服务已在端口 ${backendPort} 正常监听。`, 'yellow');
    await notifyBackendDemoLoad();
  } else {
    log(`[2/4] 启动 Spring Boot 后端整合服务 (端口 ${backendPort})...`, 'green');
    const logsDir = path.join(projectRoot, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const backendLog = fs.openSync(path.join(logsDir, 'backend.log'), 'a');

    const backendProc = spawn(mvnCmd, ['-f', 'backend/pom.xml', 'spring-boot:run'], {
      cwd: projectRoot,
      stdio: ['ignore', backendLog, backendLog],
      detached: true,
      shell: true,
    });
    backendProc.unref();

    await waitForPort(backendPort, 35);
  }

  // 1.3 检查并启动前端 Vite 调试服务
  if (config.frontend.autoStartDevServer) {
    if (isPortInUse(frontendPort)) {
      log(`[提示] 前端调试服务已在端口 ${frontendPort} 正常监听。`, 'yellow');
    } else {
      log(`[3/4] 启动前端 Vite 调试服务 (端口 ${frontendPort})...`, 'green');
      const feProc = spawn('npm', ['--prefix', 'frontend', 'run', 'dev'], {
        cwd: projectRoot,
        stdio: 'ignore',
        detached: true,
        shell: true,
      });
      feProc.unref();
      await waitForPort(frontendPort, 15);
    }
  }

  // 1.4 打开浏览器
  if (config.demo.autoOpenBrowser) {
    log(`[4/4] 正在打开系统界面...`, 'green');
    openBrowser(config.demo.targetBrowserUrl);
  }

  log('\n=======================================================================', 'green');
  log('                OneTerm 演示环境已启动成功！', 'green');
  log('=======================================================================', 'green');
  log(`  主应用服务 (整合入口):  ${config.server.spaUrl}`, 'white');
  log(`  前端调试服务 (Vite):     ${config.frontend.devUrl}`, 'white');
  log(`  Swagger 离线接口文档:   ${config.server.swaggerUrl}`, 'white');
  log('');
  log(`  主管理员账号:  ${config.demo.accounts.demoStudent.username} / ${config.demo.accounts.demoStudent.password} (角色: ADMIN)`, 'yellow');
  log('=======================================================================\n', 'green');
}

// 2. 停止服务
function stopServices() {
  log('\n正在停止 OneTerm 服务...', 'yellow');
  killPort(config.server.port);
  killPort(config.frontend.port);
  log('服务已全部停止。\n', 'green');
}

// 3. 服务健康状态检查
function showStatus() {
  log('\n=== OneTerm 服务运行状态 ===', 'cyan');
  const bPort = config.server.port;
  const fPort = config.frontend.port;

  const bRunning = isPortInUse(bPort);
  const fRunning = isPortInUse(fPort);

  console.log(`  后端服务 (端口 ${bPort}): ${bRunning ? colors.green + '[运行中]' : colors.red + '[已停止]'}${colors.reset}`);
  console.log(`  前端服务 (端口 ${fPort}): ${fRunning ? colors.green + '[运行中]' : colors.red + '[已停止]'}${colors.reset}`);
  console.log('');
}

// 4. 查看示例数据大纲
function showSampleInfo() {
  const summaryPath = path.resolve(projectRoot, config.demo.sampleFiles.summary);
  if (!fs.existsSync(summaryPath)) {
    log(`[提示] 找不到摘要文件: ${summaryPath}`, 'yellow');
    return;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

  log('\n=======================================================================', 'cyan');
  log('             OneTerm 全套拟造示例数据集信息汇总', 'cyan');
  log('=======================================================================', 'cyan');
  log('【1. 账户信息】', 'yellow');
  log(`  主管理员账号: ${summary.profiles.student.username} / ${summary.profiles.student.password} (权限: ADMIN)`);
  log('');
  log('【2. 预置骨干课程与考试】', 'yellow');
  for (const c of summary.courses) {
    log(`  * 《${c.name}》 (${c.teacher} | ${c.classroom})`);
    log(`    排课时间: ${c.weeklyClass}`, 'gray');
    if (c.exam) {
      log(`    考试安排: ${c.exam.title} (${c.exam.time} @ ${c.exam.location})`, 'gray');
    }
  }
  log('');
  log('【3. 预置日程冲突说明】', 'yellow');
  for (const cf of summary.conflicts) {
    log(`  * 日期: ${cf.date} [${cf.type}]`);
    log(`    冲突时段: ${cf.overlapTime}`, 'red');
    log(`    事件 A:   ${cf.eventA}`, 'gray');
    log(`    事件 B:   ${cf.eventB}`, 'gray');
  }
  log('');
  log('【4. 示例文件路径】', 'yellow');
  log(`  * 真实高校周次课表: ${path.resolve(projectRoot, config.demo.sampleFiles.excelTimetable)}`, 'gray');
  log(`  * 教务通知原文大纲: ${path.resolve(projectRoot, config.demo.sampleFiles.rawNoticeText)}`, 'gray');
  log(`  * 标准结构化事件集: ${path.resolve(projectRoot, config.demo.sampleFiles.structuredEvents)}`, 'gray');
  log(`  * 考点细点大纲库:   ${path.resolve(projectRoot, config.demo.sampleFiles.reviewTopics)}`, 'gray');
  log('=======================================================================\n', 'cyan');
}

// 5. 执行全套测试
function runTests() {
  log('\n正在执行全套自动化单元测试 (66 项用例)...', 'cyan');
  const mvnCmd = getMavenCommand();
  const res = spawn(mvnCmd, ['-f', 'backend/pom.xml', 'test'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });
  res.on('close', (code) => {
    if (code === 0) {
      log('\n[成功] 自动化测试全部通过！', 'green');
    } else {
      log(`\n[失败] 测试退出码: ${code}`, 'red');
    }
  });
}

// 主菜单
function showMenu() {
  console.clear();
  log('=======================================================================', 'cyan');
  log('        OneTerm (一学期) - 示例环境独立启动器 (Demo Launcher)', 'cyan');
  log('                     BAT + JSON 驱动模式', 'cyan');
  log('=======================================================================', 'cyan');
  log('  [1] 一键快速启动（直接修改DB写入示例+启动后端/前端+打开浏览器）', 'green');
  log('  [2] 检查服务运行状态 (Status)', 'white');
  log('  [3] 直接向 SQLite 数据库写入/重置拟造示例信息 (Direct DB Seed)', 'white');
  log('  [4] 查看预置示例数据与账号大纲 (Sample Info)', 'white');
  log('  [5] 运行全量单元测试与工程校验 (Maven Test)', 'white');
  log('  [6] 停止所有正在运行的服务 (Stop)', 'yellow');
  log('  [0] 退出启动器', 'gray');
  log('=======================================================================', 'cyan');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('请输入操作编号 [0-6] (默认 1): ', async (answer) => {
    rl.close();
    const choice = (answer || '1').trim();
    switch (choice) {
      case '1':
        await startServices();
        break;
      case '2':
        showStatus();
        break;
      case '3':
        seedDatabaseDirectly();
        await notifyBackendDemoLoad();
        break;
      case '4':
        showSampleInfo();
        break;
      case '5':
        runTests();
        break;
      case '6':
        stopServices();
        break;
      case '0':
        log('再见！', 'gray');
        process.exit(0);
        break;
      default:
        log('无效的选择', 'red');
        break;
    }
  });
}

// 命令行参数处理
const action = (process.argv[2] || 'menu').toLowerCase();

(async () => {
  switch (action) {
    case 'menu':
      showMenu();
      break;
    case 'start':
      await startServices();
      break;
    case 'stop':
      stopServices();
      break;
    case 'status':
      showStatus();
      break;
    case 'seed':
      seedDatabaseDirectly();
      await notifyBackendDemoLoad();
      break;
    case 'samples':
      showSampleInfo();
      break;
    case 'test':
      runTests();
      break;
    default:
      showMenu();
      break;
  }
})();