import { describe, expect, it } from "vitest";
import { currentRevision, savePersonPost } from "./posts";

describe("person blog pages", () => {
  it("keeps one page per normalized person name and appends revisions", () => {
    const firstSave = savePersonPost(
      [],
      {
        personName: "  Ásta Jónsdóttir ",
        title: "A first story",
        excerpt: "First excerpt",
        content: "First version",
      },
      "2026-09-28T10:00:00.000Z",
    );
    const secondSave = savePersonPost(
      firstSave,
      {
        personName: "ásta   jónsdóttir",
        title: "An updated story",
        excerpt: "Updated excerpt",
        content: "Second version",
      },
      "2026-09-28T11:00:00.000Z",
    );

    expect(secondSave).toHaveLength(1);
    expect(secondSave[0].slug).toBe("asta-jonsdottir");
    expect(secondSave[0].revisions).toHaveLength(2);
    expect(currentRevision(secondSave[0])?.content).toBe("Second version");
    expect(secondSave[0].revisions[0].content).toBe("First version");
  });

  it("keeps generated page slugs unique", () => {
    const first = savePersonPost(
      [],
      {
        personName: "Ada Lovelace",
        title: "Notes",
        excerpt: "",
        content: "",
      },
      "2026-09-28T10:00:00.000Z",
    );
    const second = savePersonPost(
      first,
      {
        personName: "Ada-Lovelace",
        title: "Another Ada",
        excerpt: "",
        content: "",
      },
      "2026-09-28T10:00:00.000Z",
    );

    expect(second.map((post) => post.slug)).toEqual([
      "ada-lovelace-2",
      "ada-lovelace",
    ]);
  });
});
