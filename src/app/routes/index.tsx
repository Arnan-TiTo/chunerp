import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth, RequirePermission } from '@/features/auth/guards'
import { AppShell } from '@/app/layouts/AppShell'
import { NotFoundState } from '@/components/feedback/States'
import { RouteError } from '@/app/routes/RouteError'
import { RootProviders } from '@/app/routes/RootProviders'

/* FND-009 — every screen is lazy-loaded and reachable by direct URL. */
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const WorkAreaHub = lazy(() => import('@/features/workarea/WorkAreaHub').then((m) => ({ default: m.WorkAreaHub })))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))

const FarmerListPage = lazy(() => import('@/features/farmers/FarmerListPage').then((m) => ({ default: m.FarmerListPage })))
const FarmerFormPage = lazy(() => import('@/features/farmers/FarmerFormPage').then((m) => ({ default: m.FarmerFormPage })))
const FarmerDetailPage = lazy(() => import('@/features/farmers/FarmerDetailPage').then((m) => ({ default: m.FarmerDetailPage })))

const BookingListPage = lazy(() => import('@/features/bookings/BookingListPage').then((m) => ({ default: m.BookingListPage })))
const BookingFormPage = lazy(() => import('@/features/bookings/BookingFormPage').then((m) => ({ default: m.BookingFormPage })))
const BookingDetailPage = lazy(() => import('@/features/bookings/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })))

const SortingPage = lazy(() => import('@/features/receiving/SortingPage').then((m) => ({ default: m.SortingPage })))
const SortingSlipPage = lazy(() => import('@/features/receiving/SortingSlipPage').then((m) => ({ default: m.SortingSlipPage })))
const WeighStationPage = lazy(() => import('@/features/receiving/WeighStationPage').then((m) => ({ default: m.WeighStationPage })))
const WeighingPage = lazy(() => import('@/features/weighing/WeighingPage').then((m) => ({ default: m.WeighingPage })))
const PurchaseSummaryPage = lazy(() => import('@/features/purchase/PurchaseSummaryPage').then((m) => ({ default: m.PurchaseSummaryPage })))
const PurchaseReceiptPage = lazy(() => import('@/features/purchase/PurchaseReceiptPage').then((m) => ({ default: m.PurchaseReceiptPage })))

const DebtListPage = lazy(() => import('@/features/debt/DebtListPage').then((m) => ({ default: m.DebtListPage })))
const DebtDetailPage = lazy(() => import('@/features/debt/DebtDetailPage').then((m) => ({ default: m.DebtDetailPage })))

const PaymentListPage = lazy(() => import('@/features/payments/PaymentListPage').then((m) => ({ default: m.PaymentListPage })))
const AccountingExportPage = lazy(() => import('@/features/accounting/AccountingExportPage').then((m) => ({ default: m.AccountingExportPage })))

const ExpenseListPage = lazy(() => import('@/features/expenses/ExpenseListPage').then((m) => ({ default: m.ExpenseListPage })))
const ExpenseFormPage = lazy(() => import('@/features/expenses/ExpenseFormPage').then((m) => ({ default: m.ExpenseFormPage })))
const ExpenseDetailPage = lazy(() => import('@/features/expenses/ExpenseDetailPage').then((m) => ({ default: m.ExpenseDetailPage })))

const MasterDataPage = lazy(() => import('@/features/master/MasterDataPage').then((m) => ({ default: m.MasterDataPage })))
const ProductMasterPage = lazy(() => import('@/features/products/ProductMasterPage').then((m) => ({ default: m.ProductMasterPage })))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AuditPage = lazy(() => import('@/features/system/AuditPage').then((m) => ({ default: m.AuditPage })))
const PermissionsPage = lazy(() => import('@/features/system/PermissionsPage').then((m) => ({ default: m.PermissionsPage })))
const SettingsPage = lazy(() => import('@/features/system/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export const router = createBrowserRouter([
  {
    element: <RootProviders />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },

      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <Navigate to="/hub" replace /> },
          { path: '/hub', element: <WorkAreaHub /> },

          {
            element: <RequirePermission permission="purchase:view" />,
            children: [
              { path: '/receiving/:queueId/receipt', element: <PurchaseReceiptPage /> },
            ],
          },

          {
            element: <AppShell />,
            children: [
              {
                element: <RequirePermission permission="dashboard:view" />,
                children: [{ path: '/dashboard', element: <DashboardPage /> }],
              },

              {
                element: <RequirePermission permission="farmer:view" />,
                children: [
                  { path: '/farmers', element: <FarmerListPage /> },
                  { path: '/farmers/new', element: <FarmerFormPage mode="create" /> },
                  { path: '/farmers/:id', element: <FarmerDetailPage /> },
                  { path: '/farmers/:id/edit', element: <FarmerFormPage mode="edit" /> },
                ],
              },

              {
                element: <RequirePermission permission="booking:view" />,
                children: [
                  { path: '/bookings', element: <BookingListPage /> },
                  { path: '/bookings/new', element: <BookingFormPage mode="create" /> },
                  { path: '/bookings/:id', element: <BookingDetailPage /> },
                  { path: '/bookings/:id/edit', element: <BookingFormPage mode="edit" /> },
                ],
              },

              {
                element: <RequirePermission permission="queue:view" />,
                children: [
                  { path: '/receiving', element: <Navigate to="/receiving/sorting" replace /> },
                  // Station 1 — จุดคัดแยก issues the slip …
                  { path: '/receiving/sorting', element: <SortingPage /> },
                  { path: '/receiving/sorting/new', element: <SortingSlipPage mode="create" /> },
                  { path: '/receiving/sorting/:queueId', element: <SortingSlipPage mode="edit" /> },
                  // … station 2 — จุดชั่งน้ำหนัก takes it from there.
                  { path: '/receiving/weighing', element: <WeighStationPage /> },
                  { path: '/receiving/:queueId/weighing', element: <WeighingPage /> },
                  { path: '/receiving/:queueId/summary', element: <PurchaseSummaryPage /> },
                ],
              },

              {
                element: <RequirePermission permission="debt:view" />,
                children: [
                  { path: '/debts', element: <DebtListPage /> },
                  { path: '/debts/:id', element: <DebtDetailPage /> },
                ],
              },

              // จ่ายส่วนต่างให้เกษตรกร — บัญชีเห็นได้ทุกคน แต่กดจ่ายต้องมีสิทธิ์ payment:pay
              {
                element: <RequirePermission permission="debt:view" />,
                children: [{ path: '/payments', element: <PaymentListPage /> }],
              },

              {
                element: <RequirePermission permission="debt:export" />,
                children: [{ path: '/accounting/export', element: <AccountingExportPage /> }],
              },

              {
                element: <RequirePermission permission="expense:view" />,
                children: [
                  { path: '/expenses', element: <ExpenseListPage /> },
                  { path: '/expenses/new', element: <ExpenseFormPage mode="create" /> },
                  { path: '/expenses/:id', element: <ExpenseDetailPage /> },
                  { path: '/expenses/:id/edit', element: <ExpenseFormPage mode="edit" /> },
                ],
              },

              {
                element: <RequirePermission permission="product:view" />,
                children: [
                  { path: '/products', element: <ProductMasterPage /> },
                  { path: '/master', element: <MasterDataPage /> },
                ],
              },

              {
                element: <RequirePermission permission="report:view" />,
                children: [{ path: '/reports', element: <ReportsPage /> }],
              },

              {
                element: <RequirePermission permission="audit:view" />,
                children: [{ path: '/system/audit', element: <AuditPage /> }],
              },
              {
                element: <RequirePermission permission="permission:manage" />,
                children: [{ path: '/system/permissions', element: <PermissionsPage /> }],
              },
              {
                element: <RequirePermission permission="setting:manage" />,
                children: [{ path: '/system/settings', element: <SettingsPage /> }],
              },

              { path: '*', element: <NotFoundState /> },
            ],
          },
        ],
      },
    ],
  },
])
