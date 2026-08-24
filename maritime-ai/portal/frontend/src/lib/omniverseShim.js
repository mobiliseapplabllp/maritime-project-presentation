// Build-time shim for @nvidia/omniverse-webrtc-streaming-library.
// The vendored package ships only its package.json here (dist/ was stripped from
// this snapshot), which breaks `vite build`. This shim keeps the same API surface
// so LiveTwin compiles and fails gracefully at runtime with its friendly
// "renderer busy / unreachable" state. Restore the real dist/ under
// vendor/omniverse-webrtc-streaming-library/ and drop the alias in
// vite.config.js to re-enable live streaming.

export const StreamType = Object.freeze({ DIRECT: "direct", GFN: "gfn", LOCAL: "local" });

export const AppStreamer = {
  connect() {
    return Promise.reject(new Error(
      "Live twin streaming library not bundled in this build — the render server is unreachable."));
  },
  stop() { /* nothing to stop */ },
  sendMessage() { /* stream not available */ },
};

export default { AppStreamer, StreamType };
