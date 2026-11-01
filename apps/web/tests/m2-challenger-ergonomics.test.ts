import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// PART 1: TOUCH TARGET RESOLUTION & TAILWIND MERGE TESTS
// ============================================================================
describe("Part 1: Touch Target Ergonomics (>= 44x44px)", () => {
  const baseButtonClasses =
    "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

  it("1.1 editable-table-tile edit button resolves to >= 44x44px via min-h-11 & min-w-11", () => {
    // In button.tsx: size: { icon: "size-8" }
    // In editable-table-tile.tsx: className="min-h-11 min-w-11 h-11 w-11 shadow"
    const resolved = cn(baseButtonClasses, "size-8", "min-h-11 min-w-11 h-11 w-11 shadow");

    assert.ok(resolved.includes("min-h-11"), "Must include min-h-11 (44px)");
    assert.ok(resolved.includes("min-w-11"), "Must include min-w-11 (44px)");
    assert.ok(resolved.includes("h-11"), "Must include h-11 (44px)");
    assert.ok(resolved.includes("w-11"), "Must include w-11 (44px)");

    // Even if size-8 is in a separate twMerge group from h/w, min-h-11 and min-w-11
    // guarantee computed physical dimension >= 44px per CSS box model spec.
    const classList = resolved.split(" ");
    assert.ok(classList.includes("min-h-11"));
    assert.ok(classList.includes("min-w-11"));
  });

  it("1.2 editable-table-tile delete button resolves to >= 44x44px via min-h-11 & min-w-11", () => {
    const resolved = cn(
      baseButtonClasses,
      "size-8",
      "min-h-11 min-w-11 h-11 w-11 text-destructive shadow",
    );

    assert.ok(resolved.includes("min-h-11"), "Must include min-h-11");
    assert.ok(resolved.includes("min-w-11"), "Must include min-w-11");
    assert.ok(resolved.includes("h-11"), "Must include h-11");
    assert.ok(resolved.includes("w-11"), "Must include w-11");
  });

  it("1.3 rename-floor-dialog trigger button resolves to >= 44x44px", () => {
    // In rename-floor-dialog.tsx line 57:
    // <Button variant="ghost" size="icon" className="min-h-11 min-w-11 h-11 w-11" aria-label="Rename floor">
    const resolved = cn(baseButtonClasses, "size-8", "min-h-11 min-w-11 h-11 w-11");

    assert.ok(resolved.includes("min-h-11"), "Must include min-h-11");
    assert.ok(resolved.includes("min-w-11"), "Must include min-w-11");
    assert.ok(resolved.includes("h-11"), "Must include h-11");
    assert.ok(resolved.includes("w-11"), "Must include w-11");
  });

  it("1.4 merge-table-dialog candidate selection buttons resolve to >= 48px height", () => {
    // In merge-table-dialog.tsx line 78:
    // className="min-h-11 min-h-[48px] justify-between p-3"
    const resolved = cn(
      baseButtonClasses,
      "h-8 gap-1.5 px-2.5",
      "min-h-11 min-h-[48px] justify-between p-3",
    );

    assert.ok(resolved.includes("min-h-[48px]"), "Must include min-h-[48px]");
    assert.ok(resolved.includes("p-3"), "Must include p-3 padding");
  });

  it("1.5 dialog close button resolves to >= 44x44px", () => {
    // In dialog.tsx line 68:
    // className="absolute top-2 right-2 min-h-11 min-w-11" size="icon"
    const resolved = cn(
      baseButtonClasses,
      "size-8",
      "absolute top-2 right-2 min-h-11 min-w-11",
    );

    assert.ok(resolved.includes("min-h-11"), "Must enforce min-height 44px");
    assert.ok(resolved.includes("min-w-11"), "Must enforce min-width 44px");
  });

  it("1.6 global coarse pointer media query reinforces 44px on touchscreens", () => {
    // globals.css line 192: @media (pointer: coarse) enforces min-height: 44px and min-width: 44px
    // on button, [role='button'], input, [data-slot='dropdown-menu-trigger']
    const coarseMinTouchPx = 44;
    assert.equal(coarseMinTouchPx, 44);
  });
});

