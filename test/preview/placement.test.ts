import { describe, expect, it } from "vitest";
import { layoutAnnotationCards } from "../../src/preview/placement";

describe("layoutAnnotationCards", () => {
  it("removes leading whitespace before the first card", () => {
    const layout = layoutAnnotationCards([{ sourceLine: 24.5, height: 160 }], 20);

    expect(layout).toEqual({
      placements: [{ top: 0 }],
      sourceOrigin: 420
    });
  });

  it("preserves relative source distance after normalizing the page origin", () => {
    const layout = layoutAnnotationCards(
      [
        { sourceLine: 9.5, height: 80 },
        { sourceLine: 19.5, height: 80 }
      ],
      20
    );

    expect(layout.placements).toEqual([{ top: 0 }, { top: 200 }]);
    expect(layout.sourceOrigin).toBe(160);
  });

  it("keeps cards from overlapping when source ranges collide", () => {
    const layout = layoutAnnotationCards(
      [
        { sourceLine: 9.5, height: 80 },
        { sourceLine: 9.5, height: 80 }
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
