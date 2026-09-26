import { describe, expect, it } from "vitest";
import { createRoomStore, type RoomChannel, type RoomMember, type RoomTransport } from "./roomStore";
import { standings } from "@/lib/social/roomLogic";

/** In-memory stand-in for Supabase Realtime: broadcast (not echoed to the sender) + presence, delivered asynchronously like the real thing. */
class Bus {
  channels = new Map<string, Set<FakeChannel>>();
  presence = new Map<string, Map<string, RoomMember>>();

  room(name: string) {
    if (!this.channels.has(name)) this.channels.set(name, new Set());
    if (!this.presence.has(name)) this.presence.set(name, new Map());
    return { chans: this.channels.get(name)!, pres: this.presence.get(name)! };
  }

  syncAll(name: string) {
    for (const ch of this.room(name).chans) queueMicrotask(() => ch.syncHandlers.forEach((h) => h()));
  }

  transport(): RoomTransport {
    return {
      channel: (name, opts) => new FakeChannel(this, name, opts.config.presence.key),
      removeChannel: (ch) => {
        const f = ch as FakeChannel;
        const { chans, pres } = this.room(f.name);
        chans.delete(f);
        pres.delete(f.key);
        this.syncAll(f.name);
      },
    };
  }
}

class FakeChannel implements RoomChannel {
  bcastHandlers: ((m: { payload: unknown }) => void)[] = [];
  syncHandlers: (() => void)[] = [];
  constructor(
    private bus: Bus,
    public name: string,
    public key: string,
  ) {}
  on(type: "broadcast" | "presence", _filter: unknown, cb: never): RoomChannel {
    if (type === "broadcast") this.bcastHandlers.push(cb);
    else this.syncHandlers.push(cb);
    return this;
  }
  subscribe(cb: (status: string) => void) {
    this.bus.room(this.name).chans.add(this);
    queueMicrotask(() => cb("SUBSCRIBED"));
    return this;
  }
  async track(p: RoomMember) {
    this.bus.room(this.name).pres.set(this.key, p);
    this.bus.syncAll(this.name);
  }
  async send(m: { payload: unknown }) {
    for (const ch of this.bus.room(this.name).chans) {
      if (ch === this) continue;
      const payload = structuredClone(m.payload);
      queueMicrotask(() => ch.bcastHandlers.forEach((h) => h({ payload })));
    }
  }
  presenceState<T>() {
    return Object.fromEntries([...this.bus.room(this.name).pres].map(([k, v]) => [k, [{ ...v, presence_ref: "r" } as T]]));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(20);

function client(bus: Bus) {
  let n = 0;
  return createRoomStore({ transport: () => bus.transport(), scramble: async () => `R U F ${++n}` });
}

async function room(bus: Bus, people: { name: string; role?: "racer" | "spectator" }[]) {
  const stores = people.map(() => client(bus));
  await stores[0].getState().open({ name: people[0].name, role: people[0].role ?? "racer", cube: false });
  await settle();
  const code = stores[0].getState().code!;
  for (let i = 1; i < people.length; i++) {
    await sleep(3); // distinct joinedAt, so the host is unambiguous
    await stores[i].getState().open({ code, name: people[i].name, role: people[i].role ?? "racer", cube: false });
    await settle();
  }
  await settle();
  return stores;
}

describe("race rooms (multi-client)", () => {
  it("agrees on members and host, and runs a free-for-all round", async () => {
    const bus = new Bus();
    const [a, b, c] = await room(bus, [{ name: "Alice" }, { name: "Bob" }, { name: "Cara", role: "spectator" }]);
    for (const s of [a, b, c]) {
      expect(s.getState().members).toHaveLength(3);
      expect(s.getState().hostId).toBe(a.getState().me!.id);
    }

    await a.getState().hostStartRound();
    await settle();
    const round = c.getState().state.round!;
    expect(round.racers.sort()).toEqual([a.getState().me!.id, b.getState().me!.id].sort());
    expect(b.getState().state.round?.scramble).toBe(round.scramble);

    // Non-hosts can't drive the room.
    await b.getState().hostStartRound();
    await settle();
    expect(c.getState().state.round?.n).toBe(1);

    b.getState().relayMove({ token: "R", timeStampMs: 1 });
    b.getState().relayMove({ token: "U", timeStampMs: 2 });
    await sleep(200);
    expect(c.getState().moves[b.getState().me!.id]?.map((m) => m.token)).toEqual(["R", "U"]);

    b.getState().finish(9000);
    await settle();
    expect(c.getState().state.round?.done).toBe(false);
    a.getState().finish(10000);
    await settle();
    const st = c.getState().state;
    expect(st.round?.done).toBe(true);
    expect(st.history).toHaveLength(1);
    const table = standings(st.history.map((h) => h.results));
    expect(table[0].id).toBe(b.getState().me!.id);
    expect(st.names[b.getState().me!.id]).toBe("Bob");
  });

  it("ignores a duplicate or stale finish", async () => {
    const bus = new Bus();
    const [a, b] = await room(bus, [{ name: "A" }, { name: "B" }]);
    await a.getState().hostStartRound();
    await settle();
    b.getState().finish(5000);
    b.getState().finish(1000);
    await settle();
    expect(a.getState().state.results[b.getState().me!.id]).toBe(5000);
  });

  it("runs a bracket heat by heat to a champion", async () => {
    const bus = new Bus();
    const [a, b, c] = await room(bus, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    a.getState().hostSetMode("bracket");
    await settle();
    const ids = [a, b, c].map((s) => s.getState().me!.id);
    const storeOf = (id: string) => [a, b, c].find((s) => s.getState().me!.id === id)!;

    // 3 racers: seed 1 (A) gets a bye, B vs C race first.
    await a.getState().hostStartRound();
    await settle();
    expect(b.getState().state.round?.racers).toEqual([ids[1], ids[2]]);
    storeOf(ids[1]).getState().finish(8000);
    storeOf(ids[2]).getState().finish(null);
    await settle();

    await a.getState().hostStartRound();
    await settle();
    const final = c.getState().state.round!;
    expect(final.racers).toEqual([ids[0], ids[1]]);
    a.getState().finish(12000);
    b.getState().finish(11000);
    await settle();
    const bracket = c.getState().state.bracket!;
    expect(bracket.rounds[bracket.rounds.length - 1][0].winner).toBe(ids[1]);
  });

  it("hands hosting to the next member, state intact, when the host leaves", async () => {
    const bus = new Bus();
    const [a, b, c] = await room(bus, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    await a.getState().hostStartRound();
    await settle();
    a.getState().leave();
    await settle();
    expect(b.getState().hostId).toBe(b.getState().me!.id);
    expect(c.getState().hostId).toBe(b.getState().me!.id);
    // The new host can close out the round the old host started.
    b.getState().hostEndRound();
    await settle();
    expect(c.getState().state.round?.done).toBe(true);
    expect(c.getState().state.history[0].results.every((r) => r.timeMs === null)).toBe(true);
  });
});
