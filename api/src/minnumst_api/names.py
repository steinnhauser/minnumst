import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from minnumst_api.models import Person

# Letters that are not accented variants, so Unicode decomposition keeps them.
TRANSLITERATION = str.maketrans({"þ": "th", "ð": "d", "æ": "ae", "ø": "o", "ß": "ss"})


def ascii_folded(value: str) -> str:
    """Lowercase, transliterate and strip accents: Sigríður -> sigridur."""
    decomposed = unicodedata.normalize("NFKD", value.lower().translate(TRANSLITERATION))
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def normalized_person_name(name: str) -> str:
    return " ".join(ascii_folded(name).split())


def person_slug(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", ascii_folded(name)))


def unique_person_slug(session: Session, name: str) -> str:
    base_slug = person_slug(name) or "person"
    slug = base_slug
    suffix = 2
    while session.scalar(select(Person.id).where(Person.slug == slug)) is not None:
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug
