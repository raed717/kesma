import type { Project } from "@/domain/model/project";
import { projectFileName, serializeProjectFile } from "@/io/project-file";
import { downloadText } from "@/lib/download";

export function exportProjectFile(project: Project) {
  downloadText(serializeProjectFile(project), projectFileName(project), "application/json");
}
