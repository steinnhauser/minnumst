export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

// Beyond this many comparisons, two versions are shown as wholly replaced rather
// than keeping an editor's browser busy.
const MAX_COMPARISONS = 4_000_000;

// A line-by-line difference: the longest common subsequence of the two texts.
export function diffLines(before: string, after: string): DiffLine[] {
  const old = before.split("\n");
  const updated = after.split("\n");
  let start = 0;
  while (
    start < old.length &&
    start < updated.length &&
    old[start] === updated[start]
  ) {
    start += 1;
  }
  let oldEnd = old.length;
  let updatedEnd = updated.length;
  while (
    oldEnd > start &&
    updatedEnd > start &&
    old[oldEnd - 1] === updated[updatedEnd - 1]
  ) {
    oldEnd -= 1;
    updatedEnd -= 1;
  }
  const same = (text: string): DiffLine => ({ kind: "same", text });
  return [
    ...old.slice(0, start).map(same),
    ...diffMiddle(old.slice(start, oldEnd), updated.slice(start, updatedEnd)),
    ...old.slice(oldEnd).map(same),
  ];
}

function diffMiddle(old: string[], updated: string[]): DiffLine[] {
  const removed = (text: string): DiffLine => ({ kind: "removed", text });
  const added = (text: string): DiffLine => ({ kind: "added", text });
  if (old.length * updated.length > MAX_COMPARISONS) {
    return [...old.map(removed), ...updated.map(added)];
  }
  // lengths[i][j]: the longest common subsequence of old[i:] and updated[j:].
  const lengths = Array.from({ length: old.length + 1 }, () =>
    new Array<number>(updated.length + 1).fill(0),
  );
  for (let i = old.length - 1; i >= 0; i -= 1) {
    for (let j = updated.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        old[i] === updated[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < old.length || j < updated.length) {
    if (i < old.length && j < updated.length && old[i] === updated[j]) {
      lines.push({ kind: "same", text: old[i] });
      i += 1;
      j += 1;
    } else if (
      j === updated.length ||
      (i < old.length && lengths[i + 1][j] >= lengths[i][j + 1])
    ) {
      lines.push(removed(old[i]));
      i += 1;
    } else {
      lines.push(added(updated[j]));
      j += 1;
    }
  }
  return lines;
}
