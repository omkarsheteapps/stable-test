export interface Company {
  company_id: number;
  name: string;
  description: string;
  user_limit: number;
  app_limit: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  project_id: number;
  company: Company;
  name: string;
  repo_url: string;
  git_pat_encrypted: string;
  created_at: string;
  updated_at: string;
}

export interface GetProjectsResponse {
  data: Project[];
}
