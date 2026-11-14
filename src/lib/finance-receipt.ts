// Receipt reading: a photo or PDF of a bill → amount, date, shop/payee, what it was for, and a category suggestion.
// Uses Claude (needs ANTHROPIC_API_KEY on the server). Without the key the feature simply stays off.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const receiptReadingOn = () => !!process.env.ANTHROPIC_API_KEY;

const Receipt = z.object({
  amount: z.number().describe("Total amount paid in PKR (the grand total, after tax and discount). 0 if not readable."),
  date: z.string().describe("Bill date as YYYY-MM-DD, or empty string if not on the bill."),
  payee: z.string().describe("Shop, company or person paid, e.g. K-Electric, Imtiaz, Meta. Empty if not readable."),
  description: z.string().describe("Short plain description of what was bought, max 8 words, e.g. 'Tea and biscuits for guests'."),
  category: z.string().describe("The best matching category from the list given, exactly as written, or empty string if none fits."),
  readable: z.boolean().describe("false if the image is not a bill/receipt or is too blurry to read."),
});
export type ReceiptData = z.infer<typeof Receipt>;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export async function readReceipt(file: File, categories: string[]): Promise<ReceiptData | { error: string }> {
  if (!receiptReadingOn()) return { error: "Receipt reading is not switched on (ANTHROPIC_API_KEY is not set on the server)." };
  if (file.size > 8_000_000) return { error: "The photo is larger than 8 MB." };
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const isPdf = file.type === "application/pdf";
  const mediaType = (IMAGE_TYPES as readonly string[]).includes(file.type) ? (file.type as (typeof IMAGE_TYPES)[number]) : null;
  if (!isPdf && !mediaType) return { error: "Use a JPG, PNG or PDF of the bill." };

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Receipt) },
      messages: [{
        role: "user",
        content: [
          isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } } : { type: "image", source: { type: "base64", media_type: mediaType!, data } },
          { type: "text", text: `This is a bill or receipt from a company in Pakistan (amounts in rupees). Read it.\nCategories to choose from:\n${categories.join("\n")}` },
        ],
      }],
    });
    if (response.stop_reason === "refusal") return { error: "This file couldn't be read. Enter the details by hand." };
    const out = response.parsed_output;
    if (!out) return { error: "Couldn't read the bill. Enter the details by hand." };
    if (!out.readable) return { error: "This doesn't look like a readable bill. Try a clearer photo." };
    return out;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { error: "Receipt reading is busy, try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { error: "The receipt reading key on the server is not valid." };
    if (e instanceof Anthropic.APIError) return { error: `Receipt reading failed (${e.status}).` };
    return { error: "Receipt reading failed. Enter the details by hand." };
  }
}
