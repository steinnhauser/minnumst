import type { Person } from "./api";
import type { Translations } from "./i18n";

// The API gives a bare year or a full date; old records often only have a year.
function readableDate(value: string, locale: string): string {
  if (value.length === 4) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function lifespan(person: Person, t: Translations): string {
  const born =
    person.birth_date &&
    `${t.born} ${readableDate(person.birth_date, t.locale)}`;
  const died =
    person.death_date &&
    `${t.died} ${readableDate(person.death_date, t.locale)}`;
  return [born, died].filter(Boolean).join(" · ");
}
