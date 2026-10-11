"use client";

import type { CubeLook } from "@/lib/cube3d/look";
import { useSettingsStore } from "@/lib/store/settingsStore";

/** The cube look chosen in Settings, to pass as `look` to every <Cube3D>. */
export function useCubeLook(): CubeLook {
  return useSettingsStore((s) => s.cubeLook);
}
