import {
  createMcpHandler,
  isLegacyRequest,
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { authenticateMcp, runTool } from '@/lib/mcpTools';


const TOOLS = {
  list_models: {
    description: 'List the models available for each studio. Call this before generating.',
    schema: {},
  },
  generate_image: {
    description: 'Create an image from a text prompt. Returns a job id — then call check_generation.',
    schema: {
      prompt: z.string().describe('What the image should show'),
      model: z.string().describe('A model id from list_models, e.g. nano-banana'),
      aspect_ratio: z.string().optional().describe('e.g. 1:1, 16:9, 9:16'),
    },
  },
  edit_image: {
    description: 'Change an existing image using a prompt. The image must be a public URL.',
    schema: {
      prompt: z.string(),
      image_url: z.string().describe('A publicly reachable image URL'),
      model: z.string(),
    },
  },
  generate_video: {
    description: 'Create a video from a text prompt. Video takes minutes — poll check_generation.',
    schema: {
      prompt: z.string(),
      model: z.string(),
      aspect_ratio: z.string().optional(),
    },
  },
  animate_image: {
    description: 'Turn a still image into a video. The image must be a public URL.',
    schema: {
      image_url: z.string(),
      model: z.string(),
      prompt: z.string().optional(),
    },
  },
  lip_sync: {
    description: 'Sync a face to audio. Give either image_url or video_url, plus audio_url.',
    schema: {
      audio_url: z.string(),
      model: z.string(),
      image_url: z.string().optional(),
      video_url: z.string().optional(),
    },
  },
  check_generation: {
    description: 'Check whether a submitted job has finished and get its result URL.',
    schema: { request_id: z.string() },
  },
};

// Every request here must finish in well under a second or two. A Vercel
// function stays provisioned (2 GB on Hobby) for as long as its response is
// open, so a held-open stream bills memory for its whole life even when idle.
// Concretely: Claude's connector opens `subscriptions/listen`, which the SDK
// serves as an SSE stream with keep-alives that only ended at the 300 s
// timeout. So the server answers with plain JSON, advertises nothing to
// subscribe to, and refuses listen requests and the GET stream outright.

// The tool list never changes at runtime, so there is nothing to notify about.
// Without this, registerTool advertises `tools.listChanged: true`, which is
// what invites the client to open a listen stream.
const SERVER_OPTIONS = { capabilities: { tools: { listChanged: false } } };
const SERVER_INFO = { name: 'open-higgsfield-ai', version: '1.0.0' };

// A fresh server per request, with the caller closed over. Do not share one
// across requests — concurrent requests would read each other's caller.
function buildServer(appUser) {
  const server = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  for (const [name, { description, schema }] of Object.entries(TOOLS)) {
    server.registerTool(name, { description, inputSchema: schema }, async (args) =>
      runTool({ appUser, tool: name, args }),
    );
  }
  return server;
}

// 2026-07-28 protocol traffic (what Claude's connector speaks today). The
// caller travels in authInfo, which the SDK passes straight through to the
// factory for this one request.
const modernHandler = createMcpHandler(
  ({ authInfo }) => buildServer(authInfo.extra.appUser),
  { legacy: 'reject', responseMode: 'json', keepAliveMs: 0, maxSubscriptions: 0 },
);

// 2025-era traffic: stateless, one server per POST, answered as a single JSON
// body rather than an SSE stream.
async function serveLegacy(request, appUser) {
  const server = buildServer(appUser);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

const jsonRpcError = (id, code, message, status = 200) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status });

async function peekBody(request) {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

export async function handleMcpRequest(request, pathToken) {
  // No server-to-client stream (2025-era GET) and no sessions to delete. Answer
  // before touching the database so a reconnecting client costs next to nothing.
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed.' } }),
      { status: 405, headers: { 'content-type': 'application/json', allow: 'POST' } },
    );
  }

  const appUser = await authenticateMcp(request, pathToken);
  if (!appUser) {
    return Response.json(
      { error: 'That token is not valid. Open /connect on the studio and copy the line again.' },
      { status: 401 },
    );
  }

  const body = await peekBody(request);
  if (body?.method === 'subscriptions/listen') {
    return jsonRpcError(
      body.id, -32601,
      'This server does not offer subscriptions. Its tools never change; poll check_generation for job results.',
    );
  }

  if (await isLegacyRequest(request, body)) {
    return serveLegacy(request, appUser);
  }
  return modernHandler.fetch(request, {
    authInfo: { token: '', clientId: appUser.clerkUserId, scopes: [], extra: { appUser } },
    parsedBody: body,
  });
}
