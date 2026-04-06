# Deploying `provisioning_api` on Frappe / ERPNext v15

## Expected repo layout (this repository)

The Frappe app lives under **`provisioning_api/`** (the folder that contains `setup.py` / `pyproject.toml`). The **Python package** is the nested directory with the same name:

```text
provisioning_api/                 # app root (what bench adds under apps/)
  pyproject.toml
  setup.py
  MANIFEST.in
  README.md
  DEPLOYMENT.md
  provisioning_api/               # import name: provisioning_api
    __init__.py
    hooks.py
    modules.txt                   # REQUIRED — see below
    api/
      __init__.py                 # makes ``provisioning_api.api`` a package
      provisioning.py
    auth.py
    access.py
    ...
  tests/
```

Do **not** place app code at `provisioning_api/api/provisioning.py` without the inner `provisioning_api/` package — that breaks imports and `pip install -e`.

## Why `modules.txt` matters

During **`bench migrate`**, Frappe syncs each installed app and, for every non-empty line `M` in **`provisioning_api/modules.txt`**, runs:

```python
importlib.import_module(f"{app_name}.{M}")
```

So for app `provisioning_api`, line **`provisioning_api`** would import **`provisioning_api.provisioning_api`**, which does not exist and raises:

`ModuleNotFoundError: No module named 'provisioning_api.provisioning_api'`

This app’s **`modules.txt`** must list the **real module folder** under the package — here **`api`** — so Frappe imports **`provisioning_api.api`**, which exists.

If you have no DocType modules, you may use a single line:

```text
api
```

Never duplicate the app name as the only module unless you also add a matching Python subpackage.

## Install on a bench

From the bench directory (example):

```bash
# If the app is not cloned yet:
bench get-app https://github.com/<org>/<repo>.git provisioning_api
# Or symlink / copy the provisioning_api folder into apps/provisioning_api

cd ~/frappe-bench
./env/bin/pip install -e apps/provisioning_api
bench --site <yoursite> install-app provisioning_api
bench --site <yoursite> migrate
bench restart
```

Ensure **`sites/common_site_config.json`** contains **`provisioning_api_token`** (see README).

## Verify imports

```bash
cd ~/frappe-bench
./env/bin/python -c "import provisioning_api; import provisioning_api.api; import provisioning_api.api.provisioning; print('ok')"
```

If the last import fails, check that **`api/__init__.py`** exists and **`pip install -e apps/provisioning_api`** was run from the bench venv.

## Verify whitelisted RPCs

Call (POST + JSON + header):

```bash
curl -sS -X POST "https://<host>/api/method/provisioning_api.api.provisioning.read_site_db_name" \
  -H "X-Provisioning-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"site_name":"<fqdn-site>"}'
```

Success body uses **`success` / `data`** (see README). Missing/invalid token raises Frappe **`PermissionError`** via **`verify_token()`**.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| `No module named 'provisioning_api.provisioning_api'` | **`modules.txt`** must not list `provisioning_api` as the module name; use **`api`** (or empty file if you know your Frappe version allows it). |
| `No module named 'provisioning_api.api'` | Add **`api/__init__.py`**; reinstall editable package. |
| Whitelist / 403 | Methods use **`allow_guest=True`**; ensure code is deployed and workers restarted. |
