/** Lanțurile de versiuni ale fișierelor (SP3b, spec §1). Pur — fără fetch. */

export interface VersionedFile {
  id: string;
  supersedes_id: string | null;
  created_at: string;
}

export interface VersionChain<T extends VersionedFile> {
  head: T;
  history: T[]; // predecesorii, cei mai noi primii
  version: number;
}

export function versionChains<T extends VersionedFile>(files: T[]): VersionChain<T>[] {
  const byId = new Map(files.map((file) => [file.id, file]));
  const superseded = new Set(
    files.map((file) => file.supersedes_id).filter((id): id is string => !!id),
  );
  // head = nu e înlocuit de nimeni (nimeni nu-l are ca supersedes_id)
  const heads = files.filter((file) => !superseded.has(file.id));
  // Defensiv: un ciclu accidental (x↔y) ar lăsa heads gol — cel mai nou
  // fișier devine head ca lanțul să rămână afișabil.
  if (heads.length === 0 && files.length > 0) {
    heads.push(
      [...files].sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
    );
  }

  return heads.map((head) => {
    const history: T[] = [];
    const visited = new Set<string>([head.id]);
    let cursor = head.supersedes_id;
    while (cursor && byId.has(cursor) && !visited.has(cursor)) {
      const prev = byId.get(cursor)!;
      history.push(prev);
      visited.add(prev.id);
      cursor = prev.supersedes_id;
    }
    return { head, history, version: history.length + 1 };
  });
}
