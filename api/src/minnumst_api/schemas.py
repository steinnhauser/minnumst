import unicodedata
from datetime import datetime
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from minnumst_api.eligibility import (
    INELIGIBLE,
    dates_in_order,
    is_eligible,
    valid_partial_date,
)
from minnumst_api.models import SuggestionKind, SuggestionStatus
from minnumst_api.names import (
    MAX_NORMALIZED_NAME,
    normalized_person_name,
    storable_text,
)

# PostgreSQL's integer columns, so an absurd number is a 422 and not a 500.
MAX_INTEGER = 2_147_483_647
RevisionNumber = Annotated[int, Field(ge=0, le=MAX_INTEGER)]
ChangeNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class Input(BaseModel):
    """A request body: text the database can't hold is refused up front."""

    @field_validator("*", mode="before")
    @classmethod
    def storable(cls, value: Any) -> Any:
        if isinstance(value, str) and not storable_text(value):
            raise ValueError("The text contains characters that can't be stored")
        return value


class PersonCreate(Input):
    name: str = Field(min_length=1, max_length=255)
    birth_date: str | None = Field(
        default=None, description="YYYY or YYYY-MM-DD", max_length=10
    )
    death_date: str | None = Field(
        default=None, description="YYYY or YYYY-MM-DD", max_length=10
    )

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be blank")
        if any(unicodedata.category(char) == "Cc" for char in value):
            raise ValueError("Name cannot contain control characters")
        if len(normalized_person_name(value)) > MAX_NORMALIZED_NAME:
            raise ValueError("Name is too long")
        return value

    @field_validator("birth_date", "death_date")
    @classmethod
    def clean_date(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        if value and not valid_partial_date(value):
            raise ValueError("Dates must be a year (YYYY) or a date (YYYY-MM-DD)")
        return value or None

    @model_validator(mode="after")
    def require_eligible(self) -> "PersonCreate":
        if not dates_in_order(self.birth_date, self.death_date):
            raise ValueError("The date of death is before the date of birth")
        if not is_eligible(self.birth_date, self.death_date):
            raise ValueError(INELIGIBLE)
        return self


class PersonUpdate(PersonCreate):
    """The person's full details: dates left out are cleared."""


class StoryRevisionInput(Input):
    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
    ]
    excerpt: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=10000)
    ] = ""
    content: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200000)
    ]
    change_note: ChangeNote | None = None
    base_revision_number: RevisionNumber | None = Field(
        default=None,
        description=(
            "The version this edit started from (0 for no story yet). If the story "
            "has moved on, the save answers 409 and changes nothing. Omit to skip."
        ),
    )


class RevisionRestore(Input):
    change_note: ChangeNote | None = None
    base_revision_number: RevisionNumber | None = None


class StoryRevisionResponse(BaseModel):
    id: str
    revision_number: int
    saved_at: datetime = Field(validation_alias="created_at")
    title: str
    excerpt: str
    content: str

    model_config = ConfigDict(from_attributes=True)


class StoryRevisionDetail(StoryRevisionResponse):
    """A version as editors see it. The public never sees who saved it or why."""

    created_by: str
    change_note: str | None
    restored_from: int | None


class StorySummary(BaseModel):
    title: str
    excerpt: str
    saved_at: datetime
    revision_count: int


class StoryResponse(BaseModel):
    id: str
    person_id: str
    revision_count: int
    current_revision: StoryRevisionResponse


class EditedStoryResponse(BaseModel):
    id: str
    person_id: str
    revision_count: int
    current_revision: StoryRevisionDetail


class PersonResponse(BaseModel):
    id: str
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime
    birth_date: str | None = None
    death_date: str | None = None
    story: StorySummary | None = None

    model_config = ConfigDict(from_attributes=True)


class PersonSourceResponse(BaseModel):
    title: str
    url: str

    model_config = ConfigDict(from_attributes=True)


class PersonDetail(PersonResponse):
    current_story: StoryRevisionResponse | None = None
    sources: list[PersonSourceResponse] = []


class PersonPage(BaseModel):
    items: list[PersonResponse]
    total: int
    offset: int
    limit: int


class SuggestionCreate(Input):
    """A visitor's proposal: new story text, or a request in their own words."""

    kind: SuggestionKind
    base_revision_number: RevisionNumber | None = None
    title: str | None = Field(default=None, max_length=255)
    excerpt: str | None = Field(default=None, max_length=10000)
    content: str | None = Field(default=None, max_length=50000)
    note: str | None = Field(default=None, max_length=2000)
    source_url: str | None = Field(default=None, max_length=2048)

    @field_validator("title", "excerpt", "content", "note", "source_url")
    @classmethod
    def blank_is_missing(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    @field_validator("source_url")
    @classmethod
    def web_address(cls, value: str | None) -> str | None:
        if value:
            url = urlsplit(value)
            if url.scheme not in {"http", "https"} or not url.netloc:
                raise ValueError("The source must be a web address")
        return value

    @model_validator(mode="after")
    def require_a_proposal(self) -> "SuggestionCreate":
        if self.kind == "edit" and not (self.title and self.content):
            raise ValueError("An edit needs a title and a story")
        if self.kind == "request" and not self.note:
            raise ValueError("A request needs a description")
        return self


class SuggestionReceipt(BaseModel):
    id: str
    status: SuggestionStatus


class SuggestionResponse(BaseModel):
    id: str
    person_id: str
    person_name: str
    person_slug: str
    kind: SuggestionKind
    status: SuggestionStatus
    base_revision_number: int | None
    current_revision: StoryRevisionResponse | None
    title: str | None
    excerpt: str | None
    content: str | None
    note: str | None
    source_url: str | None
    created_at: datetime
    reviewed_at: datetime | None
    reviewed_by: str | None


class SuggestionPage(BaseModel):
    items: list[SuggestionResponse]
    total: int
    offset: int
    limit: int


class SuggestionAcceptance(Input):
    """The story as the editor wants it; omitted, the visitor's text is used."""

    story: StoryRevisionInput | None = None


class PersonVisibility(Input):
    hidden: bool


class ErrorResponse(BaseModel):
    """The body of every 404 and 409 response."""

    detail: str
