const assert = require('assert');
const vscode = require('vscode');
const path = require("path");
const {dbfDocument} = require('../../src/dbfDocument');

function testDBF(fileName,result, prepare) {
	return new Promise((resolve) =>{
		var dbf = new dbfDocument(vscode.Uri.file(path.resolve(__dirname,"..","harbour-generator",fileName)))
		dbf.onReady = () => {
			assert.strictEqual(dbf.info.nRecord, result.length, "numRecord");
			dbf.readRows(1,3);
		}
		dbf.onRow = (row) => {
			assert.strictEqual(row.length, result[row.recNo-1].length, "row "+row.recNo+" # field");
			if(prepare) prepare(row);
			for(i=0;i<row.length;i++) {
				assert.strictEqual(row[0], result[row.recNo-1][0], "row "+row.recNo+" field len "+0);
				assert.strictEqual(row[1], result[row.recNo-1][1], "row "+row.recNo+" field len "+1);
				assert.strictEqual(row[2], result[row.recNo-1][2], "row "+row.recNo+" field len "+2);
			}
			if(row.recNo==result.length)
				resolve();
		}
	});
}

suite('dbf Reading Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	var str = [
		["first row","a very long text","ナルト うずまき"],
		["second row","Nel mezzo del cammin di nostra vita \\ mi ritrovai per una selva oscura, \\ che la diritta via era smarrita.  \\ Ahi quanto a dir qual era e' cosa dura \\ esta selva selvaggia e aspra e forte \\ che nel pensier rinova la paura!","神曲"],
		["third  row", "It is not important","تم حذف الخط"]
	];
	test('String Test',  () => testDBF("TestString.dbf",str,(r) => r.forEach((x,i) => r[i]=x.trim())));
	test('Varstring Test',  () => testDBF("TestVarString.dbf",str));
});
