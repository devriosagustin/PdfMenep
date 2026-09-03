export function HeadContent({ nonce }: { nonce?: string }) {
  void nonce;
  return (
    <>
      <link rel="manifest" href="/pwa.webmanifest" />
      <link rel="apple-touch-icon" href="/icon-180.png" sizes="180x180" />
    </>
  );
}
