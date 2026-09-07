import { handleMcpRequest } from '@/lib/mcpServer';

// Claude's desktop connector reserves the Authorization header for its own OAuth
// flow, so the token travels in the path instead. Same authentication, same
// tools, same usage logging as the header route.
async function handler(request, context) {
  const { token } = await context.params;
  return handleMcpRequest(request, token);
}

export { handler as GET, handler as POST, handler as DELETE };
