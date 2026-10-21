import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const REPO_ROOT = join(import.meta.dir, "../../..");
const SIGNING_METHODS = new Set(["signMessage", "signPsbt", "signTransaction", "signTypedData"]);

// Signer-interface internals that a toolbox requires but that never reach the wallet object.
const ALLOWED_STUBS = new Set([
  // ethers AbstractSigner declares signTransaction abstract; the toolbox does not expose it.
  "packages/wallets/src/walletconnect/evmSigner.ts#signTransaction",
  // Internal ethers signer method; the WalletConnect wallet object sets signTypedData to undefined.
  "packages/wallets/src/walletconnect/evmSigner.ts#signTypedData",
  // The NEAR toolbox falls back to signAndSendTransactions on this rejection; the wallet sets it undefined.
  "packages/wallets/src/walletconnect/index.ts#signTransaction",
]);

function isNotSupportedError(node: ts.Expression) {
  if (!(ts.isNewExpression(node) && node.expression.getText() === "SwapKitError")) return false;
  const [firstArg] = node.arguments ?? [];
  if (!firstArg) return false;
  if (ts.isStringLiteral(firstArg)) return firstArg.text.endsWith("_not_supported");
  if (!ts.isObjectLiteralExpression(firstArg)) return false;

  return firstArg.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      property.name.getText() === "errorKey" &&
      ts.isStringLiteral(property.initializer) &&
      property.initializer.text.endsWith("_not_supported"),
  );
}

function isStubExpression(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)) return isStubExpression(node.expression);
  if (!ts.isCallExpression(node)) return false;

  const callee = node.expression.getText();
  if (/^unsupported[A-Z]/.test(callee)) return true;

  const [rejection] = node.arguments;
  return callee === "Promise.reject" && !!rejection && isNotSupportedError(rejection);
}

function isStubBody(body: ts.ConciseBody) {
  if (!ts.isBlock(body)) return isStubExpression(body);
  if (body.statements.length !== 1) return false;

  const [statement] = body.statements;
  if (ts.isThrowStatement(statement)) return isNotSupportedError(statement.expression);
  if (ts.isReturnStatement(statement) && statement.expression) return isStubExpression(statement.expression);
  return ts.isExpressionStatement(statement) && isStubExpression(statement.expression);
}

function getFunctionBody(node: ts.Node) {
  if (ts.isMethodDeclaration(node)) return node.body;
  if (!(ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) || !node.initializer) return undefined;

  const { initializer } = node;
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer) ? initializer.body : undefined;
}

function findSigningStubs(fileName: string, source: string) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const stubs: string[] = [];

  const visit = (node: ts.Node) => {
    const name =
      ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)
        ? node.name.getText(sourceFile)
        : undefined;
    const body = name && SIGNING_METHODS.has(name) ? getFunctionBody(node) : undefined;
    if (name && body && isStubBody(body)) stubs.push(`${fileName}#${name}`);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return stubs;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "__tests__" || entry.name === "node_modules" ? [] : listSourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("signing capability", () => {
  test("the detector flags a throwing stub and ignores a real implementation", () => {
    const source = `
      const wallet = {
        signMessage: () => { throw new SwapKitError("wallet_x_method_not_supported"); },
        signTransaction: () => unsupportedSignTransaction("X"),
        signTypedData: (data) => provider.request({ method: "eth_signTypedData_v4", params: [data] }),
      };
    `;

    expect(findSigningStubs("sample.ts", source)).toEqual(["sample.ts#signMessage", "sample.ts#signTransaction"]);
  });

  test("no wallet signing method is a stub that throws 'not supported'", () => {
    const packagesDir = join(REPO_ROOT, "packages");
    const files = readdirSync(packagesDir).flatMap((pkg) => listSourceFiles(join(packagesDir, pkg, "src")));
    expect(files.length).toBeGreaterThan(0);

    const stubs = files
      .flatMap((file) => findSigningStubs(relative(REPO_ROOT, file), readFileSync(file, "utf8")))
      .filter((stub) => !ALLOWED_STUBS.has(stub));

    expect(stubs).toEqual([]);
  });
});
