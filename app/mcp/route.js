import { handleMcpRequest } from '@/lib/mcpServer';

const handler = (request) => handleMcpRequest(request);

export { handler as GET, handler as POST, handler as DELETE };
