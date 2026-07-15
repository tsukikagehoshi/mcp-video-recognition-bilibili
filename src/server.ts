/**
 * MCP server implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { createLogger } from './utils/logger.js';
import { GeminiService } from './services/gemini.js';
import { createImageRecognitionTool } from './tools/image-recognition.js';
import { createAudioRecognitionTool } from './tools/audio-recognition.js';
import { createVideoRecognitionTool } from './tools/video-recognition.js';
import type { GeminiConfig } from './types/index.js';

const log = createLogger('Server');

export interface ServerConfig {
  gemini: GeminiConfig;
  transport: 'stdio' | 'sse';
  port?: number;
}

export class Server {
  private readonly geminiService: GeminiService;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;

    // Initialize Gemini service (shared across sessions)
    this.geminiService = new GeminiService(config.gemini);

    log.info('MCP server initialized');
  }

  /**
   * Build a fresh McpServer instance with all tools registered.
   * Each HTTP session gets its own instance (a McpServer can only be
   * connected to a single transport at a time).
   */
  private createMcpServer(): McpServer {
    const mcpServer = new McpServer({
      name: 'mcp-video-recognition',
      version: '1.0.0'
    });

    const imageRecognitionTool = createImageRecognitionTool(this.geminiService);
    const audioRecognitionTool = createAudioRecognitionTool(this.geminiService);
    const videoRecognitionTool = createVideoRecognitionTool(this.geminiService);

    mcpServer.tool(
      imageRecognitionTool.name,
      imageRecognitionTool.description,
      imageRecognitionTool.inputSchema.shape,
      imageRecognitionTool.callback
    );

    mcpServer.tool(
      audioRecognitionTool.name,
      audioRecognitionTool.description,
      audioRecognitionTool.inputSchema.shape,
      audioRecognitionTool.callback
    );

    mcpServer.tool(
      videoRecognitionTool.name,
      videoRecognitionTool.description,
      videoRecognitionTool.inputSchema.shape,
      videoRecognitionTool.callback
    );

    return mcpServer;
  }

  /**
   * Start the server with the configured transport
   */
  async start(): Promise<void> {
    try {
      if (this.config.transport === 'stdio') {
        await this.startWithStdio();
      } else if (this.config.transport === 'sse') {
        await this.startWithSSE();
      } else {
        throw new Error(`Unsupported transport: ${this.config.transport}`);
      }
    } catch (error) {
      log.error('Failed to start server', error);
      throw error;
    }
  }

  /**
   * Start the server with stdio transport
   */
  private async startWithStdio(): Promise<void> {
    log.info('Starting server with stdio transport');

    const transport = new StdioServerTransport();

    transport.onclose = () => {
      log.info('Stdio transport closed');
    };

    transport.onerror = (error) => {
      log.error('Stdio transport error', error);
    };

    const mcpServer = this.createMcpServer();
    await mcpServer.connect(transport);
    log.info('Server started with stdio transport');
  }

  /**
   * Start the server with Streamable HTTP transport
   */
  private async startWithSSE(): Promise<void> {
    log.info('Starting server with Streamable HTTP transport');

    const express = await import('express');
    const app = express.default();
    const port = this.config.port || 3000;

    app.use(express.json({ limit: '64mb' }));

    // Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // POST /mcp — client-to-server. Creates a session on initialize.
    app.post('/mcp', async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request — fresh transport + fresh McpServer instance
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
              log.info(`New session initialized: ${sid}`);
            }
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              delete transports[transport.sessionId];
              log.info(`Session closed: ${transport.sessionId}`);
            }
          };

          // Each session gets its own McpServer instance
          const mcpServer = this.createMcpServer();
          await mcpServer.connect(transport);
        } else {
          log.error('Bad Request: no valid session ID and not an initialize request');
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        log.error('Error handling MCP request', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // Reusable handler for GET (SSE stream) and DELETE (session end)
    const handleSessionRequest = async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };

    app.get('/mcp', handleSessionRequest);
    app.delete('/mcp', handleSessionRequest);

    app.listen(port, () => {
      log.info(`Server started with Streamable HTTP transport on port ${port}`);
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    log.info('Server stopped');
  }
}
