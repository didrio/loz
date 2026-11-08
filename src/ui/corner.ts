/**
 * The HUD's top-right corner (T47): a round picture, the time under it, then the place's name. Outdoors and in
 * houses the picture is the sky dial and the time shows; in a dungeon (time stands still there) it is a still render of
 * the dungeon's iconic view and the time text is gone. Pure, so a test can pin it.
 */
export interface CornerView {
  /** Show the dungeon's picture (true) or the sky dial (false). */
  picture: boolean;
  showTime: boolean;
  /** The place's name, trimmed; empty hides the line. */
  name: string;
}

/** `place`: the current area's name where Wren stands; `portrait`: the dungeon's rendered picture (a URL), null elsewhere. */
export function cornerView(place: string, portrait: string | null): CornerView {
  return { picture: !!portrait, showTime: !portrait, name: place.trim() };
}
