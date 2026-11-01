import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks every line of identical text as the same", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("finds a changed line between unchanged ones", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles only additions and only removals", () => {
    expect(diffLines("a", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "added", text: "b" },
    ]);
    expect(diffLines("a\nb", "b")).toEqual([
      { kind: "removed", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("keeps lines that moved past a change in common", () => {
    expect(
      diffLines("a\nb\nc\nd", "x\nb\ny\nd\nz").filter(
        (line) => line.kind === "same",
      ),
    ).toEqual([
      { kind: "same", text: "b" },
      { kind: "same", text: "d" },
    ]);
  });

  it("shows enormous differences as a whole replacement", () => {
    const old = Array.from({ length: 2001 }, (_, i) => `old ${i}`).join("\n");
    const updated = Array.from({ length: 2001 }, (_, i) => `new ${i}`).join(
      "\n",
    );

    const lines = diffLines(old, updated);

    expect(lines).toHaveLength(4002);
    expect(lines[0].kind).toBe("removed");
    expect(lines[4001].kind).toBe("added");
  });
});
