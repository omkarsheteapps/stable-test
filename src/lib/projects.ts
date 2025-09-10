import { api } from "./api";
import type { GetProjectsResponse, Project } from "@/types/project";

export async function getProjects(): Promise<Project[]> {
  const { data } = await api.get<GetProjectsResponse>("/projects");
  return Array.isArray(data?.data) ? data.data : [];
}
