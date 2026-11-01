import logging
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import AfterValidator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from minnumst_api.database import get_session
from minnumst_api.models import Person, Story, StoryRevision, Suggestion
from minnumst_api.names import (
    new_person,
    normalized_person_name,
    person_identity,
    storable_text,
)
from minnumst_api.schemas import (
    MAX_INTEGER,
    EditedStoryResponse,
    ErrorResponse,
    PersonCreate,
    PersonDetail,
    PersonPage,
    PersonResponse,
    PersonSourceResponse,
    PersonUpdate,
    StoryResponse,
    StoryRevisionDetail,
    StoryRevisionInput,
    StoryRevisionResponse,
    StorySummary,
    SuggestionCreate,
    SuggestionReceipt,
)

router = APIRouter(prefix="/api")
# Documented error responses, so the OpenAPI contract and generated clients
# know every status a route can return.
Responses = dict[int | str, dict[str, Any]]
NOT_FOUND: Responses = {
    404: {"model": ErrorResponse, "description": "Person or story not found"}
}
CONFLICT: Responses = {
    409: {"model": ErrorResponse, "description": "Conflicts with stored data"}
}
QUEUE_FULL: Responses = {
    429: {"model": ErrorResponse, "description": "The review queue is full"}
}
SessionDep = Annotated[Session, Depends(get_session)]
# Set by Traefik from Authentik's answer, replacing anything a client sent.
ReviewerHeader = Annotated[str, Header(alias="X-Authentik-Username", max_length=255)]
logger = logging.getLogger(__name__)
# Keeps a flood of suggestions from filling the disk or burying the queue.
MAX_PENDING_SUGGESTIONS = 500
IDENTITY_CONFLICT = "A person with this name and these dates already exists"
STORY_MOVED_ON = (
    "This story has changed since you opened it. Open it again to see the latest "
    "version; your text has not been saved."
)
# A person with their whole story, for a single profile.
WITH_STORY = selectinload(Person.story).selectinload(Story.revisions)
# Lists only summarise stories, so they skip loading every revision's full text.
WITH_STORY_SUMMARY = WITH_STORY.defer(StoryRevision.content)


def searchable(value: str | None) -> str | None:
    if value is not None and not storable_text(value):
        raise ValueError("The search contains characters that can't be stored")
    return value


def latest_revision(story: Story) -> StoryRevision | None:
    if not story.revisions:
        return None
    return max(story.revisions, key=lambda revision: revision.revision_number)


def person_response(person: Person) -> PersonResponse:
    story_summary = None
    if person.story:
        revision = latest_revision(person.story)
        if revision:
            story_summary = StorySummary(
                title=revision.title,
                excerpt=revision.excerpt,
                saved_at=revision.created_at,
                revision_count=len(person.story.revisions),
            )
    return PersonResponse(
        id=person.id,
        name=person.name,
        slug=person.slug,
        created_at=person.created_at,
        updated_at=person.updated_at,
        birth_date=person.birth_date,
        death_date=person.death_date,
        story=story_summary,
    )


def person_detail(person: Person) -> PersonDetail:
    current = latest_revision(person.story) if person.story else None
    return PersonDetail(
        **person_response(person).model_dump(),
        current_story=(
            StoryRevisionResponse.model_validate(current) if current else None
        ),
        sources=[PersonSourceResponse.model_validate(item) for item in person.sources],
    )


def story_response(story: Story) -> StoryResponse:
    revision = latest_revision(story)
    if revision is None:
        raise HTTPException(status_code=404, detail="Story has no revisions")
    return StoryResponse(
        id=story.id,
        person_id=story.person_id,
        revision_count=len(story.revisions),
        current_revision=StoryRevisionResponse.model_validate(revision),
    )


def edited_story_response(story: Story, revision: StoryRevision) -> EditedStoryResponse:
    return EditedStoryResponse(
        id=story.id,
        person_id=story.person_id,
        revision_count=revision.revision_number,
        current_revision=StoryRevisionDetail.model_validate(revision),
    )


# Log lines only carry values read from the database, never request input; the
# request ID in every record correlates them with the request.
def get_person(session: Session, person_id: UUID | str) -> Person:
    person = session.scalar(
        select(Person)
        .options(WITH_STORY, selectinload(Person.sources))
        .where(Person.id == str(person_id))
        .execution_options(populate_existing=True)
    )
    if person is None:
        logger.warning("Person lookup failed")
        raise HTTPException(status_code=404, detail="Person not found")
    return person


def get_public_person(session: Session, person_id: UUID) -> Person:
    """A person the public may see: to them, a hidden person doesn't exist."""
    person = get_person(session, person_id)
    if person.hidden_at is not None:
        logger.warning("Public lookup of a hidden person failed")
        raise HTTPException(status_code=404, detail="Person not found")
    return person


