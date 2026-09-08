import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Option } from '@/types/common'
import type {
  BankPayload,
  BranchPayload,
  ExpenseCategoryPayload,
  ProjectPayload,
} from '@/services/api/contracts'
import { services } from '@/services'

export const masterKeys = {
  all: ['master'] as const,
  branches: (includeInactive = false) => [...masterKeys.all, 'branches', includeInactive] as const,
  projects: (includeInactive = false) => [...masterKeys.all, 'projects', includeInactive] as const,
  banks: (includeInactive = false) => [...masterKeys.all, 'banks', includeInactive] as const,
  expenseCategories: (includeInactive = false) =>
    [...masterKeys.all, 'expenseCategories', includeInactive] as const,
}

/**
 * Master data changes rarely and is read by nearly every form, so it is cached
 * for a long stale time and invalidated wholesale on any edit.
 */
const MASTER_STALE = 10 * 60_000

export function useBranchMaster(includeInactive = false) {
  return useQuery({
    queryKey: masterKeys.branches(includeInactive),
    queryFn: () => services.master.branches(includeInactive),
    staleTime: MASTER_STALE,
  })
}

export function useProjectMaster(includeInactive = false) {
  return useQuery({
    queryKey: masterKeys.projects(includeInactive),
    queryFn: () => services.master.projects(includeInactive),
    staleTime: MASTER_STALE,
  })
}

export function useBankMaster(includeInactive = false) {
  return useQuery({
    queryKey: masterKeys.banks(includeInactive),
    queryFn: () => services.master.banks(includeInactive),
    staleTime: MASTER_STALE,
  })
}

export function useExpenseCategoryMaster(includeInactive = false) {
  return useQuery({
    queryKey: masterKeys.expenseCategories(includeInactive),
    queryFn: () => services.master.expenseCategories(includeInactive),
    staleTime: MASTER_STALE,
  })
}

/* ── Dropdown option helpers ────────────────────────────────────────────── */

/** Branch options for every สาขา / จุดรับซื้อ select. */
export function useBranchOptions(): { options: Option[]; loading: boolean } {
  const { data, isPending } = useBranchMaster()
  return {
    options: (data ?? []).map((b) => ({ value: b.id, label: b.name, description: b.code })),
    loading: isPending,
  }
}

export function useProjectOptions(): { options: Option[]; loading: boolean } {
  const { data, isPending } = useProjectMaster()
  return {
    options: (data ?? []).map((p) => ({ value: p.id, label: p.name })),
    loading: isPending,
  }
}

export function useBankOptions(): { options: Option[]; loading: boolean } {
  const { data, isPending } = useBankMaster()
  return {
    options: (data ?? []).map((b) => ({ value: b.code, label: b.name })),
    loading: isPending,
  }
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

function useMasterMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // Every screen that renders a dropdown must see the change immediately.
      void qc.invalidateQueries({ queryKey: masterKeys.all })
      void qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}

export function useSaveBranch() {
  return useMasterMutation(({ id, payload }: { id: string | null; payload: BranchPayload }) =>
    services.master.saveBranch(id, payload),
  )
}

export function useSaveProject() {
  return useMasterMutation(({ id, payload }: { id: string | null; payload: ProjectPayload }) =>
    services.master.saveProject(id, payload),
  )
}

export function useSaveBank() {
  return useMasterMutation(({ id, payload }: { id: string | null; payload: BankPayload }) =>
    services.master.saveBank(id, payload),
  )
}

export function useSaveExpenseCategory() {
  return useMasterMutation(
    ({ id, payload }: { id: string | null; payload: ExpenseCategoryPayload }) =>
      services.master.saveExpenseCategory(id, payload),
  )
}
