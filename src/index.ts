import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

export default function webdavSyncExtension(pi: ExtensionAPI) {
  pi.setLabel("OMP WebDAV Sync");

  const handler = async (args: string, ctx: ExtensionCommandContext) => {
    const [command = "status"] = args.trim().split(/\s+/);
    ctx.ui.notify(`omp-webdav-sync: ${command} executed (work in progress)`);
  };

  pi.registerCommand("ompsync", {
    description: "Sync OMP config via private WebDAV with 3-way semantic merge",
    handler,
  });
}
