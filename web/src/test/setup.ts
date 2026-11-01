import "@testing-library/jest-dom/vitest";

// jsdom has no layout, so it can't scroll.
window.scrollTo = () => undefined;
