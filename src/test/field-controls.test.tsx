import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldCameraPanel } from "@/components/mk/field-camera-panel";
import { cleanFieldCaps, cleanFieldCtl, fieldCapsOf, fieldCtlOf, videoConstraintsOf, type FieldCaps, type FieldCtl } from "@/lib/mk/field-link";

describe("field camera + mic commands", () => {
  it("keeps only valid values from the network", () => {
    expect(cleanFieldCtl({ zoom: 2.5, torch: true, focus: "manual", exposure: "bogus", wb: "continuous", facing: "user", echoCancellation: true, evil: 1 })).toEqual({
      zoom: 2.5,
      torch: true,
      focus: "manual",
      wb: "continuous",
      facing: "user",
      echoCancellation: true,
    });
    expect(cleanFieldCtl({ zoom: "9", colorTemp: 5, exposureComp: Infinity, facing: "sideways" })).toEqual({});
    expect(cleanFieldCtl(null)).toEqual({});
  });

  it("turns what a phone reports into the controls the director sees", () => {
    const caps = fieldCapsOf(
      { zoom: { min: 1, max: 8, step: 0.1 }, torch: true, focusMode: ["continuous", "manual", "nonsense"], exposureCompensation: { min: -2, max: 2, step: 0.5 } },
      { echoCancellation: [true, false] },
      { noiseSuppression: false },
      true,
    );
    expect(caps).toEqual({
      zoom: { min: 1, max: 8, step: 0.1 },
      torch: true,
      focus: ["continuous", "manual"],
      exposureComp: { min: -2, max: 2, step: 0.5 },
      flip: true,
      mic: { echoCancellation: true, noiseSuppression: true, autoGainControl: undefined },
    });
  });

  it("ignores a broken capability list", () => {
    expect(cleanFieldCaps("nope")).toBeNull();
    expect(cleanFieldCaps({ zoom: { min: 5, max: 1 } })).toEqual({});
  });

  it("reads the camera's current state back", () => {
    expect(fieldCtlOf({ zoom: 3, torch: false, focusMode: "continuous", exposureMode: "none" }, { echoCancellation: false }, "environment")).toEqual({
      zoom: 3,
      torch: false,
      focus: "continuous",
      facing: "environment",
      echoCancellation: false,
    });
  });

  it("builds one standalone constraint per camera setting, modes first", () => {
    expect(videoConstraintsOf({ zoom: 2, focus: "manual", torch: true, facing: "user", echoCancellation: true })).toEqual([{ focusMode: "manual" }, { zoom: 2 }, { torch: true }]);
    expect(videoConstraintsOf({})).toEqual([]);
  });
});

describe("director camera panel", () => {
  afterEach(cleanup);
  const caps: FieldCaps = { zoom: { min: 1, max: 5, step: 0.1 }, torch: true, focus: ["continuous", "manual"], flip: true, mic: { noiseSuppression: true } };

  it("shows only what the phone can do and sends just what changed", () => {
    const changes: FieldCtl[] = [];
    render(<FieldCameraPanel caps={caps} ctl={{ zoom: 1 }} online onChange={(p) => changes.push(p)} />);
    expect(screen.getByText("ZOOM")).toBeTruthy();
    expect(screen.queryByText("WHITE BALANCE")).toBeNull();
    expect(screen.queryByText(/ECHO CANCEL/)).toBeNull();
    fireEvent.click(screen.getByLabelText("ZOOM up"));
    fireEvent.click(screen.getByText(/TORCH/));
    fireEvent.click(screen.getByText("FRONT (SELFIE)"));
    fireEvent.click(screen.getByText("MANUAL"));
    fireEvent.click(screen.getByText(/NOISE REDUCE/));
    expect(changes).toEqual([{ zoom: 1.5 }, { torch: true }, { facing: "user" }, { focus: "manual" }, { noiseSuppression: true }]);
  });

  it("explains itself while the phone is offline or cannot do remote controls", () => {
    const { rerender } = render(<FieldCameraPanel caps={null} ctl={{}} online={false} onChange={() => {}} />);
    expect(screen.getByText(/appear when the reporter's phone is online/)).toBeTruthy();
    rerender(<FieldCameraPanel caps={{}} ctl={{}} online onChange={() => {}} />);
    expect(screen.getByText(/does not allow remote zoom/)).toBeTruthy();
  });

  it("resets zoom, torch and automatic modes", () => {
    const onChange = vi.fn();
    render(<FieldCameraPanel caps={caps} ctl={{ zoom: 4, torch: true, focus: "manual" }} online onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByText("RESET"));
    });
    expect(onChange).toHaveBeenCalledWith({ zoom: 1, torch: false, focus: "continuous" });
  });
});
