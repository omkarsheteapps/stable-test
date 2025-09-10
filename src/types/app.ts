import type { Project } from "./project";

export interface App {
  app_id: number;
  project: Project;
  name: string;
  description?: string;
}

export interface GetAppsResponse {
  data: App[];
}
