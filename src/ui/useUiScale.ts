import { useEffect } from "react";

// The size the menus and the HUD are laid out at; the stage scales them to whatever it really is.
export const UI_WIDTH = 800;
// Beyond this the text would read too large on a big monitor; the layout widens instead.
export const UI_MAX_SCALE = 1.2;

// Keeps --ui-scale in step with the stage, so a small screen shows the same layout, only smaller.
export function useUiScale(): void {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const apply = () => {
      const width = root.clientWidth;
      if (width > 0) document.documentElement.style.setProperty("--ui-scale", String(Math.min(UI_MAX_SCALE, width / UI_WIDTH)));
    };
    apply();
    const observer = new ResizeObserver(() => requestAnimationFrame(apply));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
}
