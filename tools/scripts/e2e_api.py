#!/usr/bin/env python3
"""Exercise the running local API over HTTP and clean up only this run's fixtures."""

from __future__ import annotations

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from minnumst_api.config import settings
from minnumst_api.database import make_engine
from minnumst_api.models import BlogPost, BlogRevision, Person

API_URL = os.environ.get("MINNUMST_E2E_API_URL", "http://127.0.0.1:8000").rstrip("/")


def require_local_database() -> None:
    url = make_url(settings.database_url)
    if (
        os.environ.get("MINNUMST_ALLOW_E2E") != "1"
        or url.get_backend_name() != "mysql"
        or url.host != "mariadb"
        or url.database != "minnumst_local"
    ):
        raise SystemExit(
            "Refusing to run destructive test cleanup outside the local "
            "minnumst_local MariaDB database."
        )


def request_json(
    method: str, path: str, payload: dict | None = None
) -> tuple[int, object | None]:
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        f"{API_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urlopen(request, timeout=5) as response:
            response_body = response.read()
            return response.status, json.loads(response_body) if response_body else None
    except HTTPError as error:
        response_body = error.read()
        return error.code, json.loads(response_body) if response_body else None


def expect_status(
    method: str,
    path: str,
    expected: int,
    payload: dict | None = None,
) -> object | None:
    status, result = request_json(method, path, payload)
    assert status == expected, (
        f"{method} {path}: expected {expected}, got {status}: {result}"
    )
    return result


def cleanup(person_ids: list[str]) -> None:
    if not person_ids:
        return
    engine = make_engine()
    blog_ids = select(BlogPost.id).where(BlogPost.person_id.in_(person_ids))
    with Session(engine) as session:
        session.execute(delete(BlogRevision).where(BlogRevision.blog_id.in_(blog_ids)))
        session.execute(delete(BlogPost).where(BlogPost.person_id.in_(person_ids)))
        session.execute(delete(Person).where(Person.id.in_(person_ids)))
        session.commit()
    engine.dispose()


def wait_until_ready() -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            status, body = request_json("GET", "/readyz")
            if status == 200 and body == {"status": "ready"}:
                return
        except URLError:
            pass
        time.sleep(1)
    raise AssertionError("API did not become ready within 30 seconds")


def main() -> None:
    require_local_database()
    wait_until_ready()
    expect_status("GET", "/healthz", 200)
    print("PASS /healthz and MariaDB-backed /readyz")

    run_id = uuid4().hex[:12]
    query = f"E2E-{run_id}"
    original_name = f"{query} Ancestor"
    renamed_name = f"{query} Remembered"
    person_ids: list[str] = []

    try:
        params = urlencode({"query": run_id, "offset": 0, "limit": 10})
        page = expect_status("GET", f"/api/people?{params}", 200)
        assert page["total"] == 0, page

        expect_status("POST", "/api/people", 422, {"name": "   "})
        person = expect_status("POST", "/api/people", 201, {"name": original_name})
        person_ids.append(person["id"])
        assert person["name"] == original_name
        assert person["slug"]
        print("PASS person creation and input validation")

        duplicate = f"  {query.lower()}   ancestor  "
        expect_status("POST", "/api/people", 409, {"name": duplicate})
        detail = expect_status("GET", f"/api/people/{person['id']}", 200)
        assert detail["id"] == person["id"]
        print("PASS normalized duplicate rejection and person read")

        updated = expect_status(
            "PATCH",
            f"/api/people/{person['id']}",
            200,
            {"name": renamed_name},
        )
        assert updated["name"] == renamed_name
        assert updated["slug"] == person["slug"]
        params = urlencode({"query": run_id, "offset": 0, "limit": 10})
        search = expect_status("GET", f"/api/people?{params}", 200)
        assert search["total"] == 1 and search["items"][0]["id"] == person["id"]
        print("PASS person update and search")

        first = {
            "title": "E2E first revision",
            "excerpt": "Created by a disposable localhost integration test.",
            "content": "First revision body.",
        }
        second = {
            "title": "E2E second revision",
            "excerpt": "The prior revision must remain available.",
            "content": "Second revision body.",
        }
        saved_first = expect_status(
            "PUT", f"/api/people/{person['id']}/blog", 200, first
        )
        saved_second = expect_status(
            "PUT", f"/api/people/{person['id']}/blog", 200, second
        )
        assert saved_first["id"] == saved_second["id"]
        assert saved_second["revision_count"] == 2

        blog = expect_status("GET", f"/api/people/{person['id']}/blog", 200)
        assert blog["current_revision"]["content"] == second["content"]
        history = expect_status(
            "GET", f"/api/people/{person['id']}/blog/revisions", 200
        )
        assert [item["revision_number"] for item in history] == [2, 1]
        assert [item["content"] for item in history] == [
            second["content"],
            first["content"],
        ]
        public_profile = expect_status(
            "GET", f"/api/people/by-slug/{person['slug']}", 200
        )
        assert public_profile["current_blog"]["content"] == second["content"]
        expect_status("DELETE", f"/api/people/{person['id']}", 409)
        print(
            "PASS blog write/read, append-only revisions, public read, "
            "and delete protection"
        )

        disposable_name = f"{query} Disposable"
        disposable = expect_status(
            "POST", "/api/people", 201, {"name": disposable_name}
        )
        person_ids.append(disposable["id"])
        expect_status("DELETE", f"/api/people/{disposable['id']}", 204)
        person_ids.remove(disposable["id"])
        expect_status("GET", f"/api/people/{disposable['id']}", 404)
        expect_status("GET", "/api/people/00000000-0000-0000-0000-000000000000", 404)
        print("PASS unblogged person deletion and not-found responses")
    finally:
        cleanup(person_ids)

    params = urlencode({"query": run_id, "offset": 0, "limit": 10})
    remaining = expect_status("GET", f"/api/people?{params}", 200)
    assert remaining["total"] == 0, remaining
    print("PASS temporary MariaDB fixtures cleaned up")


if __name__ == "__main__":
    main()
