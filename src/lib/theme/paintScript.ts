/**
 * Runs while the HTML is still being parsed (inlined in <head> by app/layout.tsx),
 * so a saved theme / effects level is on <html> before the first paint —
 * AppBootstrap and FxLayer set the same attributes after hydration, from the
 * same persisted blob. A no-op when storage is empty, blocked or unreadable.
 *
 * The id lists mirror THEMES / FX_LEVELS in store/settingsStore.ts (a test keeps
 * them in step); the v1 blob stored "light" for what is now "paper".
 */
export const PAINT_SETTINGS_SCRIPT = `(function(){try{var raw=localStorage.getItem("cube-timer-settings");if(!raw)return;var s=JSON.parse(raw).state;if(!s)return;var d=document.documentElement;var t=s.theme;if(t==="light")t="paper";if(["nebula","mint","carbon","sunset","terminal","speedcube","paper"].indexOf(t)>-1)d.dataset.theme=t;var f=s.fxLevel;if(["off","spicy","insane"].indexOf(f)>-1)d.dataset.fxLevel=f}catch(e){}})()`;
