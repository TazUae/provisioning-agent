/**
 * Fixed paths for DockerExecBackend / host-bench bridge (not configured via env).
 * Prefer `ERP_EXECUTION_BACKEND=remote` in production; remote execution handles credentials.
 */
export const DOCKER_BENCH_DEFAULTS = {
  CONTAINER_NAME: "axiserp-erpnext-pnzjyk-backend-1",
  BENCH_PATH: "/home/frappe/frappe-bench",
  BENCH_EXECUTABLE: "bench",
} as const;

/** Used only for `bench new-site --admin-password` in the Docker bench bridge. */
export const DOCKER_BENCH_NEW_SITE_ADMIN_PASSWORD = "local-docker-backend-only";
