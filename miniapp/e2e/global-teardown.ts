export default async function teardown() {
  const ports = [process.env.MINIAPP_E2E_API_PORT ?? '8017', process.env.MINIAPP_E2E_PREVIEW_PORT ?? '4174'];
  for (const port of ports) {
    try {
      await fetch(`http://127.0.0.1:${port}/__test/shutdown`, { method: 'POST', signal: AbortSignal.timeout(3_000) });
    } catch {
      // A failed startup may never have opened the loopback fixture port.
    }
  }
}
