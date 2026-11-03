# Whisper 本地模型服务

给公网站点用的**本地 Whisper 模型源**。浏览器里的 transformers.js 需要按文件逐个下载模型权重，
但静态网站放不下上百 MB 的文件；这个小服务让模型留在用户自己的电脑上，只在 `127.0.0.1` 上
提供只读的下载地址。转写仍在浏览器本地完成，**音频不会上传**。

配合站点：<https://comate.wpsgo.com/s/fWnM6TtJbHuP/>

## 下载

前往 [Releases](../../releases/latest) 下载 `whisper-local-model-server-win64.zip`（约 101 MB，含 exe 与
whisper-tiny.en / whisper-base.en 两个 INT8 量化模型）。

## 使用

1. 解压**整个文件夹**（不要只拿出 exe），目录结构必须是：

   ```text
   model-server.exe
   models\onnx-community\whisper-tiny.en\...
   models\onnx-community\whisper-base.en\...
   ```

2. 双击 `model-server.exe`，窗口显示 `地址：http://127.0.0.1:5981/` 即启动成功。
   **保持窗口开着**；关闭窗口即停止服务。
3. 打开网站 → 听力 → 设置 → 转写通道选「本机浏览器（需下载模型）」→
   下载源选「本地模型服务」→ 地址填 `http://127.0.0.1:5981/`。
4. 点「下载模型」，几秒完成（读的是本机文件）→ 回听力页导入视频即可转写。
5. 浏览器若询问「是否允许此站点访问本地网络」，点允许。

建议使用 Chrome 或 Edge 138+。Safari / Firefox 对 HTTPS 页面访问 loopback 的策略不一致，不保证可用。

## 常见问题

- **双击后窗口一闪而过**：端口被占用时会停在错误提示上，按回车退出；先关掉已在运行的实例，
  或用 `set PORT=5982 && model-server.exe` 换端口（网站里的地址也要改成 5982）。
- **Windows 安全中心拦截**：点「更多信息 → 仍要运行」。程序没有数字签名。
- **只支持英语**：模型是 `whisper-*.en`。
- **网站提示下载失败**：确认黑色窗口还在、地址末尾带 `/`、防火墙没有拦 Node。

## 安全边界

- 默认只监听 `127.0.0.1`，局域网和外网都访问不到。
- 只读，只暴露 `models/` 目录，拒绝路径穿越。
- 不运行上传逻辑，不向外发任何数据。

## 从源码运行

```bash
node server.mjs                      # 读取同目录 models/
WHISPER_MODEL_DIR=/path/to/parent node server.mjs   # 模型放在别处时
```

模型目录见下方结构说明；`node prepare-models.mjs <源目录>` 可以把 HuggingFace 缓存整理成这个结构。

## 目录结构

```text
model-server/
├── model-server.exe        # 构建产物（Release 里提供）
├── server.mjs              # 源码，可直接 node server.mjs
└── models/
    └── onnx-community/
        ├── whisper-tiny.en/
        │   ├── config.json
        │   ├── generation_config.json
        │   ├── preprocessor_config.json
        │   ├── tokenizer.json
        │   ├── tokenizer_config.json
        │   └── onnx/
        │       ├── encoder_model_quantized.onnx
        │       └── decoder_model_merged_quantized.onnx
        └── whisper-base.en/...
```

多出的 `onnx-community/` 一层是必需的：前端给 transformers.js 的模型 id 就是
`onnx-community/whisper-tiny.en`，路径模板为 `{model}/`。

## 构建 exe

```bash
pnpm install
node build-win.mjs
```

产物在 `build/model-server.exe`（Node SEA，单文件，无需安装 Node）。
