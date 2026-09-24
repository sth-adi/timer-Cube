"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLatestGyro, subscribeGyro, subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { SOLVED_FACELETS, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { calibrationFor, useGyroStore } from "@/lib/store/gyroStore";
import { Cube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import {
  FACE_NORMALS,
  HOME_ORIENTATION,
  apply,
  orientationFromQuat,
  physicalFaceAt,
  viewerMove,
  type Mat3,
} from "@/lib/gyro/orientation";

/**
 * One input layer for every Play experience, so each works three ways:
 * a connected smart cube, the keyboard (csTimer's virtual-cube keys), or
 * the on-screen turn pad. Every turn arrives as both its *physical* name
 * (by center color — what gates and cube states care about) and its *grip*
 * name (what your hands did, with the gyro following regrips when the cube
 * has one — what game controls care about).
 */

export interface PlayTurn {
  /** Named by the turned face's center color (engine frame: white U, green F). */
  physical: string;
  /** Named from the solver's grip: R is whatever face your right hand turned. */
  grip: string;
  source: "cube" | "key" | "pad";
}

/** csTimer's virtual-cube keys, in grip notation. */
export const KEY_TURNS: Record<string, string> = {
  i: "R",
  k: "R'",
  d: "L",
  e: "L'",
  j: "U",
  f: "U'",
  s: "D",
  l: "D'",
  h: "F",
  g: "F'",
  w: "B",
  o: "B'",
};

/** The cube's orientation right now: live from the gyro when it has one, else the home grip (yellow top, green front). */
export function currentOrientation(): Mat3 {
  const { gyroActive, protocolName } = useSmartCubeStore.getState();
  const ref = useGyroStore.getState().ref;
  const latest = getLatestGyro();
  if (!gyroActive || !ref || !latest) return HOME_ORIENTATION;
  return orientationFromQuat(latest.q, ref, calibrationFor(protocolName).calibration);
}

/** The grip turn `gripToken` as a physical turn, for the cube held in `orientation`. */
export function physicalFromGrip(gripToken: string, orientation: Mat3 = HOME_ORIENTATION): string {
  return physicalFaceAt(orientation, gripToken[0]) + gripToken.slice(1);
}

function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
}

/**
 * Subscribes to every turn from every source. Returns the cube's state
 * (the real cube's when connected, else a virtual one the pad and keys
 * drive), plus `press` for on-screen pads and `resetVirtual`.
 */
export function usePlayInput(onTurn: (t: PlayTurn) => void, { keyboard = true }: { keyboard?: boolean } = {}) {
  const handler = useRef(onTurn);
  useEffect(() => {
    handler.current = onTurn;
  });
  const connected = useSmartCubeStore((s) => s.connected);
  const liveFacelets = useSmartCubeStore((s) => s.liveFacelets);
  const virtual = useRef<CubeJSInstance | null>(null);
  const [virtualFacelets, setVirtualFacelets] = useState(SOLVED_FACELETS);

  const press = useCallback((gripToken: string, source: "key" | "pad" = "pad") => {
    const orientation = currentOrientation();
    const physical = physicalFromGrip(gripToken, orientation);
    if (!useSmartCubeStore.getState().connected) {
      virtual.current ??= new Cube();
      virtual.current.move(physical);
      setVirtualFacelets(virtual.current.asString());
    }
    handler.current({ physical, grip: gripToken, source });
  }, []);

  const resetVirtual = useCallback((to?: string) => {
    virtual.current = to ? Cube.fromString(to) : new Cube();
    setVirtualFacelets(virtual.current.asString());
  }, []);

  useEffect(
    () =>
      subscribeRawMoves(({ token }) => {
        const grip = viewerMove(token, currentOrientation());
        // The bus fires before liveFacelets updates: let the store catch up first.
        window.setTimeout(() => handler.current({ physical: token, grip, source: "cube" }), 0);
      }),
    [],
  );

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inField(e.target)) return;
      const turn = KEY_TURNS[e.key.toLowerCase()];
      if (!turn) return;
      e.preventDefault();
      press(turn, "key");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, press]);

  return { connected, facelets: connected ? liveFacelets : virtualFacelets, press, resetVirtual };
}

export interface Tilt {
  x: number;
  y: number;
  source: "cube" | "phone" | "keys" | "none";
}

/**
 * How the cube is tilted, as a ref updated at gyro rate (never re-renders):
 * x > 0 means its right side dipped, y > 0 means its front edge dipped
 * toward you. Measured on whichever face is on top, so a regrip doesn't
 * matter. `level()` declares the current pose flat. Without a gyro cube,
 * a phone's own tilt sensor can stand in (`enablePhone()`; iOS asks first).
 */
export function useTilt(gain = 2.4) {
  const tilt = useRef<Tilt>({ x: 0, y: 0, source: "none" });
  const raw = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zero = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [phone, setPhone] = useState(false);

  const publish = useCallback(
    (source: Tilt["source"]) => {
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      const dead = (v: number) => (Math.abs(v) < 0.025 ? 0 : v);
      tilt.current = {
        x: clamp(dead(raw.current.x - zero.current.x) * gain),
        y: clamp(dead(raw.current.y - zero.current.y) * gain),
        source,
      };
    },
    [gain],
  );

  useEffect(
    () =>
      subscribeGyro(() => {
        const m = currentOrientation();
        const top = physicalFaceAt(m, "U");
        const n = apply(m, FACE_NORMALS[top]);
        raw.current = { x: n[0], y: n[2] };
        publish("cube");
      }),
    [publish],
  );

  useEffect(() => {
    if (!phone) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (useSmartCubeStore.getState().gyroActive) return;
      const b = ((e.beta ?? 0) * Math.PI) / 180;
      const g = ((e.gamma ?? 0) * Math.PI) / 180;
      raw.current = { x: Math.sin(g), y: Math.sin(b) };
      publish("phone");
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [phone, publish]);

  const level = useCallback(() => {
    zero.current = { ...raw.current };
    publish(tilt.current.source);
  }, [publish]);

  const enablePhone = useCallback(async () => {
    const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if (DOE?.requestPermission && (await DOE.requestPermission()) !== "granted") return false;
    } catch {
      return false;
    }
    setPhone(true);
    // A phone held for reading tips toward you: take wherever it is as flat.
    window.setTimeout(() => (zero.current = { ...raw.current }), 250);
    return true;
  }, []);

  /** Keyboard/pad tilt, used when neither sensor is live. */
  const nudge = useCallback((x: number, y: number) => {
    if (tilt.current.source === "cube" || tilt.current.source === "phone") return;
    tilt.current = { x, y, source: x || y ? "keys" : "none" };
  }, []);

  return { tilt, level, enablePhone, phone, nudge };
}
