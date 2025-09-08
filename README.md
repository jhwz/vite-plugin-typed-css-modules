# vite-plugin-typed-css-modules

Generates typed definitions for css modules using [typed-css-modules](https://github.com/Quramy/typed-css-modules).

The plugin will set the vite config field `css.modules.localsConvention` to [`camelCaseOnly`](https://github.com/madyankin/postcss-modules#localsconvention) and sets the [`camelCase`](https://github.com/Quramy/typed-css-modules#camelize-css-token) option in [typed-css-modules](https://github.com/Quramy/typed-css-modules).

Using the vite dev server, any time a `[name].module.css` file is created, updated, or deleted, the corresponding `.d.ts` file will be automatically generated or removed.

## Installation

```sh
npm install vite-plugin-typed-css-modules
```

## Usage

> [!TIP]
> It's recommended to add `*.module.css` to your `.gitignore` file to avoid committing the generated `.d.ts` files to your repository.

```js
// vite.config.js

import typedCssModulesPlugin from "vite-plugin-typed-css-modules";

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [typedCssModulesPlugin()],
};

export default config;
```

### Optional Configuration

```js
// vite.config.js

import typedCssModulesPlugin from "vite-plugin-typed-css-modules";

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [
    typedCssModulesPlugin({
      // Include specific file patterns (default: '**/*.module.css')
      include: ['**/*.module.css'],

      // Exclude files from processing
      ignore: [],
      
      // Enable verbose logging for debugging
      verbose: true,
    }),
  ],
};

export default config;
```
