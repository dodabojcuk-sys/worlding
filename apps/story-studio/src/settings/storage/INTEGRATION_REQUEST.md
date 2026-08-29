# Storage settings integration request

`App.tsx` owns the independent `/settings/storage` selection and renders `SettingsStorageRoute`. It deliberately does not modify `TianyanR0Shell.tsx`, `GlobalStatusBar.tsx` or project-directory files.

The route obtains a short-lived `LocalFolderProvider` session and calls only these exported transport functions: `getStorageTransparency`, `revealStorageProject`, `exportStorageProject`, and `importStorageProject`. The server routes are `GET /storage/status`, `POST /storage/reveal`, `POST /storage/export`, and `POST /storage/import`; the implementation port is `createWorkspacePackagePort`.

If navigation later adds a Settings item, link it to `/settings/storage`; do not move any storage logic into the Shell. Directory selection must remain server-mediated. This build honestly leaves library/backup chooser controls disabled until a fixed-command native chooser is supplied. The package port never receives provider credentials or a browser-supplied destination path.