def append_revision(
    session: Session,
    person: Person,
    payload: StoryRevisionInput,
    created_by: str,
    *,
    change_note: str | None = None,
    restored_from: int | None = None,
) -> StoryRevision:
    """Add a version to the person's story, creating the story on the first save.

    A save that started from an older version is refused, so it can't silently
    undo what was published since. The story row's lock orders concurrent saves,
    and a unique constraint decides between two first saves.
    """
    story = session.scalar(
        select(Story).where(Story.person_id == person.id).with_for_update()
    )
    latest_number = (
        session.scalar(
            select(func.max(StoryRevision.revision_number)).where(
                StoryRevision.story_id == story.id
            )
        )
        if story
        else None
    ) or 0
    if payload.base_revision_number not in (None, latest_number):
        logger.warning("Save rejected because the story moved on")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=STORY_MOVED_ON)
    if story is None:
        story = Story(id=str(uuid4()), person_id=person.id)
        session.add(story)
    revision = StoryRevision(
        id=str(uuid4()),
        story=story,
        revision_number=latest_number + 1,
        title=payload.title,
        excerpt=payload.excerpt,
        content=payload.content,
        created_by=created_by,
        change_note=change_note or payload.change_note or None,
        restored_from=restored_from,
    )
    session.add(revision)
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        logger.warning("Save rejected because another save came first")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=STORY_MOVED_ON
        ) from error
    return revision


@router.get(
    "/people",
    response_model=PersonPage,
    description=(
        "Search people by name, ordered by name. The search ignores case, accents "
        "and repeated spaces and matches any part of the name. An empty or "
        "missing `query` returns everyone. Results come in pages of `limit` "
        "people (1 to 100, default 50) starting at `offset` (0 or more); "
        "`total` counts every match, so clients can page through them with `offset`."
    ),
)
def list_people(
    session: SessionDep,
    query: Annotated[
        str | None,
        Query(max_length=255, description="Part of a name; empty matches everyone"),
        AfterValidator(searchable),
    ] = None,
    offset: Annotated[
        int, Query(ge=0, le=MAX_INTEGER, description="Number of matches to skip")
    ] = 0,
    limit: Annotated[int, Query(ge=1, le=100, description="Page size, 1 to 100")] = 50,
) -> PersonPage:
    statement = select(Person).where(Person.hidden_at.is_(None))
    count_statement = select(func.count(Person.id)).where(Person.hidden_at.is_(None))
    if query and query.strip():
        # Autoescape, so a % or _ in the query matches only itself.
        matches = Person.normalized_name.contains(
            normalized_person_name(query), autoescape=True
        )
        statement = statement.where(matches)
        count_statement = count_statement.where(matches)
    total = session.scalar(count_statement) or 0
    people = session.scalars(
        statement.options(WITH_STORY_SUMMARY)
        .order_by(Person.name, Person.id)
        .offset(offset)
        .limit(limit)
    ).all()
    logger.debug("People search completed total=%d returned=%d", total, len(people))
    return PersonPage(
        items=[person_response(person) for person in people],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/people",
    response_model=PersonResponse,
    status_code=status.HTTP_201_CREATED,
    responses=CONFLICT,
)
def create_person(payload: PersonCreate, session: SessionDep) -> PersonResponse:
    person = new_person(session, payload.name, payload.birth_date, payload.death_date)
    session.add(person)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        logger.warning("Person creation rejected because the identity exists")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=IDENTITY_CONFLICT
        ) from error
    session.refresh(person)
    logger.info("Person created person_id=%s", person.id)
    return person_response(person)


@router.get("/people/by-slug/{slug}", response_model=PersonDetail, responses=NOT_FOUND)
def get_person_by_slug(slug: str, session: SessionDep) -> PersonDetail:
    person = (
        None
        if not storable_text(slug)
        else session.scalar(
            select(Person)
            .options(WITH_STORY, selectinload(Person.sources))
            .where(Person.slug == slug, Person.hidden_at.is_(None))
        )
    )
    if person is None:
        logger.warning("Public person lookup failed route=by-slug")
        raise HTTPException(status_code=404, detail="Person not found")
    logger.debug("Public person loaded person_id=%s", person.id)
    return person_detail(person)


@router.get(
    "/people/{person_id}",
    response_model=PersonDetail,
    responses=NOT_FOUND,
    description=(
        "Read a person and their current story by ID. Neither frontend calls "
        "it (the public archive reads by slug, the editorial desk works from "
        "search results), but it is the canonical ID-based read: every "
        "mutation takes an ID, so integrations and the end-to-end test use it "
        "to check a write, and a deleted person reads as 404."
    ),
)
def read_person(person_id: UUID, session: SessionDep) -> PersonDetail:
    person = get_public_person(session, person_id)
    logger.debug("Person loaded person_id=%s", person.id)
    return person_detail(person)


