import React, { useEffect, useRef, useState } from "react";
import { AppStreamer, StreamType } from "@nvidia/omniverse-webrtc-streaming-library";
import { useLang } from "../lib/i18n.jsx";

// Live interactive 3D twin — WebRTC client for the Omniverse Kit render running
// on the port's GPU server. Kit renders the vessel's USD once and streams it; the
// browser gets an H.264 video track plus a data channel for input (orbit/zoom)
// and control messages (camera jumps). Signaling is Kit's WebRTC signaller,
// TLS-wrapped by nginx as wss://<host>:<signalPort>; media is DTLS/SRTP over UDP.
//
// The single T4 serves ONE interactive viewer at a time, so a second viewer may
// get a terminate — handled as a friendly "busy" state rather than an error.
// AppStreamer is a singleton: we connect on mount and stop() on unmount.

const VIDEO_ID = "sagar-twin-video";
const AUDIO_ID = "sagar-twin-audio";

export default function LiveTwin({ stream, name, onClose }) {
  const { t } = useLang();
  const [phase, setPhase] = useState("connecting"); // connecting | streaming | error
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);        // bump to force a fresh connect
  const startedRef = useRef(false);

  // If no real video frames arrive within this window, the renderer is almost
  // always busy with another viewer or still warming up — surface that instead
  // of spinning forever (the NVIDIA lib retries the signaller silently).
  const CONNECT_TIMEOUT_MS = 30000;

  useEffect(() => {
    if (!stream || startedRef.current) return undefined; // guard StrictMode double-mount
    startedRef.current = true;
    const server = stream.host;
    const port = stream.signalPort || 49100;
    let cancelled = false;
    let streaming = false;

    const markStreaming = () => {
      if (cancelled) return;
      streaming = true;
      clearTimeout(connectTimer);
      setPhase("streaming");
    };
    // The video track can begin without a 'playing' event firing reliably, so
    // poll the element for real frames as a backstop.
    const framePoll = setInterval(() => {
      const v = document.getElementById(VIDEO_ID);
      if (v && v.videoWidth > 0 && !v.paused) markStreaming();
    }, 1000);
    const connectTimer = setTimeout(() => {
      if (cancelled || streaming) return;
      setPhase("error");
      setDetail(
        t("Couldn't get a picture — the live renderer serves one interactive viewer at a time and is likely busy (or still warming up). Try again in a moment.")
      );
      try { AppStreamer.stop(); } catch { /* nothing to stop */ }
    }, CONNECT_TIMEOUT_MS);

    AppStreamer.connect({
      streamSource: StreamType.DIRECT,
      streamConfig: {
        videoElementId: VIDEO_ID,
        audioElementId: AUDIO_ID,
        authenticate: true,
        maxReconnects: 20,
        signalingServer: server,
        signalingPort: port,
        mediaServer: server,
        nativeTouchEvents: true,
        width: 1920,
        height: 1080,
        fps: 60,
        onStart: () => {
          const p = document.getElementById(VIDEO_ID);
          if (p) {
            p.tabIndex = -1;
            p.playsInline = true;
            p.muted = true;
            p.play().catch(() => {});
          }
        },
        onUpdate: () => {},
        onCustomEvent: () => {},
        onStop: () => {},
        onTerminate: () => {
          if (cancelled) return;
          setPhase((ph) => (ph === "streaming" ? "error" : ph));
          setDetail(
            t("The live stream ended — the twin renderer serves one interactive viewer at a time and may be busy. Try again in a moment.")
          );
        },
      },
    }).catch((err) => {
      if (cancelled) return;
      setPhase("error");
      setDetail(String(err?.info ?? err?.message ?? t("Could not reach the live twin stream server.")));
    });

    return () => {
      cancelled = true;
      startedRef.current = false;
      clearInterval(framePoll);
      clearTimeout(connectTimer);
      try { AppStreamer.stop(); } catch { /* never started */ }
    };
  }, [stream, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    setDetail("");
    setPhase("connecting");
    setAttempt((n) => n + 1); // cleanup stops the old peer, effect re-connects
  };

  const cameras = stream?.cameras || [];
  const goCamera = (path) => {
    try {
      AppStreamer.sendMessage(JSON.stringify({ event_type: "setCameraRequest", payload: { camera: path } }));
    } catch { /* stream not ready */ }
  };

  return (
    <div className="tw-live">
      <div className="tw-live-stage">
        <video id={VIDEO_ID} className="tw-live-video" playsInline muted />
        <audio id={AUDIO_ID} autoPlay style={{ display: "none" }} />

        {phase !== "streaming" && (
          <div className="tw-live-overlay">
            {phase === "connecting" && (
              <>
                <div className="tw-spin" />
                <div className="tw-live-msg">{t("Connecting to live 3D stream…")}</div>
                <div className="tw-live-sub">{t("Starting the RTX render on the port GPU server")}</div>
              </>
            )}
            {phase === "error" && (
              <>
                <div className="tw-live-err">⚠</div>
                <div className="tw-live-msg">{detail}</div>
                <div className="tw-live-actions">
                  <button type="button" className="tw-live-retry" onClick={retry}>
                    {t("Try again")}
                  </button>
                  <button type="button" className="tw-live-ghost" onClick={onClose}>
                    {t("Back to renders")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <span className="tw-badge tw-badge-live">● {t("LIVE 3D")}</span>
        <button type="button" className="tw-live-close" onClick={onClose} title={t("Exit live view")}>
          ✕ {t("Exit live")}
        </button>
      </div>

      {phase === "streaming" && (
        <div className="tw-live-bar">
          {cameras.length > 0 && (
            <>
              <span className="tw-live-camlabel">{t("Camera")}</span>
              {cameras.map((c) => (
                <button key={c.path} type="button" className="tw-live-cam" onClick={() => goCamera(c.path)}>
                  {t(c.label)}
                </button>
              ))}
            </>
          )}
          <span className="tw-live-hint">{t("Drag to orbit · scroll to zoom")}</span>
        </div>
      )}
    </div>
  );
}
