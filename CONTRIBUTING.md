# Contributing

Thanks for your interest in **meowcaller-js**!

## License Dependencies

Every runtime and dev dependency must carry an **OSI-approved open-source license**. The allowlist:

| License | SPDX identifier |
|---------|----------------|
| MIT | `MIT` |
| Apache 2.0 | `Apache-2.0` |
| BSD 2-Clause | `BSD-2-Clause` |
| BSD 3-Clause | `BSD-3-Clause` |
| ISC | `ISC` |
| The Unlicense | `Unlicense` |
| CC0 1.0 Universal | `CC0-1.0` |
| Zero-Clause BSD | `0BSD` |

A **license-check** GitHub Action runs on every PR that touches `package.json`. To run it locally:

```bash
npm install
node -e "
  const pkg = require('./package-lock.json');
  const pkgs = pkg.packages || {};
  for (const [path, info] of Object.entries(pkgs)) {
    if (!path) continue;
    const name = path.replace(/^node_modules\\//, '');
    console.log(name + ': ' + (info.license || 'UNKNOWN'));
  }
"
```

If a dependency uses a composite expression (e.g. `(MIT OR Apache-2.0)`), it is accepted if at least one option is in the allowlist.

## Development

```bash
node --test            # run tests
node src/index.js      # syntax check
```

## Pull Requests

1. Keep changes focused — one feature or fix per PR.
2. Run `node --check` on any new `.js` files.
3. If adding a dependency, confirm its license is on the allowlist.
4. Update the README if the public API changes.
