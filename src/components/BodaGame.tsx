import { useEffect, useRef, useState } from "react";
import { Fuel, Pause, Play, Shield, Star, Volume2, VolumeX } from "lucide-react";
import { createSfx, type Sfx } from "@/game/audio";
import { createView, type View3d } from "@/game/view3d";
import { createInput, type Input } from "@/game/input";
import { createGame, snapshot, startShift, stepGame, type Game, type Hud, type Phase } from "@/game/sim";

const SAVE_KEY = "boda-rush-v1";

type Save = { v: 1; best: number; bestStreak: number; muted: boolean };

function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { v: 1, best: 0, bestStreak: 0, muted: false };
    const parsed = JSON.parse(raw) as Partial<Save>;
    return {
      v: 1,
      best: typeof parsed.best === "number" ? parsed.best : 0,
      bestStreak: typeof parsed.bestStreak === "number" ? parsed.bestStreak : 0,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { v: 1, best: 0, bestStreak: 0, muted: false };
  }
}

function storeSave(save: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode */
  }
}

function money(n: number) {
  return `KSh ${Math.round(n).toLocaleString("en-KE")}`;
}

const EMPTY_HUD: Hud = {
  cash: 0,
  best: 0,
  fuel: 100,
  helmets: 3,
  streak: 0,
  fares: 0,
  phase: "title",
  objective: "Snatch a fare",
  detail: "Stages glow maize",
  speedKph: 0,
  newBest: false,
  targetX: 0,
  targetY: 0,
  targetLabel: "",
  stars: 0,
  escape: 0,
  seen: false,
  ending: "",
  shook: 0,
  style: 0,
  boost: 0,
  drifting: false,
  toasts: [],
  day: 0.72,
  rain: 0,
  radio: "Boda FM",
};

