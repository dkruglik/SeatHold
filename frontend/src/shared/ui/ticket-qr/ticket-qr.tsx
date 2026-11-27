import { Code, Stack, Text } from "@mantine/core";
import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";

const payloadPrefix = "SEATHOLD:";
const qrSizePx = 160;

type QrState = { readonly kind: "loading" } | { readonly kind: "ready"; readonly src: string } | { readonly kind: "failed" };

/**
 * The ticket as a QR code (payload `SEATHOLD:<code>`), drawn in the browser into an image. The code is also printed as
 * text, so it can be copied or read out when the QR cannot be scanned.
 */
export function TicketQr({ code }: { readonly code: string }) {
  const [state, setState] = useState<QrState>({ kind: "loading" });

  useEffect(() => {
    let current = true;
    setState({ kind: "loading" });
    toDataURL(`${payloadPrefix}${code}`, { margin: 1, errorCorrectionLevel: "M" }).then(
      (src) => current && setState({ kind: "ready", src }),
      () => current && setState({ kind: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [code]);

  return (
    <Stack gap={4} align="center">
      {state.kind === "ready" ? (
        <img src={state.src} alt={`QR code for ticket ${code}`} width={qrSizePx} height={qrSizePx} />
      ) : null}
      {state.kind === "failed" ? <Text size="sm">QR code unavailable, use the code below.</Text> : null}
      <Code fz="sm" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{code}</Code>
    </Stack>
  );
}
