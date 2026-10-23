package com.oneterm.common;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 静态前端 SPA 路由回退与离线 Swagger / OpenAPI 文档展示配置。
 * 支持通过 8789 端口一站式访问前端应用、REST/SSE 接口与 /swagger-ui/index.html 接口文档。
 */
@Configuration
public class WebSpaAndDocsConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(
                        "file:../frontend/dist/assets/",
                        "file:frontend/dist/assets/",
                        "classpath:/static/assets/"
                );
    }

    @RestController
    public static class SpaAndOpenApiController {

        @GetMapping(value = {"/v3/api-docs/openapi.yaml", "/api-docs/openapi.yaml"}, produces = "text/yaml;charset=UTF-8")
        public ResponseEntity<String> getOpenApiYaml() {
            Path[] candidates = {
                    Paths.get("../docs/api/openapi.yaml"),
                    Paths.get("docs/api/openapi.yaml"),
                    Paths.get("/app/docs/api/openapi.yaml")
            };
            for (Path p : candidates) {
                if (Files.exists(p)) {
                    try {
                        return ResponseEntity.ok(Files.readString(p, StandardCharsets.UTF_8));
                    } catch (IOException ignored) {
                    }
                }
            }
            return ResponseEntity.ok("openapi: 3.0.3\ninfo:\n  title: OneTerm API\n  version: 1.0.0\n");
        }

        @GetMapping(value = {"/swagger-ui/index.html", "/swagger-ui.html"}, produces = MediaType.TEXT_HTML_VALUE)
        public ResponseEntity<String> getSwaggerUiPage() {
            return ResponseEntity.ok(OFFLINE_SWAGGER_UI_HTML);
        }

        @GetMapping(value = {"/", "/login", "/extract", "/calendar", "/qa", "/visualize", "/admin"}, produces = MediaType.TEXT_HTML_VALUE)
        public ResponseEntity<Resource> serveSpaIndex() {
            Path[] candidates = {
                    Paths.get("../frontend/dist/index.html"),
                    Paths.get("frontend/dist/index.html")
            };
            for (Path p : candidates) {
                if (Files.exists(p)) {
                    return ResponseEntity.ok()
                            .contentType(MediaType.TEXT_HTML)
                            .body(new FileSystemResource(p));
                }
            }
            ClassPathResource classpathIndex = new ClassPathResource("static/index.html");
            if (classpathIndex.exists()) {
                return ResponseEntity.ok()
                        .contentType(MediaType.TEXT_HTML)
                        .body(classpathIndex);
            }
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(new org.springframework.core.io.ByteArrayResource(
                            "<!DOCTYPE html><html><body><h2>OneTerm Backend Running on Port 8789</h2><p><a href=\"/swagger-ui/index.html\">Swagger UI</a></p></body></html>"
                                    .getBytes(StandardCharsets.UTF_8)
                    ));
        }

        private static final String OFFLINE_SWAGGER_UI_HTML = """
                <!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                  <meta charset="UTF-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <title>一学期 OneTerm — Swagger UI & OpenAPI 契约控制台</title>
                  <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }
                    header { background: #0f766e; color: #fff; padding: 16px 28px; display: flex; justify-content: space-between; align-items: center; }
                    header h1 { font-size: 18px; }
                    header a { color: #ccfbf1; text-decoration: none; font-size: 13px; border: 1px solid #5eead4; padding: 5px 12px; border-radius: 6px; }
                    .container { max-width: 1180px; margin: 20px auto; padding: 0 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
                    h2 { font-size: 15px; color: #0f766e; margin-bottom: 12px; }
                    .ep-list { display: flex; flex-direction: column; gap: 8px; max-height: 75vh; overflow-y: auto; }
                    .ep-item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; }
                    .ep-item:hover { background: #f0fdfa; border-color: #14b8a6; }
                    .method { font-weight: 700; font-size: 11px; padding: 3px 7px; border-radius: 4px; color: #fff; min-width: 56px; text-align: center; }
                    .GET { background: #0284c7; } .POST { background: #0d9488; } .PUT { background: #f59e0b; } .DELETE { background: #ef4444; }
                    .path { font-family: monospace; font-size: 13px; font-weight: 600; }
                    .desc { font-size: 12px; color: #64748b; margin-left: auto; }
                    pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; max-height: 55vh; white-space: pre-wrap; }
                    .form-row { display: flex; gap: 8px; margin-bottom: 10px; }
                    input, select, textarea { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-family: monospace; }
                    button { background: #0d9488; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-weight: 600; }
                  </style>
                </head>
                <body>
                  <header>
                    <h1>一学期 OneTerm — Swagger UI (离线内建 OpenAPI 3.0 调试台)</h1>
                    <div style="display:flex;gap:10px;">
                      <a href="/v3/api-docs/openapi.yaml" target="_blank">查看原始 openapi.yaml</a>
                      <a href="/">返回应用首页</a>
                    </div>
                  </header>
                  <div class="container">
                    <div class="card">
                      <h2>接口列表（点击填充右侧在线调试器）</h2>
                      <div class="ep-list" id="epList"></div>
                    </div>
                    <div class="card">
                      <h2>在线接口调试 / OpenAPI 规范预览</h2>
                      <div class="form-row">
                        <select id="reqMethod" style="width:110px;"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select>
                        <input id="reqPath" value="/api/auth/me" />
                        <button id="btnSend">发送请求</button>
                      </div>
                      <textarea id="reqBody" rows="4" placeholder="请求 JSON Body（GET 可留空）" style="margin-bottom:10px;"></textarea>
                      <pre id="respBox">正在加载 /v3/api-docs/openapi.yaml ...</pre>
                    </div>
                  </div>
                  <script>
                    const endpoints = [
                      { m: 'POST', p: '/api/auth/demo-load', d: '一键载入示例数据并登录', b: '{}' },
                      { m: 'POST', p: '/api/auth/login', d: '账号密码登录', b: '{"username":"admin","password":"YOUR_PASSWORD"}' },
                      { m: 'GET', p: '/api/auth/me', d: '获取当前会话与额度状态', b: '' },
                      { m: 'GET', p: '/api/auth/models', d: '获取已启用的对话模型列表', b: '' },
                      { m: 'POST', p: '/api/extract/stream', d: 'SSE 流式抽取教务事件', b: '{"text":"《算法设计与分析》 2026-11-04 08:00-09:40 教学楼 A302"}' },
                      { m: 'GET', p: '/api/events', d: '查询当前用户事件列表', b: '' },
                      { m: 'GET', p: '/api/calendar/overview', d: '获取日历、冲突与热力图全景', b: '' },
                      { m: 'GET', p: '/api/calendar/conflicts', d: '获取日程时间冲突对', b: '' },
                      { m: 'POST', p: '/api/calendar/review-topics/schedule', d: '自动倒排生成考前复习路径', b: '{}' },
                      { m: 'GET', p: '/api/calendar/export.ics', d: '导出标准 .ics 日历文件', b: '' },
                      { m: 'POST', p: '/api/qa/index', d: '构建原文切片与向量索引', b: '{}' },
                      { m: 'POST', p: '/api/qa/ask/stream', d: 'SSE 流式 RAG 问答', b: '{"question":"下周三有空吗？"}' },
                      { m: 'POST', p: '/api/visualize/generate/stream', d: 'SSE 流式生成知识点可视化 HTML', b: '{"topic":"冒泡排序"}' },
                      { m: 'GET', p: '/api/visualize', d: '获取已生成的可视化列表', b: '' },
                      { m: 'GET', p: '/api/admin/users', d: '管理员查看全部用户与额度', b: '' },
                      { m: 'GET', p: '/api/admin/llm-configs', d: '管理员查看模型配置（脱敏Key）', b: '' }
                    ];
                    const listEl = document.getElementById('epList');
                    endpoints.forEach(ep => {
                      const div = document.createElement('div');
                      div.className = 'ep-item';
                      div.innerHTML = `<span class="method ${ep.m}">${ep.m}</span><span class="path">${ep.p}</span><span class="desc">${ep.d}</span>`;
                      div.onclick = () => {
                        document.getElementById('reqMethod').value = ep.m;
                        document.getElementById('reqPath').value = ep.p;
                        document.getElementById('reqBody').value = ep.b;
                      };
                      listEl.appendChild(div);
                    });
                    fetch('/v3/api-docs/openapi.yaml').then(r => r.text()).then(t => {
                      document.getElementById('respBox').textContent = t;
                    });
                    document.getElementById('btnSend').onclick = async () => {
                      const method = document.getElementById('reqMethod').value;
                      const path = document.getElementById('reqPath').value;
                      const body = document.getElementById('reqBody').value;
                      const headers = { 'Accept': 'application/json' };
                      const m = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]*)/);
                      if (m && method !== 'GET') headers['X-XSRF-TOKEN'] = decodeURIComponent(m[1]);
                      if (body && method !== 'GET') headers['Content-Type'] = 'application/json';
                      const res = await fetch(path, { method, headers, credentials: 'include', body: method === 'GET' || !body ? undefined : body });
                      const txt = await res.text();
                      document.getElementById('respBox').textContent = `HTTP ${res.status}\\n\\n` + txt;
                    };
                  </script>
                </body>
                </html>
                """;
    }
}