export function BodaGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const nubRef = useRef<HTMLDivElement>(null);
  const hornRef = useRef<HTMLButtonElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<Input | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [phase, setPhase] = useState<Phase>("title");
  const [muted, setMuted] = useState(false);
  const [trackName, setTrackName] = useState("");
  const trackRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const map = mapRef.current;
    const stick = stickRef.current;
    const nub = nubRef.current;
    const horn = hornRef.current;
    if (!wrap || !canvas || !map || !stick || !nub || !horn) return;

    const save = loadSave();
    const game = createGame(save.best, save.bestStreak);
    const input = createInput();
    const sfx = createSfx();
    sfx.setMuted(save.muted);
    gameRef.current = game;
    inputRef.current = input;
    sfxRef.current = sfx;
    setMuted(save.muted);
    setHud(snapshot(game));

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const unbindStick = input.bindStick(stick, nub);
    const unbindHorn = input.bindHorn(horn);

    const view: View3d = createView(canvas);
    const mapCtx = map.getContext("2d");

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      view.resize(rect.width, rect.height, dpr);
      map.width = 132;
      map.height = 148;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const probe = {
      getYaw: () => game.yaw,
      getSpeed: () => game.speed,
      getStars: () => game.stars,
      setKeys: (codes: string[]) => input.setKeys(codes),
      setSteer: (v: number) => input.setSteer(v),
    };
    window.__controlsTest = probe;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTick = 0;
    let savedOver = false;
    const step = 1 / 60;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (game.hitStop > 0 && !media.matches) {
        game.hitStop -= dt;
      } else {
        acc += dt;
        let steps = 0;
        const actions = input.sample();
        let hornEdge = actions.hornPressed;
        let pauseEdge = actions.pausePressed;
        while (acc >= step && steps < 5) {
          const before = game.phase;
          stepGame(game, step, { ...actions, hornPressed: hornEdge, pausePressed: pauseEdge });
          hornEdge = false;
          pauseEdge = false;
          if (before !== game.phase) setPhase(game.phase);
          acc -= step;
          steps++;
        }
      }

      for (const event of game.events) {
        if (event === "horn") sfx.horn();
        else if (event === "coin") sfx.coin();
        else if (event === "crash") sfx.crash();
        else if (event === "fill") sfx.fill();
      }
      game.events.length = 0;
      sfx.engine(game.speed, game.phase === "play");
      sfx.wanted(game.phase === "play" && game.stars > 0 && game.seen);
      const own = trackRef.current;
      sfx.radio(game.phase === "play" && !own, game.stars > 0 && game.seen);
      if (own) {
        own.muted = sfx.muted();
        if (game.phase === "play" && !own.muted && own.paused) void own.play();
        if ((game.phase !== "play" || own.muted) && !own.paused) own.pause();
      }

      const snap = snapshot(game);
      view.render(
        game,
        dt,
        media.matches,
        game.phase === "play" ? { x: snap.targetX, y: snap.targetY } : null,
      );
      if (mapCtx) view.paintMap(mapCtx, game, map.width, map.height);

      hudTick += dt;
      if (hudTick > 0.12 || game.phase !== phase) {
        hudTick = 0;
        setHud(snap);
        setPhase(game.phase);
      }

      if (game.phase === "over" && !savedOver) {
        savedOver = true;
        const next = loadSave();
        storeSave({
          v: 1,
          best: Math.max(next.best, game.best, game.cash),
          bestStreak: Math.max(next.bestStreak, game.bestStreak, game.streak),
          muted: sfx.muted(),
        });
      }
      if (game.phase === "play") savedOver = false;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unbindStick();
      unbindHorn();
      input.destroy();
      sfx.engine(0, false);
      sfx.wanted(false);
      sfx.radio(false, false);
      trackRef.current?.pause();
      view.dispose();
      if (window.__controlsTest === probe) delete window.__controlsTest;
    };
    // phase is read as a hint; the sim ref is the source of truth inside the loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlock = () => sfxRef.current?.unlock();

  const onTrack = (file: File | undefined) => {
    if (!file) return;
    const prev = trackRef.current;
    if (prev) {
      prev.pause();
      URL.revokeObjectURL(prev.src);
    }
    const audio = new Audio(URL.createObjectURL(file));
    audio.loop = true;
    audio.volume = 0.55;
    trackRef.current = audio;
    setTrackName(file.name.replace(/\.[^.]+$/, ""));
    unlock();
  };

  const begin = () => {
    const game = gameRef.current;
    if (!game) return;
    unlock();
    startShift(game);
    setPhase("play");
    setHud(snapshot(game));
  };

  const resume = () => {
    const game = gameRef.current;
    if (!game) return;
    game.phase = "play";
    setPhase("play");
  };

  const pause = () => {
    const game = gameRef.current;
    if (!game || game.phase !== "play") return;
    game.phase = "pause";
    setPhase("pause");
  };

  const toggleMute = () => {
    const sfx = sfxRef.current;
    if (!sfx) return;
    const next = !sfx.muted();
    sfx.setMuted(next);
    setMuted(next);
    const save = loadSave();
    storeSave({ ...save, muted: next });
    unlock();
  };

  const fuelLow = hud.fuel < 18;

  return (
    <div ref={wrapRef} className="relative h-dvh w-full overflow-hidden bg-soil text-paper">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={mapRef}
        className="pointer-events-none absolute right-3 bottom-36 z-10 h-28 w-24 rounded-lg sm:bottom-4 sm:h-36 sm:w-32"
        aria-hidden
      />

      {phase !== "title" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="pointer-events-auto rounded-xl bg-ink/88 px-3 py-2 shadow-lg">
              <p className="font-display text-xl leading-none font-extrabold text-maize">{money(hud.cash)}</p>
              <p className="mt-1 text-xs text-muted">
                {hud.streak > 0 ? `${hud.streak} clean` : "No streak"} · {hud.fares} fares · {hud.speedKph} km/h
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Fuel className="size-4 text-maize" aria-hidden />
                <div className="h-2 w-24 overflow-hidden rounded-full bg-paper/15">
                  <div
                    className={`h-full rounded-full ${fuelLow ? "bg-clay" : "bg-maize"}`}
                    style={{ width: `${Math.max(0, Math.min(100, hud.fuel))}%` }}
                  />
                </div>
                <div className="flex gap-1" aria-label={`${hud.helmets} helmets left`}>
                  {[0, 1, 2].map((i) => (
                    <Shield
                      key={i}
                      className={`size-4 ${i < hud.helmets ? "text-paper" : "text-paper/25"}`}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div
                className={`flex gap-0.5 rounded-full bg-ink/88 px-2 py-1.5 ${hud.stars > 0 && hud.seen ? "wanted-stars" : ""}`}
                aria-label={`${hud.stars} of 5 wanted stars`}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`size-4 ${i <= hud.stars ? "fill-maize text-maize" : "text-paper/25"}`}
                    strokeWidth={2}
                  />
                ))}
              </div>
              {hud.stars > 0 && !hud.seen && (
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/88">
                  <div className="h-full bg-flag" style={{ width: `${Math.round(hud.escape * 100)}%` }} />
                </div>
              )}
              <div className="flex gap-2">
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-full bg-ink/88 text-paper"
                onClick={phase === "pause" ? resume : pause}
                aria-label={phase === "pause" ? "Resume" : "Pause"}
              >
                {phase === "pause" ? <Play className="size-5" /> : <Pause className="size-5" />}
              </button>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-full bg-ink/88 text-paper"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                aria-pressed={muted}
              >
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-sm rounded-full bg-ink/88 px-4 py-2 text-center">
            <p className="font-display text-sm leading-tight font-extrabold">{hud.objective}</p>
            <p className="text-xs text-muted">{hud.detail}</p>
            <p className="text-[10px] tracking-wide text-paper/50">
              {hud.rain > 0.3 ? "Rain · " : ""}
              {hud.day < 0.22 || hud.day > 0.78 ? "Night" : hud.day > 0.68 ? "Dusk" : "Day"} · {hud.radio}
            </p>
          </div>
        </div>
      )}

      {phase === "title" && (
        <div className="absolute inset-0 z-20 flex items-end justify-center p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-paper/15 bg-ink/92 p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-maize">NAIROBI · AFTER FIVE</p>
            <h1 className="mt-1 font-display text-5xl leading-none font-extrabold">Boda Rush</h1>
            <p className="mt-3 text-sm text-paper/90">
              The whole city, shortened so you can ride it. Day turns to night. Rain kills the grip.
              Clip a matatu and the stars come on. Cut through estates and parks.
            </p>
            <ul className="mt-4 space-y-1 text-sm text-muted">
              <li>WASD or the stick. The camera rides behind you.</li>
              <li>Hard hits raise the stars. Three is a roadblock, four is the chopper.</li>
              <li>Get off the tarmac. The bar drops a star once they lose you.</li>
            </ul>
            <button
              type="button"
              className="mt-5 h-12 w-full rounded-xl bg-maize font-display text-lg font-extrabold text-ink"
              onClick={begin}
            >
              Start shift
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => onTrack(e.target.files?.[0])}
            />
            <button
              type="button"
              className="mt-2 h-10 w-full rounded-xl border border-paper/20 text-sm text-paper"
              onClick={() => fileRef.current?.click()}
            >
              {trackName ? `Loaded · ${trackName}` : "Load a song from this device"}
            </button>
            {hud.best > 0 && (
              <p className="mt-3 text-center text-xs text-muted">Best shift {money(hud.best)}</p>
            )}
          </div>
        </div>
      )}

      {phase === "pause" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-ink p-6 text-center">
            <h2 className="font-display text-3xl font-extrabold">Held at the lights</h2>
            <p className="mt-2 text-sm text-muted">The city idles with you. Fuel does not.</p>
            <button
              type="button"
              className="mt-5 h-12 w-full rounded-xl bg-maize font-display text-lg font-extrabold text-ink"
              onClick={resume}
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {phase === "over" && (
        <div className="absolute inset-0 z-20 flex items-end justify-center p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-paper/15 bg-ink/94 p-6 text-center">
            <p className="text-xs font-semibold tracking-[0.16em] text-clay">
              {hud.ending === "busted" ? "BUSTED" : "WRECKED"}
            </p>
            <h2 className="mt-1 font-display text-4xl leading-none font-extrabold">
              {hud.ending === "busted" ? "They boxed you" : hud.newBest ? "New best shift" : "The bike is done"}
            </h2>
            <p className="mt-3 font-display text-2xl font-extrabold text-maize">{money(hud.cash)}</p>
            <p className="mt-1 text-sm text-muted">
              {hud.shook} stars lost · {hud.fares} fares · best {money(hud.best)}
            </p>
            <button
              type="button"
              className="mt-5 h-12 w-full rounded-xl bg-maize font-display text-lg font-extrabold text-ink"
              onClick={begin}
            >
              Ride again
            </button>
          </div>
        </div>
      )}

      <div className="touch-controls absolute inset-x-0 bottom-0 z-30 flex items-end justify-between px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div
          ref={stickRef}
          className="relative flex size-32 items-center justify-center rounded-full border border-paper/25 bg-ink/55"
          style={{ touchAction: "none" }}
          role="slider"
          aria-label="Ride stick"
          aria-valuemin={-1}
          aria-valuemax={1}
        >
          <div ref={nubRef} className="size-14 rounded-full bg-paper/90 shadow-md" />
        </div>
        <button
          ref={hornRef}
          type="button"
          className="flex size-20 items-center justify-center rounded-full bg-maize font-display text-sm font-extrabold text-ink"
          style={{ touchAction: "none" }}
          aria-label="Hoot"
        >
          Hoot
        </button>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
  }
}
