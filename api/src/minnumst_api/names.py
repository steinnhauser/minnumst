import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from minnumst_api.models import Person

# Letters that are not accented variants, so Unicode decomposition keeps them.
TRANSLITERATION = str.maketrans({"þ": "th", "ð": "d", "æ": "ae", "ø": "o", "ß": "ss"})
# Column limits. Folding can lengthen a name, and a slug gets a suffix when taken.
MAX_NORMALIZED_NAME = 600
MAX_BASE_SLUG = 200


def storable_text(value: str) -> bool:
    """Whether PostgreSQL can hold it: no NUL characters or lone surrogates."""
    if "\x00" in value:
        return False
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


# Icelandic alphabetical order, which neither the database nor Unicode knows.
ICELANDIC_ALPHABET = "aábcdðeéfghiíjklmnoópqrstuúvwxyýzþæö"
SORT_POSITIONS = {
    letter: f"{position:02d}"
    for position, letter in enumerate(ICELANDIC_ALPHABET, start=10)
}


def ascii_folded(value: str) -> str:
    """Lowercase, transliterate and strip accents: Sigríður -> sigridur."""
    decomposed = unicodedata.normalize(
        "NFKD", unicodedata.normalize("NFC", value).lower().translate(TRANSLITERATION)
    )
    return "".join(
        char
        for char in decomposed
        # Combining accents, and invisible characters that pasted text can carry.
        if not unicodedata.combining(char) and unicodedata.category(char) != "Cf"
    )


def search_key(value: str) -> str:
    """Spellings people treat as the same letter become one, for finding a name.

    Beyond the accents: þ is th or t, æ is ae or a, and y and i sound alike. So
    Sæmundur, Saemundur and Samundur match, as do Þóra, Thora and Tora.
    """
    folded = " ".join(ascii_folded(value).split())
    return folded.replace("th", "t").replace("ae", "a").replace("y", "i")


def sort_key(value: str) -> str:
    """Sorts in Icelandic alphabetical order under any database collation.

    Each letter becomes two digits, its position in the alphabet. A character
    outside the alphabet takes the position of its folded form, or is skipped.
    """
    parts = []
    for char in unicodedata.normalize("NFC", value).lower():
        if char in SORT_POSITIONS:
            parts.append(SORT_POSITIONS[char])
        elif char.isspace():
            parts.append("00")
        else:
            parts.extend(
                SORT_POSITIONS[folded]
                for folded in ascii_folded(char)
                if folded in SORT_POSITIONS
            )
    return "".join(parts)[:MAX_NORMALIZED_NAME]


def normalized_person_name(name: str) -> str:
    return " ".join(ascii_folded(name).split())


def person_slug(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", ascii_folded(name)))


def person_identity(name: str, birth_date: str | None, death_date: str | None) -> str:
    """What must be unique: many people share a name, but rarely with their dates."""
    return "|".join((normalized_person_name(name), birth_date or "", death_date or ""))


def unique_person_slug(
    session: Session, name: str, birth_date: str | None = None
) -> str:
    """The name's slug; if that's taken, with the birth year, then with a number."""

    def taken(slug: str) -> bool:
        return session.scalar(select(Person.id).where(Person.slug == slug)) is not None

    name_slug = person_slug(name)[:MAX_BASE_SLUG].rstrip("-") or "person"
    if not taken(name_slug):
        return name_slug
    base_slug = f"{name_slug}-{birth_date[:4]}" if birth_date else name_slug
    slug = base_slug
    suffix = 2
    while taken(slug):
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


def name_columns(
    name: str, birth_date: str | None, death_date: str | None
) -> dict[str, str | None]:
    """Everything stored about a validated name and dates, always set together."""
    return {
        "name": name,
        "normalized_name": normalized_person_name(name),
        "search_name": search_key(name),
        "sort_name": sort_key(name),
        "birth_date": birth_date,
        "death_date": death_date,
        "identity": person_identity(name, birth_date, death_date),
    }


def new_person(
    session: Session, name: str, birth_date: str | None, death_date: str | None
) -> Person:
    """A person who passed validation, ready to add to the session."""
    return Person(
        **name_columns(name, birth_date, death_date),
        slug=unique_person_slug(session, name, birth_date),
    )
