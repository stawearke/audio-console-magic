import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reporterUrl, viewerUrl } from "@/lib/mk/field-link";

// No network in tests: the connection server is replaced by one that never answers.
vi.mock("peerjs", () => ({
  Peer: class {
    destroyed = false;
    disconnected = false;
    on() {}
    connect() {
      return { on() {}, close() {} };
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));

import { UnitsDesk } from "@/components/mk/units-desk";
import { fieldUnits } from "@/lib/mk/field-units";

describe("field links", () => {
  it("builds the reporter and OBS addresses", () => {
    expect(reporterUrl("https://app.example/", "abc123", 2, "Ryan", "Kisumu")).toBe(
      "https://app.example/field?room=abc123&unit=2&name=Ryan&loc=Kisumu",
    );
    expect(reporterUrl("https://app.example", "abc123", 3, "", "")).toBe("https://app.example/field?room=abc123&unit=3");
    expect(viewerUrl("https://app.example/", "abc123", 2)).toBe("https://app.example/field-view?room=abc123&unit=2");
  });
});

describe("Field units page", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("adds a unit with name and place, numbering from 1", async () => {
    render(<UnitsDesk />);
    fireEvent.change(screen.getByPlaceholderText(/^Name/), { target: { value: "Ryan" } });
    fireEvent.change(screen.getByPlaceholderText(/^Location/), { target: { value: "Kisumu" } });
    await act(async () => {
      fireEvent.click(screen.getByText("ADD"));
    });
    expect(screen.getByText("FIELD 1")).toBeTruthy();
    expect(screen.getByText("Send link")).toBeTruthy();
    expect(fieldUnits.snapshot().units).toEqual([{ n: 1, name: "Ryan", loc: "Kisumu" }]);
  });
});
