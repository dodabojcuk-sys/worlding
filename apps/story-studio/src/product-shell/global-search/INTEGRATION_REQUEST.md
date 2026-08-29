# TIANYAN R0.6 Global Search integration request

This worktree deliberately does not modify `TianyanR0Shell.tsx` or the shared
topbar. The main Shell thread should make only the following integrations:

1. In `GlobalStatusBar.tsx`, import `GlobalSearchControl` and
   `createProductGlobalSearchReadAdapter`; create the adapter once with
   `useMemo`, then mount the control in the compact topbar action area.
2. Pass the existing `runtime.project?.id` and `runtime.workVersionId` as the
   search context. A missing project or work version may still search routes,
   but must not request project objects or source documents.
3. Map the existing i18n function into `GlobalSearchLabels`; do not hard-code a
   second locale store in the new component.
4. Convert `result.target` to a URL and keep `TianyanR0Shell` as the sole
   history/route state owner. Existing object query keys are
   `directoryObject`, `directoryProject`, `directoryVersion`, and
   `directoryType`; character results additionally use `directoryView=characters`.
5. Add the source query keys `directorySource`, `directoryProject`,
   `directoryWorkVersion`, and `directoryVersion` to the existing directory
   reference opener. That opener must resolve the existing source-import
   review projection; this module does not create a source page or a source
   owner.

Do not duplicate the route registry, the ObjectCatalog, source-import review
repository, or the Shell command palette. `GlobalSearchControl` receives its
engine and navigation callback from the existing composition owners.
