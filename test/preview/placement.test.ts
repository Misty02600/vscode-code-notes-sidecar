import { describe, expect, it } from "vitest";
import { layoutAnnotationCards } from "../../src/preview/placement";

describe("layoutAnnotationCards", () => {
  it("removes leading whitespace before the first card", () => {
    const layout = layoutAnnotationCards([{ sourceLine: 24, height: 160 }], 20);

    expect(layout).toEqual({
      placements: [{ top: 0 }],
      sourceOrigin: 480
    });
  });

  it("aligns card tops to source starts after normalizing the page origin", () => {
    const layout = layoutAnnotationCards(
      [
        { sourceLine: 9, height: 80 },
        { sourceLine: 19, height: 80 }
      ],
      20
    );

    expect(layout.placements).toEqual([{ top: 0 }, { top: 200 }]);
    expect(layout.sourceOrigin).toBe(180);
  });

  it("keeps later source anchors stable when an earlier card changes height", () => {
    const collapsed = layoutAnnotationCards(
      [
        { sourceLine: 10, height: 40 },
        { sourceLine: 30, height: 40 }
      ],
      20
    );
    const expanded = layoutAnnotationCards(
      [
        { sourceLine: 10, height: 180 },
        { sourceLine: 30, height: 40 }
      ],
      20
    );

    expect(collapsed.placements[1]).toEqual({ top: 400 });
    expect(expanded.placements[1]).toEqual({ top: 400 });
  });

  it("keeps cards from overlapping when source ranges collide", () => {
    const layout = layoutAnnotationCards(
      [
        { sourceLine: 9, height: 80 },
        { sourceLine: 9, height: 80 }
      ],
      20
    );

    expect(layout.placements).toEqual([{ top: 0 }, { top: 96 }]);
  });

  it("handles an empty page", () => {
    expect(layoutAnnotationCards([], 20)).toEqual({
      placements: [],
      sourceOrigin: 0
    });
  });
});
