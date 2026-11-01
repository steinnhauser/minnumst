"""The editors' routes. All of `/api/admin` goes through Authentik at the edge.

Unreviewed suggestions, story history and hidden people are only ever served
from here, so nothing outside this prefix can reveal them.
"""

import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from minnumst_api.api import (
    CONFLICT,
    NOT_FOUND,
    WITH_STORY,
    WITH_STORY_SUMMARY,
    ReviewerHeader,
    SessionDep,
    append_revision,
    edited_story_response,
    get_person,
    latest_revision,
    person_response,
)
from minnumst_api.models import Person, Suggestion, SuggestionStatus
from minnumst_api.schemas import (
    MAX_INTEGER,
    EditedStoryResponse,
    PersonResponse,
    PersonVisibility,
    RevisionRestore,
    StoryRevisionDetail,
    StoryRevisionInput,
    StoryRevisionResponse,
    SuggestionAcceptance,
    SuggestionPage,
    SuggestionResponse,
)

admin_router = APIRouter(prefix="/api/admin")
logger = logging.getLogger(__name__)


def suggestion_response(suggestion: Suggestion) -> SuggestionResponse:
    person = suggestion.person
    current = latest_revision(person.story) if person.story else None
    return SuggestionResponse(
        id=suggestion.id,
        person_id=person.id,
        person_name=person.name,
        person_slug=person.slug,
        kind=suggestion.kind,
        status=suggestion.status,
        base_revision_number=suggestion.base_revision_number,
        current_revision=(
            StoryRevisionResponse.model_validate(current) if current else None
        ),
        title=suggestion.title,
        excerpt=suggestion.excerpt,
        content=suggestion.content,
        note=suggestion.note,
        source_url=suggestion.source_url,
        created_at=suggestion.created_at,
        reviewed_at=suggestion.reviewed_at,
        reviewed_by=suggestion.reviewed_by,
    )


# A suggestion with its person and their current story, to compare against.
WITH_PERSON = selectinload(Suggestion.person).options(WITH_STORY)


def pending_suggestion(session: Session, suggestion_id: UUID) -> Suggestion:
    """The suggestion, locked, so that two editors can't both decide it."""
    suggestion = session.scalar(
        select(Suggestion).where(Suggestion.id == str(suggestion_id)).with_for_update()
    )
    if suggestion is None:
        logger.warning("Suggestion lookup failed")
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if suggestion.status != "pending":
        logger.warning("Suggestion was already decided suggestion_id=%s", suggestion.id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This suggestion has already been decided",
        )
    return suggestion


def decide(
    session: Session, suggestion: Suggestion, decision: SuggestionStatus, by: str
) -> None:
    suggestion.status = decision
    suggestion.reviewed_at = datetime.now(UTC)
    suggestion.reviewed_by = by
    suggestion.title = suggestion.excerpt = suggestion.content = None
    suggestion.note = suggestion.source_url = None
    session.commit()
    logger.info("Suggestion %s suggestion_id=%s", decision, suggestion.id)


def reloaded(session: Session, suggestion_id: str) -> SuggestionResponse:
    return suggestion_response(
        session.scalars(
            select(Suggestion)
            .options(WITH_PERSON)
            .where(Suggestion.id == suggestion_id)
            .execution_options(populate_existing=True)
        ).one()
    )


