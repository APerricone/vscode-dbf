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
			for(let i=0;i<row.length;i++) {
				assert.deepStrictEqual(row[i], result[row.recNo-1][i], "row "+row.recNo+" field "+(i+1));
			}
			if(row.recNo==result.length)
				resolve();
		}
	});
}

/**
 *
 * @param {Date} dt
 */
function onlyDate(dt) {
	var val = new Date(Date.UTC(0,dt.getUTCMonth(),dt.getDate()));
	val.setUTCFullYear(dt.getUTCFullYear());
	return val;
}
/**
 *
 * @param {Date} dt
 */
function onlyTime(dt) {
	var val = new Date(dt);
	//val.setUTCFullYear(0);
	//val.setUTCHours();
	//val.setHours(dt.getHours(),dt.getMinutes(),dt.getSeconds());
	val.setFullYear(0,0,1);
	val.setHours(dt.getHours(),dt.getMinutes(),dt.getSeconds());
	return val;
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
	var baseDates = [new Date("2020-01-01 12:34:56"), new Date("1900-01-01 23:59:59"), new Date("2345-12-31 00:00:00")]
	var dateTime = [];
	for (let i = 0; i < baseDates.length; i++) {
		const e = baseDates[i];
		dateTime.push([(i!=1), onlyDate(baseDates[i]),onlyDate(baseDates[i]),onlyDate(baseDates[i]),onlyTime(baseDates[i]),baseDates[i] ]);
	}
	test('DateTime Test',  () => testDBF("TestLogicalAndDateTime.dbf",dateTime));
});
