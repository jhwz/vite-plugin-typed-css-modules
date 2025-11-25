import fs from "fs";
import { DtsCreator } from "typed-css-modules/lib/dts-creator.js";
import {
  createFilter,
  type FilterPattern,
  type PluginOption,
  type UserConfig,
} from "vite";

const defaultFilesGlob = "**/*.module.css";

export type TypedCssModulesOptions = {
  /**
   * A glob pattern to match the files to scan for CSS modules.
   * Defaults to any `*.module.css` files in the project.
   */
  include?: FilterPattern;

  /**
   * A glob pattern to match the files to ignore.
   * @default undefined
   */
  ignore?: FilterPattern;

  /**
   * Enable verbose logging for debugging
   * @default false
   */
  verbose?: boolean;

  /**
   * @deprecated use {@link TypedCssModulesOptions.include} instead
   */
  fileExtension?: `.${string}` | `.${string}`[];
};

function assertUnreachable(value: never): never {
  throw new Error(`Unreachable value: ${value}`);
}

function coerceArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function plugin(options?: TypedCssModulesOptions): PluginOption {
  let include: FilterPattern = options?.include ?? defaultFilesGlob;
  if (options?.fileExtension) {
    if (options.include) {
      throw new Error(
        `Pick either the \`include\` or \`fileExtension\` option, not both.`,
      );
    }
    include = coerceArray(options.fileExtension).map(
      (extension) => `**/*${extension}`,
    );
  }

  const filter = createFilter(include ?? defaultFilesGlob, options?.ignore);
  const verbose: boolean = options?.verbose ?? false;

  const creator = new DtsCreator({ camelCase: true });

  function debugLog(message: string) {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.debug(`[typed-css-modules] ${message}`);
    }
  }
  function isCssModule(file: string) {
    const result = filter(file);
    debugLog(
      `[isCssModule] ${file} is ${result ? "a CSS module" : "not a CSS module"}`,
    );
    return result;
  }

  async function generateTypeDefinitions(file: string) {
    debugLog(
      `[generateTypeDefinitions] Generating type definitions for ${file}`,
    );
    const dts = await creator.create(file, undefined, true);
    await dts.writeFile();
    debugLog(
      `[generateTypeDefinitions] Wrote type definitions at ${dts.outputFilePath}`,
    );
  }

  return {
    name: "typed-css-modules",
    config() {
      const config: UserConfig = {
        css: {
          modules: {
            localsConvention: "camelCaseOnly",
          },
        },
      };
      return config;
    },
    async buildStart(options) {
      if (options.input) {
        const files = Object.values(options.input).filter(isCssModule);
        await Promise.all(files.map(generateTypeDefinitions));
      }
    },
    async watchChange(file, change) {
      if (!isCssModule(file)) {
        debugLog(
          `[watchChange:${change.event}] Skipping type definitions for ${file} because it does not match files glob`,
        );
        return;
      }

      await (async () => {
        switch (change.event) {
          case "create":
          case "update": {
            debugLog(
              `[watchChange:${change.event}] Generating type definitions for ${file}`,
            );

            await generateTypeDefinitions(file);

            return;
          }
          case "delete": {
            debugLog(
              `[watchChange:${change.event}] Deleting type definitions for ${file}`,
            );

            const dtsPath = `${file}.d.ts`;

            if (fs.existsSync(dtsPath)) {
              fs.unlinkSync(dtsPath);
            } else {
              debugLog(
                `[watchChange:${change.event}] Type definitions for ${file} not found`,
              );
            }

            return;
          }
          default: {
            assertUnreachable(change.event);
          }
        }
      })().catch((error) => {
        // eslint-disable-next-line no-console
        console.error(
          `[typed-css-modules] [watchChange:${change.event}] Error processing ${file}: ${error}`,
        );
      });
    },
  };
}

export default plugin;
