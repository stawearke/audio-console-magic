import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldReturnPanel, QUICK_CUES } from "@/components/mk/field-return-panel";
import { CUE_MAX, cleanBattery, cleanCue, cleanLevel, isFieldTally } from "@/lib/mk/field-link";

describe("field return channel helpers", () => {
  it("cleans cue text from the network", () => {
    expect(cleanCue("  STAND\u0000 BY \n\n now ")).toBe("STAND BY now");
    expect(cleanCue(42)).toBe("");
    expect(cleanCue("x".repeat(500))).toHaveLength(CUE_MAX);
  });

  it("accepts only real tally states", () => {
    expect(["program", "preview", "off"].every(isFieldTally)).toBe(true);
    expect(isFieldTally("red")).toBe(false);
  });

  it("reads battery and mic level safely", () => {
    expect(cleanBattery({ level: 63.4, charging: true })).toEqual({ level: 63, charging: true });
    expect(cleanBattery({ level: 140 })).toBeNull();
    expect(cleanBattery("x")).toBeNull();
    expect(cleanLevel(3)).toBe(1);
    expect(cleanLevel(-1)).toBe(0);
    expect(cleanLevel("loud")).toBe(0);
  });
});

describe("director return panel", () => {
  afterEach(cleanup);

  it("sends quick and typed cues, and shows when the reporter has seen one", () => {
    const sent: string[] = [];
    const onCue = vi.fn((t: string) => {
      sent.push(t);
      return sent.length;
    });
    const { rerender } = render(<FieldReturnPanel online talking={false} ack={0} onCue={onCue} onTalk={async () => null} />);
    fireEvent.click(screen.getByText(QUICK_CUES[0]));
    expect(screen.getByText(/waiting for the reporter to tap OK/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cue text"), { target: { value: "  Ask about the bridge  " } });
    fireEvent.click(screen.getByText("SEND"));
    expect(sent).toEqual(["STAND BY", "  Ask about the bridge  "]);
    rerender(<FieldReturnPanel online talking={false} ack={2} onCue={onCue} onTalk={async () => null} />);
    expect(screen.getByText(/seen by the reporter/)).toBeTruthy();
  });

  it("says so when the phone is offline and the cue cannot be sent", () => {
    render(<FieldReturnPanel online talking={false} ack={0} onCue={() => 0} onTalk={async () => null} />);
    fireEvent.click(screen.getByText(QUICK_CUES[1]));
    expect(screen.getByText(/phone is offline/)).toBeTruthy();
  });

  it("turns talkback on and off, and reports a refused microphone", async () => {
    const onTalk = vi.fn(async (on: boolean) => (on ? "Allow this browser to use your microphone to talk to the reporter." : null));
    const { rerender } = render(<FieldReturnPanel online talking={false} ack={0} onCue={() => 0} onTalk={onTalk} />);
    fireEvent.click(screen.getByText(/TALK \(YOUR VOICE/));
    await waitFor(() => expect(screen.getByText(/Allow this browser/)).toBeTruthy());
    expect(onTalk).toHaveBeenCalledWith(true);
    rerender(<FieldReturnPanel online talking ack={0} onCue={() => 0} onTalk={onTalk} />);
    fireEvent.click(screen.getByText(/TAP TO STOP/));
    expect(onTalk).toHaveBeenLastCalledWith(false);
  });

  it("disables cues while the reporter is offline", () => {
    render(<FieldReturnPanel online={false} talking={false} ack={0} onCue={() => 1} onTalk={async () => null} />);
    expect((screen.getByText(QUICK_CUES[0]) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("SEND") as HTMLButtonElement).disabled).toBe(true);
  });
});
