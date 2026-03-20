const STORAGE_FIRST_RUN_COMPLETE = "prodtrack_first_run_complete";

export function isFirstRunComplete(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_FIRST_RUN_COMPLETE) === "1";
}

export function setFirstRunComplete(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_FIRST_RUN_COMPLETE, "1");
}
