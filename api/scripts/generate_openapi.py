import argparse
import json
from pathlib import Path

from minnumst_api.main import app

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "openapi.json"


def render_openapi() -> str:
    document = json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True)
    return f"{document}\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="check the committed spec without writing it",
    )
    args = parser.parse_args()
    document = render_openapi()

    if args.check:
        if not SPEC_PATH.exists() or SPEC_PATH.read_text(encoding="utf-8") != document:
            raise SystemExit(
                "api/openapi.json is missing or out of date; run make openapi"
            )
        print("api/openapi.json is up to date")
        return

    SPEC_PATH.parent.mkdir(parents=True, exist_ok=True)
    SPEC_PATH.write_text(document, encoding="utf-8")
    print(f"Generated {SPEC_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
