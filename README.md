# MCP Video Recognition Server (Bilibili/URL fork)

An MCP (Model Context Protocol) server that analyzes **images, audio, and video** using Google's Gemini AI.

> **This is a fork of [mario-andreschak/mcp_video_recognition](https://github.com/mario-andreschak/mcp_video_recognition).**
> All original recognition logic and credit belong to the upstream author. This fork adds the changes listed below. Licensed under MIT, same as upstream.

---

## What this fork adds / 本 fork 的改动

Compared to the upstream project, this fork adds:

1. **URL input for video recognition / 视频识别支持网址输入**
   The `video_recognition` tool's `filepath` argument now accepts **either a local file path OR a video URL** (e.g. a Bilibili or YouTube link). When a URL is given, the server downloads the video with `yt-dlp` first, then analyzes it with Gemini, and deletes the temp file afterwards.
   `video_recognition` 的 `filepath` 参数现在既能填本地路径，也能直接填视频网址（B站 / YouTube 等）。传网址时服务端先用 `yt-dlp` 下载，再交给 Gemini 分析，用完自动删除临时文件。

2. **Auto quality selection / 自动选清晰度**
   Uses `yt-dlp -S res:480` to pick the format closest to 480p (works for both landscape and portrait videos), keeping downloads small and fast to save tokens and memory.
   用 `-S res:480` 自动选最接近 480p 的档（横屏竖屏都适配），省流量、省 token、省内存。

3. **Cookie & User-Agent support for anti-bot sites / 支持 Cookie 和 UA 绕过风控**
   If a Netscape-format cookie file exists at `/app/bili-cookies.txt`, it is passed to `yt-dlp` automatically (Bilibili and some sites return HTTP 412 without login cookies). A desktop User-Agent is always sent.
   若 `/app/bili-cookies.txt` 存在（Netscape 格式的 cookie 文件），会自动带给 `yt-dlp`（B站等站点无登录 Cookie 会返回 412）。同时固定发送桌面版 User-Agent。

4. **Dockerfile bundles `yt-dlp` + `ffmpeg`** / Dockerfile 内置 yt-dlp 和 ffmpeg。

Image and audio recognition are unchanged from upstream.
图片和音频识别与上游一致，未改动。

---

## Tools

- `image_recognition` — analyze an image (local file path)
- `audio_recognition` — analyze / transcribe audio (local file path)
- `video_recognition` — analyze a video; `filepath` accepts a **local path or a URL**

---

## Prerequisites

- Docker (recommended), or Node.js 22+
- A Google Gemini API key

---

## Quick start (Docker)

```bash
git clone <your-fork-url>.git video-mcp
cd video-mcp

# 1. Create env file (see .env.example)
cp .env.example video.env
# then edit video.env and put in your real GOOGLE_API_KEY

# 2. (Optional, for Bilibili) put a Netscape-format cookie file next to the project
#    Export it with a browser extension like "Cookie-Editor" while logged in to Bilibili.
#    Name it bili-cookies.txt

# 3. Build
docker build -t video-mcp .

# 4. Run (mount cookie file if you have one)
docker run -d --name video --restart unless-stopped \
  -p 18014:3000 \
  --env-file ./video.env \
  -v "$(pwd)/bili-cookies.txt:/app/bili-cookies.txt" \
  video-mcp
```

MCP endpoint: `http://<host>:3000/mcp` (Streamable HTTP).

### Environment variables

| Variable | Meaning |
|---|---|
| `GOOGLE_API_KEY` | **Required.** Google Gemini API key. |
| `TRANSPORT_TYPE` | `sse` (Streamable HTTP, for remote) or `stdio`. Default `stdio`. |
| `PORT` | Port for HTTP transport. Default `3000`. |
| `LOG_LEVEL` | `verbose` / `debug` / `info` / `warn` / `error` / `fatal`. |

---

## Usage note

When your MCP client (or its model) calls `video_recognition`, pass the Bilibili/YouTube link as the `filepath` argument. Example intent:

> Call `video_recognition` with `filepath` = `https://www.bilibili.com/video/BVxxxxxxxxx/` and tell me what's in the video.

Keep videos short (Gemini free tier has size/quota limits). Cookies expire — re-export when Bilibili starts returning 412 / login errors.

---

## Security

- **Never commit** your real `video.env` (contains the API key) or `bili-cookies.txt` (contains your login session). Both are gitignored.
- Downloaded videos are stored in a temp dir and deleted after analysis.

---

## Credits & License

- Upstream project: **[mario-andreschak/mcp_video_recognition](https://github.com/mario-andreschak/mcp_video_recognition)** — original image/audio/video recognition MCP server.
- This fork only adds URL download / cookie / quality-selection features on top.
- Licensed under the **MIT License** (see `LICENSE`). The original copyright
  `Copyright (c) 2025 mario-andreschak` is retained.
