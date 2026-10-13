"use client";

import { useEffect, useState } from "react";

// Refresh time-based UI at minute boundaries and immediately after tab resume.
export function useMinuteNow() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      setNow(Date.now());
      timer = setTimeout(update, 60_000 - Date.now() % 60_000 + 20);
    };
    const resume = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return now;
}
