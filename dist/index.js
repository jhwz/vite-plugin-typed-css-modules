import fs from "fs";
import path from "path";
import { fdir } from "fdir";
import { DtsCreator } from "typed-css-modules/lib/dts-creator.js";
import { createFilter, } from "vite";
const defaultFilesGlob = "**/*.module.css";
const defaultSrcDir = "src";
function assertUnreachable(value) {
    throw new Error(`Unreachable value: ${value}`);
}
function coerceArray(value) {
    if (value === null || value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
/**
 * Returns true if `filePath` is located within `folderPath`. However, does not
 * check if the file or folder actually exist on disk.
 */
function isInFolder(filePath, folderPath) {
    const relative = path.relative(folderPath, filePath);
    return !relative.startsWith("..");
}
function plugin(options) {
    var _a, _b, _c;
    let include = (_a = options === null || options === void 0 ? void 0 : options.include) !== null && _a !== void 0 ? _a : defaultFilesGlob;
    if (options === null || options === void 0 ? void 0 : options.fileExtension) {
        if (options.include) {
            throw new Error(`Pick either the \`include\` or \`fileExtension\` option, not both.`);
        }
        include = coerceArray(options.fileExtension).map((extension) => `**/*${extension}`);
    }
    let viteConfig = null;
    let _filter = null;
    const verbose = (_b = options === null || options === void 0 ? void 0 : options.verbose) !== null && _b !== void 0 ? _b : false;
    // the absolute paths to both of these directories must be resolved relative
    // to the project root directory
    let rootOutputDir = options === null || options === void 0 ? void 0 : options.rootDir;
    let srcDir = (_c = options === null || options === void 0 ? void 0 : options.srcDir) !== null && _c !== void 0 ? _c : defaultSrcDir;
    const creator = new DtsCreator({ camelCase: true });
    function debugLog(message) {
        if (verbose) {
            // eslint-disable-next-line no-console
            console.debug(`[typed-css-modules] ${message}`);
        }
    }
    /** Returns the absolute path to the project root. */
    function getProjectRoot() {
        var _a;
        return (_a = viteConfig === null || viteConfig === void 0 ? void 0 : viteConfig.root) !== null && _a !== void 0 ? _a : process.cwd();
    }
    function filter(id) {
        if (!_filter) {
            // prevent .d.ts files from matching, resulting in infinite loops
            const ignore = [...coerceArray(options === null || options === void 0 ? void 0 : options.ignore), "**/*.d.ts"];
            // we must defer creating the filter until the vite config has been
            // resolved to properly resolve the project root directory
            _filter = createFilter(include, ignore, {
                resolve: srcDir
            });
        }
        return _filter(id);
    }
    function isCssModule(file) {
        const result = filter(file);
        debugLog(`[isCssModule] ${file} is ${result ? "a CSS module" : "not a CSS module"}`);
        return result;
    }
    /** Get the path of the file relative to the src root. */
    function getRelativePath(file) {
        return path.isAbsolute(file) ? path.relative(srcDir, file) : file;
    }
    async function generateTypeDefinitions(file) {
        try {
            debugLog(`[generateTypeDefinitions] Generating type definitions for ${file}`);
            const dts = await creator.create(file, undefined, true);
            if (rootOutputDir) {
                const relativePath = getRelativePath(file);
                const outputPath = path.join(rootOutputDir, `${relativePath}.d.ts`);
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, dts.formatted);
                debugLog(`[generateTypeDefinitions] Wrote type definitions at ${outputPath}`);
            }
            else {
                await dts.writeFile();
                debugLog(`[generateTypeDefinitions] Wrote type definitions at ${dts.outputFilePath}`);
            }
        }
        catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[typed-css-modules] Error generating type definitions for ${file}: ${error}`);
            // In dev mode, log the error instead of throwing to avoid crashing the
            // server. In build mode, re-throw the error to fail the build.
            if ((viteConfig === null || viteConfig === void 0 ? void 0 : viteConfig.command) !== "serve") {
                throw error;
            }
        }
    }
    /**
     * Get all files in the project that match the include patterns, excluding
     * those that match the ignore patterns.
     */
    async function getAllMatchingFiles() {
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
            const config = {
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
            const relativeRootOutputDir = options === null || options === void 0 ? void 0 : options.rootDir;
            if (relativeRootOutputDir) {
                // resolve the root output dir relative to the project root
                rootOutputDir = path.join(getProjectRoot(), relativeRootOutputDir);
            }
            if (options === null || options === void 0 ? void 0 : options.srcDir) {
                srcDir = path.join(getProjectRoot(), options.srcDir);
                if (!fs.existsSync(srcDir)) {
                    debugLog(`[configResolved] Warning: srcDir "${options.srcDir}" ` +
                        `resolved to "${srcDir}" does not exist.`);
                    // Assume the user knows what they are doing if they explicitly
                    // specify options.srcDir and proceed. This allows for scenarios
                    // where the srcDir may be generated later.
                }
            }
            else {
                const absoluteDefaultSrcDir = path.join(getProjectRoot(), defaultSrcDir);
                if (fs.existsSync(absoluteDefaultSrcDir)) {
                    // Only use the default "src" directory if it actually exists. Do not
                    // break projects that do not use a "src" folder and which do not use
                    // the `rootDir` anyway, in which case the `srcDir` doesn't matter.
                    srcDir = absoluteDefaultSrcDir;
                    debugLog(`[configResolved] Using default srcDir: ${srcDir}`);
                }
                else {
                    // otherwise, fall back to using the project root
                    srcDir = getProjectRoot();
                    debugLog(`[configResolved] Using project root as srcDir: ${srcDir}`);
                }
            }
        },
        async buildStart(options) {
            const files = await getAllMatchingFiles();
            const filesString = files.length > 0 ? `:\n${files.join("\n")}\n` : "";
            debugLog(`[buildStart] Found ${files.length} matching files${filesString}`);
            await Promise.all(files.map(generateTypeDefinitions));
        },
        async watchChange(file, change) {
            if (!isInFolder(file, srcDir)) {
                debugLog(`[watchChange:${change.event}] Skipping type definitions for ` +
                    `${file} because it is outside of srcDir: ${srcDir}`);
                return;
            }
            if (!isCssModule(file)) {
                debugLog(`[watchChange:${change.event}] Skipping type definitions for ` +
                    `${file} because it does not match the filter`);
                return;
            }
            await (async () => {
                switch (change.event) {
                    case "create":
                    case "update": {
                        debugLog(`[watchChange:${change.event}] Generating type definitions for ${file}`);
                        await generateTypeDefinitions(file);
                        return;
                    }
                    case "delete": {
                        debugLog(`[watchChange:${change.event}] Deleting type definitions for ${file}`);
                        const dtsPath = rootOutputDir
                            ? path.join(rootOutputDir, `${getRelativePath(file)}.d.ts`)
                            : `${file}.d.ts`;
                        if (fs.existsSync(dtsPath)) {
                            fs.unlinkSync(dtsPath);
                        }
                        else {
                            debugLog(`[watchChange:${change.event}] Type definitions for ${file} not found`);
                        }
                        return;
                    }
                    default: {
                        assertUnreachable(change.event);
                    }
                }
            })().catch((error) => {
                // eslint-disable-next-line no-console
                console.error(`[typed-css-modules] [watchChange:${change.event}] Error processing ${file}: ${error}`);
            });
        },
    };
}
export default plugin;
//# sourceMappingURL=index.js.map