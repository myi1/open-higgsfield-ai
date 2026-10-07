import { findAppUserByMcpToken } from './appUser.js';
import { forwardToMuapi } from './muapiForward.js';
import { t2iModels, i2iModels, t2vModels, i2vModels, lipsyncModels }
  from '../packages/studio/src/models.js';

/**
 * Resolve the caller from either an Authorization header or a token in the URL
 * path. The path form exists because Claude's desktop connector reserves the
 * Authorization header for its own OAuth flow and will not let a person set it.
 */
export async function authenticateMcp(request, pathToken) {
  const header = request.headers.get('authorization') ?? '';
  const fromHeader = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const token = fromHeader || String(pathToken ?? '').trim();
  if (!token) return null;
  return (await findAppUserByMcpToken(token)) ?? null;
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

// MuAPI answers a submit or a status check in about a second. If it hangs, give
// up and say so rather than hold the MCP request open.
export const MUAPI_TIMEOUT_MS = 20_000;

async function callMuapi(options) {
  try {
    return await forwardToMuapi({ ...options, signal: AbortSignal.timeout(MUAPI_TIMEOUT_MS) });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { timedOut: true };
    throw err;
  }
}

// Our own refusals carry `error` as a string; MuAPI's carry an object or a
// `detail`. Tool results must be text, so flatten whichever came back.
function reason(body) {
  const e = body?.error;
  if (typeof e === 'string') return e;
  return e?.message ?? body?.detail ?? body?.message ?? undefined;
}

const SUBMIT_TIMED_OUT =
  'MuAPI did not answer in time. The job may still have started, so check the studio ' +
  'history before submitting it again.';
const CHECK_TIMED_OUT = 'MuAPI did not answer in time. Check again in a few seconds.';

const names = (models, limit = 12) =>
  models.slice(0, limit).map((m) => `${m.id} — ${m.name}`).join('\n');

async function submit({ appUser, endpoint, payload, origin }) {
  const result = await callMuapi({
    appUser, path: endpoint, method: 'POST', body: payload, via: 'MCP', origin,
  });
  if (result.timedOut) return text(SUBMIT_TIMED_OUT);

  if (result.status >= 400) {
    return text(reason(result.body) ?? `That did not work (status ${result.status}).`);
  }

  const id = result.body.request_id ?? result.body.id;
  return text(
    `Submitted. Job id: ${id}\n\n` +
    `This runs in the background — call check_generation with this id in about ` +
    `10 seconds for an image, or a minute or two for video.`,
  );
}

export async function runTool({ appUser, tool, args }) {
  switch (tool) {
    case 'list_models':
      return text(
        `Image (text to image):\n${names(t2iModels)}\n\n` +
        `Image editing (image + prompt):\n${names(i2iModels)}\n\n` +
        `Video (text to video):\n${names(t2vModels)}\n\n` +
        `Video (image to video):\n${names(i2vModels)}\n\n` +
        `Lip sync:\n${names(lipsyncModels)}`,
      );

    case 'generate_image':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:image',
        payload: { prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? '1:1' },
      });

    case 'edit_image':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:image',
        payload: { prompt: args.prompt, image_url: args.image_url },
      });

    case 'generate_video':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:video',
        payload: { prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? '16:9' },
      });

    case 'animate_image':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:video',
        payload: { prompt: args.prompt ?? '', image_url: args.image_url },
      });

    case 'lip_sync':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:lipsync',
        payload: {
          audio_url: args.audio_url,
          image_url: args.image_url,
          video_url: args.video_url,
        },
      });

    case 'check_generation': {
      const result = await callMuapi({
        appUser, path: `predictions/${args.request_id}/result`, method: 'GET', via: 'MCP',
      });
      if (result.timedOut) return text(CHECK_TIMED_OUT);
      // A refusal is final; reporting it as "still working" would have the
      // client poll a job that will never finish.
      if (result.status >= 400) {
        return text(reason(result.body) ?? `Could not check that job (status ${result.status}).`);
      }

      const status = String(result.body?.status ?? '').toLowerCase();
      if (['completed', 'succeeded', 'success'].includes(status)) {
        const url = result.body.outputs?.[0]?.url ?? result.body.url;
        return text(url ? `Done: ${url}` : 'Done, but no output url came back.');
      }
      if (['failed', 'error'].includes(status)) {
        return text(`That generation failed: ${reason(result.body) ?? 'no reason given'}`);
      }
      return text('Still working — check again in a few seconds.');
    }

    default:
      return text(`Unknown tool: ${tool}`);
  }
}
