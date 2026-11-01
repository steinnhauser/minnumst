import { createContext, useContext } from "react";
import type { ApiError } from "@minnumst/api-client";

// The interface in two languages, chosen by the address: Icelandic by default, and
// English under /en.
// Names and stories stay as they were written. No sentence puts a name inside
// Icelandic text, because names inflect and these strings can't decline them.
export type Language = "en" | "is";

const en = {
  months: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  fullDate: (day: number, month: string, year: number) =>
    `${day} ${month} ${year}`,
  otherLanguageName: "Íslenska",
  languageNotice: "",
  title: "Minnumst | A shared history of ancestors",
  home: "Minnumst home",
  tagline: "A SHARED HISTORY OF ANCESTORS",
  eyebrow: "LET US REMEMBER",
  heading: "Find someone to remember.",
  intro:
    "Minnumst means “let us remember”. Read the stories of Icelanders who have passed away, and help keep their memory.",
  searchLabel: "Search by name",
  searchPlaceholder: "Type a name...",
  searchButton: "Search",
  suggestionsLabel: "Search suggestions",
  resultsLabel: "Search results",
  enterName: "Enter a name to search the archive.",
  searching: "Searching the archive...",
  noResults: "We found no one by that name. Try another spelling.",
  tooShort: "Please type at least 3 letters.",
  searchTitle: "Search",
  resultsFor: (query: string) => `Results for “${query}”`,
  showing: (first: number, last: number, total: number) =>
    `Showing ${first}–${last} of ${total} people.`,
  noSuchPage: "There are no results on this page.",
  lastPage: "Go to the last page of results",
  paginationLabel: "Pages of results",
  previous: "← Previous",
  next: "Next →",
  pageOf: (page: number, last: number) => `Page ${page} of ${last}`,
  backToResults: "← Back to the results",
  shortPage: "A short page",
  publicNote: "Open to everyone · No sign-in needed",
  about: "About the archive",
  photoAlt:
    "Grafarkirkja, a small old church with a turf roof, under a pale sky",
  photoEyebrow: "GRAFARKIRKJA, NEAR HOFSÓS",
  photoCaption: ["Remembered", "together."],
  aboutEyebrow: "A SHARED RECORD",
  aboutText:
    "A growing collection of the stories of those who came before us, kept with care by the people who remember them.",
  notFound: "We could not find this page. It may have moved or been removed.",
  unreachable:
    "We could not reach the archive just now. Please try again soon.",
  failed: "Something went wrong. Please try again.",
  personLabel: "Person details",
  inMemoryOf: "IN MEMORY OF",
  born: "Born",
  died: "Died",
  noStory: (name: string) =>
    `No story has been written yet. If you know something of ${name}'s life, you are welcome to suggest one.`,
  sources: "Sources",
  suggestEdit: "Suggest an edit",
  sent: (name: string) =>
    `Thank you for helping to remember ${name}. An editor will read your suggestion before anything changes on this page.`,
  formIntro:
    "These stories are about people's family members, so please write with care and in your own words. Leave out living people and private matters such as health, crime, adoption or paternity. We don't ask who you are and keep no record of who sent it. If you would like a reply, write to",
  formQuestion: "What would you like to do?",
  kindEdit: "Write or improve the story",
  kindRequest: "Report a mistake or ask for a removal",
  storyTitle: "Title",
  storyExcerpt: "Introduction (optional)",
  storyContent: "Story",
  noteForEditor: "Anything the editor should know (optional)",
  noteRequest: "What is wrong, or what should be removed?",
  sourceLink: "Link to a source (optional)",
  send: "Send for review",
  tooMany:
    "Many suggestions have arrived just now. Please wait a few minutes and try again; your text is still here.",
  tooLong:
    "This is longer than we can accept at once. Please shorten it and try again.",
  copyright: "© 2026 Steinn Hauser Magnússon",
  storiesRemain: "Stories remain with their authors and sources.",
  openSource: "OPEN SOURCE",
  projectLabel: "Project",
  sourceCode: "Source code on GitHub",
  licence: "Code licensed under Apache-2.0",
  security: "Report a security issue",
  peopleAndData: "PEOPLE AND DATA",
  dataPromise:
    "This archive only holds people who died more than five years ago, and it uses no tracking or analytics. To correct or remove something, use “Suggest an edit” on a person's page or write to us.",
  dataLink: "Data protection and sources",
  photoCredit: "Photograph: Grafarkirkja, by Syrio",
};

