import logging
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from minnumst_api.database import get_session
from minnumst_api.models import BlogPost, BlogRevision, Person
from minnumst_api.names import (
    normalized_person_name,
    unique_person_slug,
)
from minnumst_api.schemas import (
    BlogResponse,
    BlogRevisionInput,
    BlogRevisionResponse,
    BlogSummary,
    ErrorResponse,
    PersonCreate,
    PersonDetail,
    PersonPage,
    PersonResponse,
    PersonUpdate,
)

router = APIRouter(prefix="/api")
# Documented error responses, so the OpenAPI contract and generated clients
# know every status a route can return.
NOT_FOUND = {404: {"model": ErrorResponse, "description": "Person or story not found"}}
CONFLICT = {409: {"model": ErrorResponse, "description": "Conflicts with stored data"}}
SessionDep = Annotated[Session, Depends(get_session)]
logger = logging.getLogger(__name__)


def latest_revision(blog: BlogPost) -> BlogRevision | None:
    if not blog.revisions:
        return None
    return max(blog.revisions, key=lambda revision: revision.revision_number)


def person_response(person: Person) -> PersonResponse:
    blog_summary = None
    if person.blog:
        revision = latest_revision(person.blog)
        if revision:
            blog_summary = BlogSummary(
                title=revision.title,
                excerpt=revision.excerpt,
                saved_at=revision.created_at,
                revision_count=len(person.blog.revisions),
            )
    return PersonResponse(
        id=person.id,
        name=person.name,
        slug=person.slug,
        created_at=person.created_at,
        updated_at=person.updated_at,
        blog=blog_summary,
    )


def blog_response(blog: BlogPost) -> BlogResponse:
    revision = latest_revision(blog)
    if revision is None:
        raise HTTPException(status_code=404, detail="Blog has no revisions")
    return BlogResponse(
        id=blog.id,
        person_id=blog.person_id,
        revision_count=len(blog.revisions),
        current_revision=BlogRevisionResponse.model_validate(revision),
    )


# Log lines only carry values read from the database, never request input; the
# request ID in every record correlates them with the request.
def get_person(session: Session, person_id: UUID) -> Person:
    person = session.scalar(
        select(Person)
        .options(selectinload(Person.blog).selectinload(BlogPost.revisions))
        .where(Person.id == str(person_id))
    )
    if person is None:
        logger.warning("Person lookup failed")
        raise HTTPException(status_code=404, detail="Person not found")
    return person


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
    ] = None,
    offset: Annotated[int, Query(ge=0, description="Number of matches to skip")] = 0,
    limit: Annotated[int, Query(ge=1, le=100, description="Page size, 1 to 100")] = 50,
) -> PersonPage:
    statement = select(Person)
    count_statement = select(func.count(Person.id))
    if query and query.strip():
        search = f"%{normalized_person_name(query)}%"
        statement = statement.where(Person.normalized_name.ilike(search))
        count_statement = count_statement.where(Person.normalized_name.ilike(search))
    total = session.scalar(count_statement) or 0
    people = session.scalars(
        statement.options(selectinload(Person.blog).selectinload(BlogPost.revisions))
        .order_by(Person.name)
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
    person = Person(
        id=str(uuid4()),
        name=payload.name,
        normalized_name=normalized_person_name(payload.name),
        slug=unique_person_slug(session, payload.name),
    )
    session.add(person)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        logger.warning("Person creation rejected because the normalized name exists")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A person with this normalized name already exists",
        ) from error
    session.refresh(person)
    logger.info("Person created person_id=%s", person.id)
    return person_response(person)


@router.get("/people/by-slug/{slug}", response_model=PersonDetail, responses=NOT_FOUND)
def get_person_by_slug(slug: str, session: SessionDep) -> PersonDetail:
    person = session.scalar(
        select(Person)
        .options(selectinload(Person.blog).selectinload(BlogPost.revisions))
        .where(Person.slug == slug)
    )
    if person is None:
        logger.warning("Public person lookup failed route=by-slug")
        raise HTTPException(status_code=404, detail="Person not found")
    logger.debug("Public person loaded person_id=%s", person.id)
    current = latest_revision(person.blog) if person.blog else None
    return PersonDetail(
        **person_response(person).model_dump(),
        current_blog=(
            BlogRevisionResponse.model_validate(current) if current else None
        ),
    )


