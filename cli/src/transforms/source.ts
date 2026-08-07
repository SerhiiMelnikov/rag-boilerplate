import { Project, SyntaxKind, Node } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ProviderId, VectorStoreId } from "../options.js";
import { SPEECH_CAPABLE } from "../options.js";

// Resolve a source file either by its exact path (used by the in-memory tests,
// which create files at repo-relative virtual paths) or by an absolute path
// ending in the given repo-relative suffix (used by applySourceTransforms,
// which adds files at real absolute paths under some project root).
function resolveSourceFile(project: Project, relPath: string): SourceFile {
  const direct = project.getSourceFile(relPath);
  if (direct) return direct;
  const bySuffix = project.getSourceFiles().find((f) => f.getFilePath().endsWith(relPath));
  if (bySuffix) return bySuffix;
  throw new Error(`source file not found: ${relPath}`);
}

// Remove `case "<id>": ...` clauses whose test is one of `ids` from every switch
// in the file, and any top-level named import whose every binding is no longer
// referenced elsewhere in the file.
function removeSwitchCasesByLiteral(project: Project, path: string, ids: string[]) {
  const sf = resolveSourceFile(project, path);
  const targets = new Set(ids);
  for (const clause of sf.getDescendantsOfKind(SyntaxKind.CaseClause)) {
    const expr = clause.getExpression();
    if (Node.isStringLiteral(expr) && targets.has(expr.getLiteralValue())) {
      clause.remove();
    }
  }
  // Drop named imports whose every binding is no longer referenced in the file.
  for (const imp of sf.getImportDeclarations()) {
    const named = imp.getNamedImports();
    if (named.length === 0) continue;
    const allUnused = named.every((n) => {
      const name = n.getName();
      // Count identifiers with this name outside the import binding itself.
      const uses = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((i) => i.getText() === name);
      return uses.length <= 1; // only the import binding remains
    });
    if (allUnused) imp.remove();
  }
  sf.saveSync();
}

// providers/index.ts: remove the removed providers' cases + now-unused imports.
export function pruneProviderFactory(project: Project, removed: ProviderId[]): void {
  removeSwitchCasesByLiteral(project, "src/lib/providers/index.ts", removed);
}

// providers/transcription.ts: remove the `if (provider === "<id>") { ... }`
// branch for each removed speech-capable provider, plus the now-unused named
// import for its adapter module.
//
// A sibling to removeSwitchCasesByLiteral rather than a reuse of it: this file
// branches on `provider === "openai"` / `provider === "google"` inside a single
// try block, not a switch, so there are no CaseClause nodes for that helper to
// find. Only google and openai (SPEECH_CAPABLE) ever appear here — anthropic and
// ollama have no branch to remove and are silently skipped, same as pruning a
// vector store nobody selected removes zero cases from vectorstore/index.ts.
//
// Follows pruneProviderCatalog's fail-loudly convention rather than
// removeSwitchCasesByLiteral's tolerate-and-move-on one: this is the exact file
// where a shape drift once shipped a project whose transcription.ts imported a
// provider adapter file scaffold.ts had already deleted (Task 2's finding, closed
// here). Silently leaving that import in place on a shape mismatch would
// reproduce the very defect this function exists to close, so a missing branch
// for a targeted provider throws instead.
export function pruneTranscriptionAdapter(project: Project, removed: ProviderId[]): void {
  const targets = removed.filter((p) => SPEECH_CAPABLE.includes(p));
  if (targets.length === 0) return;

  const sf = resolveSourceFile(project, "src/lib/providers/transcription.ts");
  const fn = sf.getFunctionOrThrow("transcribe");

  for (const id of targets) {
    const ifStmt = fn.getDescendantsOfKind(SyntaxKind.IfStatement).find((stmt) => {
      const expr = stmt.getExpression();
      if (!Node.isBinaryExpression(expr)) return false;
      if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsEqualsEqualsToken) return false;
      if (expr.getLeft().getText() !== "provider") return false;
      const right = expr.getRight();
      return Node.isStringLiteral(right) && right.getLiteralValue() === id;
    });
    if (!ifStmt) {
      throw new Error(
        `src/lib/providers/transcription.ts must contain an "if (provider === \"${id}\")" branch to prune`,
      );
    }
    ifStmt.remove();
  }

  // Drop now-unused named import SPECIFIERS (not whole declarations): unlike
  // providers/index.ts, this file imports experimental_transcribe and
  // generateText together from "ai", and pruning only one provider leaves the
  // other in active use — an all-or-nothing removal (removeSwitchCasesByLiteral's
  // approach) would leave the whole "ai" import untouched either way, but this
  // is scoped per-specifier so the now-dead half is still removed when only one
  // of the two provider branches is pruned.
  for (const imp of sf.getImportDeclarations()) {
    for (const spec of [...imp.getNamedImports()]) {
      const name = spec.getName();
      const uses = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((i) => i.getText() === name);
      if (uses.length <= 1) spec.remove(); // only the import binding itself remains
    }
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) {
      imp.remove();
    }
  }
  sf.saveSync();
}

