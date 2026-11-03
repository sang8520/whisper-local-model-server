/**
 * 本地 Whisper 模型服务（方案 B）。
 *
 * 浏览器里的 transformers.js 要按「一个文件一次 GET」的方式取权重，
 * 所以 GitHub Releases 里的 zip 不能直接当模型源。这个服务负责：
 *   1. 把 models/ 目录按静态文件吐出去；
 *   2. 带上跨域头，让部署在公网的网站在 HTTPS 下也能读取本机文件；
 *   3. 应答 Chrome 的本地网络预检（Access-Control-Allow-Private-Network）。
 *
 * 默认只监听 127.0.0.1，不对外网开放。
 *
 * 目录约定（与前端 remotePathTemplate = "{model}/" 对应）：
 *   models/onnx-community/whisper-tiny.en/onnx/encoder_model_quantized.onnx
 *   models/onnx-community/whisper-tiny.en/onnx/decoder_model_merged_quantized.onnx
 */
import http from "node:http";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 5981);
const HOST = process.env.HOST || "127.0.0.1";

const exeName = path.basename(process.execPath).toLowerCase();
const isNodeRuntime = exeName === "node" || exeName === "node.exe";
const baseDir = process.env.WHISPER_MODEL_DIR
  ? path.resolve(process.env.WHISPER_MODEL_DIR)
  : isNodeRuntime
    ? path.dirname(path.resolve(process.argv[1] || "."))
    : path.dirname(process.execPath);
const ROOT = path.join(baseDir, "models");

const TYPES = {
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".onnx": "application/octet-stream",
  ".wasm": "application/wasm",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

function listModels() {
  const root = path.join(ROOT, "onnx-community");
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => statSync(path.join(root, name)).isDirectory());
}

function indexHtml() {
  const models = listModels();
  const rows = models
    .map((name) => {
      const enc = path.join(ROOT, "onnx-community", name, "onnx", "encoder_model_quantized.onnx");
      return `<li>${name} ${existsSync(enc) ? "✅" : "⚠️ 缺少 onnx 文件"}</li>`;
    })
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>本地模型服务</title>
<body style="font-family: system-ui; padding: 2rem; line-height: 1.6">
<h1>本地 Whisper 模型服务已启动</h1>
<p>服务地址：<code>http://${HOST}:${PORT}/</code></p>
<p>可用模型：</p><ul>${rows || "<li>⚠️ 没有找到 models/onnx-community/ 目录</li>"}</ul>
<p>回到网站 → 听力设置 → 本机浏览器 → 下载源选「本地模型服务」，填入上面的地址。</p>
</body>`;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Chrome 从公网 HTTPS 页面访问 127.0.0.1 时的本地网络预检
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Timing-Allow-Origin", "*");
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
    res.end("method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    res.writeHead(400);
    res.end("bad request");
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    const html = indexHtml();
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : html);
    return;
  }

  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep) || !existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    // 权重内容不会变，允许浏览器长期缓存
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

/**
 * 双击启动时，任何错误都会让窗口瞬间关闭，用户只看到一闪而过。
 * 这里把错误留在屏幕上，等用户按回车再退出。
 */
function holdOnError(lines) {
  console.error("");
  for (const line of lines) console.error(`  ${line}`);
  console.error("");
  console.error("  按回车键退出...");
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(1));
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    holdOnError([
      `端口 ${PORT} 已被占用。`,
      "可能已经有一个模型服务在运行（看看任务栏里有没有黑色窗口），关掉它再试。",
      "也可以换一个端口启动：在命令行执行",
      `  set PORT=5982 && model-server.exe`,
      "然后网站里的地址也改成 http://127.0.0.1:5982/",
    ]);
    return;
  }
  holdOnError([`启动失败：${err.message}`]);
});

process.on("uncaughtException", (err) => {
  holdOnError([`程序出错：${err.message}`]);
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  Whisper 本地模型服务已启动");
  console.log(`  地址：http://${HOST}:${PORT}/`);
  console.log(`  模型目录：${ROOT}`);
  const models = listModels();
  console.log(`  可用模型：${models.length ? models.join(", ") : "（没有找到，检查 models/onnx-community/）"}`);
  console.log("");
  console.log("  保持这个窗口开着；关闭窗口即停止服务。");
  console.log("");
});
