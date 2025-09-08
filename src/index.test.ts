import path from "path";
import fs from "fs";
import { expect, test, vi } from "vitest";
import { build, createServer, type BuildOptions, type InlineConfig, type Plugin } from "vite";
import plugin, { type TypedCssModulesOptions } from "./index.js";

const fixturesDir = path.resolve(__dirname, "__fixtures__");

const sampleCssModuleName = "sample.module.css";
const sampleCssModuleDtsName = `${sampleCssModuleName}.d.ts`;


function createTestDir(options?: TypedCssModulesOptions) {
    const cssModulePath = path.join(fixturesDir, sampleCssModuleName);
    const testDir = path.resolve(
        __dirname,
        "__fixtures__",
        `.test-${process.hrtime().join('')}`
    );

    fs.mkdirSync(testDir);

    // Copy both the CSS module and the index.js file
    fs.copyFileSync(cssModulePath, path.join(
        testDir, path.basename(cssModulePath))
    );
    fs.copyFileSync(
        path.join(fixturesDir, "index.js"),
        path.join(testDir, "index.js")
    );

    const buildOptions = {
        root: testDir,
        configFile: false,
        plugins: [
            plugin(options),
        ],
        logLevel: "silent",
        build: {
            rollupOptions: {
                input: {
                    main: path.join(testDir, 'index.js'),
                    css: path.join(testDir, sampleCssModuleName),
                },
            },
        },
    } satisfies InlineConfig;

    return {
        buildOptions,
        [Symbol.dispose]: () => {
            fs.rmSync(testDir, { recursive: true, force: true });
        },
    };
}

async function createTestServer(options?: TypedCssModulesOptions) {
    const dir = createTestDir(options);

    const server = await createServer({
        ...dir.buildOptions,
        plugins: [plugin(options)],
    });

    await server.listen(0);

    return {
        ...dir,
        server,
        readFileSync(file: string) {
            return fs.readFileSync(path.join(dir.buildOptions.root, file), "utf-8");
        },
        writeFileSync(file: string, content: string) {
            return fs.writeFileSync(path.join(dir.buildOptions.root, file), content);
        },
        waitForFileChange() {
            return new Promise<void>((resolve) => {
                const watcher = server.watcher;
                const onChange = () => {
                    watcher.off('change', onChange);
                    watcher.off('add', onChange);
                    watcher.off('unlink', onChange);
                    // Give the plugin a moment to process the file
                    setTimeout(resolve, 50);
                };
                watcher.on('change', onChange);
                watcher.on('add', onChange);
                watcher.on('unlink', onChange);
            });
        },
        [Symbol.asyncDispose]: async () => {
            await server.close();
            dir[Symbol.dispose]();
        },
    }
}

test('build', async () => {
    using ctx = createTestDir();

    await build(ctx.buildOptions);

    const dtsPath = path.join(ctx.buildOptions.root, sampleCssModuleDtsName);
    expect(fs.existsSync(dtsPath)).toBe(true);
    const dtsContent = fs.readFileSync(dtsPath, "utf-8");
    expect(dtsContent).toMatchInlineSnapshot(`
      "declare const styles: {
        readonly "container": string;
      };
      export = styles;

      "
    `);
});

test('watch file creation', async () => {
    await using ctx = await createTestServer();

    // Create a new CSS module file
    const newCssModuleName = "sample2.module.css";
    const newCssContent = `.header { color: blue; }`;
    ctx.writeFileSync(newCssModuleName, newCssContent);

    // wait for the file change to be processed
    await ctx.waitForFileChange();

    // verify the generated content
    const contents = ctx.readFileSync(`${newCssModuleName}.d.ts`);
    expect(contents).toMatchInlineSnapshot(`
      "declare const styles: {
        readonly "header": string;
      };
      export = styles;

      "
    `);
});

test('watch file update', async () => {
    await using ctx = await createTestServer();

    // First, write initial content to the CSS module file
    const initialCssContent = `.header { color: blue; }`;
    ctx.writeFileSync(sampleCssModuleName, initialCssContent);
    await ctx.waitForFileChange();

    // Then edit the CSS module file to add more content
    const updatedCssContent = initialCssContent + "\n.footer { margin: 10px; }";
    ctx.writeFileSync(sampleCssModuleName, updatedCssContent);

    // wait for the file change to be processed
    await ctx.waitForFileChange();

    // verify the updated content
    const contents = ctx.readFileSync(sampleCssModuleDtsName);
    expect(contents).toMatchInlineSnapshot(`
      "declare const styles: {
        readonly "footer": string;
        readonly "header": string;
      };
      export = styles;

      "
    `);
});

test('watch file deletion', async () => {
    await using ctx = await createTestServer();

    // First, create the CSS module file
    const cssContent = `.header { color: blue; }`;
    ctx.writeFileSync(sampleCssModuleName, cssContent);
    await ctx.waitForFileChange();

    // Then delete the CSS module file
    fs.unlinkSync(path.join(ctx.buildOptions.root, sampleCssModuleName));

    // wait for the file deletion to be processed
    await ctx.waitForFileChange();

    // verify the .d.ts file was deleted
    expect(fs.existsSync(path.join(ctx.buildOptions.root, sampleCssModuleDtsName))).toBe(false);
});