// vectorstore/index.ts: remove the removed stores' cases + now-unused imports.
export function pruneVectorFactory(project: Project, removed: VectorStoreId[]): void {
  removeSwitchCasesByLiteral(project, "src/lib/vectorstore/index.ts", removed);
}

// scripts/vectorstore-init.ts: remove the removed stores' ensure* imports + cases.
export function pruneVectorInitScript(project: Project, removed: VectorStoreId[]): void {
  removeSwitchCasesByLiteral(project, "scripts/vectorstore-init.ts", removed);
}

// types.ts: narrow the ProviderId / EmbeddingProviderId unions to the kept set.
export function narrowProviderUnions(project: Project, kept: ProviderId[]): void {
  const sf = resolveSourceFile(project, "src/lib/providers/types.ts");
  const keptSet = new Set<string>(kept);
  const embeddingCapable = new Set(["google", "openai", "ollama"]);
  const narrowAlias = (aliasName: string, allMembers: string[]) => {
    const alias = sf.getTypeAliasOrThrow(aliasName);
    const keptMembers = allMembers.filter((m) => keptSet.has(m));
    alias.setType(keptMembers.map((m) => `"${m}"`).join(" | "));
  };
  narrowAlias("ProviderId", ["google", "openai", "anthropic", "ollama"]);
  narrowAlias("EmbeddingProviderId", ["google", "openai", "ollama"].filter((m) => embeddingCapable.has(m)));
  sf.saveSync();
}

// schema.ts: rewrite the up-to-twelve settings default("...") calls for
// provider/model.
export function rewriteSettingsDefaults(
  project: Project,
  d: {
    chatProvider: ProviderId; chatModel: string;
    embeddingProvider: ProviderId; embeddingModel: string;
    parserProvider: ProviderId; parserModel: string;
    imageProvider: ProviderId; imageModel: string;
    unifiedProvider: ProviderId; unifiedModel: string;
    speechProvider: ProviderId | null; speechModel: string | null;
  },
): void {
  const sf = resolveSourceFile(project, "src/lib/db/schema.ts");
  const map: Record<string, string> = {
    chat_provider: d.chatProvider, chat_model: d.chatModel,
    embedding_provider: d.embeddingProvider, embedding_model: d.embeddingModel,
    parser_provider: d.parserProvider, parser_model: d.parserModel,
    image_provider: d.imageProvider, image_model: d.imageModel,
    unified_provider: d.unifiedProvider, unified_model: d.unifiedModel,
  };
  // Speech is the one pair that can be absent: a selection with no
  // speech-capable provider (e.g. --providers ollama) leaves the schema's own
  // defaults in place, unread — SPEECH_PROVIDER_IDS is empty there, the admin
  // form's row does not render and the endpoint answers 503.
  if (d.speechProvider && d.speechModel) {
    map.speech_provider = d.speechProvider;
    map.speech_model = d.speechModel;
  }
  // Each settings column is built as `text("<col>")...default("<old>")` inside a
  // single PropertyAssignment (`colName: text(...).notNull().default(...)`).
  // Find the column's PropertyAssignment, then locate the .default(...) call
  // and the text("<col>") call within it to know which default to write.
  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const columnLiteral = prop
      .getDescendantsOfKind(SyntaxKind.StringLiteral)
      .find((s) => map[s.getLiteralValue()] !== undefined);
    if (!columnLiteral) continue;
    const col = columnLiteral.getLiteralValue();
    for (const call of prop.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!call.getExpression().getText().endsWith(".default")) continue;
      const arg = call.getArguments()[0];
      if (arg && Node.isStringLiteral(arg)) arg.setLiteralValue(map[col]);
    }
  }
  sf.saveSync();
}

