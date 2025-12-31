import { type FilterPattern, type PluginOption } from "vite";
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
     * Default: "src" if it exists; otherwise, the project root.
     */
    srcDir?: string;
    /**
     * @deprecated use {@link TypedCssModulesOptions.include} instead
     */
    fileExtension?: `.${string}` | `.${string}`[];
};
declare function plugin(options?: TypedCssModulesOptions): PluginOption;
export default plugin;
