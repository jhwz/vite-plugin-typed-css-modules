import fs from "fs";
import path from "path";
import { fdir } from "fdir";
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

function coerceArray<T>(
  value: T | T[] | readonly T[] | null | undefined
): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value as T];
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

  let viteConfig: ResolvedConfig | null = null;

  let _filter: ((id: string | unknown) => boolean) | null = null;

  const verbose: boolean = options?.verbose ?? false;
  let rootOutputDir = options?.rootDir;

  const creator = new DtsCreator({ camelCase: true });

  function debugLog(message: string) {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.debug(`[typed-css-modules] ${message}`);
    }
  }
  function getProjectRoot(): string {
    return viteConfig?.root ?? process.cwd();
  }
  function filter(id: string | unknown): boolean {
    if (!_filter) {
      // we must defer creating the filter until the vite config has been
      // resolved to properly resolve the project root directory
      _filter = createFilter(include, options?.ignore, {
        resolve: getProjectRoot()
      });
    }
    return _filter(id);
  }
  function isCssModule(file: string) {
    if (file.endsWith(".d.ts")) {
      // prevent .d.ts files from matching, resulting in infinite loops
      return false;
    }
    const result = filter(file);
    debugLog(
      `[isCssModule] ${file} is ${result ? "a CSS module" : "not a CSS module"}`
    );
    return result;
  }

  function getRelativePath(file: string): string {
    return path.isAbsolute(file) ? path.relative(getProjectRoot(), file) : file;
  }

  async function generateTypeDefinitions(file: string) {
    try {
      debugLog(
        `[generateTypeDefinitions] Generating type definitions for ${file}`,
      );
      const dts = await creator.create(file, undefined, true);

      if (rootOutputDir) {
        const relativePath = getRelativePath(file);
        const outputPath = path.join(rootOutputDir, `${relativePath}.d.ts`);
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
    } catch (error) {
      console.error(
        `[typed-css-modules] Error generating type definitions for ${file}: ${error}`,
      );
      // In dev mode, log the error instead of throwing to avoid crashing the
      // server. In build mode, re-throw the error to fail the build.
      if (viteConfig?.command !== "serve") {
        throw error;
      }
    }
  }

  /**
   * Get all files in the project that match the include patterns, excluding
   * those that match the ignore patterns.
   */
  async function getAllMatchingFiles(): Promise<string[]> {

    const rootDir = getProjectRoot();

    const walker = new fdir()
      .withFullPaths()
      .exclude((dirName, dirPath) => {
        // exclude node_modules
        return dirName === "node_modules";
      })
      .filter((path, isDirectory) => {
        if (isDirectory) {
          // never skip directories
          return true;
        }
        if (path.endsWith(".d.ts")) {
          // prevent .d.ts files from matching, resulting in infinite loops
          return false;
        }
        return filter(path);
      })
      .crawl(rootDir);

    const files = walker.sync();

    return files;

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
    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
      const relativeRootOutputDir = options?.rootDir;
      if (relativeRootOutputDir) {
        // resolve the root output dir relative to the project root
        rootOutputDir = path.join(getProjectRoot(), relativeRootOutputDir);
      }

    },
    async buildStart(options) {

      const files = await getAllMatchingFiles();

      const filesString = files.length > 0 ? `:\n${files.join("\n")}\n` : "";
      debugLog(`[buildStart] Found ${files.length} matching files${filesString}`);

      await Promise.all(files.map(generateTypeDefinitions));
    },
    async watchChange(file, change) {
      if (!isCssModule(file)) {
        debugLog(
          `[watchChange:${change.event}] Skipping type definitions for ` +
          `${file} because it does not match the filter`
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

            const dtsPath = rootOutputDir
              ? path.join(rootOutputDir, `${getRelativePath(file)}.d.ts`)
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
