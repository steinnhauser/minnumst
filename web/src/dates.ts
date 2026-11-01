import type { Person } from "./api";

const fullDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "UTC",
});

// The API gives a bare year or a full date; old records often only have a year.
function readableDate(value: string): string {
  return value.length > 4 ? fullDate.format(new Date(value)) : value;
}

export function lifespan(person: Person): string {
  const born = person.birth_date
    ? `Born ${readableDate(person.birth_date)}`
    : "";
  const died = person.death_date
    ? `Died ${readableDate(person.death_date)}`
    : "";
  return [born, died].filter(Boolean).join(" · ");
}
