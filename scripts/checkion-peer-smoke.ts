import {
  captureCheckionFullPage,
  checkionConfig,
  checkionPeerReadyReason,
  jpegDimensions
} from "../src/checkion-client.js";

async function main() {
  const cfg = checkionConfig();
  const reason = checkionPeerReadyReason(cfg);
  console.log(`ready_reason=${JSON.stringify(reason)}`);
  if (reason) process.exit(2);
  const shot = await captureCheckionFullPage("https://example.com/", cfg);
  const dims = jpegDimensions(shot.bytes);
  console.log(
    JSON.stringify({
      scanId: shot.scanId,
      bytes: shot.bytes.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      contentType: shot.contentType
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
