"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type {
  CollectedRecord,
  CollectionTask,
  CronSchedule,
  DashboardActivity,
  DashboardStats,
  DataSource,
} from "@/lib/types"

// ── Dashboard ────────────────────────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => api.get<DashboardStats>("/dashboard/stats").then((r) => r.data),
    refetchInterval: 30_000,
  })
}

export function useDashboardActivity() {
  return useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: () => api.get<DashboardActivity>("/dashboard/activity").then((r) => r.data),
  })
}

// ── Sources ──────────────────────────────────────────────────────────────────

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => api.get<DataSource[]>("/sources?limit=200").then((r) => r.data),
  })
}

export function useToggleSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<DataSource>(`/sources/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  })
}

export function useDeleteSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  })
}

// ── Schedules ────────────────────────────────────────────────────────────────

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<CronSchedule[]>("/schedules?limit=200").then((r) => r.data),
  })
}

export function useToggleSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<CronSchedule>(`/schedules/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  })
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function useTasks(params?: { status?: string }) {
  const qs = params?.status ? `&status=${params.status}` : ""
  return useQuery({
    queryKey: ["tasks", params?.status ?? "all"],
    queryFn: () =>
      api.get<CollectionTask[]>(`/tasks?limit=100${qs}`).then((r) => r.data),
    refetchInterval: 15_000,
  })
}

// ── Records ──────────────────────────────────────────────────────────────────

export function useRecords(params?: { page?: number; search?: string }) {
  const page = params?.page ?? 1
  const search = params?.search ? `&search=${encodeURIComponent(params.search)}` : ""
  return useQuery({
    queryKey: ["records", page, params?.search ?? ""],
    queryFn: () => api.get<CollectedRecord[]>(`/records?page=${page}&limit=50${search}`),
  })
}
