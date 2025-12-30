import fs from "fs";
import path from "path";
import { build, createServer, type InlineConfig } from "vite";
import { expect, test } from "vitest";
import plugin, { type TypedCssModulesOptions } from "./index.js";

const fixturesDir = path.resolve(__dirname, "__fixtures__");

const sampleCssModuleName = "sample.module.css";
const sampleCssModuleDtsName = `${sampleCssModuleName}.d.ts`;

function createTestDirPath() {
  return path.resolve(
    __dirname,
    "__fixtures__",
    `.test-${process.hrtime().join("")}`,
  );
}

function createTestDir(options?: TypedCssModulesOptions) {
  const cssModulePath = path.join(fixturesDir, sampleCssModuleName);
  const testDir = createTestDirPath();

  fs.mkdirSync(testDir);

  // Copy both the CSS module and the index.js file
  fs.copyFileSync(
    cssModulePath,
    path.join(testDir, path.basename(cssModulePath)),
  );
  fs.copyFileSync(
    path.join(fixturesDir, "index.js"),
    path.join(testDir, "index.js"),
  );

  const buildOptions = {
    root: testDir,
    configFile: false,
    plugins: [plugin(options)],
    logLevel: "silent",
    build: {
      rollupOptions: {
        input: {
          main: path.join(testDir, "index.js"),
          css: path.join(testDir, sampleCssModuleName),
        },
      },
    },
  } satisfies InlineConfig;

  return {
    buildOptions,
    [Symbol.dispose]: () => {
      fs.rmSync(testDir, { recursive: true });
    },
    readFileSync(file: string) {
      return fs.readFileSync(path.join(testDir, file), "utf-8");
    },
    writeFileSync(file: string, content: string) {
      return fs.writeFileSync(path.join(testDir, file), content);
    },
    existsSync(file: string) {
      return fs.existsSync(path.join(testDir, file));
    },
    unlinkSync(file: string) {
      return fs.unlinkSync(path.join(testDir, file));
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
    waitForFileChange() {
      return new Promise<void>((resolve) => {
        const watcher = server.watcher;
        const onChange = () => {
          watcher.off("change", onChange);
          watcher.off("add", onChange);
          watcher.off("unlink", onChange);
          // Give the plugin a moment to process the file
          setTimeout(resolve, 50);
        };
        watcher.on("change", onChange);
        watcher.on("add", onChange);
        watcher.on("unlink", onChange);
      });
    },
    [Symbol.asyncDispose]: async () => {
      await server.close();
      dir[Symbol.dispose]();
    },
  };
}

test("build", async () => {
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

test("build generates types for CSS modules not in rollup input", async () => {
  using ctx = createTestDir();

  // Add a second CSS module that is NOT in the rollup input
  const extraCssModuleName = "extra.module.css";
  ctx.writeFileSync(extraCssModuleName, `.button { color: red; }`);

  // Build with only index.js as input (no CSS modules in input)
  await build({
    ...ctx.buildOptions,
    build: {
      rollupOptions: {
        input: {
          main: path.join(ctx.buildOptions.root, "index.js"),
        },
      },
    },
  });

  // Both CSS modules should have .d.ts files generated
  expect(ctx.existsSync(sampleCssModuleDtsName)).toBe(true);
  expect(ctx.existsSync(`${extraCssModuleName}.d.ts`)).toBe(true);

  const extraDtsContent = ctx.readFileSync(`${extraCssModuleName}.d.ts`);
  expect(extraDtsContent).toMatchInlineSnapshot(`
      "declare const styles: {
        readonly "button": string;
      };
      export = styles;

      "
    `);
});

test("watch file creation", async () => {
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

test("watch file update", async () => {
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

test("watch file deletion", async () => {
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
  expect(ctx.existsSync(sampleCssModuleDtsName)).toBe(false);
});

test("include pattern option", async () => {
  await using ctx = await createTestServer({
    include: "**/*.styles.css",
    ignore: "**/__*",
  });

  const cssContent = `.button { background: red; }`;

  // Create a file that matches the include pattern
  const stylesCssName = "sample.styles.css";
  ctx.writeFileSync(stylesCssName, cssContent);
  await ctx.waitForFileChange();

  // Create a file that matches the exclude pattern
  const ignoreCssName = `__${stylesCssName}`;
  ctx.writeFileSync(ignoreCssName, cssContent);
  await ctx.waitForFileChange();

  expect(ctx.existsSync(sampleCssModuleDtsName)).toBe(false);

  expect(ctx.existsSync(stylesCssName + ".d.ts")).toBe(true);
  expect(ctx.existsSync(ignoreCssName + ".d.ts")).toBe(false);
});

test("deprecated fileExtension option", async () => {
  await using ctx = await createTestServer({ fileExtension: ".css" });

  ctx.writeFileSync(`test.css`, `.header { color: blue; }`);

  await ctx.waitForFileChange();

  expect(ctx.existsSync(`test.css.d.ts`)).toBe(true);
});

test("rootDir option writes .d.ts files to alternate directory", async () => {
  const tempRootDir = createTestDirPath();
  fs.mkdirSync(tempRootDir);
  try {
    using ctx = createTestDir({ rootDir: tempRootDir });

    await build(ctx.buildOptions);

    // .d.ts should NOT be in the source directory
    expect(ctx.existsSync(sampleCssModuleDtsName)).toBe(false);

    // .d.ts SHOULD be in the rootDir (path is relative to cwd)
    const relativeTestDir = path.relative(process.cwd(), ctx.buildOptions.root);
    const dtsInRootDir = path.join(
      tempRootDir,
      relativeTestDir,
      sampleCssModuleDtsName,
    );
    expect(fs.existsSync(dtsInRootDir)).toBe(true);

    const dtsContent = fs.readFileSync(dtsInRootDir, "utf-8");
    expect(dtsContent).toMatchInlineSnapshot(`
      "declare const styles: {
        readonly "container": string;
      };
      export = styles;

      "
    `);
  } finally {
    fs.rmSync(tempRootDir, { recursive: true });
  }
});

test("rootDir option deletes .d.ts from alternate directory on file deletion", async () => {
  const tempRootDir = createTestDirPath();
  fs.mkdirSync(tempRootDir);

  try {
    const dir = createTestDir({ rootDir: tempRootDir });
    const server = await createServer({
      ...dir.buildOptions,
      plugins: [plugin({ rootDir: tempRootDir })],
    });
    await server.listen(0);

    const waitForFileChange = () =>
      new Promise<void>((resolve) => {
        const watcher = server.watcher;
        const onChange = () => {
          watcher.off("change", onChange);
          watcher.off("add", onChange);
          watcher.off("unlink", onChange);
          setTimeout(resolve, 50);
        };
        watcher.on("change", onChange);
        watcher.on("add", onChange);
        watcher.on("unlink", onChange);
      });

    try {
      // Create a CSS module
      const cssContent = `.header { color: blue; }`;
      dir.writeFileSync(sampleCssModuleName, cssContent);
      await waitForFileChange();

      // Verify .d.ts was created in rootDir
      const relativeTestDir = path.relative(
        process.cwd(),
        dir.buildOptions.root,
      );
      const dtsInRootDir = path.join(
        tempRootDir,
        relativeTestDir,
        sampleCssModuleDtsName,
      );
      expect(fs.existsSync(dtsInRootDir)).toBe(true);

      // Delete the CSS module
      dir.unlinkSync(sampleCssModuleName);
      await waitForFileChange();

      // Verify .d.ts was deleted from rootDir
      expect(fs.existsSync(dtsInRootDir)).toBe(false);
    } finally {
      await server.close();
      dir[Symbol.dispose]();
    }
  } finally {
    fs.rmSync(tempRootDir, { recursive: true });
  }
});
