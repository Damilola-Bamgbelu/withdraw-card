import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";
import bill100 from "../assets/bill100.jpg";

const ICON_COUNT = 5;

function cn(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** A real $100 bill. Muted = greyscale inactive state. */
function BillStack({ muted }: { muted?: boolean }) {
  return (
    <img
      src={bill100}
      alt=""
      draggable={false}
      aria-hidden="true"
      className={cn(
        "h-full w-full rounded-xs object-cover shadow-regular-xs",
        muted && "opacity-35 grayscale",
      )}
    />
  );
}

/** Rolling numeric value tween — used for the badge and CTA label. */
function useRollingNumber(value: number, duration = 0.25) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      setDisplay(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: "easeOut" });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  useMotionValueEvent(motionValue, "change", (latest) => setDisplay(latest));

  return Math.round(display);
}

/** iOS-time-picker-style wheel: the outgoing and incoming values travel
 *  together as one scrolling column (both stay visible while moving),
 *  shrinking and greying with distance from center, and the container
 *  mask fades them out at the edges — the seamless switch of Apple's
 *  picker. Colors mirror the soft-400 / strong-950 tokens (framer-motion
 *  needs literal values to interpolate). */
function RollingAmount({ value, direction }: { value: number; direction: 1 | -1 }) {
  const reduceMotion = useReducedMotion();
  const inactive = value === 0;

  return (
    <div className="wheel-mask relative h-10 w-full overflow-hidden text-amount font-semibold tabular-nums">
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          initial={
            reduceMotion
              ? { opacity: 0 }
              : {
                  y: direction * -24,
                  scale: 0.9,
                  color: "#a3a39a",
                  filter: "blur(5px)",
                }
          }
          animate={{
            y: 0,
            scale: 1,
            opacity: 1,
            color: inactive ? "#a3a39a" : "#0e0e0d",
            filter: "blur(0px)",
          }}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : {
                  y: direction * 24,
                  scale: 0.9,
                  color: "#a3a39a",
                  filter: "blur(4px)",
                  opacity: 0,
                }
          }
          transition={
            reduceMotion
              ? { duration: 0.15 }
              : { type: "spring", stiffness: 380, damping: 30 }
          }
          className="absolute inset-0 flex items-center justify-center"
        >
          ${value}
          {/* blinking caret — hints the amount is typeable */}
          <span className="caret-blink ml-1 inline-block h-6 w-0.5 rounded-full bg-sub-300" />
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export interface WithdrawCardProps {
  balance?: number;
}

export default function WithdrawCard({ balance = 500 }: WithdrawCardProps) {
  const reduceMotion = useReducedMotion();
  const step = balance / ICON_COUNT;

  const [amount, setAmount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [inputFlash, setInputFlash] = useState(false);
  const [overLimit, setOverLimit] = useState(false);
  const [fireRun, setFireRun] = useState(false);
  const amountRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevFillsRef = useRef<number[]>(Array(ICON_COUNT).fill(0));
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const iconControls = [
    useAnimationControls(),
    useAnimationControls(),
    useAnimationControls(),
    useAnimationControls(),
    useAnimationControls(),
  ];
  const iconRowControls = useAnimationControls();

  const remaining = balance - amount;
  const displayRemaining = useRollingNumber(remaining);
  const displayCta = useRollingNumber(amount);

  const isMax = amount >= balance && balance > 0;
  const isZero = amount <= 0;
  const isAtMax = remaining <= 0;

  const fills = useMemo(() => {
    return Array.from({ length: ICON_COUNT }, (_, i) =>
      clamp(amount / step - i, 0, 1),
    );
  }, [amount, step]);

  const shakeIconRow = useCallback(() => {
    if (reduceMotion) return;
    iconRowControls.start({
      x: [0, -5, 5, -3, 0],
      transition: { duration: 0.25 },
    });
  }, [iconRowControls, reduceMotion]);

  // Bounce newly-activated stacks (left-to-right, staggered) on increase;
  // decreases just let the clip drain smoothly, no pop.
  useEffect(() => {
    const prevFills = prevFillsRef.current;
    const newlyFilled: number[] = [];
    fills.forEach((f, i) => {
      if (prevFills[i] === 0 && f > 0) newlyFilled.push(i);
    });

    if (newlyFilled.length > 0 && !reduceMotion) {
      newlyFilled.forEach((i, order) => {
        // Squash-and-stretch drop-in: the stack elongates and lifts,
        // then lands with a squash before settling.
        iconControls[i].start({
          scaleY: [1, 1.4, 0.88, 1.05, 1],
          scaleX: [1, 0.82, 1.12, 0.98, 1],
          y: [0, -10, 0, 0, 0],
          transition: {
            delay: order * 0.06,
            duration: 0.5,
            times: [0, 0.35, 0.6, 0.8, 1],
            ease: "easeOut",
          },
        });
      });
    }

    prevFillsRef.current = fills;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fills, reduceMotion]);

  // Synchronized pulse when the balance is fully withdrawn.
  const prevIsMaxRef = useRef(false);
  useEffect(() => {
    if (isMax && !prevIsMaxRef.current && balance > 0) {
      if (reduceMotion) {
        iconControls.forEach((c) => c.start({ opacity: [1, 0.7, 1] }));
      } else {
        iconControls.forEach((c) =>
          c.start({
            scale: [1, 1.06, 1],
            transition: { duration: 0.3, ease: "easeInOut" },
          }),
        );
      }
    }
    prevIsMaxRef.current = isMax;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMax, balance, reduceMotion]);

  // Fire sweep runs through the CTA twice when the full balance is reached.
  const prevAtMaxRef = useRef(false);
  useEffect(() => {
    if (isAtMax && !prevAtMaxRef.current) {
      setFireRun(true);
      if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
      fireTimeoutRef.current = setTimeout(() => setFireRun(false), 2000);
    }
    prevAtMaxRef.current = isAtMax;
  }, [isAtMax]);

  const stepAmount = useCallback(
    (direction: 1 | -1) => {
      directionRef.current = direction;
      const next = clamp(amountRef.current + direction * step, 0, balance);
      if (next === amountRef.current) {
        shakeIconRow();
        return;
      }
      amountRef.current = next;
      setAmount(next);
    },
    [balance, step, shakeIconRow],
  );

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  }, []);

  const startHold = useCallback(
    (direction: 1 | -1) => {
      // A lost pointerup must never leave an orphaned interval running.
      clearHold();
      stepAmount(direction);
      holdTimeoutRef.current = setTimeout(() => {
        holdIntervalRef.current = setInterval(() => {
          stepAmount(direction);
        }, 150);
      }, 400);
    },
    [stepAmount, clearHold],
  );

  // Safety net: any pointer release or tab switch ends the hold.
  useEffect(() => {
    window.addEventListener("pointerup", clearHold);
    window.addEventListener("blur", clearHold);
    return () => {
      window.removeEventListener("pointerup", clearHold);
      window.removeEventListener("blur", clearHold);
      clearHold();
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (overLimitTimeoutRef.current) clearTimeout(overLimitTimeoutRef.current);
      if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
    };
  }, [clearHold]);

  // Free-form amount input: strip non-numerics, clamp to [0, balance],
  // flash the border red when the user types past the balance.
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9]/g, "");
      const parsed = raw === "" ? 0 : parseInt(raw, 10);
      directionRef.current = parsed >= amountRef.current ? 1 : -1;
      if (parsed > balance) {
        setInputFlash(true);
        setOverLimit(true);
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setInputFlash(false), 300);
        if (overLimitTimeoutRef.current) clearTimeout(overLimitTimeoutRef.current);
        overLimitTimeoutRef.current = setTimeout(() => setOverLimit(false), 2500);
      } else {
        setOverLimit(false);
      }
      const next = clamp(parsed, 0, balance);
      amountRef.current = next;
      setAmount(next);
    },
    [balance],
  );

  const ctaDisabled = amount <= 0;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-weak-50 p-6">
      <div className="w-full max-w-md rounded-20 bg-white-0 p-8 shadow-regular-md">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-label-lg font-medium text-strong-950">
              Withdraw
            </h2>
            <div className="rounded-full bg-warning-lighter px-2 py-0.5 text-2xs font-medium text-warning-dark">
              ${displayRemaining} left
            </div>
          </div>
          <button
            type="button"
            aria-label="More information"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-soft-400 transition-colors hover:bg-weak-50 hover:text-sub-600"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 9v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="6.75" r="0.9" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Bill-stack row */}
        <motion.div
          animate={iconRowControls}
          className="mb-8 flex items-center justify-center gap-2"
        >
          {fills.map((fraction, i) => (
            <motion.div
              key={i}
              animate={iconControls[i]}
              style={{ transformOrigin: "center bottom" }}
              className="relative h-6 w-14"
            >
              {/* empty base — greyscale silhouette always visible */}
              <div className="absolute inset-0">
                <BillStack muted />
              </div>
              {/* full-color overlay, revealed left-to-right via clip */}
              <motion.div
                className="absolute inset-0"
                animate={{
                  clipPath: `inset(0 ${(1 - fraction) * 100}% 0 0)`,
                }}
                transition={{
                  duration: reduceMotion ? 0 : 0.2,
                  ease: "easeOut",
                }}
              >
                <BillStack />
              </motion.div>
            </motion.div>
          ))}
        </motion.div>

        {/* Stepper track: grey container, white pill buttons, amount in the middle */}
        <div
          className={cn(
            "relative mb-4 flex items-center rounded-full border bg-neutral-100 p-0.5 transition-colors duration-150",
            inputFlash ? "border-error-base" : "border-transparent",
          )}
        >
          {/* amount in the middle, layered behind the pills */}
          {!editing && (
            <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
              <RollingAmount value={amount} direction={directionRef.current} />
            </div>
          )}

          <motion.button
            type="button"
            aria-label="Decrease amount"
            whileTap={reduceMotion ? undefined : { scale: 0.93, y: 2 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            onPointerDown={() => startHold(-1)}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            className={cn(
              "z-10 flex h-12 flex-1 items-center justify-center rounded-full bg-white-0 shadow-regular-sm transition-[opacity,box-shadow] active:shadow-none",
              isZero && "opacity-40",
            )}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-strong-950" aria-hidden="true">
              <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6.5 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </motion.button>

          {/* center gap — click to type the amount in place */}
          {editing ? (
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              aria-label="Withdrawal amount"
              value={amount === 0 ? "" : String(amount)}
              onChange={handleInputChange}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="z-10 h-12 w-24 shrink-0 bg-transparent text-center text-amount font-semibold tabular-nums text-strong-950 outline-none"
            />
          ) : (
            <button
              type="button"
              aria-label="Edit amount"
              onClick={() => setEditing(true)}
              className="z-10 h-12 w-24 shrink-0 cursor-text"
            />
          )}

          <motion.button
            type="button"
            aria-label="Increase amount"
            whileTap={reduceMotion ? undefined : { scale: 0.93, y: 2 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            onPointerDown={() => startHold(1)}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            className={cn(
              "z-10 flex h-12 flex-1 items-center justify-center rounded-full bg-white-0 shadow-regular-sm transition-[opacity,box-shadow] active:shadow-none",
              isMax && "opacity-40",
            )}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-strong-950" aria-hidden="true">
              <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </motion.button>
        </div>

        {/* Over-limit error, fixed height so the layout stays stable */}
        <div className="mb-4 h-4 text-center" aria-live="polite">
          {overLimit && (
            <span className="text-paragraph-xs text-error-base">
              Amount is above your remaining balance
            </span>
          )}
        </div>

        {/* Helper text — one line; only "Withdraw now" is active */}
        <p className="mb-6 whitespace-nowrap text-center text-paragraph-xs text-soft-400">
          <span className="font-medium text-strong-950">Withdraw now,</span>{" "}
          top up later. Each stack is ${step}.
        </p>

        {/* CTA — inline white pill with a subtle stroke, fire-gradient hover */}
        <button
          type="button"
          disabled={ctaDisabled}
          className={cn(
            "group relative w-full overflow-hidden rounded-full border border-soft-200/70 bg-white-0 py-3.5 text-label-md font-semibold text-strong-950 shadow-regular-xs transition-shadow",
            ctaDisabled ? "cursor-not-allowed opacity-40" : "hover:shadow-regular-sm",
            fireRun && "cta-fire-active",
          )}
        >
          {/* fire band that sweeps across on hover */}
          {!ctaDisabled && (
            <span
              aria-hidden="true"
              className="cta-fire pointer-events-none absolute inset-y-0 left-0 w-2/5"
            />
          )}
          <span className="relative">Withdraw ${displayCta}</span>
        </button>
      </div>
    </div>
  );
}
