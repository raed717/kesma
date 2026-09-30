import { totalAreaM2 } from "../geometry/measure";
import type { Project, ProjectSummary } from "./project";

export function summarizeProject(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    parcelCount: project.property.parcels.length,
    propertyAreaM2: totalAreaM2(project.property.parcels.map((p) => p.geometry)),
    beneficiaryCount: project.beneficiaries.length,
    scenarioCount: project.scenarios.length,
  };
}
