import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toDataURL } from "qrcode";
import { theme } from "../../../app/theme";
import { TicketQr } from "./ticket-qr";

vi.mock("qrcode", () => ({ toDataURL: vi.fn() }));

const toDataUrl = vi.mocked(toDataURL) as unknown as ReturnType<typeof vi.fn>;

function renderQr(code: string) {
  return render(
    <MantineProvider theme={theme} env="test">
      <TicketQr code={code} />
    </MantineProvider>,
  );
}

describe("TicketQr", () => {
  beforeEach(() => {
    toDataUrl.mockReset();
    toDataUrl.mockResolvedValue("data:image/png;base64,AAAA");
  });

  it("shows a QR image with a descriptive alt text and the code as copyable text", async () => {
    renderQr("ABC123");

    const image = await screen.findByRole("img", { name: "QR code for ticket ABC123" });
    expect(image.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(screen.getByText("ABC123")).toBeTruthy();
  });

  it("encodes the payload SEATHOLD:<code>", async () => {
    renderQr("ABC123");

    await screen.findByRole("img");
    expect(toDataUrl).toHaveBeenCalledWith("SEATHOLD:ABC123", expect.objectContaining({ errorCorrectionLevel: "M", margin: 1 }));
  });

  it("keeps the code visible when the QR cannot be drawn", async () => {
    toDataUrl.mockRejectedValue(new Error("boom"));
    renderQr("ABC123");

    expect(await screen.findByText("QR code unavailable, use the code below.")).toBeTruthy();
    expect(screen.getByText("ABC123")).toBeTruthy();
  });
});
