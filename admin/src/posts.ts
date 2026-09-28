export type PostRevision = {
  id: string;
  savedAt: string;
  title: string;
  excerpt: string;
  content: string;
};

export type PersonPost = {
  id: string;
  personName: string;
  personKey: string;
  slug: string;
  revisions: PostRevision[];
};

export type PostInput = Pick<PostRevision, "title" | "excerpt" | "content"> & {
  personName: string;
};

const storageKey = "eftirmal-admin.posts.v1";

export function personKey(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

export function personSlug(name: string) {
  return name
    .toLocaleLowerCase()
    .replace(/þ/g, "th")
    .replace(/ð/g, "d")
    .replace(/æ/g, "ae")
    .replace(/ö/g, "o")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function currentRevision(post: PersonPost) {
  return post.revisions.at(-1);
}

export function savePersonPost(
  posts: PersonPost[],
  input: PostInput,
  savedAt = new Date().toISOString(),
): PersonPost[] {
  const name = input.personName.trim().replace(/\s+/g, " ");
  const key = personKey(name);
  const existing = posts.find((post) => post.personKey === key);
  const revision: PostRevision = {
    id: crypto.randomUUID(),
    savedAt,
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    content: input.content.trim(),
  };

  if (existing) {
    return posts.map((post) =>
      post.id === existing.id
        ? {
            ...post,
            personName: name,
            revisions: [...post.revisions, revision],
          }
        : post,
    );
  }

  const baseSlug = personSlug(name) || "person";
  let slug = baseSlug;
  let suffix = 2;
  while (posts.some((post) => post.slug === slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return [
    {
      id: crypto.randomUUID(),
      personName: name,
      personKey: key,
      slug,
      revisions: [revision],
    },
    ...posts,
  ];
}

export function loadPosts(): PersonPost[] {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPersonPost);
  } catch {
    return [];
  }
}

export function persistPosts(posts: PersonPost[]) {
  localStorage.setItem(storageKey, JSON.stringify(posts));
}

function isPersonPost(value: unknown): value is PersonPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<PersonPost>;
  return (
    typeof post.id === "string" &&
    typeof post.personName === "string" &&
    typeof post.personKey === "string" &&
    typeof post.slug === "string" &&
    Array.isArray(post.revisions) &&
    post.revisions.every(
      (revision) =>
        revision &&
        typeof revision.id === "string" &&
        typeof revision.savedAt === "string" &&
        typeof revision.title === "string" &&
        typeof revision.excerpt === "string" &&
        typeof revision.content === "string",
    )
  );
}
