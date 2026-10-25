from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PersonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class PersonUpdate(PersonCreate):
    pass


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
    blog: BlogSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class PersonDetail(PersonResponse):
    current_blog: BlogRevisionResponse | None = None


class PersonPage(BaseModel):
    items: list[PersonResponse]
    total: int
    offset: int
    limit: int


class ErrorResponse(BaseModel):
    """The body of every 404 and 409 response."""

    detail: str
