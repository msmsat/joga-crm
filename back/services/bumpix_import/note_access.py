"""A client shared by two masters does not expose their private lesson notes."""
from sqlalchemy import select, or_, and_
from models import ClientNote, Lesson
from models.bumpix import BumpixJournalLink, BumpixEvent
from .reading import conditions


def visible_notes(ctx):
    result = [ClientNote.studio_id == ctx.studio_id]
    if ctx.role == 'trainer':
        imported = select(BumpixJournalLink.note_id).where(BumpixJournalLink.note_id.is_not(None))
        own = select(BumpixJournalLink.note_id).join(BumpixEvent, BumpixEvent.id == BumpixJournalLink.event_id).where(
            *conditions(ctx), BumpixJournalLink.note_id.is_not(None))
        lessons = select(Lesson.id).where(Lesson.studio_id == ctx.studio_id, Lesson.teacher_id == ctx.user.id)
        result.append(or_(and_(ClientNote.lesson_id.is_(None), ~ClientNote.id.in_(imported)),
                          ClientNote.lesson_id.in_(lessons), ClientNote.id.in_(own)))
    return result
