#!/usr/bin/env node
/**
 * ==============================================================================
 * OneTerm (一学期) - 示例环境独立启动器 (BAT + JSON 驱动引擎)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const readline = require('readline');

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

// HTTP POST 请求调用 demo-load 注入全套示例数据
function seedDemoData() {
  return new Promise((resolve) => {
    const backendPort = config.server.port;
    if (!isPortInUse(backendPort)) {
      log(`[错误] 后端服务未在端口 ${backendPort} 运行，无法注入示例数据！`, 'red');
      return resolve(false);
    }

    log(`正在向 http://localhost:${backendPort}/api/auth/demo-load 发送数据注入请求...`, 'cyan');
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
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            log(`[成功] 全量示例数据注入完成！`, 'green');
            log(`  已载入账号: ${data.username} (角色: ${data.role}, 每日Token限额: ${data.dailyTokenLimit})`, 'gray');
            resolve(true);
          } catch {
            log(`[成功] 示例数据初始化完毕 (响应码: ${res.statusCode})`, 'green');
            resolve(true);
          }
        });
      }
    );

    req.on('error', (err) => {
      log(`[提示] 示例数据初始化提示: ${err.message}`, 'yellow');
      resolve(false);
    });

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

  const backendPort = config.server.port;
  const frontendPort = config.frontend.port;
  const mvnCmd = getMavenCommand();

  // 1.1 检查并启动后端
  if (isPortInUse(backendPort)) {
    log(`[提示] 后端服务已在端口 ${backendPort} 正常监听。`, 'yellow');
  } else {
    log(`[1/4] 启动 Spring Boot 后端整合服务 (端口 ${backendPort})...`, 'green');
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

  // 1.2 检查并启动前端 Vite 调试服务
  if (config.frontend.autoStartDevServer) {
    if (isPortInUse(frontendPort)) {
      log(`[提示] 前端调试服务已在端口 ${frontendPort} 正常监听。`, 'yellow');
    } else {
      log(`[2/4] 启动前端 Vite 调试服务 (端口 ${frontendPort})...`, 'green');
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

  // 1.3 自动载入全套示例数据
  if (config.demo.autoLoadOnStart) {
    log(`[3/4] 自动装载演示学生与 9 项标准日程/考前复习数据...`, 'green');
    await new Promise((r) => setTimeout(r, 1200));
    await seedDemoData();
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
  log(`  演示学生账号:  ${config.demo.accounts.demoStudent.username} / ${config.demo.accounts.demoStudent.password}`, 'yellow');
  log(`  系统管理账号:  ${config.demo.accounts.admin.username} / ${config.demo.accounts.admin.password}`, 'yellow');
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
  log('             OneTerm 全套示例数据集信息汇总', 'cyan');
  log('=======================================================================', 'cyan');
  log('【1. 演示账户信息】', 'yellow');
  log(`  学生账号: ${summary.profiles.student.username} / ${summary.profiles.student.password}`);
  log(`  管理员号: ${summary.profiles.admin.username} / ${summary.profiles.admin.password}`);
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
  log('  [1] 一键快速启动（后端+前端+自动装载全套示例数据+自动打开浏览器）', 'green');
  log('  [2] 检查服务运行状态 (Status)', 'white');
  log('  [3] 重新注入/重置全套示例数据 (Demo Seed)', 'white');
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
        await seedDemoData();
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
      await seedDemoData();
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
