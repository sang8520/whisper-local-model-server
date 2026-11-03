/**
 * 把 HF 下载的权重摆成本地服务要的目录结构。
 *
 * 用法：node prepare-models.mjs <whisper-models 目录> [目标目录]
 *
 * 源目录形如：
 *   whisper-models/whisper-tiny.en/onnx/encoder_model_quantized.onnx
 * 目标目录形如：
 *   models/onnx-community/whisper-tiny.en/onnx/encoder_model_quantized.onnx
 *
 * 前端把模型 id 拼成 onnx-community/<model>，路径模板是 "{model}/"，
 * 所以必须多出 onnx-community 这一层。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("用法：node prepare-models.mjs <whisper-models 目录> [目标目录]");
  process.exit(1);
}
const sourceRoot = resolve(src);
if (!existsSync(sourceRoot)) {
  console.error(`源目录不存在：${sourceRoot}`);
  process.exit(1);
}

const targetRoot = resolve(process.argv[3] ?? join(import.meta.dirname, "models"));
const destRoot = join(targetRoot, "onnx-community");
mkdirSync(destRoot, { recursive: true });

const models = readdirSync(sourceRoot).filter((name) => {
  const dir = join(sourceRoot, name);
  return statSync(dir).isDirectory() && existsSync(join(dir, "onnx"));
});

if (models.length === 0) {
  console.error(`在 ${sourceRoot} 下没找到包含 onnx/ 的模型目录`);
  process.exit(1);
}

for (const name of models) {
  const from = join(sourceRoot, name);
  const to = join(destRoot, name);
  console.log(`复制 ${name} → ${to}`);
  cpSync(from, to, { recursive: true, force: true });
}

console.log(`完成。启动服务：node ${join(import.meta.dirname, "server.mjs")}`);
