import type { Mode } from "@nightcode/database";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";
import { createListDirectoryTool } from "./list-directory";
import { createWriteFileTool } from "./write-file";
import { createEditFileTool } from "./edit-file";
import { createBashTool } from "./bash";
import { createReadFileTool } from "./read-file";

export function createTools(cwd: string, mode: Mode) {
  const readOnlyTools = {
    readFile: createReadFileTool(cwd),
    listDirectory: createListDirectoryTool(cwd),
    grep: createGrepTool(cwd),
    glob: createGlobTool(cwd),
  };

  if (mode === "PLAN") {
    return readOnlyTools;
  }

  return {
    ...readOnlyTools,
    writeFile: createWriteFileTool(cwd),
    edit: createEditFileTool(cwd),
    bash: createBashTool(cwd),
  };
}
