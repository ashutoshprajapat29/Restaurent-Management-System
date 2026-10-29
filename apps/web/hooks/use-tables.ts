"use client";

import type {
  BulkTableCreateDto,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
  TransferOrderDto,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface RestaurantTable {
  id: string;
  floorId: string;
  number: string;
  name: string | null;
  capacity: number;
  status: TableStatusDto;
  statusSince: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  shape: "square" | "round" | "rect";
  qrToken: string | null;
  assignedWaiter: { id: string; name: string } | null;
}

export interface Floor {
  id: string;
  name: string;
  sortOrder: number;
  tables: RestaurantTable[];
}

export function useFloors(branchId: string | null) {
  return useQuery({
    queryKey: ["floors", branchId],
    queryFn: () => api.get<Floor[]>(`/tables/floors?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 10_000,
  });
}

export function useCreateFloor(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post(`/tables/floors?branchId=${branchId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateFloor(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/tables/floors/${id}?branchId=${branchId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useCreateTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TableDto) => api.post(`/tables?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useBulkCreateTables(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BulkTableCreateDto) => api.post(`/tables/bulk?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: TableUpdateDto }) =>
      api.patch(`/tables/${id}?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTableLayout(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: TableLayoutUpdateDto[]) =>
      api.patch(`/tables/layout?branchId=${branchId}`, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useDeleteTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tables/${id}?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTableStatus(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TableStatusDto }) =>
      api.patch(`/tables/${id}/status?branchId=${branchId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useRotateQrToken(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RestaurantTable>(`/tables/${id}/qr-token?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useTransferTableOrder(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransferOrderDto) =>
      api.post(`/tables/transfer?branchId=${branchId}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["floors", branchId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

