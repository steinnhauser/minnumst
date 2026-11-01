import grafarkirkja from "./assets/churches/grafarkirkja.webp";
import budakirkja from "./assets/churches/budakirkja.webp";
import seydisfjardarkirkja from "./assets/churches/seydisfjardarkirkja.webp";
import thingvallakirkja from "./assets/churches/thingvallakirkja.webp";
import husavikurkirkja from "./assets/churches/husavikurkirkja.webp";
import saurbaejarkirkja from "./assets/churches/saurbaejarkirkja.webp";
import vikurkirkja from "./assets/churches/vikurkirkja.webp";
import akureyrarkirkja from "./assets/churches/akureyrarkirkja.webp";
import strandarkirkja from "./assets/churches/strandarkirkja.webp";
import stykkisholmskirkja from "./assets/churches/stykkisholmskirkja.webp";
import holadomkirkja from "./assets/churches/holadomkirkja.webp";
import hallgrimskirkja from "./assets/churches/hallgrimskirkja.webp";

// The churches on the front page, from around the country. Cropped by hand to the frame and
// resized from the originals on Wikimedia Commons, each under the licence named here. The credit
// shows on the page with each photograph, as the licences require.
export type Church = {
  name: string;
  place: string;
  image: string;
  alt: { en: string; is: string };
  photographer: string;
  licence: string;
  licenceUrl: string;
  source: string;
};

export const churches: readonly Church[] = [
  {
    name: "Grafarkirkja",
    place: "Höfðaströnd",
    image: grafarkirkja,
    alt: {
      en: "A small old church of dark timber with a turf roof, under a pale sky",
      is: "Lítil gömul timburkirkja með torfþaki undir fölum himni",
    },
    photographer: "Syrio",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:Grafarkirkja_02.jpg",
  },
  {
    name: "Búðakirkja",
    place: "Búðir, Snæfellsnes",
    image: budakirkja,
    alt: {
      en: "A black wooden church beneath a dark sky, with snow-capped mountains behind",
      is: "Svört timburkirkja undir dimmum himni, með snæviþakin fjöll í baksýn",
    },
    photographer: "Eric Kilby",
    licence: "CC BY-SA 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    source:
      "https://commons.wikimedia.org/wiki/File:Black_Church_and_Mountains_2021-10-04.jpg",
  },
  {
    name: "Seyðisfjarðarkirkja",
    place: "Seyðisfjörður",
    image: seydisfjardarkirkja,
    alt: {
      en: "A pale blue wooden church with a tall spire, below a green mountainside",
      is: "Ljósblá timburkirkja með háum turni undir grænni fjallshlíð",
    },
    photographer: "Mustang Joe",
    licence: "CC0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    source:
      "https://commons.wikimedia.org/wiki/File:The_Blue_Church_in_Sey%C3%B0isfj%C3%B6r%C3%B0ur,_Iceland_(48359468331).jpg",
  },
  {
    name: "Þingvallakirkja",
    place: "Þingvellir",
    image: thingvallakirkja,
    alt: {
      en: "A small white church with a dark roof and a slender tower on a grassy rise",
      is: "Lítil hvít kirkja með dökku þaki og mjóum turni á grasi gróinni hæð",
    },
    photographer: "JD554",
    licence: "CC BY-SA 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    source: "https://commons.wikimedia.org/wiki/File:Thingvellir_church.jpg",
  },
  {
    name: "Húsavíkurkirkja",
    place: "Húsavík",
    image: husavikurkirkja,
    alt: {
      en: "An ornate white wooden church with a green spire and dark timber detailing",
      is: "Skrautleg hvít timburkirkja með grænum turni og dökkum skreytingum",
    },
    photographer: "Andreas Tille",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:HusavikChurch.jpg",
  },
  {
    name: "Saurbæjarkirkja",
    place: "Rauðisandur",
    image: saurbaejarkirkja,
    alt: {
      en: "A small black church at the end of a stone path, under a wide cloudy sky",
      is: "Lítil svört kirkja við enda steinlagðs stígs undir víðum, skýjuðum himni",
    },
    photographer: "Eric Kilby",
    licence: "CC BY-SA 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    source:
      "https://commons.wikimedia.org/wiki/File:Black_Church_at_Rau%C3%B0isandur.jpg",
  },
  {
    name: "Víkurkirkja",
    place: "Vík í Mýrdal",
    image: vikurkirkja,
    alt: {
      en: "A white church with a red roof under a deep blue sky",
      is: "Hvít kirkja með rauðu þaki undir djúpbláum himni",
    },
    photographer: "Jonashtand",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source:
      "https://commons.wikimedia.org/wiki/File:201708_V%C3%ADkurkirkja_02.jpg",
  },
  {
    name: "Akureyrarkirkja",
    place: "Akureyri",
    image: akureyrarkirkja,
    alt: {
      en: "A tall concrete church with twin towers on a green hill",
      is: "Há steinsteypt kirkja með tvo turna á grænni hæð",
    },
    photographer: "Jon Gretarsson",
    licence: "CC BY-SA 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    source:
      "https://commons.wikimedia.org/wiki/File:Akureyrarkirkja_-_panoramio_(1).jpg",
  },
  {
    name: "Strandarkirkja",
    place: "Selvogur",
    image: strandarkirkja,
    alt: {
      en: "A pale wooden church with a dark steeple, seen from the front above a stone wall",
      is: "Ljós timburkirkja með dökkum turni, séð að framan ofan við steinvegg",
    },
    photographer: "JNC2",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source: "https://commons.wikimedia.org/wiki/File:Strandarkirkja-Front.jpg",
  },
  {
    name: "Stykkishólmskirkja",
    place: "Stykkishólmur",
    image: stykkisholmskirkja,
    alt: {
      en: "A white modern church with a soaring arched bell tower",
      is: "Hvít nútímaleg kirkja með háum bogadregnum klukkuturni",
    },
    photographer: "Kasa Fue",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    source:
      "https://commons.wikimedia.org/wiki/File:Stykkisholmur_Church_2019_1.jpg",
  },
  {
    name: "Hóladómkirkja",
    place: "Hólar í Hjaltadal",
    image: holadomkirkja,
    alt: {
      en: "A red sandstone cathedral and a tall white bell tower below the mountains",
      is: "Rauð dómkirkja úr sandsteini og hár hvítur klukkuturn undir fjöllum",
    },
    photographer: "Michael Scaduto",
    licence: "CC BY-SA 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    source: "https://commons.wikimedia.org/wiki/File:Holakirkja.jpg",
  },
  {
    name: "Hallgrímskirkja",
    place: "Reykjavík",
    image: hallgrimskirkja,
    alt: {
      en: "A soaring concrete church whose tower steps up like basalt columns",
      is: "Há steinsteypt kirkja með turni sem rís eins og stuðlaberg",
    },
    photographer: "DimaXmarxist",
    licence: "CC0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    source:
      "https://commons.wikimedia.org/wiki/File:Hallgr%C3%ADmskirkja_2018_HDR.jpg",
  },
];