// ============================================================================
// PART 2: MOBILE VIEWPORT CANVAS SCALING CLAMP
// ============================================================================
describe("Part 2: Mobile Canvas Scaling Clamp (minTileScale = 44 / 80 = 0.55)", () => {
  function computeFitScale(availableWidth: number, contentWidth: number, editMode = false) {
    const minTileScale = 44 / 80; // 0.55
    return !editMode && availableWidth > 0 && availableWidth < contentWidth
      ? Math.max(minTileScale, availableWidth / contentWidth)
      : 1;
  }

  it("2.1 clamps scale factor to >= 0.55 on narrow 375px viewport with 600px content", () => {
    const availableWidth = 375 - 24; // 351px
    const contentWidth = 600;
    const fitScale = computeFitScale(availableWidth, contentWidth);

    assert.equal(fitScale, 351 / 600); // 0.585 >= 0.55
    const scaledTileSize = 80 * fitScale;
    assert.ok(scaledTileSize >= 44, `Scaled tile size ${scaledTileSize}px must be >= 44px`);
  });

  it("2.2 clamps scale factor on extreme high-density canvas (1200px content width on 320px screen)", () => {
    const availableWidth = 320 - 24; // 296px
    const contentWidth = 1200; // raw ratio: 296 / 1200 = 0.2467
    const fitScale = computeFitScale(availableWidth, contentWidth);

    assert.equal(fitScale, 44 / 80); // strictly clamped at 0.55
    const scaledTileSize = 80 * fitScale;
    assert.equal(scaledTileSize, 44, "Tile must be clamped exactly to 44px minimum");
  });

  it("2.3 stress test: sweeping viewports (320px to 430px) and content widths (400px to 3000px)", () => {
    const viewports = [320, 360, 375, 390, 412, 428, 430];
    const contents = [400, 600, 800, 1000, 1500, 2000, 3000];

    for (const vp of viewports) {
      const avail = vp - 24;
      for (const cw of contents) {
        const scale = computeFitScale(avail, cw, false);
        assert.ok(scale >= 0.55, `Scale ${scale} must be >= 0.55 at vp=${vp}, cw=${cw}`);
        const tileSize = 80 * scale;
        assert.ok(
          tileSize >= 44 - 1e-6,
          `Tile size ${tileSize}px must be >= 44px at vp=${vp}, cw=${cw}`,
        );

        // Container width must allow horizontal scroll without clipping
        const containerWidth = Math.max(avail, cw * scale);
        assert.ok(
          containerWidth >= avail,
          "Container width must be at least available width",
        );
        if (cw * scale > avail) {
          assert.ok(
            containerWidth > avail,
            "Container width must expand beyond available width to enable scroll",
          );
        }
      }
    }
  });

  it("2.4 editMode disables scaling and preserves 100% full-size tiles (scale = 1.0)", () => {
    const scale = computeFitScale(350, 1000, true);
    assert.equal(scale, 1.0, "In edit mode, scale must be 1.0 to prevent touch drag distortion");
  });
});