@router.patch(
    "/people/{person_id}",
    response_model=PersonResponse,
    responses=NOT_FOUND | CONFLICT,
)
def update_person(
    person_id: UUID, payload: PersonUpdate, session: SessionDep
) -> PersonResponse:
    person = get_person(session, person_id)
    identity = person_identity(payload.name, payload.birth_date, payload.death_date)
    conflict = session.scalar(
        select(Person.id).where(Person.identity == identity, Person.id != person.id)
    )
    if conflict:
        logger.warning("Person update rejected due to identity conflict")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=IDENTITY_CONFLICT
        )
    person.name = payload.name
    person.normalized_name = normalized_person_name(payload.name)
    person.birth_date = payload.birth_date
    person.death_date = payload.death_date
    person.identity = identity
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        logger.warning("Person update rejected because the identity exists")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=IDENTITY_CONFLICT
        ) from error
    updated_person = get_person(session, person.id)
    logger.info("Person updated person_id=%s", updated_person.id)
    return person_response(updated_person)


@router.get(
    "/people/{person_id}/story",
    response_model=StoryResponse,
    responses=NOT_FOUND,
    description=(
        "Read just the person's story: its current revision and how many "
        "revisions it has, without the person or the full history. No "
        "frontend calls it; it returns 404 for a person without a story."
    ),
)
def read_story(person_id: UUID, session: SessionDep) -> StoryResponse:
    person = get_public_person(session, person_id)
    if person.story is None:
        logger.warning(
            "Story read failed because no story exists person_id=%s", person.id
        )
        raise HTTPException(status_code=404, detail="Story not found")
    logger.debug(
        "Story loaded person_id=%s revision_count=%d",
        person.id,
        len(person.story.revisions),
    )
    return story_response(person.story)


@router.put(
    "/people/{person_id}/story",
    response_model=EditedStoryResponse,
    responses=NOT_FOUND | CONFLICT,
)
def save_story(
    person_id: UUID,
    payload: StoryRevisionInput,
    session: SessionDep,
    editor: ReviewerHeader = "unknown",
) -> EditedStoryResponse:
    person = get_person(session, person_id)
    revision = append_revision(session, person, payload, editor)
    story = revision.story
    session.commit()
    logger.info(
        "Story revision saved person_id=%s story_id=%s revision_number=%d",
        person.id,
        story.id,
        revision.revision_number,
    )
    return edited_story_response(story, revision)


@router.post(
    "/people/{person_id}/suggestions",
    response_model=SuggestionReceipt,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND | QUEUE_FULL,
    description=(
        "Propose a change to a person's page: `edit` carries new story text and "
        "`request` describes a correction or removal in the visitor's own words. "
        "The only write open to the public, and it needs no login: nothing is "
        "published until an editor accepts it, and nothing about the visitor is "
        "stored."
    ),
)
def create_suggestion(
    person_id: UUID, payload: SuggestionCreate, session: SessionDep
) -> SuggestionReceipt:
    person = get_public_person(session, person_id)
    pending = session.scalar(
        select(func.count(Suggestion.id)).where(Suggestion.status == "pending")
    )
    if (pending or 0) >= MAX_PENDING_SUGGESTIONS:
        logger.warning("Suggestion rejected because the review queue is full")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many suggestions are waiting for review; try again later",
        )
    suggestion = Suggestion(
        id=str(uuid4()),
        person_id=person.id,
        kind=payload.kind,
        base_revision_number=payload.base_revision_number,
        title=payload.title,
        excerpt=payload.excerpt,
        content=payload.content,
        note=payload.note,
        source_url=payload.source_url,
    )
    session.add(suggestion)
    session.commit()
    logger.info("Suggestion received suggestion_id=%s", suggestion.id)
    return SuggestionReceipt(id=suggestion.id, status=suggestion.status)


@router.delete(
    "/people/{person_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND | CONFLICT,
    description=(
        "Delete a person who has no story, to undo a mistaken create. A person "
        "with a story returns 409 and is kept, because stories and their "
        "revisions are never deleted: no route edits or deletes them. Like "
        "every write, it goes through Authentik at the edge. No frontend "
        "calls it."
    ),
)
def delete_person(person_id: UUID, session: SessionDep) -> Response:
    person = get_person(session, person_id)
    if person.story is not None:
        logger.warning(
            "Person deletion rejected because story history exists person_id=%s",
            person.id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Person has story history; deletion is disabled to preserve revisions"
            ),
        )
    deleted_id = person.id
    session.delete(person)
    session.commit()
    logger.info("Person deleted person_id=%s", deleted_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
