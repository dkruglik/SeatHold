import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontendConfigProvider, useFrontendConfig } from "./config-context";

function Probe() {
  return <p>{`poll ${useFrontendConfig().seatPollIntervalMs}`}</p>;
}

describe("useFrontendConfig", () => {
  it("returns the config of the provider", () => {
    render(
      <FrontendConfigProvider config={{ apiBaseUrl: "/api", seatPollIntervalMs: 1234 }}>
        <Probe />
      </FrontendConfigProvider>,
    );

    expect(screen.getByText("poll 1234")).toBeTruthy();
  });

  it("falls back to the defaults without a provider", () => {
    render(<Probe />);

    expect(screen.getByText("poll 3000")).toBeTruthy();
  });
});
