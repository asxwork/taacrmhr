// Commission tracker: the agent's share of a closed deal's commission and where it stands
// (waiting for the developer/client → received by the company → paid to the agent).

type D = { commissionAmount: number | null; agentSharePct: number | null };

/** The agent's share = commission × agent %, or the whole commission when no split was set. */
export const agentShare = (d: D) => (d.commissionAmount == null ? null : Math.round((d.commissionAmount * (d.agentSharePct ?? 100)) / 100));

export type CommissionState = "pending" | "received" | "paid";
export const commissionState = (d: { commissionReceivedAt: Date | null; agentPaidAt: Date | null }): CommissionState => (d.agentPaidAt ? "paid" : d.commissionReceivedAt ? "received" : "pending");
export const STATE_LABEL: Record<CommissionState, string> = { pending: "Waiting for developer", received: "Received · to pay agent", paid: "Paid to agent" };
