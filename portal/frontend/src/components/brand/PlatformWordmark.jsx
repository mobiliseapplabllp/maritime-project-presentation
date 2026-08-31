/* Platform wordmark — a neutral anchor-and-rule mark for the operations portal.
 * Deliberately carries no company identity: this build is a reference
 * deployment, not a named customer's system. */
export default function PlatformWordmark({ height = 30, mono, style }) {
  const fill = mono || 'currentColor';
  return (
    <svg viewBox="0 0 208 44" height={height} style={{ display: 'block', ...style }} aria-label="Maritime Operations">
      <text x="0" y="30" fill={fill} fontFamily="Archivo, Helvetica, Arial, sans-serif"
            fontWeight="800" fontSize="26" letterSpacing="-0.5">MARITIME</text>
      <rect x="0" y="37" width="146" height="3" rx="1.5" fill={fill} opacity="0.55" />
      <text x="152" y="30" fill={fill} fontFamily="'IBM Plex Mono', monospace"
            fontSize="11" letterSpacing="1.5" opacity="0.8">OPS</text>
    </svg>
  );
}
