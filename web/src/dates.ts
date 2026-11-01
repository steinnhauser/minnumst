import type { Person } from "./api";
import type { Translations } from "./i18n";

// The API gives a bare year or a full date; old records often only have a year.
// Written out here because not every browser carries Icelandic date formats.
function readableDate(value: string, t: Translations): string {
  const [year, month, day] = value.split("-").map(Number);
  return month ? t.fullDate(day, t.months[month - 1], year) : String(year);
}

export function lifespan(person: Person, t: Translations): string {
  const born =
    person.birth_date && `${t.born} ${readableDate(person.birth_date, t)}`;
  const died =
    person.death_date && `${t.died} ${readableDate(person.death_date, t)}`;
  return [born, died].filter(Boolean).join(" · ");
}

// What a search result says under a name.
export function personDetail(person: Person, t: Translations): string {
  return person.story?.title ?? (lifespan(person, t) || t.shortPage);
}
