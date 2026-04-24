"use client";

import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";
import { Header } from "./Header";

export function PageWrapper({
  children,
  narrow = false,
}: PropsWithChildren<{ narrow?: boolean }>) {
  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop />
      <Header />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={`relative z-10 mx-auto w-full px-6 pb-16 ${
          narrow ? "max-w-lg" : "max-w-6xl"
        }`}
      >
        {children}
      </motion.main>
      <Footer />
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_-10%,rgba(124,106,247,0.18),transparent_45%),radial-gradient(circle_at_110%_10%,rgba(78,205,196,0.08),transparent_55%)]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>
    </>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-6 pb-10 text-[11px] text-subtle">
      <p className="tracking-[0.12em] uppercase">
        Private tips, routed through Loyal Network
      </p>
      <p className="text-subtle">
        Built for the Loyal Hackathon · GhostTip keeps recipients private.
      </p>
    </footer>
  );
}
