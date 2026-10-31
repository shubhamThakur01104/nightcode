import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "path";
import { toolInputSchemas, Mode, type ModeType } from "@nightcode/shared";

const MAX_FILE_SIZE = 50_000;
const MAX_RESULTS = 200;
const MAX_MATCHES = 50;
const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT = 30_000;

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".output",
]);

const DEFAULT_IGNORED_FILES = new Set([
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const DEFAULT_IGNORED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".zip",
  ".tar",
  ".gz",
  ".wasm",
  ".map",
]);

let cachedGitignoreRules: string[] | null = null;

async function loadGitignoreRules(cwd: string): Promise<string[]> {
  if (cachedGitignoreRules !== null) return cachedGitignoreRules;
  try {
    const gitignoreContent = await readFile(join(cwd, ".gitignore"), "utf-8");
    cachedGitignoreRules = gitignoreContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    cachedGitignoreRules = [];
  }
  return cachedGitignoreRules;
}

async function isIgnoredPath(relPath: string, cwd: string): Promise<boolean> {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  const fileName = segments[segments.length - 1] || "";
  const ext = extname(fileName).toLowerCase();

  // Strict .env check
  if (
    fileName.startsWith(".env") ||
    segments.some((s) => s.startsWith(".env"))
  ) {
    return true;
  }

  // Ignored directories
  if (segments.some((s) => DEFAULT_IGNORED_DIRS.has(s))) {
    return true;
  }

  // Ignored lockfiles
  if (DEFAULT_IGNORED_FILES.has(fileName)) {
    return true;
  }

  // Ignored file extensions
  if (DEFAULT_IGNORED_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check .gitignore rules
  const gitignoreRules = await loadGitignoreRules(cwd);
  for (const rule of gitignoreRules) {
    const cleanRule = rule.replace(/^\//, "").replace(/\/$/, "");
    if (normalized === cleanRule || normalized.startsWith(`${cleanRule}/`)) {
      return true;
    }
    if (fileName === cleanRule) {
      return true;
    }
  }

  return false;
}

function resolveInsideCwd(path: string) {
  const cwd = process.cwd();
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path is outside the project directory");
  }

  const normalizedRel = rel.replace(/\\/g, "/");
  const filename = normalizedRel.split("/").pop() || "";
  if (
    filename.startsWith(".env") ||
    normalizedRel.includes("/.env") ||
    normalizedRel === ".env"
  ) {
    throw new Error("Access to .env files is forbidden");
  }

  return { cwd, resolved };
}

function truncate(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`
    : value;
}

export async function executeLocalTool(
  toolName: string,
  input: unknown,
  mode: ModeType,
) {
  if (
    mode === Mode.PLAN &&
    !["readFile", "listDirectory", "glob", "grep"].includes(toolName)
  ) {
    throw new Error(`Tool ${toolName} is not available in PLAN mode`);
  }

  switch (toolName) {
    case "readFile": {
      const { path, startLine, endLine } =
        toolInputSchemas.readFile.parse(input);
      const { resolved } = resolveInsideCwd(path);
      const rawContent = await readFile(resolved, "utf-8");
      const lines = rawContent.split(/\r?\n/);
      const totalLines = lines.length;

      // Range-based read if specified
      if (startLine != null || endLine != null) {
        const from = Math.max(1, startLine ?? 1);
        const to = Math.min(totalLines, endLine ?? totalLines);

        if (from > totalLines) {
          return {
            content: "",
            startLine: from,
            endLine: to,
            totalLines,
            message: `startLine (${from}) exceeds total lines (${totalLines})`,
          };
        }

        const selectedLines = lines.slice(from - 1, to);
        const padLength = String(to).length;
        const formatted = selectedLines
          .map((line, idx) => `${String(from + idx).padStart(padLength, " ")} | ${line}`)
          .join("\n");

        return {
          content: selectedLines.join("\n"),
          formatted,
          startLine: from,
          endLine: to,
          totalLines,
        };
      }

      // Full file read with size capping
      if (rawContent.length > MAX_FILE_SIZE) {
        return {
          content: rawContent.slice(0, MAX_FILE_SIZE),
          truncate: true,
          totalLength: rawContent.length,
          totalLines,
          message: `File output truncated at ${MAX_FILE_SIZE} characters. Use startLine and endLine parameters to read specific sections.`,
        };
      }

      return { content: rawContent, totalLines };
    }

    case "listDirectory": {
      const { path } = toolInputSchemas.listDirectory.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const entries = await readdir(resolved);
      const results: { name: string; type: "file" | "directory" }[] = [];

      for (const entry of entries) {
        if (
          entry.startsWith(".") ||
          entry === "node_modules" ||
          entry.startsWith(".env")
        ) {
          continue;
        }

        const relPath = relative(cwd, join(resolved, entry));
        if (await isIgnoredPath(relPath, cwd)) {
          continue;
        }

        try {
          const info = await stat(join(resolved, entry));
          results.push({
            name: entry,
            type: info.isDirectory() ? "directory" : "file",
          });
        } catch {
          // Skip broken symlinks or inaccessible entries
        }
      }

      results.sort((a, b) =>
        a.type !== b.type
          ? a.type === "directory"
            ? -1
            : 1
          : a.name.localeCompare(b.name),
      );
      return { path: relative(cwd, resolved) || ".", entries: results };
    }

    case "glob": {
      const { pattern, path } = toolInputSchemas.glob.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const glob = new Bun.Glob(pattern);
      const files: string[] = [];
      let truncated = false;

      for await (const match of glob.scan({
        cwd: resolved,
        dot: false,
        onlyFiles: true,
      })) {
        const fullPath = resolve(resolved, match);
        const relPath = relative(cwd, fullPath);

        if (await isIgnoredPath(relPath, cwd)) {
          continue;
        }

        if (files.length >= MAX_RESULTS) {
          truncated = true;
          break;
        }
        files.push(relPath.replace(/\\/g, "/"));
      }
      files.sort();
      return { files, ...(truncated ? { truncated: true } : {}) };
    }

    case "grep": {
      const { pattern, path, include } = toolInputSchemas.grep.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);

      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch (err) {
        throw new Error(`Invalid regular expression: ${pattern}`);
      }

      const matches: { file: string; line: number; content: string }[] = [];
      let truncated = false;
      let totalMatches = 0;

      const globPattern = include || "**/*";
      const glob = new Bun.Glob(globPattern);

      for await (const match of glob.scan({
        cwd: resolved,
        dot: false,
        onlyFiles: true,
      })) {
        const fullPath = resolve(resolved, match);
        const relPath = relative(cwd, fullPath);

        if (await isIgnoredPath(relPath, cwd)) {
          continue;
        }

        try {
          const fileContent = await readFile(fullPath, "utf-8");
          const lines = fileContent.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            if (regex.test(line)) {
              totalMatches++;
              if (matches.length < MAX_MATCHES) {
                matches.push({
                  file: relPath.replace(/\\/g, "/"),
                  line: i + 1,
                  content:
                    line.length > 500 ? `${line.slice(0, 500)}...` : line,
                });
              } else {
                truncated = true;
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      return {
        matches,
        ...(truncated ? { truncated: true, totalMatches } : {}),
        ...(matches.length === 0 ? { message: "No matches found" } : {}),
      };
    }

    case "writeFile": {
      const { path, content } = toolInputSchemas.writeFile.parse(input);
      const { resolved } = resolveInsideCwd(path);
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, "utf-8");
      return {
        success: true as const,
        path: relative(process.cwd(), resolved).replace(/\\/g, "/"),
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };
    }

    case "editFile": {
      const { path, oldString, newString } =
        toolInputSchemas.editFile.parse(input);
      const { resolved } = resolveInsideCwd(path);
      const content = await readFile(resolved, "utf-8");

      // 1. Exact match attempt
      let occurrences = content.split(oldString).length - 1;
      let targetOld = oldString;
      let targetContent = content;

      // 2. CRLF vs LF normalized fallback
      if (occurrences === 0) {
        const normalizedContent = content.replace(/\r\n/g, "\n");
        const normalizedOld = oldString.replace(/\r\n/g, "\n");
        const normOccurrences = normalizedContent.split(normalizedOld).length - 1;

        if (normOccurrences === 1) {
          targetContent = normalizedContent;
          targetOld = normalizedOld;
          occurrences = 1;
        }
      }

      // 3. Trailing-whitespace normalized fallback
      if (occurrences === 0) {
        const stripTrailing = (s: string) =>
          s
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n");
        const cleanContent = stripTrailing(content.replace(/\r\n/g, "\n"));
        const cleanOld = stripTrailing(oldString.replace(/\r\n/g, "\n"));
        const cleanOccurrences = cleanContent.split(cleanOld).length - 1;

        if (cleanOccurrences === 1) {
          targetContent = cleanContent;
          targetOld = cleanOld;
          occurrences = 1;
        }
      }

      if (occurrences === 0) throw new Error("oldString not found in file");
      if (occurrences > 1) {
        throw new Error(`oldString is ambiguous; found ${occurrences} matches`);
      }

      const updated = targetContent.replace(targetOld, newString);

      // Atomic write: write to temp file then rename
      const tempPath = `${resolved}.${Date.now()}.tmp`;
      try {
        await writeFile(tempPath, updated, "utf-8");
        await rename(tempPath, resolved);
      } catch {
        await writeFile(resolved, updated, "utf-8");
        try {
          await unlink(tempPath);
        } catch {
          // Ignore cleanup error
        }
      }

      return {
        success: true as const,
        path: relative(process.cwd(), resolved).replace(/\\/g, "/"),
      };
    }

    case "bash": {
      const { command, timeout = DEFAULT_TIMEOUT } =
        toolInputSchemas.bash.parse(input);

      // Block attempts to read/cat/grep .env files via bash
      if (
        /\b(cat|less|more|head|tail|grep|awk|sed|cp|mv)\s+.*\.env/i.test(
          command,
        ) ||
        /\.env\b/i.test(command)
      ) {
        throw new Error(
          "Access to .env files via bash command is strictly forbidden",
        );
      }

      const isWin = process.platform === "win32";
      const shellArgs = isWin
        ? ["cmd.exe", "/d", "/s", "/c", command]
        : ["bash", "-c", command];

      const proc = Bun.spawn(shellArgs, {
        cwd: resolveInsideCwd(".").resolved,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, TERM: "dumb" },
      });

      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {}
      }, timeout);

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      clearTimeout(timer);

      return {
        stdout: truncate(stdout, MAX_OUTPUT),
        stderr: truncate(stderr, MAX_OUTPUT),
        exitCode,
      };
    }

    default:
      throw new Error(`Unknown tool : ${toolName}`);
  }
}
