import { type FilterPattern, type PluginOption } from "vite";
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
declare function plugin(options?: TypedCssModulesOptions): PluginOption;
export default plugin;
