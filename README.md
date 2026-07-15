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

## 中文部署教程（详细版）

这份教程假设你要把它部署到一台**自己的云服务器（Linux）**上，用 Docker 运行，让远程的 MCP 客户端（如各类聊天平台）通过网址调用，实现「发一个 B 站链接，AI 就能看懂视频画面」。

### 你需要准备

1. 一台装了 **Docker** 的 Linux 服务器（1核1G 也能跑，处理视频那几秒会吃点内存，建议有 2G 内存或配了 swap）。
2. 一个 **Google Gemini API Key**：去 [aistudio.google.com/apikey](https://aistudio.google.com/apikey) 免费申请。
3. （下 B 站视频需要）一份**你自己的 B 站登录 Cookie**，下面第 4 步会讲怎么导出。

### 第 1 步：拉代码

```bash
cd ~
git clone <你的仓库地址>.git video-mcp
cd video-mcp
```

### 第 2 步：写环境变量文件

```bash
cp .env.example video.env
nano video.env
```

把 `GOOGLE_API_KEY=` 后面换成你自己的 Gemini Key。其它保持默认即可（`TRANSPORT_TYPE=sse` 表示走 HTTP，适合远程用）。保存退出：`Ctrl+O` 回车 `Ctrl+X`。

### 第 3 步：（可选，但下 B 站视频几乎必需）准备 Cookie

B 站对没有登录 Cookie 的请求会返回 **HTTP 412**，导致下载失败。解决办法是带上你自己的登录 Cookie：

1. 电脑浏览器**登录 B 站**（bilibili.com）。
2. 装浏览器扩展 **Cookie-Editor**，在 B 站页面点开它。
3. 点 **Export → Export as Netscape**（⚠️ 一定要选 **Netscape** 格式，不是 JSON）。
4. 把导出的内容保存成服务器上的 `~/video-mcp/bili-cookies.txt`：
   ```bash
   nano ~/video-mcp/bili-cookies.txt
   ```
   粘贴进去保存。文件开头应该是 `# Netscape HTTP Cookie File`。

> Cookie 会过期。哪天视频又下不了（报 412 或要登录），重新导出覆盖这个文件、再 `docker restart video` 即可。

### 第 4 步：构建镜像

```bash
docker build -t video-mcp .
```

第一次会下载 Node 基础镜像、安装 ffmpeg 和 yt-dlp、编译代码，需要一两分钟。看到 `naming to ... video-mcp` 就成功了。

### 第 5 步：启动容器

```bash
docker run -d --name video --restart unless-stopped \
  -p 18014:3000 \
  --env-file ~/video-mcp/video.env \
  -v ~/video-mcp/bili-cookies.txt:/app/bili-cookies.txt \
  video-mcp
```

说明：
- `-p 18014:3000`：把容器的 3000 端口映射到服务器的 18014（对外端口你可以改）。
- `-v ...bili-cookies.txt...`：把 Cookie 文件挂进容器。**没做第 3 步（没 Cookie）就删掉这一行 `-v`**。
- 注意挂载 Cookie **不要**加 `:ro`（只读），因为 yt-dlp 运行时会回写更新 Cookie。

### 第 6 步：确认起来了

```bash
docker logs video
```

看到 `Server started with Streamable HTTP transport on port 3000` 就正常了。再确认 yt-dlp 装好：

```bash
docker exec video yt-dlp --version
```

能打印版本号（如 `2026.07.04`）即可。

### 第 7 步：连接你的 MCP 客户端

MCP 端点是：

```
http://你的服务器IP:18014/mcp
```

如果你用了域名 + 反向代理（如 Nginx / Caddy）转发到 `localhost:18014`，就用你的 `https://域名/mcp`。传输方式选 **Streamable HTTP**。

### 第 8 步：怎么用

在你的聊天客户端里，**明确要求调用 `video_recognition` 工具**，把链接作为 `filepath` 参数。例如对 AI 说：

> 请调用 video_recognition 工具，filepath 填 https://www.bilibili.com/video/BVxxxxxxxxx/ ，帮我看看视频里是什么。

> ⚠️ 如果你同时接了「网页读取」类工具（如 jina），AI 可能会把链接拿去读网页而不是下载视频。这时要明确说「不要读网页，用 video_recognition 下载视频看画面」。

### 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 下载报 `HTTP Error 412` | B 站风控，没带登录 Cookie | 按第 3 步准备 `bili-cookies.txt` 并挂载 |
| 报 `Read-only file system: /app/bili-cookies.txt` | 挂载 Cookie 时加了 `:ro` | 去掉 `:ro` 重新 run |
| 报 `Requested format is not available` | 视频没有对应清晰度档 | 本 fork 已用 `-S res:480` 自动选档，一般不会遇到；若遇到可 `docker exec video yt-dlp --list-formats <链接>` 看有哪些档 |
| 报 `429 Too Many Requests / exceeded your current quota` | Gemini Key 免费额度用完 / 被限流 | 换一个 Gemini Key（改 `video.env` 后 `docker restart video`），或等次日额度重置 |
| AI 不调用视频工具，去读网页了 | 客户端优先用了别的工具 | 对话里点名 `video_recognition`，或临时停用网页读取类工具 |

### 关于视频时长与费用

- 视频识别很吃 Gemini 的 token，**建议只处理 1~3 分钟以内的短视频**。
- Gemini 有免费额度，个人偶尔用足够；高频使用会触发限流或产生费用。
- 本 fork 默认下载 480p 左右画质，已经尽量省流量和 token。

---

## Credits & License

- Upstream project: **[mario-andreschak/mcp_video_recognition](https://github.com/mario-andreschak/mcp_video_recognition)** — original image/audio/video recognition MCP server.
- This fork only adds URL download / cookie / quality-selection features on top.
- Licensed under the **MIT License** (see `LICENSE`). The original copyright
  `Copyright (c) 2025 mario-andreschak` is retained.
