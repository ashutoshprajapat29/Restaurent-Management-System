/**
 * Touch POS & Cart Engine (Opaque-Box Helper)
 * Implements Dine-in/Takeaway carts, modifier selection bounds,
 * rapid manipulation, portions, and one-click out-of-stock toggling.
 */

export interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  halfPrice?: number | null;
  taxRatePercent: number;
  isActive: boolean; // Out-of-stock toggle (true = available, false = 86'd)
  modifierGroupIds: string[];
  stationId?: string;
}

export interface CartLine {
  lineId: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  portion: "FULL" | "HALF" | "CUSTOM";
  unitPrice: number;
  selectedModifiers: ModifierOption[];
  kitchenNote?: string;
  lineTotal: number;
}

export class PosCartEngine {
  private menu = new Map<string, MenuItem>();
  private modifierGroups = new Map<string, ModifierGroup>();
  private lines: CartLine[] = [];
  public orderType: "DINE_IN" | "TAKEAWAY" = "DINE_IN";
  public tableId?: string;

  registerModifierGroup(group: ModifierGroup) {
    this.modifierGroups.set(group.id, group);
  }

  registerMenuItem(item: MenuItem) {
    this.menu.set(item.id, item);
  }

  toggleOutOfStock(menuItemId: string, isActive: boolean): MenuItem {
    const item = this.menu.get(menuItemId);
    if (!item) throw new Error(`Menu item ${menuItemId} not found`);
    item.isActive = isActive;
    return item;
  }

  addItem(params: {
    menuItemId: string;
    quantity?: number;
    portion?: "FULL" | "HALF" | "CUSTOM";
    customPrice?: number;
    modifierIds?: string[];
    kitchenNote?: string;
  }): CartLine {
    const item = this.menu.get(params.menuItemId);
    if (!item) throw new Error(`Menu item ${params.menuItemId} not found`);

    if (!item.isActive) {
      throw new Error(`Item "${item.name}" is OUT OF STOCK and cannot be ordered`);
    }

    const qty = params.quantity ?? 1;
    if (qty <= 0) throw new Error("Quantity must be positive");

    const portion = params.portion ?? "FULL";
    let basePrice = item.price;
    if (portion === "HALF") {
      if (item.halfPrice === undefined || item.halfPrice === null) {
        throw new Error(`Item "${item.name}" does not support half portion`);
      }
      basePrice = item.halfPrice;
    } else if (portion === "CUSTOM") {
      if (params.customPrice === undefined || params.customPrice < 0) {
        throw new Error("Custom portion requires a valid non-negative custom price");
      }
      basePrice = params.customPrice;
    }

    // Resolve modifiers and validate min/max bounds
    const selectedMods: ModifierOption[] = [];
    let modPriceSum = 0;

    for (const groupId of item.modifierGroupIds) {
      const group = this.modifierGroups.get(groupId);
      if (!group) continue;

      const groupSelectedIds = (params.modifierIds ?? []).filter((id) =>
        group.options.some((opt) => opt.id === id),
      );

      if (group.isRequired && groupSelectedIds.length < (group.minSelect || 1)) {
        throw new Error(
          `Modifier group "${group.name}" requires at least ${group.minSelect || 1} selection(s)`,
        );
      }
      if (groupSelectedIds.length > group.maxSelect) {
        throw new Error(
          `Modifier group "${group.name}" permits at most ${group.maxSelect} selection(s)`,
        );
      }

      for (const modId of groupSelectedIds) {
        const opt = group.options.find((o) => o.id === modId);
        if (opt) {
          selectedMods.push(opt);
          modPriceSum += opt.priceAdjustment;
        }
      }
    }

    const unitPrice = basePrice + modPriceSum;
    const lineTotal = Math.round((unitPrice * qty + Number.EPSILON) * 100) / 100;

    const line: CartLine = {
      lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      menuItemId: item.id,
      itemName: item.name,
      quantity: qty,
      portion,
      unitPrice,
      selectedModifiers: selectedMods,
      kitchenNote: params.kitchenNote,
      lineTotal,
    };

    this.lines.push(line);
    return line;
  }

  updateLineQuantity(lineId: string, quantity: number): void {
    const idx = this.lines.findIndex((l) => l.lineId === lineId);
    if (idx === -1) throw new Error(`Cart line ${lineId} not found`);

    if (quantity <= 0) {
      this.lines.splice(idx, 1);
    } else {
      const line = this.lines[idx];
      line.quantity = quantity;
      line.lineTotal = Math.round((line.unitPrice * quantity + Number.EPSILON) * 100) / 100;
    }
  }

  updateLineNote(lineId: string, note: string): void {
    const line = this.lines.find((l) => l.lineId === lineId);
    if (!line) throw new Error(`Cart line ${lineId} not found`);
    line.kitchenNote = note;
  }

  removeLine(lineId: string): void {
    this.lines = this.lines.filter((l) => l.lineId !== lineId);
  }

  clear(): void {
    this.lines = [];
  }

  getLines(): CartLine[] {
    return [...this.lines];
  }

  validateCartStock(): { valid: boolean; outOfStockItemNames: string[] } {
    const outOfStock: string[] = [];
    for (const line of this.lines) {
      const item = this.menu.get(line.menuItemId);
      if (!item || !item.isActive) {
        outOfStock.push(line.itemName);
      }
    }
    return {
      valid: outOfStock.length === 0,
      outOfStockItemNames: outOfStock,
    };
  }

  calculateTotals(opts?: {
    discountPercent?: number;
    discountFlat?: number;
    tip?: number;
    taxMode?: "INCLUSIVE" | "EXCLUSIVE";
    defaultTaxRate?: number;
  }): {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    tip: number;
    total: number;
  } {
    const subtotal = Math.round(
      (this.lines.reduce((sum, l) => sum + l.lineTotal, 0) + Number.EPSILON) * 100,
    ) / 100;

    let discount = 0;
    if (opts?.discountPercent) {
      discount = Math.round((subtotal * (opts.discountPercent / 100) + Number.EPSILON) * 100) / 100;
    } else if (opts?.discountFlat) {
      discount = Math.min(subtotal, opts.discountFlat);
    }

    const discountedSubtotal = Math.max(0, subtotal - discount);
    const taxRate = opts?.defaultTaxRate ?? 5;
    let taxAmount = 0;

    if (opts?.taxMode === "EXCLUSIVE") {
      taxAmount = Math.round((discountedSubtotal * (taxRate / 100) + Number.EPSILON) * 100) / 100;
    } else {
      // INCLUSIVE
      taxAmount = Math.round(((discountedSubtotal * taxRate) / (100 + taxRate) + Number.EPSILON) * 100) / 100;
    }

    const tip = opts?.tip ?? 0;
    const total = opts?.taxMode === "EXCLUSIVE"
      ? Math.round((discountedSubtotal + taxAmount + tip + Number.EPSILON) * 100) / 100
      : Math.round((discountedSubtotal + tip + Number.EPSILON) * 100) / 100;

    return {
      subtotal,
      discountAmount: discount,
      taxAmount,
      tip,
      total,
    };
  }
}