const is: typeof en = {
  months: [
    "janúar",
    "febrúar",
    "mars",
    "apríl",
    "maí",
    "júní",
    "júlí",
    "ágúst",
    "september",
    "október",
    "nóvember",
    "desember",
  ],
  fullDate: (day: number, month: string, year: number) =>
    `${day}. ${month} ${year}`,
  otherLanguageName: "English",
  languageNotice: "Don't read Icelandic? Read this site in English",
  title: "Minnumst | Sameiginleg saga forfeðra",
  home: "Minnumst, forsíða",
  tagline: "SAMEIGINLEG SAGA FORFEÐRA",
  eyebrow: "MINNUMST ÞEIRRA",
  heading: "Hverra viltu minnast?",
  intro:
    "Hér geturðu lesið sögur genginna Íslendinga og hjálpað til við að varðveita minningu þeirra.",
  searchLabel: "Leita eftir nafni",
  searchPlaceholder: "Sláðu inn nafn...",
  searchButton: "Leita",
  suggestionsLabel: "Tillögur að leit",
  resultsLabel: "Leitarniðurstöður",
  enterName: "Sláðu inn nafn til að leita í safninu.",
  searching: "Leita í safninu...",
  noResults: "Enginn fannst með þessu nafni. Prófaðu annan rithátt.",
  tooShort: "Sláðu inn að minnsta kosti 3 stafi.",
  searchTitle: "Leit",
  resultsFor: (query: string) => `Niðurstöður fyrir „${query}“`,
  showing: (first: number, last: number, total: number) =>
    `Sýni ${first}–${last} af ${total}.`,
  noSuchPage: "Engar niðurstöður eru á þessari síðu.",
  lastPage: "Fara á síðustu síðu niðurstaðna",
  paginationLabel: "Síður niðurstaðna",
  previous: "← Fyrri",
  next: "Næsta →",
  pageOf: (page: number, last: number) => `Síða ${page} af ${last}`,
  backToResults: "← Aftur í niðurstöður",
  shortPage: "Stutt síða",
  publicNote: "Öllum opið · Engin innskráning",
  about: "Um safnið",
  photoAlt: "Grafarkirkja, lítil gömul kirkja með torfþaki, undir fölum himni",
  photoEyebrow: "GRAFARKIRKJA VIÐ HOFSÓS",
  photoCaption: ["Minnumst", "saman."],
  aboutEyebrow: "SAMEIGINLEG HEIMILD",
  aboutText:
    "Vaxandi safn af sögum þeirra sem á undan okkur gengu, varðveitt af alúð af þeim sem minnast þeirra.",
  notFound: "Þessi síða fannst ekki. Hún kann að hafa verið færð eða fjarlægð.",
  unreachable:
    "Ekki tókst að ná sambandi við safnið. Reyndu aftur innan skamms.",
  failed: "Eitthvað fór úrskeiðis. Vinsamlegast reyndu aftur.",
  personLabel: "Upplýsingar um manneskju",
  inMemoryOf: "TIL MINNINGAR",
  // The customary abbreviations, which also need no gendered form.
  born: "f.",
  died: "d.",
  noStory: () =>
    "Engin saga hefur enn verið skráð. Ef þú veist eitthvað um ævi viðkomandi er þér velkomið að leggja hana til.",
  sources: "Heimildir",
  suggestEdit: "Leggja til breytingu",
  sent: () =>
    "Takk fyrir að hjálpa okkur að varðveita þessa minningu. Ritstjóri les tillöguna þína áður en nokkru er breytt á þessari síðu.",
  formIntro:
    "Þessar sögur fjalla um ástvini fólks, svo við biðjum þig að skrifa af nærgætni og með eigin orðum. Slepptu lifandi fólki og einkamálum á borð við heilsufar, afbrot, ættleiðingu eða faðerni. Við spyrjum ekki hver þú ert og geymum engar upplýsingar um sendanda. Ef þú vilt fá svar geturðu skrifað á",
  formQuestion: "Hvað viltu gera?",
  kindEdit: "Skrifa eða bæta söguna",
  kindRequest: "Tilkynna villu eða biðja um að eitthvað verði fjarlægt",
  storyTitle: "Titill",
  storyExcerpt: "Inngangur (valkvætt)",
  storyContent: "Saga",
  noteForEditor: "Eitthvað sem ritstjóri ætti að vita (valkvætt)",
  noteRequest: "Hvað er rangt eða hvað ætti að fjarlægja?",
  sourceLink: "Tengill á heimild (valkvætt)",
  send: "Senda til yfirlestrar",
  tooMany:
    "Margar tillögur hafa borist rétt í þessu. Bíddu í nokkrar mínútur og reyndu aftur; textinn þinn er enn hér.",
  tooLong:
    "Þetta er lengra en við getum tekið við í einu. Styttu textann og reyndu aftur.",
  copyright: "© 2026 Steinn Hauser Magnússon",
  storiesRemain: "Sögurnar tilheyra höfundum sínum og heimildum.",
  openSource: "OPINN HUGBÚNAÐUR",
  projectLabel: "Verkefnið",
  sourceCode: "Frumkóði á GitHub",
  licence: "Kóði undir Apache-2.0 leyfi",
  security: "Tilkynna öryggisgalla",
  peopleAndData: "FÓLK OG GÖGN",
  dataPromise:
    "Hér eru aðeins skráðir einstaklingar sem létust fyrir meira en fimm árum, og engin rakning eða greining er notuð. Til að leiðrétta eða fjarlægja eitthvað geturðu notað „Leggja til breytingu“ á síðu viðkomandi eða skrifað til okkar.",
  dataLink: "Persónuvernd og heimildir",
  photoCredit: "Ljósmynd: Grafarkirkja, eftir Syrio",
};

export const translations = { en, is };
export type Translations = typeof en;

const ENGLISH_PATH = /^\/en(\/|$)/;

export function languageFromPath(pathname: string): Language {
  return ENGLISH_PATH.test(pathname) ? "en" : "is";
}

// The address without its language prefix.
export function withoutLanguage(pathname: string): string {
  return pathname.replace(ENGLISH_PATH, "/");
}

export function inLanguage(language: Language, path: string): string {
  return language === "en" ? `/en${path === "/" ? "" : path}` : path;
}

// Whether the browser reads Icelandic; everyone else gets a pointer to English.
export function browserReadsIcelandic(): boolean {
  return navigator.languages.some((tag) => /^is\b/i.test(tag));
}

// An API failure in the reader's words. The API's own messages are in English.
export function failureMessage(error: unknown, language: Language): string {
  const t = translations[language];
  const { status, message } = error as ApiError;
  if (status === 404) return t.notFound;
  if (status === undefined) return t.unreachable;
  return language === "en" ? message : t.failed;
}

export const LanguageContext = createContext<Language>("is");

export function useTranslations(): Translations {
  return translations[useContext(LanguageContext)];
}
