import { Project, SyntaxKind, Node } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ProviderId, VectorStoreId } from "../options";

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
  // touch type annotations, which are handled separately here).
  for (const union of [...sf.getDescendantsOfKind(SyntaxKind.UnionType)]) {
    narrowUnionTypeNode(union, removed);
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
  kf.saveSync();
}

// Load the generated project's source files and apply every source transform.
export async function applySourceTransforms(
  root: string,
  o: {
    keptProviders: ProviderId[];
    keptStores: VectorStoreId[];
    settingsDefaults: { chatProvider: ProviderId; chatModel: string; embeddingProvider: ProviderId; embeddingModel: string; parserProvider: ProviderId; parserModel: string };
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
  await project.save();
}
