import { createMcpHandler } from 'mcp-handler';
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

// The handler is built per request with the caller closed over. Do not hoist
// this to module scope and pass the user in on the Request object — concurrent
// requests would read each other's caller.
function handlerFor(appUser) {
  return createMcpHandler(
    (server) => {
      for (const [name, { description, schema }] of Object.entries(TOOLS)) {
        server.registerTool(name, { description, inputSchema: schema }, async (args) =>
          runTool({ appUser, tool: name, args }),
        );
      }
    },
    {
      serverInfo: { name: 'open-higgsfield-ai', version: '1.0.0' },
    },
  );
}

export async function handleMcpRequest(request, pathToken) {
  const appUser = await authenticateMcp(request, pathToken);
  if (!appUser) {
    return Response.json(
      { error: 'That token is not valid. Open /connect on the studio and copy the line again.' },
      { status: 401 },
    );
  }
  return handlerFor(appUser)(request);
}
