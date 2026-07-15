import { useEffect, useState } from "react";

export function useTimer(active = true) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [active]);

  return seconds;
}
