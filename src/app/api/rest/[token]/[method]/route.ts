import { CORS, handleRest } from "@/lib/dev-rest";

// Inbound webhook (Settings → Developer resources), Bitrix style:
//   GET or POST https://<domain>/api/rest/<key>/crm.lead.list?stage=New%20Request
//   POST body: JSON or form fields. ".json" after the method name is allowed (crm.lead.list.json).
// Answer: { result, total?, next?, time } or { error, error_description } with an HTTP error status.
export const GET = async (req: Request, ctx: { params: Promise<{ token: string; method: string }> }) => { const { token, method } = await ctx.params; return handleRest(req, token, method); };
export const POST = GET;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
