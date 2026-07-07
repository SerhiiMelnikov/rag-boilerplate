import { Project, SyntaxKind, Node } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ProviderId, VectorStoreId } from "../options.js";

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

// schema.ts: rewrite the six settings default("...") calls for provider/model.
export function rewriteSettingsDefaults(
  project: Project,
  d: { chatProvider: ProviderId; chatModel: string; embeddingProvider: ProviderId; embeddingModel: string; parserProvider: ProviderId; parserModel: string },
): void {
  const sf = resolveSourceFile(project, "src/lib/db/schema.ts");
  const map: Record<string, string> = {
    chat_provider: d.chatProvider, chat_model: d.chatModel,
    embedding_provider: d.embeddingProvider, embedding_model: d.embeddingModel,
    parser_provider: d.parserProvider, parser_model: d.parserModel,
  };
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

// schema.ts: remove the pgvector-only `chunks` table + its local
// EMBEDDING_DIMENSIONS const, then drop any drizzle-orm/pg-core named import left
// unused (e.g. `vector`). Used when the chosen vector store is NOT pgvector, so
// the app keeps no chunk vectors in Postgres. The runtime EMBEDDING_DIMENSIONS in
// providers/embedding.ts is a different, untouched constant.
export function pruneChunksFromSchema(project: Project): void {
  const sf = resolveSourceFile(project, "src/lib/db/schema.ts");
  for (const name of ["chunks", "EMBEDDING_DIMENSIONS"]) {
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

// Narrow a union type node in-place to drop members whose literal string value
// is in `removed`, preserving non-string-literal members (e.g. `null`) as-is.
function narrowUnionTypeNode(union: import("ts-morph").UnionTypeNode, removed: string[]) {
  const members = union.getTypeNodes();
  const kept = members.filter((m) => {
    if (!Node.isLiteralTypeNode(m)) return true;
    const lit = m.getLiteral();
    if (!Node.isStringLiteral(lit)) return true;
    return !removed.includes(lit.getLiteralValue());
  });
  if (kept.length !== members.length) {
    union.replaceWithText(kept.map((k) => k.getText()).join(" | "));
  }
}

// settings-form.tsx + provider-keys-form.tsx: drop pruned providers from the
// hardcoded arrays/objects/type unions and remove their <KeyRow> lines.
export function pruneAdminProviderLists(project: Project, kept: ProviderId[]): void {
  const keptSet = new Set<string>(kept);
  const removed = (["google", "openai", "anthropic", "ollama"] as ProviderId[]).filter((p) => !keptSet.has(p));

  // Key-based providers actually have an API-key input (ollama is key-less: a
  // base URL only). When none of them survive (an ollama-only selection,
  // which validateSelection allows since ollama is embedding-capable),
  // narrowing the key-based unions/objects below down to nothing collapses
  // them to `never`, which fails `tsc` downstream (e.g. `KEY_OF`'s value
  // union in settings-form.tsx, and `KeyName` in provider-keys-form.tsx). In
  // that case we skip narrowing those specific declarations and leave them in
  // their original three-provider form; the corresponding UI rows are still
  // removed and the stale values are never read, so this is harmless.
  const keyBasedProviders: ProviderId[] = ["google", "openai", "anthropic"];
  const keptKeyBased = keyBasedProviders.filter((p) => keptSet.has(p));

  // settings-form: filter string-literal array elements, object properties
  // whose key is a removed provider, and union-type literals for a removed
  // provider (e.g. the `Record<string, "google" | "openai" | ...>` annotation).
  const sf = resolveSourceFile(project, "src/components/admin/settings-form.tsx");
  for (const arr of sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
    // Compute indices to remove up front: removing an element forgets its
    // node, so later indices must be resolved before any mutation and then
    // removed highest-first to keep the remaining indices valid.
    const indicesToRemove: number[] = [];
    arr.getElements().forEach((el, i) => {
      if (Node.isStringLiteral(el) && removed.includes(el.getLiteralValue() as ProviderId)) indicesToRemove.push(i);
    });
    for (const i of indicesToRemove.reverse()) arr.removeElement(i);
  }
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const prop of [...obj.getProperties()]) {
      if (Node.isPropertyAssignment(prop)) {
        const name = prop.getName().replace(/['"]/g, "");
        if (removed.includes(name as ProviderId)) prop.remove();
      }
    }
  }
  // Narrow union type nodes last (removing array/object entries above does not
  // touch type annotations, which are handled separately here). Guard: when no
  // key-based provider is kept (ollama-only), don't strip key-based literals
  // out of a union — that would collapse `KEY_OF`'s value union down to just
  // `null`, which the `if (!k) return false;` guard in `providerMissingKey`
  // then narrows to `never`, breaking `keys[k].set`. Only non-key-based
  // members (currently just "ollama", which doesn't appear in that union
  // anyway) are removed in that case.
  const unionRemoved = keptKeyBased.length > 0 ? removed : removed.filter((p) => !keyBasedProviders.includes(p));
  for (const union of [...sf.getDescendantsOfKind(SyntaxKind.UnionType)]) {
    narrowUnionTypeNode(union, unionRemoved);
  }
  sf.saveSync();

  // provider-keys-form: remove <KeyRow label="<Provider> API key" .../> for removed providers.
  const kf = resolveSourceFile(project, "src/components/admin/provider-keys-form.tsx");
  const labelFor: Record<ProviderId, string> = { google: "Google API key", openai: "OpenAI API key", anthropic: "Anthropic API key", ollama: "" };
  for (const jsx of [...kf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)]) {
    const label = jsx.getAttribute("label");
    const text = label?.getFirstDescendantByKind(SyntaxKind.StringLiteral)?.getLiteralValue();
    if (text && removed.some((p) => labelFor[p] && labelFor[p] === text)) {
      // Remove the whole JSX child (including its own line/whitespace) rather
      // than leaving an empty text node behind.
      jsx.replaceWithText("");
    }
  }

  // Remove the standalone "Ollama base URL" <label>...</label> block (it isn't
  // a <KeyRow>, so the loop above never touches it) when ollama isn't kept.
  if (removed.includes("ollama")) {
    const matches = kf.getDescendantsOfKind(SyntaxKind.JsxElement).filter((el) => el.getText().includes("Ollama base URL"));
    // Prefer the innermost match: an enclosing <section>/<form> also "contains"
    // the text transitively, so only remove elements with no matching descendant.
    for (const el of matches) {
      const hasNestedMatch = el.getDescendantsOfKind(SyntaxKind.JsxElement).some((d) => d.getText().includes("Ollama base URL"));
      if (!hasNestedMatch) el.replaceWithText("");
    }
  }

  // Narrow the KeyName type alias to the key-based kept providers. Ollama is
  // key-less (no API key, just a base URL) so it's never a KeyName member.
  // Guard: when no key-based provider is kept (ollama-only), skip this
  // narrowing entirely rather than collapsing to `never` — a `never` KeyName
  // then poisons every `keyInputs[k]`/`Record<KeyName, string>` use with a
  // `tsc` error. Leaving the original three-provider union in place is
  // harmless here: the corresponding <KeyRow>s are already removed above, so
  // the extra union members / object keys are simply never read or submitted.
  if (keptKeyBased.length > 0) {
    const keyNameAlias = kf.getTypeAliasOrThrow("KeyName");
    keyNameAlias.setType(keptKeyBased.map((m) => `"${m}"`).join(" | "));

    // Filter the keyInputs initializer object literals (the useState default and
    // the reset call after a successful save) down to the kept key-based providers.
    const keyBasedSet = new Set<string>(keyBasedProviders);
    for (const obj of kf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
      const props = obj.getProperties();
      const isKeyInputsInitializer = props.length > 0 && props.every(
        (p) => Node.isPropertyAssignment(p) && keyBasedSet.has(p.getName().replace(/['"]/g, "")),
      );
      if (!isKeyInputsInitializer) continue;
      for (const prop of [...props]) {
        if (Node.isPropertyAssignment(prop) && removed.includes(prop.getName().replace(/['"]/g, "") as ProviderId)) {
          prop.remove();
        }
      }
    }

    // Filter the submit-loop provider array (`["google", "openai", "anthropic"] as const`).
    for (const arr of kf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
      const indicesToRemove: number[] = [];
      arr.getElements().forEach((el, i) => {
        if (Node.isStringLiteral(el) && removed.includes(el.getLiteralValue() as ProviderId)) indicesToRemove.push(i);
      });
      for (const i of indicesToRemove.reverse()) arr.removeElement(i);
    }
  }

  kf.saveSync();
}

// Load the generated project's source files and apply every source transform.
export async function applySourceTransforms(
  root: string,
  o: {
    keptProviders: ProviderId[];
    keptStores: VectorStoreId[];
    settingsDefaults: { chatProvider: ProviderId; chatModel: string; embeddingProvider: ProviderId; embeddingModel: string; parserProvider: ProviderId; parserModel: string };
    cutPgvector: boolean;
  },
): Promise<void> {
  const allProviders: ProviderId[] = ["google", "openai", "anthropic", "ollama"];
  const allStores: VectorStoreId[] = ["pgvector", "qdrant", "chroma", "weaviate", "pinecone"];
  const removedProviders = allProviders.filter((p) => !o.keptProviders.includes(p));
  const removedStores = allStores.filter((s) => !o.keptStores.includes(s));

  const project = new Project({ tsConfigFilePath: `${root}/tsconfig.json`, skipAddingFilesFromTsConfig: true });
  for (const rel of [
    "src/lib/providers/index.ts", "src/lib/providers/types.ts", "src/lib/vectorstore/index.ts",
    "src/lib/db/schema.ts", "src/components/admin/settings-form.tsx", "src/components/admin/provider-keys-form.tsx",
    "scripts/vectorstore-init.ts",
  ]) {
    project.addSourceFileAtPath(`${root}/${rel}`);
  }

  if (removedProviders.length) {
    pruneProviderFactory(project, removedProviders);
    narrowProviderUnions(project, o.keptProviders);
    pruneAdminProviderLists(project, o.keptProviders);
  }
  if (removedStores.length) {
    pruneVectorFactory(project, removedStores);
    pruneVectorInitScript(project, removedStores);
  }
  rewriteSettingsDefaults(project, o.settingsDefaults);
  if (o.cutPgvector) pruneChunksFromSchema(project);
  await project.save();
}