@admin_router.get("/suggestions", response_model=SuggestionPage)
def list_suggestions(
    session: SessionDep,
    suggestion_status: Annotated[SuggestionStatus, Query(alias="status")] = "pending",
    offset: Annotated[int, Query(ge=0, le=MAX_INTEGER)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> SuggestionPage:
    total = session.scalar(
        select(func.count(Suggestion.id)).where(Suggestion.status == suggestion_status)
    )
    suggestions = session.scalars(
        select(Suggestion)
        .options(WITH_PERSON)
        .where(Suggestion.status == suggestion_status)
        .order_by(Suggestion.created_at, Suggestion.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return SuggestionPage(
        items=[suggestion_response(item) for item in suggestions],
        total=total or 0,
        offset=offset,
        limit=limit,
    )


@admin_router.post(
    "/suggestions/{suggestion_id}/accept",
    response_model=SuggestionResponse,
    responses=NOT_FOUND | CONFLICT,
    description=(
        "Accept a suggestion. An edit becomes a new revision, with the editor's "
        "changes if `story` is given. A request is marked as handled, because "
        "the editor acts on it separately."
    ),
)
def accept_suggestion(
    suggestion_id: UUID,
    payload: SuggestionAcceptance,
    session: SessionDep,
    reviewer: ReviewerHeader = "unknown",
) -> SuggestionResponse:
    suggestion = pending_suggestion(session, suggestion_id)
    if suggestion.kind == "edit":
        story = payload.story or StoryRevisionInput(
            title=suggestion.title or "",
            excerpt=suggestion.excerpt or "",
            content=suggestion.content or "",
        )
        person = get_person(session, suggestion.person_id)
        suggestion.revision_id = append_revision(
            session,
            person,
            story,
            reviewer,
            change_note=story.change_note or "Accepted a visitor's suggestion",
        ).id
    decide(session, suggestion, "accepted", reviewer)
    return reloaded(session, suggestion.id)


@admin_router.post(
    "/suggestions/{suggestion_id}/reject",
    response_model=SuggestionResponse,
    responses=NOT_FOUND | CONFLICT,
    description="Reject a suggestion. Its text is deleted straight away.",
)
def reject_suggestion(
    suggestion_id: UUID, session: SessionDep, reviewer: ReviewerHeader = "unknown"
) -> SuggestionResponse:
    suggestion = pending_suggestion(session, suggestion_id)
    decide(session, suggestion, "rejected", reviewer)
    return reloaded(session, suggestion.id)


@admin_router.get(
    "/people/{person_id}/story/revisions",
    response_model=list[StoryRevisionDetail],
    responses=NOT_FOUND,
    description=(
        "The full revision history, newest first. For editors only: the public "
        "sees just the current revision, so text an editor removes from a story "
        "stops being public while the record of it is kept."
    ),
)
def list_story_revisions(
    person_id: UUID, session: SessionDep
) -> list[StoryRevisionDetail]:
    person = get_person(session, person_id)
    if person.story is None:
        logger.warning(
            "Story history read failed because no story exists person_id=%s",
            person.id,
        )
        raise HTTPException(status_code=404, detail="Story not found")
    revisions = [
        StoryRevisionDetail.model_validate(revision)
        for revision in sorted(
            person.story.revisions,
            key=lambda item: item.revision_number,
            reverse=True,
        )
    ]
    logger.debug(
        "Story history loaded person_id=%s revision_count=%d",
        person.id,
        len(revisions),
    )
    return revisions


@admin_router.post(
    "/people/{person_id}/story/revisions/{revision_number}/restore",
    response_model=EditedStoryResponse,
    responses=NOT_FOUND | CONFLICT,
    description=(
        "Publish an earlier version again. It becomes a new version with the same "
        "text, so nothing is overwritten and the restore can itself be undone."
    ),
)
def restore_revision(
    person_id: UUID,
    revision_number: Annotated[int, Path(ge=1, le=MAX_INTEGER)],
    payload: RevisionRestore,
    session: SessionDep,
    editor: ReviewerHeader = "unknown",
) -> EditedStoryResponse:
    person = get_person(session, person_id)
    versions = person.story.revisions if person.story else []
    original = next(
        (item for item in versions if item.revision_number == revision_number), None
    )
    if original is None:
        logger.warning("Restore failed because the version doesn't exist")
        raise HTTPException(status_code=404, detail="Version not found")
    current = max(versions, key=lambda item: item.revision_number)
    text = (original.title, original.excerpt, original.content)
    if text == (current.title, current.excerpt, current.content):
        logger.warning("Restore rejected because the text is already current")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The current version already has this text",
        )
    revision = append_revision(
        session,
        person,
        StoryRevisionInput(
            title=original.title,
            excerpt=original.excerpt,
            content=original.content,
            base_revision_number=payload.base_revision_number,
        ),
        editor,
        change_note=payload.change_note or f"Restored version {revision_number}",
        restored_from=revision_number,
    )
    story = revision.story
    session.commit()
    logger.info(
        "Story version restored person_id=%s revision_number=%d",
        person.id,
        revision.revision_number,
    )
    return edited_story_response(story, revision)


@admin_router.get("/people/hidden", response_model=list[PersonResponse])
def list_hidden_people(session: SessionDep) -> list[PersonResponse]:
    people = session.scalars(
        select(Person)
        .options(WITH_STORY_SUMMARY)
        .where(Person.hidden_at.is_not(None))
        .order_by(Person.name)
    ).all()
    return [person_response(person) for person in people]


@admin_router.put(
    "/people/{person_id}/visibility",
    response_model=PersonResponse,
    responses=NOT_FOUND,
    description=(
        "Hide a person from everything the public can read, or show them again. "
        "Their record and history are kept for the editors."
    ),
)
def set_person_visibility(
    person_id: UUID, payload: PersonVisibility, session: SessionDep
) -> PersonResponse:
    person = get_person(session, person_id)
    person.hidden_at = datetime.now(UTC) if payload.hidden else None
    session.commit()
    logger.info("Person visibility changed person_id=%s", person.id)
    return person_response(get_person(session, person_id))
