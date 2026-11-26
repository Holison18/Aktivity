"use client";
// Adds a pointer-originated ripple and snappy click-pop animation to every `.btn` and `.chip`
// across the app without modifying individual buttons or links. Respects prefers-reduced-motion.
import { useEffect } from "react";

export default function ClickEffects() {
  useEffect(() => {
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || reduced()) return;
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn, .chip");
      if (!target) return;
      if (target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.1;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const ripple = document.createElement("span");
      ripple.className = "click-ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      target.appendChild(ripple);

      const cleanup = () => ripple.remove();
      ripple.addEventListener("animationend", cleanup, { once: true });
      window.setTimeout(cleanup, 520);
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
