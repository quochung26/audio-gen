/**
 * Where a chapter ends.
 *
 * Scenes are outlined one at a time, each knowing only what came before it, so something
 * has to tell a scene whether it is closing the chapter or leaving room. That has been a
 * guess: the third scene was told "this is the LAST scene, land it" because
 * `SCENES_PER_CHAPTER` is three, and a chapter that genuinely needed five was told to
 * land three times and then told to "close it out" at four, five and six.
 *
 * Which scene ends a chapter is the same kind of fact as which episode ends a story: not
 * something readable off the data, because the next scene is always one button away. So
 * it is said, or it is guessed — and when it is said, the guess stops.
 *
 * Null is the ordinary state and keeps exactly the old behaviour. Most chapters run to
 * about three scenes and nobody needs to say so.
 */

export interface ScenePositionInput {
  /** The scene being outlined, 1-based. */
  sceneNumber: number;
  /** The scene this chapter ends on, if the writer has said. */
  endsAtScene: number | null;
  /** The usual length, used only when nobody has said. */
  scenesPerChapter: number;
}

/**
 * What this scene's place in the chapter obliges it to do.
 *
 * Sequential outlining's one real failure mode: with only the past in front of it, a
 * model resolves everything and the chapter ends three times. The note is what stops
 * that — which is why it matters that it stops being a guess as soon as anyone knows
 * better.
 */
export function scenePosition(input: ScenePositionInput): string {
  const { sceneNumber, endsAtScene, scenesPerChapter } = input;

  if (endsAtScene !== null) {
    if (sceneNumber < endsAtScene) {
      const left = endsAtScene - sceneNumber;
      return (
        `${left} more scene${left === 1 ? "" : "s"} come${left === 1 ? "s" : ""} after this ` +
        `one, and the writer has said the chapter ends on scene ${endsAtScene}. Do NOT ` +
        `resolve the chapter here: leave the characters somewhere the next scene can pick ` +
        `up from.`
      );
    }
    return (
      `This is the chapter's last scene — the writer has said so, it is not a guess from ` +
      `the usual length. Land it: whatever the chapter set up has to pay off here, and the ` +
      `episode has to be able to move on from it.`
    );
  }

  // Nobody has said, so the usual length is all there is to go on. Said as the estimate
  // it is: a scene told "this is the last one" on a guess will close a chapter that had
  // another movement left in it.
  if (sceneNumber < scenesPerChapter) {
    const left = scenesPerChapter - sceneNumber;
    return (
      `There ${left === 1 ? "is" : "are"} about ${left} more scene${left === 1 ? "" : "s"} ` +
      `after this one. Do NOT resolve the chapter here: leave the characters somewhere ` +
      `the next scene can pick up from.`
    );
  }
  if (sceneNumber === scenesPerChapter) {
    return (
      `A chapter usually runs to about ${scenesPerChapter} scenes, so this is probably its ` +
      `last — nobody has said either way. Bring it to a close if the chapter is ready to ` +
      `close; if it plainly is not, leave it somewhere one more scene can finish.`
    );
  }
  return (
    `The chapter is already past its usual length, so this scene is an extension the ` +
    `writer asked for. Close it out rather than opening anything new.`
  );
}

/** Whether a chapter has all the scenes it is going to have. */
export function chapterClosed(scenes: number, endsAtScene: number | null): boolean {
  return endsAtScene !== null && scenes >= endsAtScene;
}
