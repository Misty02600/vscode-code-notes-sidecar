export interface CardPlacementInput {
  sourceLine: number;
  height: number;
}

export interface CardPlacement {
  top: number;
}

export interface AnnotationCardLayout {
  placements: CardPlacement[];
  sourceOrigin: number;
}

export function layoutAnnotationCards(
  cards: readonly CardPlacementInput[],
  lineHeight: number,
  gap = 16
): AnnotationCardLayout {
  const safeLineHeight = Math.max(8, lineHeight || 21);
  const firstCard = cards[0];
  const sourceOrigin = firstCard
    ? Math.max(0, firstCard.sourceLine * safeLineHeight)
    : 0;
  let nextTop = 0;

  const placements = cards.map(card => {
    const height = Math.max(0, card.height);
    const sourceTop = Math.max(0, card.sourceLine * safeLineHeight);
    const idealTop = Math.max(0, sourceTop - sourceOrigin);
    const top = Math.max(idealTop, nextTop);

    nextTop = top + height + gap;
    return { top };
  });

  return { placements, sourceOrigin };
}
