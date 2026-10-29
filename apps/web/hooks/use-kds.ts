"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { KOT_NEXT_STATUS, type KotStatusDto } from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { resolveWsUrl } from "@/lib/ws-url";

export interface KotTicket {
  id: string;
  orderId: string;
  stationId: string | null;
  ticketNumber: string;
  status: KotStatusDto;
  isPriority: boolean;
  printedCount: number;
  lastPrintError: string | null;
  createdAt: string;
  station: { id: string; name: string } | null;
  order: {
    orderNumber: string;
    type: string;
    channel: "STAFF" | "ONLINE";
    notes: string | null;
    table: { number: string; name: string | null } | null;
    guestName: string | null;
    customer: { name: string | null; phone: string | null } | null;
    createdBy?: { id: string; name: string } | null;
  };
  items: {
    id: string;
    orderItem: {
      nameSnapshot: string;
      quantity: number;
      kitchenNote: string | null;
      modifiers: { nameSnapshot: string }[];
    };
  }[];
}

export function useKdsStations(branchId: string | null) {
  return useQuery({
    queryKey: ["kds", "stations", branchId],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/kds/stations?branchId=${branchId}`),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}

/** stationId "" = every station (the default, and what this screen always did). */
export function useKdsTickets(branchId: string | null, stationId = "", enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!branchId || !enabled) return;
    const socket = io(resolveWsUrl(), { query: { branchId }, withCredentials: true });
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["kds", "tickets"] });
    };
    socket.on("kot.created", invalidate);
    socket.on("kot.updated", invalidate);
    return () => {
      socket.disconnect();
    };
  }, [branchId, enabled, queryClient]);

  return useQuery({
    queryKey: ["kds", "tickets", branchId, stationId],
    queryFn: () =>
      api.get<KotTicket[]>(
        `/kds/tickets?branchId=${branchId}${stationId ? `&stationId=${encodeURIComponent(stationId)}` : ""}`,
      ),
    enabled: !!branchId && enabled,
    refetchInterval: 20_000,
  });
}

export function useUpdateKotStatus(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: KotStatusDto }) =>
      api.patch(`/kds/tickets/${id}/status?branchId=${branchId}`, { status }),
    // Also on error: a 409 means the ticket moved on another screen, and the
    // board must show where it really is rather than the stale step.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["kds"] }),
  });
}

export const NEXT_STATUS = KOT_NEXT_STATUS;

/** The kitchen declining a ticket; `confirmStarted` once cooking has begun. */
export function useRejectKot(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, confirmStarted }: { id: string; reason: string; confirmStarted?: boolean }) =>
      api.post(`/kds/tickets/${id}/reject?branchId=${branchId}`, { reason, confirmStarted }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["kds"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["floors", branchId] });
    },
  });
}

export interface IncomingOrder {
  id: string;
  orderNumber: string;
  type: string;
  channel: "STAFF" | "ONLINE";
  guestName: string | null;
  notes: string | null;
  createdAt: string;
  scheduledFor: string | null;
  table: { number: string; name: string | null } | null;
  customer: { name: string | null; phone: string | null } | null;
  items: {
    id: string;
    nameSnapshot: string;
    quantity: number;
    kitchenNote: string | null;
    modifiers: { nameSnapshot: string }[];
  }[];
}

/** Orders waiting for a yes/no. Only fetched for users who may answer them. */
export function useKdsIncoming(branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["kds", "incoming", branchId],
    queryFn: () => api.get<IncomingOrder[]>(`/kds/incoming?branchId=${branchId}`),
    enabled: !!branchId && enabled,
    refetchInterval: 15_000,
  });
}

function invalidateAfterAnswer(queryClient: ReturnType<typeof useQueryClient>, branchId: string | null) {
  queryClient.invalidateQueries({ queryKey: ["kds"] });
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["floors", branchId] });
}

export function useAcceptIncoming(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.post(`/kds/incoming/${orderId}/accept?branchId=${branchId}`),
    onSettled: () => invalidateAfterAnswer(queryClient, branchId),
  });
}

export function useDeclineIncoming(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      api.post(`/kds/incoming/${orderId}/reject?branchId=${branchId}`, { reason }),
    onSettled: () => invalidateAfterAnswer(queryClient, branchId),
  });
}

export interface KitchenProgressTicket {
  id: string;
  orderId: string;
  status: KotStatusDto;
  createdAt: string;
  readyAt: string | null;
  order: {
    orderNumber: string;
    type: string;
    table: { id: string; number: string; name: string | null } | null;
  };
}

/** Where each live ticket is - for order-taking screens, no guest details. */
export function useKdsProgress(branchId: string | null) {
  return useQuery({
    queryKey: ["kds", "progress", branchId],
    queryFn: () => api.get<KitchenProgressTicket[]>(`/kds/progress?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 20_000,
  });
}

export function useSetKotPriority(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPriority }: { id: string; isPriority: boolean }) =>
      api.patch(`/kds/tickets/${id}/priority?branchId=${branchId}`, { isPriority }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kds", "tickets", branchId] }),
  });
}

/** `reprint` false = first print (409 if already printed); true = extra copy stamped REPRINT. */
export function useReprintKot(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reprint }: { id: string; reprint: boolean }) =>
      api.post(`/kds/tickets/${id}/${reprint ? "reprint" : "print"}?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kds", "tickets", branchId] }),
  });
}

export interface KitchenPerformanceRow {
  stationId: string;
  stationName: string;
  ticketsReady: number;
  avgMinutesToReady: number;
}

export function useKitchenPerformance(branchId: string | null) {
  return useQuery({
    queryKey: ["kds", "performance", branchId],
    queryFn: () => api.get<KitchenPerformanceRow[]>(`/kds/performance?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 60_000,
  });
}
