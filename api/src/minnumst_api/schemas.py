from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from minnumst_api.eligibility import INELIGIBLE, is_eligible, valid_partial_date


class PersonCreate(BaseModel):
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
        if not is_eligible(self.birth_date, self.death_date):
            raise ValueError(INELIGIBLE)
        return self


class PersonUpdate(PersonCreate):
    """The person's full details: dates left out are cleared."""


class BlogRevisionInput(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    excerpt: str = Field(default="", max_length=10000)
    content: str = Field(min_length=1)

    @field_validator("title", "excerpt", "content")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class BlogRevisionResponse(BaseModel):
    id: str
    revision_number: int
    saved_at: datetime = Field(validation_alias="created_at")
    title: str
    excerpt: str
    content: str

    model_config = ConfigDict(from_attributes=True)


class BlogSummary(BaseModel):
    title: str
    excerpt: str
    saved_at: datetime
    revision_count: int


class BlogResponse(BaseModel):
    id: str
    person_id: str
    revision_count: int
    current_revision: BlogRevisionResponse


class PersonResponse(BaseModel):
    id: str
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime
    birth_date: str | None = None
    death_date: str | None = None
    blog: BlogSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class PersonSourceResponse(BaseModel):
    title: str
    url: str

    model_config = ConfigDict(from_attributes=True)


class PersonDetail(PersonResponse):
    current_blog: BlogRevisionResponse | None = None
    sources: list[PersonSourceResponse] = []


class PersonPage(BaseModel):
    items: list[PersonResponse]
    total: int
    offset: int
    limit: int


class SuggestionCreate(BaseModel):
    """A visitor's proposal: new story text, or a request in their own words."""

    kind: Literal["edit", "request"]
    base_revision_number: int | None = Field(default=None, ge=1)
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
    status: str


class SuggestionResponse(BaseModel):
    id: str
    person_id: str
    person_name: str
    person_slug: str
    kind: str
    status: str
    base_revision_number: int | None
    current_revision: BlogRevisionResponse | None
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


class SuggestionAcceptance(BaseModel):
    """The story as the editor wants it; omitted, the visitor's text is used."""

    story: BlogRevisionInput | None = None


class PersonVisibility(BaseModel):
    hidden: bool


class ErrorResponse(BaseModel):
    """The body of every 404 and 409 response."""

    detail: str
