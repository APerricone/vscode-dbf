const vscode = require('vscode');
const { dbfDocument } = require("./dbfDocument");
const path = require('path');
const fs = require('fs');
const { time } = require('console');


/**
 * @extends vscode.CustomReadonlyEditorProvider
 */
class dbfCustomEditor {

    /**
    * @param {vscode.ExtensionContext} context
     * @param {dbfDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
    */
    constructor(context, document, webviewPanel) {
        this.context = context;
        this.document = document;
        this.webviewPanel = webviewPanel;

        this.webviewPanel.onDidChangeViewState((ev) => {
            this.changedViewState(ev);
        });
    }

    /**
     *
     * @param {vscode.WebviewPanelOnDidChangeViewStateEvent} ev
     */
    changedViewState(ev) {
        if(this.webviewPanel.visible) {
            if(this.document.ready) {
                this.fillWebPanel();
            } else
                this.document.onReady = () => this.fillWebPanel();
        }
    }

    setup() {
        var src = path.join(this.context.extensionPath,"media","index.html");
        this.webviewPanel.webview.options= {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
        };
		// Receive message from the webview.
		this.webviewPanel.webview.onDidReceiveMessage((m) => {
            this.onMessage(m);
		});
        return new Promise((resolve,reject) => {
            fs.readFile(src, {"encoding": "utf-8"}, (err,data) => {
                data = data.replace(/\$\{webview\.cspSource\}/g,this.webviewPanel.webview.cspSource)
                data = data.replace(/\$\{baseUri\}/g,this.webviewPanel.webview.asWebviewUri(
                    this.webviewPanel.webview.options.localResourceRoots[0]
                ))
                this.webviewPanel.webview.html = data;
                resolve();
                if(this.document.ready) {
                    this.fillWebPanel();
                } else
                    this.document.onReady = () => this.fillWebPanel();
            });
        });

    }

    onMessage(message) {
        switch (message.command) {
            default:
                break;
        }
    }

    fillWebPanel() {
        if(!this.document.ready) {
            throw "document not ready"
        }
        this.webviewPanel.webview.postMessage({ command: 'info', data: this.document.info });
        // write header
        this.webviewPanel.webview.postMessage({ command: 'header', data: this.document.colInfos });
        var dateOpt = { year: "numeric", month: "2-digit", day: "2-digit"};
        var timeOpt = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false};
        var dFormat = new Intl.DateTimeFormat(vscode.env.language, dateOpt);
        var tFormat = new Intl.DateTimeFormat(vscode.env.language, timeOpt);
        var dtFormat = new Intl.DateTimeFormat(vscode.env.language, { ...dateOpt, ...timeOpt});
        // write rows
        this.document.onRow =(row) => {
            var rowInfo = [];
            for (let i = 0; i < row.length; i++) {
                /** @type {String|Number|Date|Boolean} */
                const val = row[i];
                /** @type {dbfcolInfo} */
                const colInfo = this.document.colInfos[i];
                switch (colInfo.type) {
                    case "C":   rowInfo.push(val);                      break;
                    case "N":   rowInfo.push(val.toFixed(colInfo.dec)); break;
                    case "L":   rowInfo.push(val? "1" : "0");           break;
                    case "D":   rowInfo.push(dFormat.format(val));      break;
                    case "T":   rowInfo.push(tFormat.format(val));      break;
                    case "@":   rowInfo.push(dtFormat.format(val));     break;
                    default:    rowInfo.push(val + "?");                break;
                }

            }
            this.webviewPanel.webview.postMessage({ command: 'row', data: rowInfo, recno: row.recNo, deleted: row.deleted, cols: this.document.colInfos });
        }
        this.document.readRows(1,Math.min(10,this.document.info.nRecord));
    }
};

exports.dbfCustomEditor = dbfCustomEditor;