// schema.ts: remove the pgvector-only `chunks` and `image_vectors` tables + the
// local EMBEDDING_DIMENSIONS const, then drop any drizzle-orm/pg-core named
// import left unused (e.g. `vector`). Used when the chosen vector store is NOT
// pgvector, so the app keeps no chunk/image vectors in Postgres (the universal
// `images` metadata table survives; only its pgvector-only embedding sidecar
// table is removed). The runtime EMBEDDING_DIMENSIONS in providers/embedding.ts
// is a different, untouched constant.
export function pruneChunksFromSchema(project: Project): void {
  const sf = resolveSourceFile(project, "src/lib/db/schema.ts");
  for (const name of ["chunks", "EMBEDDING_DIMENSIONS", "imageVectors"]) {
    sf.getVariableDeclaration(name)?.getVariableStatementOrThrow().remove();
  }
  // Drop named imports whose binding is no longer referenced anywhere in the file.
  for (const imp of sf.getImportDeclarations()) {
    const unused = imp.getNamedImports().filter((spec) => {
      const nm = spec.getName();
      const uses = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((i) => i.getText() === nm);
      return uses.length <= 1; // only the import binding itself remains
    });
    for (const spec of unused) spec.remove();
    if (imp.getNamedImports().length === 0) imp.remove();
  }
  sf.saveSync();
}

// Provider pruning for the admin surface, in one place.
//
// This replaces a pair of file-wide ts-morph sweeps over settings-form.tsx and
// provider-keys-form.tsx: every array literal, every object literal, every union
// type, plus JSX pattern-matching that would delete an enclosing <form> if a
// label ever moved into a self-closing element. None of that contract was
// written down; it was whatever the sweeps happened to hit.
//
// Now the admin forms render from src/lib/providers/catalog.ts, so their markup
// is free and only the catalog is edited. The *OrThrow calls below ARE the
// contract: if the declaration is renamed or stops being an array literal, the
// CLI fails at scaffold time instead of silently producing a broken app.
export function pruneProviderCatalog(project: Project, kept: ProviderId[]): void {
  const keptSet = new Set<string>(kept);
  const cat = resolveSourceFile(project, "src/lib/providers/catalog.ts");
  const decl = cat.getVariableDeclarationOrThrow("PROVIDERS");
  const arr = decl.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!arr) {
    throw new Error("PROVIDERS in src/lib/providers/catalog.ts must be initialised with an array literal");
  }

  // Resolve indices before mutating: removing an element forgets its node, so
  // every index must be known up front and removed highest-first.
  const drop: number[] = [];
  arr.getElements().forEach((el, i) => {
    if (!Node.isObjectLiteralExpression(el)) {
      throw new Error("every PROVIDERS entry must be an object literal");
    }
    const prop = el.getProperty("id");
    if (!prop || !Node.isPropertyAssignment(prop)) {
      throw new Error("every PROVIDERS entry must have an `id` property");
    }
    const init = prop.getInitializer();
    if (!init || !Node.isStringLiteral(init)) {
      throw new Error("every PROVIDERS entry's `id` must be a string literal");
    }
    if (!keptSet.has(init.getLiteralValue())) drop.push(i);
  });
  for (const i of drop.reverse()) arr.removeElement(i);
  cat.saveSync();
}

// settings-service.ts: the CHAT_PROVIDERS / EMBEDDING_PROVIDERS `as const` arrays
// that feed z.enum(...) in settingsPatchSchema. Without this a generated project's
// API accepts a provider the project no longer ships, stores it, and fails later
// in the pruned factory — a runtime gap CI's type-check and build cannot see.
//
// The arrays stay literal rather than deriving from the catalog because z.enum
// needs a literal tuple to produce a literal union; deriving would collapse the
// schema's types to plain `string`. src/lib/providers/catalog.test.ts holds the
// agreement test that stops the two drifting.
//
// Scoped to the two named declarations: a file-wide sweep would also reach
// unrelated literals in a 300-line service.
export function pruneSettingsServiceProviders(project: Project, kept: ProviderId[]): void {
  const keptSet = new Set<string>(kept);
  const sf = resolveSourceFile(project, "src/lib/config/settings-service.ts");
  for (const name of ["CHAT_PROVIDERS", "EMBEDDING_PROVIDERS"]) {
    const decl = sf.getVariableDeclarationOrThrow(name);
    const init = decl.getInitializerOrThrow();
    // `[...] as const` — the initializer is an AsExpression wrapping the array.
    const expr = Node.isAsExpression(init) ? init.getExpression() : init;
    if (!Node.isArrayLiteralExpression(expr)) {
      throw new Error(`${name} in src/lib/config/settings-service.ts must be an array literal`);
    }
    const drop: number[] = [];
    expr.getElements().forEach((el, i) => {
      if (Node.isStringLiteral(el) && !keptSet.has(el.getLiteralValue())) drop.push(i);
    });
    for (const i of drop.reverse()) expr.removeElement(i);
  }
  sf.saveSync();
}

