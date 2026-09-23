# chariot-openapi

Chariot uses the `OpenAPI 3.0.0` specification to schematize our [docs](https://docs.givechariot.com)
and to generate our supported client libraries.
This provides for a consistent typing experience across our external interfaces.

## Development

Tooling and tasks are managed with [mise](https://mise.jdx.dev/). To set up:

```sh
./mise/install
```

That installs mise (if needed), then Node, pnpm and the Fern CLI version pinned in
`fern/fern.config.json`. Run `mise tasks` to see everything available:

```sh
mise run fern:dev      # serve the docs locally, with hot reload, on :3000
mise run fern:check    # validate the specs, overrides and docs config
mise run fern:preview  # publish a hosted preview and print its URL
mise run fern:upgrade  # bump the pinned Fern CLI
```

`fern:dev` renders the real docs UI at <http://localhost:3000> and reloads as you
edit anything under `fern/` or `specs/`. Pass extra flags after `--`, for example
`mise run fern:dev -- --port 3002`.

Search, SEO and authentication are disabled in local dev. To exercise those, use
`fern:preview`, which builds the site the same way the Preview Docs workflow does
on every pull request. It publishes to Fern Cloud, so it needs credentials from
`fern login` (or a `FERN_TOKEN` in your environment).

## Code Generation

You can find examples on the official [OpenApiGenerator docs](https://github.com/OpenAPITools/openapi-generator#3---usage)
for how to automatically generate client libraries from the provided specs.
