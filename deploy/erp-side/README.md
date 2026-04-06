# ERP-side deployment templates

Files here support ERP-side deployment notes and templates for `provisioning-agent`.

Strategic backend selection is **`ERP_EXECUTION_BACKEND=docker|remote`**.
`docker` remains the default temporary bridge backend, and `remote` is the long-term target.
Any prior `host_bench` material in this folder is operational legacy context and not part of the strategic backend selector.

- **Operator procedure:** `docs/erp-side-runbook.md`
- **Why this layout exists:** `docs/erp-side-runtime.md`

## systemd

- `systemd/provisioning-agent.service.example` — unit file template
- `systemd/provisioning-agent.env.example` — intentionally empty placeholder (see repo README **Deployment**); do not put secrets in git. Create the real environment file on the server with secrets from your secret manager or Dokploy-equivalent.

Copy the unit to `/etc/systemd/system/`, create `/etc/provisioning-agent/environment` (or similar) on the host with real variables, then `daemon-reload` and `enable --now provisioning-agent`.
