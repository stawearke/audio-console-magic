import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecButton, RecChip, RecordingsPanel, RecRemote, RecSpace, RecStatusLine } from "@/components/mk/field-recordings";
import {
  LOW_SPACE_BYTES,
  memoryStore,
  REC_IDLE,
  type RecMeta,
  type RecStatus,
  type RecStore,
} from "@/lib/mk/field-record";

const meta = (o: Partial<RecMeta> = {}): RecMeta => ({
  id: "a",
  name: "FIELD 1 Ryan",
  startedAt: new Date(2026, 10, 18, 14, 32).getTime(),
  endedAt: new Date(2026, 10, 18, 15, 2).getTime(),
  mime: "video/mp4",
  parts: 1,
  bytes: 2_700_000_000,
  ...o,
});
/** A recording that never finished (still running, or cut short): no end time at all. */
const unfinished = (o: Partial<RecMeta> = {}): RecMeta => {
  const { endedAt: _gone, ...rest } = meta(o);
  return rest;
};
const running: RecStatus = { on: true, bytes: 48_000_000, ms: 65_000, parts: 1, error: "" };

describe("director's REC chip", () => {
  afterEach(cleanup);
  it("shows only while the phone is recording", () => {
    const { container, rerender } = render(<RecChip on={false} />);
    expect(container.textContent).toBe("");
    rerender(<RecChip on />);
    expect(container.textContent).toBe("REC");
  });
});

describe("phone's recording line", () => {
  afterEach(cleanup);
  it("is empty when idle and fine", () => {
    const { container } = render(<RecStatusLine status={REC_IDLE} />);
    expect(container.textContent).toBe("");
  });
  it("shows time and size, and the parts once there are several", () => {
    const { rerender } = render(<RecStatusLine status={running} />);
    expect(screen.getByTestId("rec-status").textContent).toContain("Backup recording 1:05 · 48 MB");
    expect(screen.getByTestId("rec-status").textContent).not.toMatch(/parts/);
    rerender(<RecStatusLine status={{ ...running, parts: 3 }} />);
    expect(screen.getByTestId("rec-status").textContent).toContain("3 parts");
  });
  it("tells the reporter why it stopped", () => {
    render(
      <RecStatusLine
        status={{ ...REC_IDLE, error: "The phone is almost out of space. Recording stopped." }}
      />,
    );
    expect(screen.getByTestId("rec-status").textContent).toContain("almost out of space");
    expect(screen.getByTestId("rec-status").textContent).not.toMatch(/Backup recording/);
  });
});

describe("saved backups on the phone", () => {
  let store: RecStore;
  beforeEach(async () => {
    store = memoryStore();
    await store.begin(meta());
    await store.append("a", 0, 0, new Blob(["abc"]));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  const panel = (over: Partial<Parameters<typeof RecordingsPanel>[0]> = {}) =>
    render(
      <RecordingsPanel store={store} status={REC_IDLE} {...over} />,
    );

  it("says so on a browser that cannot keep recordings", () => {
    panel({ store: null });
    expect(screen.getByTestId("rec-panel").textContent).toMatch(/cannot keep a backup/);
  });

  it("lists what is saved, with length and size", async () => {
    await store.begin(
      meta({
        id: "b",
        name: "FIELD 1 Ryan",
        startedAt: new Date(2026, 10, 19, 9, 0).getTime(),
        endedAt: new Date(2026, 10, 19, 9, 10).getTime(),
        parts: 3,
        bytes: 900_000_000,
      }),
    );
    panel();
    const rows = await screen.findAllByTestId("rec-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("10:00 · 900 MB · 3 parts"); // newest first
    expect(rows[1]!.textContent).toContain("30:00 · 2.7 GB");
  });

  it("marks a recording that was cut short as still saved", async () => {
    await store.begin(
      unfinished({
        id: "c",
        startedAt: new Date(2026, 10, 20).getTime(),
        bytes: 10_000_000,
      }),
    );
    panel();
    expect((await screen.findAllByTestId("rec-row"))[0]!.textContent).toContain(
      "cut short (still saved)",
    );
  });

  it("will not save or delete the recording that is running right now", async () => {
    await store.begin(
      unfinished({
        id: "now",
        startedAt: new Date(2026, 10, 21).getTime(),
        bytes: 1000,
      }),
    );
    panel({ status: running });
    const row = (await screen.findAllByTestId("rec-row"))[0]!;
    expect(row.textContent).toContain("recording now");
    for (const b of row.querySelectorAll("button"))
      expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("shares a backup through the phone's share sheet", async () => {
    const share = vi.fn(async (_d: ShareData) => {});
    Object.assign(navigator, { canShare: () => true, share });
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "SAVE / SHARE" }));
    await screen.findByText("Sent.");
    const files = (share.mock.calls[0]![0] as unknown as { files: File[] }).files;
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("FIELD-1-Ryan_2026-11-18_1432.mp4");
  });

  it("deletes a backup only after the reporter confirms", async () => {
    panel();
    const del = await screen.findByRole("button", { name: "DELETE" });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(del);
    expect(await store.list()).toHaveLength(1);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(del);
    await waitFor(async () => expect(await store.list()).toHaveLength(0));
    await screen.findByText("No backups yet.");
  });
});

describe("the reporter's REC button", () => {
  afterEach(cleanup);
  it("starts the backup only when pressed, and stops it only when pressed again", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RecButton on={false} onToggle={onToggle} />);
    expect(screen.getByTestId("rec-button").textContent).toBe("REC");
    fireEvent.click(screen.getByTestId("rec-button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<RecButton on onToggle={onToggle} />);
    expect(screen.getByTestId("rec-button").textContent).toBe("STOP REC");
  });
  it("cannot be pressed when the phone cannot record", () => {
    render(<RecButton on={false} disabled onToggle={() => {}} />);
    expect((screen.getByTestId("rec-button") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("space left for the backup", () => {
  afterEach(cleanup);
  it("says nothing when the browser will not say how much room there is", () => {
    const { container } = render(<RecSpace freeBytes={null} kbps={8000} />);
    expect(container.textContent).toBe("");
  });
  it("shows how long the phone can record, and turns amber when it is short", () => {
    const { rerender } = render(<RecSpace freeBytes={LOW_SPACE_BYTES + 6_096_000_000} kbps={8000} />);
    expect(screen.getByTestId("rec-space").textContent).toContain("about 1.7 h");
    expect(screen.getByTestId("rec-space").className).not.toContain("amber");
    rerender(<RecSpace freeBytes={LOW_SPACE_BYTES + 1_000_000_000} kbps={8000} />);
    expect(screen.getByTestId("rec-space").textContent).toContain("about 16 min");
    expect(screen.getByTestId("rec-space").className).toContain("amber");
  });
});

describe("the director's REC control", () => {
  afterEach(cleanup);
  it("starts the phone's backup, and shows STOP REC while it runs", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RecRemote online on={false} onToggle={onToggle} />);
    expect(screen.getByTestId("rec-remote").textContent).toBe("REC");
    fireEvent.click(screen.getByTestId("rec-remote"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<RecRemote online on onToggle={onToggle} />);
    expect(screen.getByTestId("rec-remote").textContent).toBe("STOP REC");
  });
  it("cannot be pressed when the reporter's phone is offline", () => {
    render(<RecRemote online={false} on={false} onToggle={() => {}} />);
    expect((screen.getByTestId("rec-remote") as HTMLButtonElement).disabled).toBe(true);
  });
});
