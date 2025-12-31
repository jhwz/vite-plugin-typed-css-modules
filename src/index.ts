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

export type TypedCssModulesOptions = {
  /**
   * Patterns to match the files to scan for CSS modules.
   * Defaults to any `*.module.css` files in the project.
   */
  include?: FilterPattern;

  /**
   * Patterns to match the files to ignore.
   * @default undefined
   */
  ignore?: FilterPattern;

  /**
   * Enable verbose logging for debugging
   * @default false
   */
  verbose?: boolean;

  /**
   * Optionally provide a root directory (relative to the project root) to write
   * the generated types out into. This can be used in conjunction with
   * typescripts `rootDirs` option to avoid polluting your work tree.
   *
   * @default undefined
   */
  rootDir?: string;

  /**
   * The source directory (relative to the project root) that serves as the root
   * for computing relative paths. When `rootDir` is set, this option ensures
   * that generated `.d.ts` files mirror the directory structure of your source
   * files starting from `srcDir`.
   *
   * For example, with `srcDir: "src"` and `rootDir: "src-gen"`, a file at
   * `src/components/Button.module.css` will generate a type definition at
   * `src-gen/components/Button.module.css.d.ts` (not
   * `src-gen/src/components/...`).
   *
   * @default "src".
   */
  srcDir?: string;

  /**
   * @deprecated use {@link TypedCssModulesOptions.include} instead
   */
  fileExtension?: `.${string}` | `.${string}`[];
};

const defaultFilesGlob = "**/*.module.css";
const defaultSrcDir = "src";


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

/**
 * Returns true if `filePath` is located within `folderPath`. However, does not
 * check if the file or folder actually exist on disk.
 */
function isInFolder(filePath: string, folderPath: string): boolean {
  const relative = path.relative(folderPath, filePath);
  return !relative.startsWith("..");
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

  // the absolute paths to both of these directories must be resolved relative
  // to the project root directory
  let rootOutputDir = options?.rootDir;
  let srcDir = options?.srcDir ?? defaultSrcDir;

  const creator = new DtsCreator({ camelCase: true });

  function debugLog(message: string) {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.debug(`[typed-css-modules] ${message}`);
    }
  }
  /** Returns the absolute path to the project root. */
  function getProjectRoot(): string {
    return viteConfig?.root ?? process.cwd();
  }

  function filter(id: string | unknown): boolean {
    if (!_filter) {
      // prevent .d.ts files from matching, resulting in infinite loops
      const ignore = [...coerceArray(options?.ignore), "**/*.d.ts"];

      // we must defer creating the filter until the vite config has been
      // resolved to properly resolve the project root directory
      _filter = createFilter(include, ignore, {
        resolve: srcDir
      });
    }
    return _filter(id);
  }
  function isCssModule(file: string) {
    const result = filter(file);
    debugLog(
      `[isCssModule] ${file} is ${result ? "a CSS module" : "not a CSS module"}`
    );
    return result;
  }

  /** Get the path of the file relative to the src root. */
  function getRelativePath(file: string): string {
    return path.isAbsolute(file) ? path.relative(srcDir, file) : file;
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

    debugLog(`[getAllMatchingFiles] Scanning for files in srcDir: ${srcDir}`);

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
        return filter(path);
      })
      .crawl(srcDir);

    const files = await walker.withPromise();

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
      const relativeSrcDir = options?.srcDir ?? defaultSrcDir;
      // resolve the src dir relative to the project root
      srcDir = path.join(getProjectRoot(), relativeSrcDir);
    },
    async buildStart(options) {

      const files = await getAllMatchingFiles();

      const filesString = files.length > 0 ? `:\n${files.join("\n")}\n` : "";
      debugLog(`[buildStart] Found ${files.length} matching files${filesString}`);

      await Promise.all(files.map(generateTypeDefinitions));
    },
    async watchChange(file, change) {

      if (!isInFolder(file, srcDir)) {
        debugLog(
          `[watchChange:${change.event}] Skipping type definitions for ` +
          `${file} because it is outside of srcDir: ${srcDir}`
        );
        return;
      }

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
