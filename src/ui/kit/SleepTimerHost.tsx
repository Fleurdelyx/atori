import { useEffect } from "react";
import { useUi } from "@/state/uiStore";
import { engine } from "@/core/audio/AudioEngine";
import { toast } from "@/state/toastStore";

/**
 * SleepTimerHost — mounted app-wide so the timer fires no matter which
 * screen is up. When it hits zero the engine fades out and pauses
 * (AudioEngine.pause() already runs the fade), then the timer clears.
 */
export function SleepTimerHost() {
  const sleepEndsAt = useUi((s) => s.sleepEndsAt);
  const setSleepEndsAt = useUi((s) => s.setSleepEndsAt);

  useEffect(() => {
    if (sleepEndsAt === null) return;
    const tick = () => {
      if (Date.now() >= sleepEndsAt) {
        setSleepEndsAt(null);
        void engine.pause();
        toast("Sleep timer — good night", "info", "スリープタイマー");
      }
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sleepEndsAt, setSleepEndsAt]);

  return null;
}
