const vscode = require('vscode');
const path = require('path');
const { dbfDocument } = require("./dbfDocument");

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
        if(document.ready) {
            this.fillWebPanel(document,webviewPanel)
        }
        return new Promise((resolve,reject) => {
            document.on("ready",() => {
                this.fillWebPanel(document,webviewPanel);
                resolve();
            });
        })
    }

    /**
     *
     * @param {dbfDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
     */
    fillWebPanel(document, webviewPanel) {
        if(!document.ready) {
            throw "document not ready"
        }
        var val = "<h1>"+path.basename(document.uri.path)+"</h1>";
        for(var i=0;i<document.colInfos.length;i++) {
            const colInfo = document.colInfos[i];
            val+="<h2>"+colInfo.name+"</h2>"
            val+="<p>"+colInfo.type+" "+colInfo.len
            if(colInfo.type=="N") {
                val+="."+colInfo.dec
            }
            val+="</p>"
        }
        webviewPanel.webview.html=val;
    }
}


exports.dbfEditorProvider = dbfEditorProvider;