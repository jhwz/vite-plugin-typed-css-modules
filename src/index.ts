import fs from "fs";
import path from "path";
import { glob } from "tinyglobby";
import { DtsCreator } from "typed-css-modules/lib/dts-creator.js";
import {
  createFilter,
  type FilterPattern,
  type PluginOption,
  type ResolvedConfig,
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
   * Optionally provide a root directory to write the generated types out into.
   * This can be used in conjunction with typescripts `rootDirs` option to avoid polluting your work tree.
   * @default undefined
   */
  rootDir?: string;

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

  let filter: ReturnType<typeof createFilter>;
  const verbose: boolean = options?.verbose ?? false;
  let rootDir = options?.rootDir;
  let viteConfig: ResolvedConfig | null = null;

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

  function getRelativePath(file: string): string {
    return path.isAbsolute(file)
      ? path.relative(viteConfig?.root ?? process.cwd(), file)
      : file;
  }

  async function generateTypeDefinitions(file: string) {
    debugLog(
      `[generateTypeDefinitions] Generating type definitions for ${file}`,
    );
    const dts = await creator.create(file, undefined, true);

    if (rootDir) {
      const relativePath = getRelativePath(file);
      const outputPath = path.join(rootDir, `${relativePath}.d.ts`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, dts.formatted);
      debugLog(
        `[generateTypeDefinitions] Wrote type definitions at ${outputPath}`,
      );
    } else {
      await dts.writeFile();
      debugLog(
        `[generateTypeDefinitions] Wrote type definitions at ${dts.outputFilePath}`,
      );
    }
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
    configResolved(config: ResolvedConfig) {
      viteConfig = config;
      filter = createFilter(include, options?.ignore, { resolve: config.root });
      if (rootDir) {
        // If a rootDir is specified, resolve it to an absolute path relative to
        // the Vite project root; otherwise, it would be resolved relative to
        // the current working directory, which may be different.
        rootDir = path.join(config.root, rootDir);
      }
    },
    async buildStart() {
      if (viteConfig) {
        function relevantPatterns(p: FilterPattern | undefined) {
          return (Array.isArray(p) ? [...p] : [p]).filter(
            (v): v is string => typeof v === "string",
          );
        }

        // Create glob pattern. If include doesn't include any Regex then we can pass the pattern
        // directly to glob. If it does, we need to glob all files and do the filtering in
        // memory.
        let pattern: string | readonly string[] = "**";
        if (typeof include === "string") {
          pattern = include;
        } else if (
          Array.isArray(include) &&
          include.every((v) => typeof v === "string")
        ) {
          pattern = include;
        }

        let matches = await glob(pattern, {
          cwd: viteConfig.root,
          absolute: true,
          ignore: ["node_modules/**", ...relevantPatterns(options?.ignore)],
        });
        await Promise.all(matches.filter(filter).map(generateTypeDefinitions));
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

            const dtsPath = rootDir
              ? path.join(rootDir, `${getRelativePath(file)}.d.ts`)
              : `${file}.d.ts`;

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
