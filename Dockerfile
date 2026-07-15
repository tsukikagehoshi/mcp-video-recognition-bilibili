FROM node:22-bookworm-slim

# Install ffmpeg + yt-dlp (for downloading and merging videos from URLs)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 curl ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install node deps first (better layer caching)
COPY package.json ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install

# Copy source and build
COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
