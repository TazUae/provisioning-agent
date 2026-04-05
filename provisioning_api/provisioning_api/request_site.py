"""Pure helpers for comparing requested site vs current request site."""


def site_matches_request(safe_site: str, current_site: str) -> bool:
    return safe_site == current_site
