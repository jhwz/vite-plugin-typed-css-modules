# vite-plugin-typed-css-modules

Generates typed definitions for css modules using [typed-css-modules](https://github.com/Quramy/typed-css-modules).

The plugin will set the vite config field `css.modules.localsConvention` to [`camelCaseOnly`](https://github.com/madyankin/postcss-modules#localsconvention) and sets the [`camelCase`](https://github.com/Quramy/typed-css-modules#camelize-css-token) option in [typed-css-modules](https://github.com/Quramy/typed-css-modules).

Using the vite dev server watcher, any time a `[name].module.css` file is edited a `[name].module.css.d.ts` file will be rewritten.
