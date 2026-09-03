/** Browser capabilities an app can opt into via next.user-config.ts. */
export type AppCapabilities = {
  /** getUserMedia({ audio }), MediaRecorder — voice recording. */
  microphone?: boolean;
  /** getUserMedia({ video }) — video calls, QR scan, photo capture. */
  camera?: boolean;
  /** navigator.geolocation — "near me", maps. */
  geolocation?: boolean;
};

/**
 * Build the `Permissions-Policy` header value. With no opt-ins this returns the
 * fully locked-down default: `camera=(), microphone=(), geolocation=(),
 * browsing-topics=()`. Each capability set to `true` becomes `<feature>=(self)`.
 */
export function buildPermissionsPolicy(caps: AppCapabilities = {}): string {
  const token = (on: boolean | undefined) => (on ? '(self)' : '()');
  return [
    `camera=${token(caps.camera)}`,
    `microphone=${token(caps.microphone)}`,
    `geolocation=${token(caps.geolocation)}`,
    'browsing-topics=()',
  ].join(', ');
}
