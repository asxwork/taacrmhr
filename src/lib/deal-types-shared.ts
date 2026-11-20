// Deal & inventory types (Off-plan, Sale, Rental… editable in Settings → CRM). Client-safe.
export const DEFAULT_DEAL_TYPES = ["Off-plan", "Sale", "Rental"];
/** A unit's type: its own, else from what kind of listing it is (project stock is off-plan). */
export const unitTypeOf = (u: { dealType?: string | null; listingType: string }) =>
  u.dealType || (u.listingType === "project" ? "Off-plan" : u.listingType === "rental" ? "Rental" : "Sale");
/** The list plus a value that's no longer in it (so editing an old record never loses it). */
export const withCurrent = (types: string[], current?: string | null) => (current && !types.includes(current) ? [...types, current] : types);
