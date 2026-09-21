import { VXShop } from "@verse8/platform";
import { FULL_GAME_PRICE_VX, FULL_GAME_PRODUCT } from "../game/account/purchase";

// The Verse8 VX Shop, for the one product we sell. The dialog is Verse8's own; the unlock itself
// arrives on the server ($onItemPurchased), so after the dialog closes the menu asks the server.

// The Agent8 v2 editor preview runs on its own host, which the SDK 2.1.0 does not recognise as a
// preview, so there the dialog is opened with the PREVIEW stage spelled out (as bastion-line does).
const V2_EDITOR_PREVIEW_HOST = /^agent8-container-v2-[a-z0-9-]+\.agent8\.verse8\.net$/;

function inEditorPreview(): boolean {
  try {
    return V2_EDITOR_PREVIEW_HOST.test(window.location.hostname.toLowerCase());
  } catch {
    return false;
  }
}

let started = false;

export function startShop(verseId: string, account: string): void {
  if (started) return;
  started = true;
  try {
    VXShop.init({ verseId, account, autoRefresh: true });
  } catch {
    // Outside Verse8 the shop has nothing to talk to; the price falls back to the listed one.
  }
}

export function fullGamePrice(): number {
  try {
    return VXShop.getItem(FULL_GAME_PRODUCT)?.price ?? FULL_GAME_PRICE_VX;
  } catch {
    return FULL_GAME_PRICE_VX;
  }
}

export function buyFullGame(verseId: string): void {
  if (inEditorPreview() && window.parent !== window) {
    window.parent.postMessage(
      { type: "OPEN_VX_SHOP_DIALOG", payload: { verseId, productId: FULL_GAME_PRODUCT, stage: "PREVIEW" } },
      "*",
    );
    return;
  }
  VXShop.buyItem(FULL_GAME_PRODUCT);
}

// Called with true when the player went through with the purchase, false when they closed it.
export function onShopClosed(listener: (purchased: boolean) => void): () => void {
  try {
    return VXShop.onClose((payload) => {
      if (payload.productId === FULL_GAME_PRODUCT) listener(payload.purchased);
    });
  } catch {
    return () => undefined;
  }
}
