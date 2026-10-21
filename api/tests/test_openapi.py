import json
from pathlib import Path

from minnumst_api.main import app

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "api" / "openapi.json"


def test_checked_in_openapi_spec_matches_application() -> None:
    checked_in_spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))

    assert checked_in_spec == app.openapi()


def test_openapi_spec_exposes_public_and_admin_operations() -> None:
    paths = json.loads(SPEC_PATH.read_text(encoding="utf-8"))["paths"]

    assert {"get", "post"} <= paths["/api/people"].keys()
    assert "patch" in paths["/api/people/{person_id}"]
    assert "put" in paths["/api/people/{person_id}/blog"]
    assert "get" in paths["/api/people/by-slug/{slug}"]
    assert "get" in paths["/api/people/{person_id}/blog/revisions"]
