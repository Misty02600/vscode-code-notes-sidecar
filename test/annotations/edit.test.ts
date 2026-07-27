import { describe, expect, it } from "vitest";
import { updateAnnotationContentJson } from "../../src/annotations/edit";

const source = `${JSON.stringify(
  {
    version: 1,
    title: "Guide",
    annotations: [
      {
        id: "first",
        file: "src/a.ts",
        title: "Original",
        description: "Original description",
        range: { startLine: 1, endLine: 3 },
        tags: ["old"]
      },
      {
        id: "second",
        file: "src/a.ts",
        title: "Unchanged",
        description: "Keep me",
        range: { startLine: 5, endLine: 6 }
      }
    ]
  },
  null,
  2
)}\n`;

describe("updateAnnotationContentJson", () => {
  it("updates only editable annotation content", () => {
    const updated = updateAnnotationContentJson(source, "first", {
      title: "  Updated title  ",
      description: "Updated **Markdown**"
    });
    const document = JSON.parse(updated);

    expect(document.annotations[0]).toMatchObject({
      id: "first",
      file: "src/a.ts",
      title: "Updated title",
      description: "Updated **Markdown**",
      range: { startLine: 1, endLine: 3 }
    });
    expect(document.annotations[0]).not.toHaveProperty("tags");
    expect(document.annotations[1].title).toBe("Unchanged");
  });

  it("removes a legacy tags property when the card is saved", () => {
    const updated = updateAnnotationContentJson(source, "first", {
      title: "Original",
      description: "Original description"
    });

    expect(JSON.parse(updated).annotations[0]).not.toHaveProperty("tags");
  });

  it("returns unchanged JSON for a no-op save", () => {
    const cleanSource = `${JSON.stringify(
      {
        version: 1,
        annotations: [
          {
            id: "first",
            file: "src/a.ts",
            title: "Original",
            description: "Original description",
            range: { startLine: 1, endLine: 3 }
          }
        ]
      },
      null,
      2
    )}\n`;

    expect(
      updateAnnotationContentJson(cleanSource, "first", {
        title: "Original",
        description: "Original description"
      })
    ).toBe(cleanSource);
  });

  it("rejects an empty title", () => {
    expect(() =>
      updateAnnotationContentJson(source, "first", {
        title: "   ",
        description: "Description"
      })
    ).toThrow("title cannot be empty");
  });

  it("does not silently edit a missing annotation", () => {
    expect(() =>
      updateAnnotationContentJson(source, "missing", {
        title: "Title",
        description: "Description"
      })
    ).toThrow("no longer exists");
  });

  it("updates only the selected page when annotation ids repeat", () => {
    const pagedSource = `${JSON.stringify(
      {
        version: 1,
        pages: [
          {
            id: "reading",
            title: "Read it",
            annotations: [
              {
                id: "same",
                file: "src/a.ts",
                title: "Reading",
                description: "Meaning",
                range: { startLine: 1, endLine: 2 }
              }
            ]
          },
          {
            id: "decisions",
            title: "Decisions",
            annotations: [
              {
                id: "same",
                file: "src/a.ts",
                title: "Decision",
                description: "Reason",
                range: { startLine: 1, endLine: 2 }
              }
            ]
          }
        ]
      },
      null,
      2
    )}\n`;

    const updated = updateAnnotationContentJson(
      pagedSource,
      "same",
      { title: "Updated decision", description: "New reason" },
      "decisions"
    );
    const document = JSON.parse(updated);

    expect(document.pages[0].annotations[0].title).toBe("Reading");
    expect(document.pages[1].annotations[0]).toMatchObject({
      title: "Updated decision",
      description: "New reason"
    });
  });

  it("does not silently edit a missing page", () => {
    expect(() =>
      updateAnnotationContentJson(
        '{"version":1,"pages":[]}',
        "missing",
        { title: "Title", description: "Description" },
        "missing-page"
      )
    ).toThrow("page");
  });
});
