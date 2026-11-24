import { CORS, handleRest } from "@/lib/dev-rest";

// Inbound webhook with the key in a header instead of the URL (keeps keys out of server and proxy logs):
//   GET or POST https://<domain>/api/rest/<method>   Authorization: Bearer <key>   (or X-Api-Key: <key>)
// Same methods, options and answers as /api/rest/<key>/<method>.
function keyOf(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  return (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "") || req.headers.get("x-api-key") || "";
}
export const GET = async (req: Request, ctx: { params: Promise<{ token: string }> }) => handleRest(req, keyOf(req).trim(), (await ctx.params).token);
export const POST = GET;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
