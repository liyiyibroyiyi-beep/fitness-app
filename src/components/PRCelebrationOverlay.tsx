"use client";

// ============================================================
// PRCelebrationOverlay
// ============================================================
// When a PR is hit, this component:
//   1. Triggers a short phone vibration (navigator.vibrate)
//   2. Shoots a full-screen burst of golden confetti particles
//   3. Displays a high-end golden-gradient "WEIGHT BREAKTHROUGH!" modal
//   4. Auto-dismisses after 3 seconds with a fade-out
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import type { PRResult } from "@/lib/types";

interface Props {
  pr: PRResult | null;
  onDismiss: () => void;
}

export default function PRCelebrationOverlay({ pr, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fireConfetti = useCallback(() => {
    // Fire multiple bursts of golden confetti
    const duration = 2500;
    const end = Date.now() + duration;
    const colors = ["#FFD700", "#FFA500", "#FFEC8B", "#DAA520", "#B8860B", "#F5DEB3"];

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors,
        gravity: 0.8,
        scalar: 1.2,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors,
        gravity: 0.8,
        scalar: 1.2,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();

    // One big central burst
    setTimeout(() => {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { x: 0.5, y: 0.4 },
        colors: ["#FFD700", "#FFEC8B", "#FFA500"],
        gravity: 0.7,
        scalar: 1.5,
        shapes: ["circle", "square"],
      });
    }, 200);

    // Second wave
    setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 120,
        origin: { x: 0.5, y: 0.3 },
        colors: ["#FFD700", "#B8860B", "#DAA520"],
        gravity: 0.6,
        scalar: 1.3,
        shapes: ["circle", "star"],
      });
    }, 600);
  }, []);

  useEffect(() => {
    if (!pr) return;
    setVisible(true);
    setExiting(false);

    // Phone vibration (short ~30ms)
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }

    // Fire confetti
    fireConfetti();

    // Auto-dismiss after 3s
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => {
        setVisible(false);
        onDismiss();
      }, 500); // match CSS transition
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pr, fireConfetti, onDismiss]);

  if (!visible || !pr) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-500 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Invisible canvas anchor for confetti origin reference */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 51 }}
      />

      {/* Central celebration modal */}
      <div
        className={`relative z-[52] px-10 py-8 rounded-2xl text-center transition-all duration-500 ${
          exiting ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
        style={{
          background:
            "linear-gradient(135deg, rgba(20,20,20,0.95) 0%, rgba(40,30,10,0.95) 50%, rgba(20,20,20,0.95) 100%)",
          border: "1.5px solid rgba(255,215,0,0.5)",
          boxShadow:
            "0 0 40px rgba(255,215,0,0.25), 0 0 80px rgba(255,215,0,0.1), inset 0 0 30px rgba(255,215,0,0.05)",
        }}
      >
        {/* Icon */}
        <div className="text-5xl mb-4">🏆</div>

        {/* Main title */}
        <h1
          className="text-4xl sm:text-5xl font-black tracking-widest uppercase mb-3"
          style={{
            background:
              "linear-gradient(135deg, #f5af19 0%, #f12711 50%, #f5af19 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 0 12px rgba(245,175,25,0.5))",
          }}
        >
          WEIGHT BREAKTHROUGH!
        </h1>

        {/* Exercise name */}
        <p className="text-gray-300 text-lg mb-4">{pr.exerciseName}</p>

        {/* PR details */}
        <div className="inline-flex items-center gap-3 bg-black/40 rounded-lg px-5 py-3 border border-white/10">
          {pr.oldBest && (
            <>
              <span className="text-gray-500 line-through text-lg">
                {pr.type === "weight"
                  ? `${pr.oldBest.weight}kg`
                  : `${pr.oldBest.reps} reps`}
              </span>
              <span className="text-gold-gradient text-2xl font-bold">→</span>
            </>
          )}
          <span
            className="text-3xl font-black"
            style={{
              background:
                "linear-gradient(135deg, #FFD700, #FFA500)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {pr.type === "weight"
              ? `${pr.newBest.weight}kg`
              : `${pr.newBest.reps} reps`}
          </span>
          {pr.type === "reps" && (
            <span className="text-gray-400 text-sm">
              @ {pr.newBest.weight}kg
            </span>
          )}
        </div>

        {/* Sub-label */}
        <p className="text-gray-500 text-xs mt-4 tracking-widest uppercase">
          {pr.type === "weight" ? "New Weight Record" : "New Rep Record"}
        </p>
      </div>
    </div>
  );
}
