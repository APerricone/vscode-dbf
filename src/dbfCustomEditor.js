const vscode = require('vscode');
const { dbfDocument } = require("./dbfDocument");
const path = require('path');
const fs = require('fs');
const { type } = require('os');
const SUPPORTED_ENCODINGS = require('./encoding').SUPPORTED_ENCODINGS;


var dbfCurrentEditor;
/**
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
        dbfCurrentEditor = this;
        vscode.commands.executeCommand('setContext', "vscode-dbf.hasDoc", true);
    }

    /**
     * @returns {dbfCustomEditor}
     */
    static getCurrentEditor() {
        return dbfCurrentEditor;
    }

    /**
     *
     * @param {vscode.WebviewPanelOnDidChangeViewStateEvent} ev
     */
    changedViewState(/*ev*/) {
        if(this.webviewPanel.visible) {
            this.document.statusBarItem.show()
            vscode.commands.executeCommand('setContext', "vscode-dbf.hasDoc", true);
        } else {
            this.document.statusBarItem.hide()
            vscode.commands.executeCommand('setContext', "vscode-dbf.hasDoc", false);
        }
        if(this.webviewPanel.visible && dbfCurrentEditor != this) {
            dbfCurrentEditor = this;
            if(this.document.ready) {
                this.fillWebPanel();
            } else
                this.document.onReady = () => this.fillWebPanel();
        } else {
            if(dbfCurrentEditor==this)
                dbfCurrentEditor = undefined;
        }
    }

    static pageHTML =undefined
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

        // eslint-disable-next-line no-unused-vars
        if(dbfCustomEditor.pageHTML) {
            var data = dbfCustomEditor.pageHTML.replace(/\$\{webview\.cspSource\}/g,this.webviewPanel.webview.cspSource)
            data = data.replace(/\$\{baseUri\}/g,this.webviewPanel.webview.asWebviewUri(
                this.webviewPanel.webview.options.localResourceRoots[0]            ))

            this.webviewPanel.webview.html = data;
        } else
            return new Promise((resolve,reject) => {
                fs.readFile(src, {"encoding": "utf-8"}, (err,data) => {
                    dbfCustomEditor.pageHTML = data;
                    data = data.replace(/\$\{webview\.cspSource\}/g,this.webviewPanel.webview.cspSource)
                    data = data.replace(/\$\{baseUri\}/g,this.webviewPanel.webview.asWebviewUri(
                        this.webviewPanel.webview.options.localResourceRoots[0]
                    ))

                    this.webviewPanel.webview.html = data;
                    resolve();
                });
            });
    }

    onMessage(message) {
        switch (message.command) {
            case "ready":
                //console.log("ready")
                if(this.document.ready) {
                    this.fillWebPanel();
                } else
                    this.document.onReady = () => this.fillWebPanel();

                break;
            case "rows":
                this.document.readRows(message.min,Math.min(message.max,this.document.info.nRecord));
                break;
            case "order":
                this.document.sort(message.colId,message.desc,message.filters);
                this.document.onSort = () => {
                    this.webviewPanel.webview.postMessage({
                        command: 'totalRow', nFilteredRow:
                            this.document.sortedIdx? this.document.sortedIdx.length : this.document.info.nRecord });
                }
                break;
            case "getList":
                this.document.getListElement(message.colId,message.filter, (items)=>{
                    this.webviewPanel.webview.postMessage({
                        command: 'list', items: items
                    })
                });
                break;
            default:
                break;
        }
    }

    fillWebPanel() {
        if(!this.document.ready) {
            throw "document not ready"
        }
        //console.log(`send Info ${this.document.ready} - ${this.document.colInfos.length} - ${this.document.info.nRecord} `)
        this.webviewPanel.webview.postMessage({ command: 'info', data: this.document.info, cols: this.document.colInfos });
        // write rows
        this.document.onRow =(row) => {
            var rowInfo = [];
            for (let i = 0; i < row.length; i++) {
                rowInfo.push(this.document.valToString(row[i],i));
            }
            var cmd = { command: 'row' };
            cmd.data = rowInfo;
            cmd.recNo = row.recNo;
            cmd.ordNo = row.ordNo;
            cmd.deleted = row.deleted;
            this.webviewPanel.webview.postMessage(cmd);
        }
        this.requestedRows = undefined;
    }

    goto(val) {
        if(this.document.sortedIdx) {
            val = this.document.sortedIdx.indexOf(val)+1;
        }
        this.webviewPanel.webview.postMessage({ command: 'goto', data: val });
    }
    setEncoding(val) {
        const doc = this.document;
        doc.iconvEncode = val;
        doc.statusBarItem.text = val;
        if( doc.statusBarItem.text in SUPPORTED_ENCODINGS) {
            doc.statusBarItem.text = SUPPORTED_ENCODINGS[doc.statusBarItem.text].labelShort;
        }
        this.webviewPanel.webview.postMessage({ command: 'reload' });
    }
};

exports.dbfCustomEditor = dbfCustomEditor;
