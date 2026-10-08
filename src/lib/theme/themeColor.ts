/**
 * The browser UI colour (status bar / address bar tint, `<meta name="theme-color">`) for each theme: the theme's
 * page background, so the chrome around the app never disagrees with it. `themeColor.test.ts` keeps this table in
 * step with the `--background` values in app/globals.css.
 */
export const THEME_COLORS: Record<string, string> = {
  nebula: "#0c0e12",
  mint: "#0b0f0f",
  carbon: "#0a0a0b",
  sunset: "#130f0e",
  terminal: "#070b08",
  speedcube: "#0b0d12",
  paper: "#eef0f4",
};

export const DEFAULT_THEME_COLOR = THEME_COLORS.nebula;

export function themeColorFor(theme: string | null | undefined): string {
  return (theme && THEME_COLORS[theme]) || DEFAULT_THEME_COLOR;
}

/**
 * Inline script for the top of <body> (the metadata tags are already parsed by then): sets the theme colour from the
 * theme the paint script put on <html>, before first paint — so a saved paper theme never shows a dark status bar.
 * ThemeColorSync keeps it right when the theme is changed later.
 */
export const THEME_COLOR_SCRIPT = `(function(){try{var c=${JSON.stringify(THEME_COLORS)};var v=c[document.documentElement.dataset.theme]||${JSON.stringify(DEFAULT_THEME_COLOR)};var m=document.querySelectorAll('meta[name="theme-color"]');if(!m.length){var e=document.createElement("meta");e.name="theme-color";document.head.appendChild(e);m=[e]}for(var i=0;i<m.length;i++)m[i].setAttribute("content",v)}catch(e){}})()`;
