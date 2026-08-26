import { execFile } from "node:child_process";

export function fileManagerCommand(targetPath, platform = process.platform) {
  if (platform === "darwin") return { command: "open", args: [targetPath], label: "在 Finder 中打开" };
  if (platform === "win32") return { command: "explorer.exe", args: [targetPath], label: "在文件资源管理器中打开" };
  if (platform === "linux") return { command: "xdg-open", args: [targetPath], label: "在文件管理器中打开" };
  return null;
}

export async function revealLocalPath(targetPath) {
  const definition = fileManagerCommand(targetPath);
  if (!definition) throw new Error("当前系统不支持直接打开故事文件夹。");
  await new Promise((resolve, reject) => {
    execFile(definition.command, definition.args, { timeout: 5_000 }, (error) => {
      if (error) reject(new Error("暂时无法打开故事文件夹，请根据显示的路径手动打开。"));
      else resolve(undefined);
    });
  });
}
