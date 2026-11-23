import { ApiError, DEV_METHODS, authorize, callMethod } from "@/lib/dev-api";

// MCP server (Model Context Protocol, streamable HTTP, stateless JSON): lets an AI assistant such as Claude use AMS.
//   URL: https://<domain>/api/mcp   Header: Authorization: Bearer <key>   (or ?key=<key>)
// The key comes from Settings → Developer resources (an inbound webhook with "AI assistant (MCP)" ticked). Tools are
// the same methods as the inbound webhook, limited to the key's scopes and its owner's permissions.
const PROTOCOL = "2025-06-18";
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const toolName = (m: string) => m.replace(/\./g, "_");

function keyOf(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  return (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "") || new URL(req.url).searchParams.get("key") || "";
}

async function answer(req: Request, msg: Rpc) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  const token = keyOf(req);
  switch (msg.method) {
    case "initialize":
      return ok({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "AMS · The Advisor Associates", version: "1.0.0" },
        instructions: "Tools to read and update the AMS CRM (leads, their activities and comments, deals, stages), users and HR. Everything runs with the permissions of the person who owns the key. Lead ids can be the AMS lead number (e.g. 9004). Times are Pakistan time." });
    case "ping": return ok({});
    case "tools/list": {
      const { scopes } = await authorize(token, null, "mcp");
      return ok({ tools: DEV_METHODS.filter((m) => scopes.has(m.scope)).map((m) => ({
        name: toolName(m.name), title: m.name, description: m.about + (m.write ? " (changes data)" : ""),
        inputSchema: { type: "object", properties: Object.fromEntries(m.params.map((p) => [p.name, { type: p.type, description: p.about }])), required: m.params.filter((p) => p.required).map((p) => p.name) },
        annotations: { readOnlyHint: !m.write },
      })) });
    }
    case "tools/call": {
      const name = String(msg.params?.name ?? ""), method = DEV_METHODS.find((m) => toolName(m.name) === name || m.name === name);
      if (!method) return err(-32602, `Unknown tool ${name}`);
      try {
        const out = await callMethod(method.name, token, (msg.params?.arguments as Record<string, unknown>) ?? {}, "mcp");
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: out, isError: false });
      } catch (e) {
        if (e instanceof ApiError && e.code === "NO_AUTH") throw e;
        return ok({ content: [{ type: "text", text: e instanceof Error ? e.message : "Something went wrong." }], isError: true });
      }
    }
    default:
      return msg.method.startsWith("notifications/") ? null : err(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  let body: Rpc | Rpc[];
  try { body = await req.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  try {
    const list = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(list.map((m) => answer(req, m)))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(body) ? out : out[0], { headers: { "MCP-Protocol-Version": PROTOCOL } });
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: e.message } }, { status: e.code === "NO_AUTH" ? 401 : 403, headers: { "WWW-Authenticate": 'Bearer realm="AMS"' } });
    console.error("MCP error", e);
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, { status: 500 });
  }
}

// No server-sent stream: this server answers each request directly.
export const GET = () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;
