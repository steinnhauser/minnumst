import { useContext, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { churches } from "./churches";
import { LanguageContext, useTranslations } from "./i18n";

const HOLD_MS = 7000;

// Fetched and decoded just before it's shown, so the fade never starts on a photograph
// that isn't ready, and a visitor only downloads the ones they stay to see.
function loadImage(src: string): Promise<void> {
  const image = new Image();
  image.src = src;
  return image.decode();
}

// Visitors who ask for less motion or less data start on one still photograph.
function startsStill(): boolean {
  const { connection } = navigator as Navigator & {
    connection?: { saveData?: boolean };
  };
  return (
    Boolean(connection?.saveData) ||
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function photoClass(
  index: number,
  current: number,
  previous: number | null,
): string | undefined {
  if (index === previous) return "photo-previous";
  if (index !== current) return undefined;
  // The first photograph just appears with the page; every later one fades in.
  return previous === null ? "photo-current" : "photo-current photo-fading";
}

function ChurchPhotos() {
  const t = useTranslations();
  const language = useContext(LanguageContext);
  const [current, setCurrent] = useState(0);
  // Stays solid underneath while the current one fades in over it.
  const [previous, setPrevious] = useState<number | null>(null);
  // The ones already loaded stay in the page, so moving between them is a fade.
  const [loaded, setLoaded] = useState<readonly number[]>([0]);
  const [isPaused, setIsPaused] = useState(startsStill);
  const church = churches[current];

  useEffect(() => {
    if (isPaused) return;
    let active = true;
    let isLoading = false;
    const timer = window.setInterval(() => {
      // Nothing to see in a hidden tab, so nothing to download.
      if (document.hidden || isLoading) return;
      const next = (current + 1) % churches.length;
      isLoading = true;
      loadImage(churches[next].image)
        .then(() => {
          if (!active) return;
          setLoaded((seen) => (seen.includes(next) ? seen : [...seen, next]));
          setPrevious(current);
          setCurrent(next);
        })
        // Stays on this photograph, and tries again next time.
        .catch(() => undefined)
        .finally(() => {
          isLoading = false;
        });
    }, HOLD_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [current, isPaused]);

  return (
    <figure className="photo-panel">
      {loaded.map((index) => (
        <img
          key={index}
          className={photoClass(index, current, previous)}
          src={churches[index].image}
          alt={index === current ? churches[index].alt[language] : ""}
          decoding={index === 0 ? "auto" : "sync"}
          fetchPriority={index === 0 ? "high" : undefined}
        />
      ))}
      <button
        className="photo-toggle"
        type="button"
        aria-label={isPaused ? t.playPhotos : t.pausePhotos}
        onClick={() => setIsPaused(!isPaused)}
      >
        {isPaused ? (
          <Play size={16} aria-hidden="true" />
        ) : (
          <Pause size={16} aria-hidden="true" />
        )}
      </button>
      <figcaption className="photo-caption">
        <strong>{church.name}</strong>
        <span>{church.place}</span>
        <small>
          <a href={church.source} rel="noreferrer">
            {t.photoBy(church.photographer)}
          </a>
          {" · "}
          <a href={church.licenceUrl} rel="noreferrer">
            {church.licence}
          </a>
        </small>
      </figcaption>
    </figure>
  );
}

export default ChurchPhotos;
