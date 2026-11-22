"use client";

import { ArrowRight, Github } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { downloadHref } from "@/lib/downloads";
import { PosMockup } from "@/components/marketing/pos-mockup";

const words = ["Restaurant", "software", "you", "actually", "own."];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-20 pb-24 sm:px-6 sm:pt-28">
      {/* Ambient gradient glow — transform/opacity only, no layout cost */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_88%),transparent)]"
      />

      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-success" />
          Open source · AGPL-3.0 · self-hosted
        </motion.div>

        <h1 className="flex flex-wrap justify-center gap-x-3 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          {words.map((word, i) => (
            <motion.span
              key={word}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className={word === "own." ? "text-primary" : undefined}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl"
        >
          POS, kitchen display, tables, reservations, inventory, and CRM — one
          self-hosted stack that runs on your own LAN. No subscription, no
          forced cloud dependency, no vendor lock-in. Your orders, your
          customers&rsquo; data, your server.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button size="lg" className="h-11 px-6 text-[15px]" nativeButton={false} render={<Link href="/signup" />}>
            Get started free
            <ArrowRight className="size-4" data-icon="inline-end" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 px-6 text-[15px]"
            nativeButton={false}
            render={<a href={downloadHref("github")} />}
          >
            <Github className="size-4" data-icon="inline-start" />
            View on GitHub
          </Button>
        </motion.div>
      </div>

      <div className="mt-16 sm:mt-20">
        <PosMockup />
      </div>
    </section>
  );
}
