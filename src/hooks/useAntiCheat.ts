import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface AntiCheatOptions {
  sessionId: string;
  isLocked: boolean;
  onLock: (reason: string) => void;
}

export function useAntiCheat({ sessionId, isLocked, onLock }: AntiCheatOptions) {
  const isOnlineRef = useRef<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const lastTickRef = useRef<number>(0);
  const lagGraceUntilRef = useRef<number>(0);
  const hiddenTimestampRef = useRef<number | null>(null);

  const isLockedRef = useRef(isLocked);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  const onLockRef = useRef(onLock);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    if (!sessionId) return;

    // Seed timestamp safely inside effect
    lastTickRef.current = Date.now();

    const logTelemetry = async (
      category: "cheat_suspect" | "network_hardware",
      eventType: string,
      details: string
    ) => {
      try {
        await supabase.from("telemetry_logs").insert({
          session_id: sessionId,
          category,
          event_type: eventType,
          details,
          occurred_at: new Date().toISOString(),
        });
      } catch {
        // Silently swallow network hiccups
      }
    };

    const handleOnline = () => {
      isOnlineRef.current = true;
      void logTelemetry("network_hardware", "NETWORK_RESTORED", "Device re-established data/Wi-Fi connection.");
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      void logTelemetry("network_hardware", "NETWORK_LOST", "Device disconnected from internet.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Hardware Lag & Thread Freeze Monitor
    const lagInterval = setInterval(() => {
      const now = Date.now();
      const delta = now - (lastTickRef.current || now);
      lastTickRef.current = now;

      if (delta > 2000 && typeof document !== "undefined" && document.visibilityState === "visible") {
        lagGraceUntilRef.current = now + 3000;
        void logTelemetry(
          "network_hardware",
          "DEVICE_LAG_DETECTED",
          `UI thread choked for ${(delta / 1000).toFixed(1)}s (low memory / thermal throttling).`
        );
      }
    }, 250);

    // Proctor Heartbeat
    const heartbeatInterval = setInterval(async () => {
      if (!isOnlineRef.current || !sessionId) return;
      try {
        await supabase
          .from("exam_sessions")
          .update({
            is_online: true,
            last_heartbeat: new Date().toISOString(),
          })
          .eq("id", sessionId);
      } catch {
        // Handled on next interval
      }
    }, 15000);

    // Mobile Focus & App Switch Monitor
    const handleVisibilityChange = async () => {
      const now = Date.now();

      if (document.visibilityState === "hidden") {
        hiddenTimestampRef.current = now;

        if (!navigator.onLine || !isOnlineRef.current) {
          void logTelemetry("network_hardware", "HIDDEN_OFFLINE", "Browser tab hidden during network drop.");
          return;
        }

        if (now < lagGraceUntilRef.current) {
          void logTelemetry("network_hardware", "HIDDEN_LAG_SPIKE", "Defocus coincided with device freeze.");
          return;
        }

        return;
      }

      if (document.visibilityState === "visible") {
        const leftAt = hiddenTimestampRef.current;
        hiddenTimestampRef.current = null;

        if (!leftAt) return;
        const awaySeconds = Math.max(1, Math.round((now - leftAt) / 1000));

        if (!navigator.onLine || !isOnlineRef.current) {
          void logTelemetry(
            "network_hardware",
            "RECONNECTED_AFTER_DROP",
            `Candidate returned after connection recovery (${awaySeconds}s away).`
          );
          return;
        }

        if (now < lagGraceUntilRef.current) {
          void logTelemetry(
            "network_hardware",
            "RESUMED_POST_LAG",
            `Candidate returned after system freeze (${awaySeconds}s away).`
          );
          return;
        }

        if (awaySeconds < 2) {
          void logTelemetry(
            "network_hardware",
            "SYSTEM_NOTIFICATION_GLANCE",
            "Brief < 2s defocus (volume HUD or notification swipe)."
          );
          return;
        }

        if (!isLockedRef.current) {
          const reason = `Candidate exited app for ${awaySeconds} seconds.`;

          void logTelemetry("cheat_suspect", "INTENTIONAL_EXIT", reason);

          try {
            await supabase
              .from("exam_sessions")
              .update({
                status: "locked",
                lock_reason: reason,
              })
              .eq("id", sessionId);
          } catch {
            // Fall back to local UI lock
          }

          onLockRef.current(reason);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(lagInterval);
      clearInterval(heartbeatInterval);
    };
  }, [sessionId]);
}