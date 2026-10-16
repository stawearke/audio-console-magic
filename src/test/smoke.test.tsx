import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Console } from "@/components/console/Console";

describe("console smoke", () => {
  it("renders every tab", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    render(<Console />);
    for (const t of ["Channel", "FX", "Patch", "Setup", "Mixer"]) fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t}$`, "i") }));
    expect(screen.getAllByText("VOICE").length).toBeGreaterThan(0);
  });
});
