/* Adani wordmark — lowercase "adani" drawn as round-capped strokes with the
 * brand gradient (#0B74B0 → #75479C → #BD3861). Drawn as paths (no font
 * dependency) so it renders identically in the app, exports and slides.
 * To use the official asset instead, replace this component's SVG body. */

let uid = 0;

export default function AdaniWordmark({ height = 30, mono, style }) {
  const id = `adg${++uid}`;
  const stroke = mono ? mono : `url(#${id})`;
  return (
    <svg viewBox="0 -9 208 66" height={height} style={{ display: 'block', ...style }} aria-label="adani">
      {!mono && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="208" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0B74B0" />
            <stop offset="0.5" stopColor="#75479C" />
            <stop offset="1" stopColor="#BD3861" />
          </linearGradient>
        </defs>
      )}
      <g stroke={stroke} strokeWidth="11" strokeLinecap="round" fill="none">
        {/* a */}
        <circle cx="20" cy="30" r="14.5" />
        <path d="M 34.5 15.5 L 34.5 44.5" />
        {/* d */}
        <circle cx="69" cy="30" r="14.5" />
        <path d="M 83.5 5.5 L 83.5 44.5" />
        {/* a */}
        <circle cx="118" cy="30" r="14.5" />
        <path d="M 132.5 15.5 L 132.5 44.5" />
        {/* n */}
        <path d="M 152.5 44.5 L 152.5 15.5" />
        <path d="M 152.5 30 A 14.5 14.5 0 0 1 181.5 30 L 181.5 44.5" />
        {/* i */}
        <path d="M 201.5 15.5 L 201.5 44.5" />
      </g>
      <circle cx="201.5" cy="-2" r="5.5" fill={mono || '#BD3861'} />
    </svg>
  );
}
