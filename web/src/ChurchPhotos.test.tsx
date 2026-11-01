import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { churches } from "./churches";
import ChurchPhotos from "./ChurchPhotos";
import { LanguageContext, translations } from "./i18n";

const HOLD_MS = 7000;
let requested: string[] = [];
let imagesLoad = true;

// Loads at once, or fails, and notes what was asked for.
class FakeImage {
  src = "";

  decode() {
    requested.push(this.src);
    return imagesLoad ? Promise.resolve() : Promise.reject(new Error("failed"));
  }
}

beforeEach(() => {
  requested = [];
  imagesLoad = true;
  vi.useFakeTimers();
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPhotos(language: "en" | "is" = "en") {
  return render(
    <LanguageContext.Provider value={language}>
      <ChurchPhotos />
    </LanguageContext.Provider>,
  );
}

async function wait(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

function shown() {
  return screen.getByRole("figure").querySelector("figcaption strong")
    ?.textContent;
}

describe("the church photographs", () => {
  it("starts on one photograph without fetching the others", async () => {
    renderPhotos();

    expect(shown()).toBe(churches[0].name);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    await wait(HOLD_MS - 1);
    expect(requested).toEqual([]);
  });

  it("moves on one at a time, fetching each just before it shows", async () => {
    renderPhotos();

    await wait(HOLD_MS);

    expect(requested).toEqual([churches[1].image]);
    expect(shown()).toBe(churches[1].name);

    await wait(HOLD_MS);

    expect(requested).toEqual([churches[1].image, churches[2].image]);
    expect(shown()).toBe(churches[2].name);
  });

  it("fades in every photograph over the last, including the first time each appears", async () => {
    const { container } = renderPhotos();
    const image = (index: number) =>
      container.querySelector(`img[src="${churches[index].image}"]`);

    // The first arrives with the page and has nothing to fade from.
    expect(image(0)).toHaveClass("photo-current");
    expect(image(0)).not.toHaveClass("photo-fading");

    await wait(HOLD_MS);
    expect(image(1)).toHaveClass("photo-current", "photo-fading");
    expect(image(0)).toHaveClass("photo-previous");
    expect(image(0)).not.toHaveClass("photo-current");

    await wait(HOLD_MS);
    expect(image(2)).toHaveClass("photo-current", "photo-fading");
    expect(image(1)).toHaveClass("photo-previous");
    expect(image(1)).not.toHaveClass("photo-fading");
    expect(image(0)?.className).toBe("");
  });

  it("fades back in a photograph it has already shown", async () => {
    const { container } = renderPhotos();

    for (let turn = 0; turn < churches.length; turn += 1) await wait(HOLD_MS);

    const first = container.querySelector(`img[src="${churches[0].image}"]`);
    expect(first).toHaveClass("photo-current", "photo-fading");
  });

  it("keeps earlier photographs in place to fade from, describing only the current one", async () => {
    const { container } = renderPhotos();

    await wait(HOLD_MS);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("alt", "");
    expect(images[0]).not.toHaveClass("photo-current");
    expect(images[1]).toHaveAttribute("alt", churches[1].alt.en);
    expect(images[1]).toHaveClass("photo-current");
  });

  it("comes back round to the first, reusing what it already has", async () => {
    const { container } = renderPhotos();

    for (let turn = 0; turn < churches.length; turn += 1) await wait(HOLD_MS);

    expect(shown()).toBe(churches[0].name);
    expect(container.querySelectorAll("img")).toHaveLength(churches.length);
  });

  it("stays put when a photograph fails, and tries again", async () => {
    imagesLoad = false;
    renderPhotos();

    await wait(HOLD_MS);
    expect(shown()).toBe(churches[0].name);

    imagesLoad = true;
    await wait(HOLD_MS);
    expect(shown()).toBe(churches[1].name);
  });

  it("fetches one at a time on a slow connection", async () => {
    let finish = () => {};
    class SlowImage extends FakeImage {
      decode() {
        requested.push(this.src);
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      }
    }
    vi.stubGlobal("Image", SlowImage);
    renderPhotos();

    await wait(HOLD_MS * 3);

    expect(requested).toHaveLength(1);
    expect(shown()).toBe(churches[0].name);

    await act(async () => finish());

    expect(shown()).toBe(churches[1].name);
  });

  it("drops a photograph that arrives after the visitor has left", async () => {
    let finish = () => {};
    class SlowImage extends FakeImage {
      decode() {
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      }
    }
    vi.stubGlobal("Image", SlowImage);
    const { unmount } = renderPhotos();
    await wait(HOLD_MS);

    unmount();

    await act(async () => finish());
    expect(screen.queryByRole("figure")).toBeNull();
  });

  it("fetches nothing in a hidden tab", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    renderPhotos();

    await wait(HOLD_MS * 2);
    expect(requested).toEqual([]);

    hidden.mockReturnValue(false);
    await wait(HOLD_MS);
    expect(shown()).toBe(churches[1].name);
  });

  it("can be paused and played again", async () => {
    renderPhotos();

    act(() => screen.getByRole("button", { name: /Pause/ }).click());
    await wait(HOLD_MS * 2);
    expect(shown()).toBe(churches[0].name);
    expect(requested).toEqual([]);

    act(() => screen.getByRole("button", { name: /Play/ }).click());
    await wait(HOLD_MS);
    expect(shown()).toBe(churches[1].name);
  });

  it("starts still for visitors who ask for less motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduced-motion"),
    }));
    renderPhotos();

    await wait(HOLD_MS * 2);

    expect(requested).toEqual([]);
    expect(screen.getByRole("button", { name: /Play/ })).toBeVisible();
  });

  it("starts still for visitors saving data", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    renderPhotos();

    await wait(HOLD_MS * 2);

    Reflect.deleteProperty(navigator, "connection");
    expect(requested).toEqual([]);
  });

  it("credits each photograph, with links to the source and licence", () => {
    renderPhotos();
    const [church] = churches;

    expect(
      screen.getByRole("link", { name: `Photo: ${church.photographer}` }),
    ).toHaveAttribute("href", church.source);
    expect(screen.getByRole("link", { name: church.licence })).toHaveAttribute(
      "href",
      church.licenceUrl,
    );
    expect(screen.getByText(church.place)).toBeVisible();
  });

  it("speaks Icelandic on the Icelandic pages", () => {
    renderPhotos("is");

    expect(screen.getByRole("img")).toHaveAttribute("alt", churches[0].alt.is);
    expect(
      screen.getByRole("button", { name: translations.is.pausePhotos }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: `Ljósmynd: ${churches[0].photographer}`,
      }),
    ).toBeVisible();
  });

  it("knows the credit and description for every photograph", () => {
    expect(churches.length).toBeGreaterThanOrEqual(10);
    for (const church of churches) {
      for (const value of [
        church.name,
        church.place,
        church.alt.en,
        church.alt.is,
        church.photographer,
        church.licence,
      ]) {
        expect(value.trim(), church.name).not.toBe("");
      }
      expect(church.source).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      );
      expect(church.licenceUrl, church.name).toMatch(/^https?:\/\//);
      expect(church.image, church.name).toMatch(/\.webp/);
    }
  });
});
