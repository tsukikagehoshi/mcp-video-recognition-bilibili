/**
 * Video recognition tool for MCP server
 * 支持两种输入：本地文件路径，或视频网址（B站/YouTube 等，自动用 yt-dlp 下载）
 */

import { createLogger } from '../utils/logger.js';
import { GeminiService } from '../services/gemini.js';
import { VideoRecognitionParamsSchema } from '../types/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { VideoRecognitionParams } from '../types/index.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const log = createLogger('VideoRecognitionTool');

const VIDEO_EXTS = ['.mp4', '.mpeg', '.mov', '.avi', '.webm'];

/**
 * 用 yt-dlp 下载网址视频到临时文件，返回下载后的本地路径。
 * 用 -S res:480 自动选最接近 480p 的档（横竖屏通用），省内存/token/时间。
 * 若存在 cookie 文件（B站等风控站点需要），自动带上。
 */
const COOKIES_PATH = '/app/bili-cookies.txt';
const YT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function downloadVideo(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-'));
    const outTmpl = path.join(outDir, 'video.%(ext)s');

    // 自动选最接近 480p 的档并合并音视频成 mp4；有 cookie 就带上
    const args = [
      '-f', 'bv*+ba/b',
      '-S', 'res:480',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--user-agent', YT_UA,
    ];
    if (fs.existsSync(COOKIES_PATH)) {
      args.push('--cookies', COOKIES_PATH);
    }
    args.push('-o', outTmpl, url);

    log.info(`yt-dlp downloading: ${url}`);
    const proc = spawn('yt-dlp', args);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (e) => reject(new Error(`yt-dlp not available: ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(-400)}`));
        return;
      }
      // 找下载出来的文件
      const files = fs.readdirSync(outDir).map((f) => path.join(outDir, f));
      const vid = files.find((f) => VIDEO_EXTS.includes(path.extname(f).toLowerCase())) || files[0];
      if (!vid) {
        reject(new Error('yt-dlp finished but no output file found'));
        return;
      }
      log.info(`yt-dlp downloaded to: ${vid}`);
      resolve(vid);
    });
  });
}

export const createVideoRecognitionTool = (geminiService: GeminiService) => {
  return {
    name: 'video_recognition',
    description:
      'Analyze and describe a video using Google Gemini AI. The "filepath" argument accepts EITHER a local file path OR a video URL (e.g. a Bilibili or YouTube link). URLs are downloaded automatically (<=480p) before analysis.',
    inputSchema: VideoRecognitionParamsSchema,
    callback: async (args: VideoRecognitionParams): Promise<CallToolResult> => {
      let tempPath: string | null = null;
      try {
        const input = String(args.filepath || '').trim();
        log.info(`Video recognition request: ${input}`);

        let localPath: string;

        if (/^https?:\/\//i.test(input)) {
          // 是网址 → 先下载
          localPath = await downloadVideo(input);
          tempPath = localPath; // 记下来，最后删
        } else {
          // 本地路径
          if (!fs.existsSync(input)) {
            throw new Error(`Video file not found: ${input}`);
          }
          const ext = path.extname(input).toLowerCase();
          if (!VIDEO_EXTS.includes(ext)) {
            throw new Error(
              `Unsupported video format: ${ext}. Supported: ${VIDEO_EXTS.join(', ')}`
            );
          }
          localPath = input;
        }

        const prompt = args.prompt || 'Describe this video';
        const modelName = args.modelname || 'gemini-2.0-flash';

        log.info('Uploading and processing video file...');
        const file = await geminiService.uploadFile(localPath);

        log.info('Video processing complete, generating content...');
        const result = await geminiService.processFile(file, prompt, modelName);

        if (result.isError) {
          log.error(`Error in video recognition: ${result.text}`);
          return { content: [{ type: 'text', text: result.text }], isError: true };
        }

        log.info('Video recognition completed successfully');
        return { content: [{ type: 'text', text: result.text }] };
      } catch (error) {
        log.error('Error in video recognition tool', error);
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `Error processing video: ${msg}` }], isError: true };
      } finally {
        // 清理临时下载的文件和目录
        if (tempPath) {
          try {
            const dir = path.dirname(tempPath);
            fs.rmSync(dir, { recursive: true, force: true });
            log.info(`Cleaned temp dir: ${dir}`);
          } catch (e) {
            log.error('Failed to clean temp file', e);
          }
        }
      }
    },
  };
};
