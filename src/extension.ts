import * as vscode from "vscode";
import { SourceAnnotationController } from "./controller/sourceAnnotationController";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const controller = new SourceAnnotationController(context);
  context.subscriptions.push(controller);
  await controller.start();
}

export function deactivate(): void {}
