/**
 * Lists the Docker build context without Docker: which files `.dockerignore` lets in, and
 * whether every `COPY` source in the Dockerfile is among them as a real file.
 *
 *   npx ts-node scripts/dockerContext.ts            # this checkout
 *   npx ts-node scripts/dockerContext.ts <dir>      # another checkout
 *
 * Exits 1 when a `COPY` source is excluded, missing, or a symlink (Docker sends a symlink as a
 * link, so a worktree whose `data/` entries point at the main checkout cannot build the image).
 *
 * Matching follows Docker's documented `.dockerignore` rules (moby `patternmatcher`): patterns
 * are relative to the context root, `*` and `?` stop at `/`, `**` spans directories, a pattern
 * that matches a parent directory matches everything below it, and the last matching line wins,
 * so `!` re-includes what an earlier line excluded.
 */
import fs from "fs";
import path from "path";

interface Rule {
  pattern: string;
  regex: RegExp;
  exclude: boolean;
}

const escape = (text: string): string => text.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/** One pattern to an anchored regex over `/`-separated relative paths. */
const toRegex = (pattern: string): RegExp => {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // `**/` may match zero directories; a trailing `**` matches everything below.
      if (pattern[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += escape(ch);
    }
  }
  return new RegExp(`^${out}$`);
};

/** `path.posix.normalize` plus Docker's stripping of a leading `/` and a trailing `/`. */
const clean = (pattern: string): string => path.posix.normalize(pattern)
  .replace(/^\/+/, "")
  .replace(/\/+$/, "");

export const parseDockerignore = (text: string): Rule[] => text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => {
    const exclude = !line.startsWith("!");
    const pattern = clean(exclude ? line : line.slice(1).trim());
    return { pattern, regex: toRegex(pattern), exclude };
  });

/**
 * An excluded directory is skipped unless some `!` line could re-include something under it,
 * which is also when Docker skips it. A `!` pattern starting with a wildcard might, so it keeps
 * the walk going everywhere.
 */
const mayReinclude = (rules: Rule[], dir: string): boolean => rules.some((rule) => (
  !rule.exclude && (rule.pattern.startsWith(`${dir}/`) || /^[*?]/.test(rule.pattern))
));

/** Every ancestor of `file` and `file` itself, shortest first: `a`, `a/b`, `a/b/c`. */
const prefixes = (file: string): string[] => file
  .split("/")
  .map((_part, index, parts) => parts.slice(0, index + 1).join("/"));

/** `true` when `.dockerignore` keeps `file` (a `/`-separated path relative to the context). */
export const isIncluded = (rules: Rule[], file: string): boolean => {
  let excluded = false;
  rules.forEach((rule) => {
    if (prefixes(file).some((candidate) => rule.regex.test(candidate))) {
      excluded = rule.exclude;
    }
  });
  return !excluded;
};

/** Sources of every `COPY` in the Dockerfile that reads the build context (not `--from=`). */
export const copySources = (dockerfile: string): string[] => dockerfile
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /^COPY\s/i.test(line) && !/--from=/i.test(line))
  .flatMap((line) => {
    const args = line.split(/\s+/).slice(1).filter((arg) => !arg.startsWith("--"));
    return args.slice(0, -1);
  });

export interface ContextEntry {
  path: string;
  bytes: number;
  symlink: boolean;
}

/** Walks `root` without following symlinks, keeping what `.dockerignore` lets in. */
export const listContext = (root: string): ContextEntry[] => {
  const rules = parseDockerignore(fs.readFileSync(path.join(root, ".dockerignore"), "utf8"));
  const entries: ContextEntry[] = [];
  const walk = (relative: string): void => {
    fs.readdirSync(path.join(root, relative), { withFileTypes: true }).forEach((dirent) => {
      const child = relative ? `${relative}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        if (isIncluded(rules, child) || mayReinclude(rules, child)) {
          walk(child);
        }
      } else if (isIncluded(rules, child)) {
        const stat = fs.lstatSync(path.join(root, child));
        entries.push({ path: child, bytes: stat.size, symlink: stat.isSymbolicLink() });
      }
    });
  };
  walk("");
  return entries;
};

const main = (): void => {
  const root = path.resolve(process.argv[2] ?? ".");
  const entries = listContext(root);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const sources = copySources(fs.readFileSync(path.join(root, "Dockerfile"), "utf8"));

  const top = new Map<string, { files: number; bytes: number }>();
  entries.forEach((entry) => {
    const head = entry.path.includes("/") ? `${entry.path.split("/")[0]}/` : entry.path;
    const sum = top.get(head) ?? { files: 0, bytes: 0 };
    top.set(head, { files: sum.files + 1, bytes: sum.bytes + entry.bytes });
  });
  console.log(`Build context of ${root}:`);
  [...top.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([head, sum]) => {
    console.log(`  ${head.padEnd(28)} ${String(sum.files).padStart(5)} files ${String(sum.bytes).padStart(12)} bytes`);
  });

  const problems: string[] = [];
  sources.forEach((source) => {
    const cleaned = clean(source);
    if (/[*?]/.test(cleaned)) {
      // A wildcard source must match at least one real file, as `COPY` requires.
      const regex = toRegex(cleaned);
      const matches = entries.filter((entry) => regex.test(entry.path));
      if (matches.length === 0) {
        problems.push(`${source} matches nothing in the context`);
      }
      matches.filter((entry) => entry.symlink).forEach((entry) => {
        problems.push(`${entry.path} (from ${source}) is a symlink`);
      });
      return;
    }
    const isFile = byPath.get(cleaned);
    const isDir = entries.some((entry) => entry.path.startsWith(`${cleaned}/`));
    const linked = entries.find((entry) => entry.symlink
      && (entry.path === cleaned || cleaned.startsWith(`${entry.path}/`)));
    if (linked) {
      problems.push(`${source} goes through the symlink ${linked.path}; build from a checkout with the real file`);
    } else if (!isFile && !isDir) {
      problems.push(`${source} is excluded by .dockerignore or missing`);
    }
  });

  console.log(`COPY sources: ${sources.join(", ")}`);
  if (problems.length > 0) {
    console.error(`Not buildable:\n  - ${problems.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("Every COPY source is in the context as a real file.");
  }
};

if (require.main === module) {
  main();
}
