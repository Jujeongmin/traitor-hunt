// The one thing on sale: the full game. It must match the Product ID registered in the Verse8
// dashboard (500 VX, one per account). Practice is free; online matches need it.
export const FULL_GAME_PRODUCT = "full-game";
export const FULL_GAME_PRICE_VX = 500;

// What the platform sends when a purchase completes (the server's $onItemPurchased hook).
export interface PurchaseEvent {
  account: string;
  purchaseId: string;
  productId: string;
  quantity: number;
}

export function readPurchaseEvent(value: unknown): PurchaseEvent | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const purchaseId = typeof e.purchaseId === "string" || typeof e.purchaseId === "number" ? String(e.purchaseId).trim() : "";
  if (typeof e.account !== "string" || e.account === "" || purchaseId === "" || purchaseId.length > 200) return null;
  if (typeof e.productId !== "string" || !Number.isInteger(e.quantity) || (e.quantity as number) < 1) return null;
  return { account: e.account, purchaseId, productId: e.productId, quantity: e.quantity as number };
}

// Local test and practice seats ("test-…") play online without buying.
export function playsFree(account: string): boolean {
  return account.startsWith("test-");
}
