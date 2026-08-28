export interface SlugFieldState {
  value: string;
  isManual: boolean;
}

export function slugifyProjectName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_./\\|:;,+]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createSlugFieldState(): SlugFieldState {
  return { value: "", isManual: false };
}

export function updateSlugFromName(state: SlugFieldState, projectName: string): SlugFieldState {
  return state.isManual ? state : { value: slugifyProjectName(projectName), isManual: false };
}

export function updateSlugManually(_: SlugFieldState, value: string): SlugFieldState {
  return { value, isManual: true };
}
