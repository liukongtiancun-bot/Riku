---
name: API codegen naming
description: Generated Zod runtime validators use operation-id-based names in this workspace.
---

When adding OpenAPI operations, import the generated runtime validator names rather than assuming they match the schema names; the generator prefixes request and response validators with the operation ID.

**Why:** The generated TypeScript interfaces and runtime Zod validators use different naming patterns, so importing an interface as a parser causes a server typecheck failure.

**How to apply:** After codegen, search the generated api-zod output for the exact `Body` and `Response` validator exports before wiring a route.