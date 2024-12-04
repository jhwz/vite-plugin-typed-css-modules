import fs from "fs";
import { DtsCreator } from "typed-css-modules/lib/dts-creator.js";
import type { PluginOption, UserConfig } from "vite";

export type TypedCssModulesOptions = {
  fileExtension?: `.${string}` | `.${string}`[];
};

function plugin(options?: TypedCssModulesOptions): PluginOption {
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
      const extensions = !options?.fileExtension
        ? [".css"]
        : Array.isArray(options.fileExtension)
        ? options.fileExtension
        : [options.fileExtension];
        
      const is_css_module = (path: string) =>
        extensions.some((ext) => path.endsWith(`.module${ext}`));

      server.watcher.on("change", async (path) => {
        if (!is_css_module(path)) return;
        try {
          const content = await creater.create(path, undefined, true);
          await content.writeFile();
        } catch (e) {
          /* ignore */
        }
      });
      server.watcher.on("unlink", (path) => {
        if (!is_css_module(path)) return;
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