// src/lib/openapi/*: the OpenAPI document hardcodes the full provider set, so a
// generated single-provider project would otherwise ship docs advertising
// providers its own API rejects. Narrow the same way the admin forms are narrowed.
// Unlike settings-form's TS unions, these are zod values: an empty object literal
// is valid, so no "collapses to never" guard is needed here.
export function pruneOpenApiProviderLists(project: Project, kept: ProviderId[]): void {
  const keptSet = new Set<string>(kept);
  const removed = (["google", "openai", "anthropic", "ollama"] as ProviderId[]).filter((p) => !keptSet.has(p));
  if (removed.length === 0) return;
  const removedKeyProps = new Set(removed.map((p) => `${p}Key`));

  // admin-settings.ts: the CHAT_PROVIDERS / EMBEDDING_PROVIDERS literal arrays and
  // the per-provider *Key fields of SettingsUpdateRequest. The *Key suffix already
  // scopes the property removal to the provider-key fields specifically, so a
  // file-wide object-literal loop is safe (verified: no other object literal in
  // this file has a property named e.g. "googleKey").
  const as = resolveSourceFile(project, "src/lib/openapi/paths/admin-settings.ts");
  for (const arr of as.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
    const indicesToRemove: number[] = [];
    arr.getElements().forEach((el, i) => {
      if (Node.isStringLiteral(el) && removed.includes(el.getLiteralValue() as ProviderId)) indicesToRemove.push(i);
    });
    for (const i of indicesToRemove.reverse()) arr.removeElement(i);
  }
  for (const obj of as.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const prop of [...obj.getProperties()]) {
      if (Node.isPropertyAssignment(prop) && removedKeyProps.has(prop.getName().replace(/['"]/g, ""))) prop.remove();
    }
  }
  as.saveSync();

  // schemas.ts: the masked `keys` object (google/openai/anthropic KeyStatus entries).
  // Scoped to properties whose initializer is the `KeyStatus` identifier (not just
  // any property literally named after a provider) so an unrelated schema field
  // that happens to share a provider's name (e.g. a locale code) is never touched.
  const sc = resolveSourceFile(project, "src/lib/openapi/schemas.ts");
  for (const obj of sc.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const prop of [...obj.getProperties()]) {
      if (!Node.isPropertyAssignment(prop)) continue;
      if (!removed.includes(prop.getName().replace(/['"]/g, "") as ProviderId)) continue;
      const init = prop.getInitializer();
      if (init && Node.isIdentifier(init) && init.getText() === "KeyStatus") prop.remove();
    }
  }
  sc.saveSync();
}

// Load the generated project's source files and apply every source transform.
export async function applySourceTransforms(
  root: string,
  o: {
    keptProviders: ProviderId[];
    keptStores: VectorStoreId[];
    settingsDefaults: {
      chatProvider: ProviderId; chatModel: string;
      embeddingProvider: ProviderId; embeddingModel: string;
      parserProvider: ProviderId; parserModel: string;
      imageProvider: ProviderId; imageModel: string;
      unifiedProvider: ProviderId; unifiedModel: string;
      speechProvider: ProviderId | null; speechModel: string | null;
    };
    cutPgvector: boolean;
  },
): Promise<void> {
  const allProviders: ProviderId[] = ["google", "openai", "anthropic", "ollama"];
  const allStores: VectorStoreId[] = ["pgvector", "qdrant", "chroma", "weaviate", "pinecone"];
  const removedProviders = allProviders.filter((p) => !o.keptProviders.includes(p));
  const removedStores = allStores.filter((s) => !o.keptStores.includes(s));

  const project = new Project({ tsConfigFilePath: `${root}/tsconfig.json`, skipAddingFilesFromTsConfig: true });
  for (const rel of [
    "src/lib/providers/index.ts", "src/lib/providers/types.ts", "src/lib/providers/catalog.ts",
    "src/lib/providers/transcription.ts",
    "src/lib/vectorstore/index.ts", "src/lib/db/schema.ts",
    "scripts/vectorstore-init.ts", "src/lib/openapi/paths/admin-settings.ts", "src/lib/openapi/schemas.ts",
    "src/lib/config/settings-service.ts",
  ]) {
    project.addSourceFileAtPath(`${root}/${rel}`);
  }

  if (removedProviders.length) {
    pruneProviderFactory(project, removedProviders);
    pruneTranscriptionAdapter(project, removedProviders);
    narrowProviderUnions(project, o.keptProviders);
    pruneProviderCatalog(project, o.keptProviders);
    pruneSettingsServiceProviders(project, o.keptProviders);
    pruneOpenApiProviderLists(project, o.keptProviders);
  }
  if (removedStores.length) {
    pruneVectorFactory(project, removedStores);
    pruneVectorInitScript(project, removedStores);
  }
  rewriteSettingsDefaults(project, o.settingsDefaults);
  if (o.cutPgvector) pruneChunksFromSchema(project);
  await project.save();
}