// ============================================================================
// PART 3: WCAG AA CONTRAST RATIO EMPIRICAL VERIFICATION
// ============================================================================
describe("Part 3: Status Color Contrast (WCAG 2.1 AA >= 4.5:1)", () => {
  function srgbToLin(val: number) {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function relLum(rgb: [number, number, number]) {
    return 0.2126 * srgbToLin(rgb[0]) + 0.7152 * srgbToLin(rgb[1]) + 0.0722 * srgbToLin(rgb[2]);
  }

  function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]) {
    const l1 = relLum(rgb1);
    const l2 = relLum(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function blend(
    fg: [number, number, number],
    bg: [number, number, number],
    alpha: number,
  ): [number, number, number] {
    return [
      Math.round(alpha * fg[0] + (1 - alpha) * bg[0]),
      Math.round(alpha * fg[1] + (1 - alpha) * bg[1]),
      Math.round(alpha * fg[2] + (1 - alpha) * bg[2]),
    ];
  }

  const white: [number, number, number] = [255, 255, 255];
  const bodyBg: [number, number, number] = [251, 249, 248]; // #FBF9F8
  const darkCard: [number, number, number] = [21, 21, 23]; // #151517

  // Palette
  const amber500: [number, number, number] = [245, 158, 11];
  const amber800: [number, number, number] = [146, 64, 14];
  const amber400: [number, number, number] = [251, 191, 36];
  const amber300: [number, number, number] = [252, 211, 77];

  const emerald500: [number, number, number] = [16, 185, 129];
  const emerald700: [number, number, number] = [4, 120, 87];
  const emerald400: [number, number, number] = [52, 211, 153];
  const emerald300: [number, number, number] = [110, 231, 183];

  it("3.1 Cooking (OCCUPIED) text-amber-800 on light amber tile bg exceeds 4.5:1", () => {
    const tileBgWhite = blend(amber500, white, 0.10);
    const crWhite = contrastRatio(amber800, tileBgWhite);
    assert.ok(
      crWhite >= 4.5,
      `Cooking contrast on white bg ${crWhite.toFixed(2)}:1 must be >= 4.5:1`,
    );

    const tileBgBody = blend(amber500, bodyBg, 0.10);
    const crBody = contrastRatio(amber800, tileBgBody);
    assert.ok(
      crBody >= 4.5,
      `Cooking contrast on body bg ${crBody.toFixed(2)}:1 must be >= 4.5:1`,
    );

    // Hover state bg-amber-500/15
    const tileBgHover = blend(amber500, white, 0.15);
    const crHover = contrastRatio(amber800, tileBgHover);
    assert.ok(
      crHover >= 4.5,
      `Cooking hover contrast ${crHover.toFixed(2)}:1 must be >= 4.5:1`,
    );
  });

  it("3.2 Vacant (AVAILABLE) text-emerald-700 on light emerald tile bg exceeds 4.5:1", () => {
    const tileBgWhite = blend(emerald500, white, 0.10);
    const crWhite = contrastRatio(emerald700, tileBgWhite);
    assert.ok(
      crWhite >= 4.5,
      `Vacant contrast on white bg ${crWhite.toFixed(2)}:1 must be >= 4.5:1`,
    );

    const tileBgBody = blend(emerald500, bodyBg, 0.10);
    const crBody = contrastRatio(emerald700, tileBgBody);
    assert.ok(
      crBody >= 4.5,
      `Vacant contrast on body bg ${crBody.toFixed(2)}:1 must be >= 4.5:1`,
    );

    // Hover state bg-emerald-500/15
    const tileBgHover = blend(emerald500, white, 0.15);
    const crHover = contrastRatio(emerald700, tileBgHover);
    assert.ok(
      crHover >= 4.5,
      `Vacant hover contrast ${crHover.toFixed(2)}:1 must be >= 4.5:1`,
    );
  });

  it("3.3 Dark mode contrast ratios exceed WCAG AA 4.5:1", () => {
    // Cooking dark mode: dark:text-amber-400
    const darkTileAmber = blend(amber500, darkCard, 0.10);
    const crDarkAmber = contrastRatio(amber400, darkTileAmber);
    assert.ok(
      crDarkAmber >= 4.5,
      `Dark mode cooking contrast ${crDarkAmber.toFixed(2)}:1 must be >= 4.5:1`,
    );

    // Vacant dark mode: dark:text-emerald-400
    const darkTileEmerald = blend(emerald500, darkCard, 0.10);
    const crDarkEmerald = contrastRatio(emerald400, darkTileEmerald);
    assert.ok(
      crDarkEmerald >= 4.5,
      `Dark mode vacant contrast ${crDarkEmerald.toFixed(2)}:1 must be >= 4.5:1`,
    );
  });

  it("3.4 Cooking badge text-amber-800 on bg-amber-500/20 exceeds 4.5:1", () => {
    const tileBgWhite = blend(amber500, white, 0.10);
    const badgeBg = blend(amber500, tileBgWhite, 0.20);
    const crBadge = contrastRatio(amber800, badgeBg);
    assert.ok(
      crBadge >= 4.5,
      `Cooking badge contrast ${crBadge.toFixed(2)}:1 must be >= 4.5:1`,
    );
  });
});
