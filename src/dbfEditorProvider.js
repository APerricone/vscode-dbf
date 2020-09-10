const vscode = require('vscode');
const { dbfDocument } = require("./dbfDocument");
const { doesNotThrow } = require('assert');

/**
 *@extends vscodde.CustomReadonlyEditorProvider
 */
class dbfEditorProvider
{
    /**
     *
     * @param {vscode.Uri} uri
     * @param {vscode.CustomDocumentOpenContext} openContext
     * @param {vscode.CancellationToken} token
     */
    openCustomDocument(uri, openContext, token) {
        if(uri.scheme != "file")
            return undefined;
        return new dbfDocument(uri);
    }
    /**
     *
     * @param {dbfDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
     * @param {vscode.CancellationToken} token
     */
    resolveCustomEditor(document, webviewPanel, token) {
        // fill webpanel with document info
        webviewPanel.webview.html="<h1>Ciao</h1>"
    }
}



exports.dbfEditorProvider = dbfEditorProvider;