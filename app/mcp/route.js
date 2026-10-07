import { handleMcpRequest } from '@/lib/mcpServer';

// Every MCP answer is a short JSON response; nothing here should run long.
// The cap stops anything that does get stuck from billing 2 GB for 300 s.
export const maxDuration = 60;

const handler = (request) => handleMcpRequest(request);

export { handler as GET, handler as POST, handler as DELETE };
