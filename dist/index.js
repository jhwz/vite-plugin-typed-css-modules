import fs from "fs";
import path from "path";
import { glob } from "tinyglobby";
import { DtsCreator } from "typed-css-modules/lib/dts-creator.js";
import { createFilter, } from "vite";
const defaultFilesGlob = "**/*.module.css";
function assertUnreachable(value) {
    throw new Error(`Unreachable value: ${value}`);
}
function coerceArray(value) {
    if (value === null || value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
function plugin(options) {
    var _a, _b;
    let include = (_a = options === null || options === void 0 ? void 0 : options.include) !== null && _a !== void 0 ? _a : defaultFilesGlob;
    if (options === null || options === void 0 ? void 0 : options.fileExtension) {
        if (options.include) {
            throw new Error(`Pick either the \`include\` or \`fileExtension\` option, not both.`);
        }
        include = coerceArray(options.fileExtension).map((extension) => `**/*${extension}`);
    }
    const filter = createFilter(include, options === null || options === void 0 ? void 0 : options.ignore);
    const verbose = (_b = options === null || options === void 0 ? void 0 : options.verbose) !== null && _b !== void 0 ? _b : false;
    const rootDir = options === null || options === void 0 ? void 0 : options.rootDir;
    let viteConfig = null;
    const creator = new DtsCreator({ camelCase: true });
    /** All of the glob patterns from the `include` option. */
    const includeGlobPatterns = coerceArray(include).filter((pattern) => typeof pattern === "string");
    /** All of the glob patterns from the `ignore` option. */
    const ignoreGlobPatterns = coerceArray(options === null || options === void 0 ? void 0 : options.ignore).filter((pattern) => typeof pattern === "string");
    /** All of the regex patterns from the `include` option. */
    const includeRegexPatterns = coerceArray(include).filter((pattern) => pattern instanceof RegExp);
    /** All of the regex patterns from the `ignore` option. */
    const ignoreRegexPatterns = coerceArray(options === null || options === void 0 ? void 0 : options.ignore).filter((pattern) => pattern instanceof RegExp);
    /** A filter that only applies the regex patterns. */
    const regexFilter = createFilter(includeRegexPatterns, ignoreRegexPatterns);
    function debugLog(message) {
        if (verbose) {
            // eslint-disable-next-line no-console
            console.debug(`[typed-css-modules] ${message}`);
        }
    }
    function isCssModule(file) {
        const result = filter(file);
        debugLog(`[isCssModule] ${file} is ${result ? "a CSS module" : "not a CSS module"}`);
        return result;
    }
    function getRelativePath(file) {
        return path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;
    }
    async function generateTypeDefinitions(file) {
        debugLog(`[generateTypeDefinitions] Generating type definitions for ${file}`);
        const dts = await creator.create(file, undefined, true);
        if (rootDir) {
            const relativePath = getRelativePath(file);
            const outputPath = path.join(rootDir, `${relativePath}.d.ts`);
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, dts.formatted);
            debugLog(`[generateTypeDefinitions] Wrote type definitions at ${outputPath}`);
        }
        else {
            await dts.writeFile();
            debugLog(`[generateTypeDefinitions] Wrote type definitions at ${dts.outputFilePath}`);
        }
    }
    /**
     * Get all files in the project that match the include pattern, excluding
     * those that match the ignore pattern.
     */
    async function getAllMatchingFiles() {
        var _a;
        // find all files matching the include glob patterns and exclude those
        // matching the ignore glob patterns
        const files = await glob(includeGlobPatterns, {
            cwd: (_a = viteConfig === null || viteConfig === void 0 ? void 0 : viteConfig.root) !== null && _a !== void 0 ? _a : process.cwd(),
            ignore: ["node_modules/**", ...ignoreGlobPatterns],
            absolute: true,
        });
        // run through regex filter to apply regex patterns
        const matchingFiles = files.filter(regexFilter);
        return matchingFiles;
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
        },
        async buildStart(options) {
            const files = await getAllMatchingFiles();
            debugLog(`[buildStart] Found ${files.length} matching files:\n${files.join("\n")}`);
            await Promise.all(files.map(generateTypeDefinitions));
        },
        async watchChange(file, change) {
            if (!isCssModule(file)) {
                debugLog(`[watchChange:${change.event}] Skipping type definitions for ${file} because it does not match files glob`);
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
                        const dtsPath = rootDir
                            ? path.join(rootDir, `${getRelativePath(file)}.d.ts`)
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