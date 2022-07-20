import type { Plugin, UserConfig } from "vite";
import { DtsCreator } from "typed-css-modules/lib/dts-creator.js";
import fs from "fs";

function plugin(): Plugin {
  const creater = new DtsCreator({ camelCase: true });

  return {
    name: "typed-css-modules",
    config: () => {
      const config: UserConfig = {
        css: {
          modules: {
            localsConvention: "camelCaseOnly",
          },
        },
      };
      return config;
    },
    configureServer: (server) => {
      server.watcher.on("change", async (path) => {
        if (!path.endsWith(".module.css")) return;
        try {
          const content = await creater.create(path, undefined, true);
          await content.writeFile();
        } catch (e) {
          /* ignore */
        }
      });
      server.watcher.on("unlink", (path) => {
        if (!path.endsWith(".module.css")) return;
        try {
          fs.unlinkSync(path + ".d.ts");
        } catch (e) {
          /* ignore */
        }
      });
    },
  };
}

export default plugin;
