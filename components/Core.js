import axios from "axios";
import Config from "./Config.js";
import download from "./Download.js";
import _ from "lodash";
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs'

const def = Config.getConfig().parameters;

const createPrompt = (base, isNegative = false) => ({
  caption: { base_caption: base, char_captions: [] },
  ...(!isNegative && { use_coords: false, use_order: true })
});

const commonParameters = {
  params_version: 3,
  width: def.width,
  height: def.height,
  scale: def.scale,
  sampler: def.sampler,
  steps: def.steps,
  n_samples: 1,
  ucPreset: 0,
  qualityToggle: true,
  dynamic_thresholding: false,
  controlnet_strength: 1,
  legacy: false,
  add_original_image: true,
  cfg_rescale: def.cfg_rescale,
  noise_schedule: def.noise_schedule,
  legacy_v3_extend: false,
  skip_cfg_above_sigma: null,
  use_coords: false,
  characterPrompts: [],
  v4_prompt: createPrompt(""),
  v4_negative_prompt: createPrompt(def.negative_prompt, true),
  negative_prompt: def.negative_prompt,
  reference_image_multiple: [],
  reference_information_extracted_multiple: [],
  reference_strength_multiple: []
};

const defaultParam = {
  text: {
    input: "",
    model: await Config.getConfig().model,
    action: "generate",
    parameters: commonParameters
  },
  image: {
    input: "",
    model: await Config.getConfig().model,
    action: "img2img",
    parameters: {
      ...commonParameters,
      strength: 0.7,
      noise: 0.2,
      image: "",
    }
  }
};

const headers = {
  authority: "api.novelai.net",
  Origin: "https://novelai.net",
  Referer: "https://novelai.net",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Content-Type": "application/json"
};

async function getPicture(param, user, type, token) {
  const { base_url } = Config.getConfig().reverse_proxy;
  const mergeData = _.merge({}, defaultParam[type], param);

  const { free_mode, proxy } = Config.getConfig();
  const agent = proxy.enable && new HttpsProxyAgent(`http://${proxy.host}:${proxy.port}`);

  const roundTo64 = v => Math.round(v / 64) * 64 || 64;
  let width = roundTo64(mergeData.parameters.width);
  let height = roundTo64(mergeData.parameters.height);

  const maxArea = free_mode ? 1048576 : 3145728;
  let area = width * height;
  if (area > maxArea) {
    const ratio = width / height;
    const scale = Math.sqrt(maxArea / area);
    width = roundTo64(width * scale);
    height = roundTo64(width / ratio);

    while ((width * height) > maxArea) {
      width -= 64;
      height = roundTo64(width / ratio);
    }
  }
  mergeData.parameters.width = Math.max(width, 64);
  mergeData.parameters.height = Math.max(height, 64);

  if (free_mode) {
    mergeData.parameters.steps = Math.min(mergeData.parameters.steps, 28);
  }

  logger.mark(logger.blue('[NAI PLUGIN]'), logger.cyan(`用户 ${user} 参数：`), mergeData);

  try {
    // 1. 正常请求文本流数据
    const response = await axios.post(`${base_url}/ai/generate-image`, mergeData, {
      headers: { ...headers, Authorization: `Bearer ${token}` },
      httpsAgent: agent,
      responseType: 'text'
    });

    const resText = response.data;
    
    // 2. 匹配并提取标准的图片 JSON
    const jsonMatch = resText.match(/\{"image":[\s\S]*?\}/);

    if (!jsonMatch) {
      logger.error(`[NAI PLUGIN] 未匹配到有效的 JSON 响应，原始数据：\n${resText.slice(0, 500)}`);
      throw new Error('NovelAI 未返回有效的图片数据，可能被 Cloudflare 拦截或账号异常');
    }

    const resJson = JSON.parse(jsonMatch[0]);
    const base64Str = resJson.image; // 提取图片真正的 Base64 数据
    const fileName = resJson.seed || Date.now(); // 优先拿 seed 做文件名
    
    // 3. 构建本地保存的文件夹路径（和原插件格式保持完全一致）
    const dirPath = `./plugins/nai-plugin/resources/userPic/${user}`;
    const savePath = `${dirPath}/${fileName}.png`; // 直接存为标准的 png 图片

    // 4. 如果用户文件夹不存在，则递归创建它
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 5. 将 Base64 转换为二进制 Buffer 并直接写入本地文件
    const imgBuffer = Buffer.from(base64Str, 'base64');
    fs.writeFileSync(savePath, imgBuffer);
    
    logger.mark(logger.blue('[NAI PLUGIN]'), logger.green(`图片已成功保存至本地：${savePath}`));
    // ============================

    // 6. 返回给上层 Image.js，把原来的逻辑对齐
    return {
      base64: base64Str,
      fileName
    };
  } catch (error) {
    logger.mark(logger.blue('[NAI PLUGIN]'), logger.cyan(`绘制图片失败`), logger.red(error));
    throw new Error('绘制图片失败');
  }
}

export default getPicture