@router.get("/people/{person_id}", response_model=PersonDetail, responses=NOT_FOUND)
def read_person(person_id: UUID, session: SessionDep) -> PersonDetail:
    person = get_person(session, person_id)
    logger.debug("Person loaded person_id=%s", person.id)
    current = latest_revision(person.blog) if person.blog else None
    return PersonDetail(
        **person_response(person).model_dump(),
        current_blog=(
            BlogRevisionResponse.model_validate(current) if current else None
        ),
    )


@router.patch(
    "/people/{person_id}",
    response_model=PersonResponse,
    responses=NOT_FOUND | CONFLICT,
)
def update_person(
    person_id: UUID, payload: PersonUpdate, session: SessionDep
) -> PersonResponse:
    person = get_person(session, person_id)
    normalized_name = normalized_person_name(payload.name)
    conflict = session.scalar(
        select(Person.id).where(
            Person.normalized_name == normalized_name,
            Person.id != person.id,
        )
    )
    if conflict:
        logger.warning("Person update rejected due to normalized-name conflict")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A person with this normalized name already exists",
        )
    person.name = payload.name
    person.normalized_name = normalized_name
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        logger.warning("Person update rejected because the normalized name exists")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A person with this normalized name already exists",
        ) from error
    updated_person = get_person(session, person.id)
    logger.info("Person updated person_id=%s", updated_person.id)
    return person_response(updated_person)


@router.get(
    "/people/{person_id}/blog", response_model=BlogResponse, responses=NOT_FOUND
)
def read_blog(person_id: UUID, session: SessionDep) -> BlogResponse:
    person = get_person(session, person_id)
    if person.blog is None:
        logger.warning(
            "Blog read failed because no blog exists person_id=%s", person.id
        )
        raise HTTPException(status_code=404, detail="Blog not found")
    logger.debug(
        "Blog loaded person_id=%s revision_count=%d",
        person.id,
        len(person.blog.revisions),
    )
    return blog_response(person.blog)


@router.put(
    "/people/{person_id}/blog", response_model=BlogResponse, responses=NOT_FOUND
)
def save_blog(
    person_id: UUID, payload: BlogRevisionInput, session: SessionDep
) -> BlogResponse:
    person = get_person(session, person_id)
    blog = session.scalar(
        select(BlogPost).where(BlogPost.person_id == person.id).with_for_update()
    )
    if blog is None:
        blog = BlogPost(id=str(uuid4()), person_id=person.id)
        session.add(blog)
        session.flush()
    latest_number = session.scalar(
        select(func.max(BlogRevision.revision_number)).where(
            BlogRevision.blog_id == blog.id
        )
    )
    revision = BlogRevision(
        id=str(uuid4()),
        blog_id=blog.id,
        revision_number=(latest_number or 0) + 1,
        title=payload.title,
        excerpt=payload.excerpt,
        content=payload.content,
    )
    session.add(revision)
    session.commit()
    session.refresh(blog)
    saved_blog = session.scalar(
        select(BlogPost)
        .options(selectinload(BlogPost.revisions))
        .where(BlogPost.id == blog.id)
    )
    logger.info(
        "Blog revision saved person_id=%s blog_id=%s revision_number=%d",
        person.id,
        blog.id,
        revision.revision_number,
    )
    return blog_response(saved_blog)


@router.get(
    "/people/{person_id}/blog/revisions",
    response_model=list[BlogRevisionResponse],
    responses=NOT_FOUND,
)
def list_blog_revisions(
    person_id: UUID, session: SessionDep
) -> list[BlogRevisionResponse]:
    person = get_person(session, person_id)
    if person.blog is None:
        logger.warning(
            "Blog history read failed because no blog exists person_id=%s",
            person.id,
        )
        raise HTTPException(status_code=404, detail="Blog not found")
    revisions = [
        BlogRevisionResponse.model_validate(revision)
        for revision in sorted(
            person.blog.revisions,
            key=lambda item: item.revision_number,
            reverse=True,
        )
    ]
    logger.debug(
        "Blog history loaded person_id=%s revision_count=%d",
        person.id,
        len(revisions),
    )
    return revisions


@router.delete(
    "/people/{person_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND | CONFLICT,
    description=(
        "Delete a person who has no story. A person with a story returns 409 "
        "and is kept, because stories and their revisions are never deleted."
    ),
)
def delete_person(person_id: UUID, session: SessionDep) -> Response:
    person = get_person(session, person_id)
    if person.blog is not None:
        logger.warning(
            "Person deletion rejected because blog history exists person_id=%s",
            person.id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Person has blog history; deletion is disabled to preserve revisions"
            ),
        )
    deleted_id = person.id
    session.delete(person)
    session.commit()
    logger.info("Person deleted person_id=%s", deleted_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
