const vscode = require('vscode');
const fs = require('fs');

/**
 * Harbour\include\hbdbf.h
 * @typedef {Object} dbfHeader
 * @property {Number} version
 * @property {Number} year
 * @property {Number} month
 * @property {Number} day
 * @property {Number} nRecord
 * @property {Number} headerLen
 * @property {Number} recordLen
 * @property {Number} transaction  1-transaction begin
 * @property {Number} encrypted 1-encrypted table
 * @property {Number} hasTags bit filed: 1-production index, 2-memo file in VFP
 * @property {Number} codePage
 */
/**
 *
 * @typedef {Object} dbfColInfo
 * @property {String} name
 * @property {'C'|'N'|'L'|'D'|'T'|'@'} type
 * @property {Number} len
 * @property {Number} dec
 * @property {Number} flags
 * @property {Number} counter
 * @property {Number} step
 * @property {Number} tag
 * @property {Number} offset - calculated value of the offset of this column on buffer
 */

/**
 * @extends vscode.CustomDocument
 */
class dbfDocument {
    /**
     *
     * @param {vscode.Uri} uri
     */
    constructor(uri) {
        this.uri = uri;
        if(uri.scheme != "file") return;
        this.onReady = () => {};
        this.ready = false;
        // eslint-disable-next-line no-unused-vars
        this.onRow = (row) => {};
        /** index of sort column, or undefined if no sort info
         * @type {Number} */
        this.sorted = undefined;
        /** @type {boolean} */
        this.sorted_desc = false;
        /** sorted recno, it is an array of length info.nRecord.
         * @type {Number[]}
        */
        this.sortedIdx = undefined; //
        this.sorting = false;
        this.onSorted = () => {};
        // Init
        this.readHeader();
    }

    readHeader() {
        fs.open(this.uri.fsPath,'r', (err,fd)=>{
            fs.read(fd,Buffer.alloc(2),0,2,8,(err,nByte,hl)=>{
                var headerLen = hl.readUInt16LE(0);
                var buff = Buffer.alloc(headerLen);
                fs.read(fd,buff,0,headerLen,0,(err,nByte,buff)=>{
                    this.setInfo(buff);
                    fs.close(fd);
                });
            });
        });
    }

    /**
     *  @param {Buffer} data
     */
    setInfo(data) {
        /** @type {dbfHeader} */
        this.info = {};
        this.info.version = data.readInt8(0);
        this.info.year =  data.readInt8(1);
        this.info.month =  data.readInt8(2);
        this.info.day =  data.readInt8(3);
        this.info.nRecord =  data.readUInt32LE(4);
        this.info.headerLen = data.readUInt16LE(8);
        this.info.recordLen = data.readUInt16LE(10);
        //12 // spazio di 2
        this.info.transaction =  data.readInt8(14);
        this.info.encrypted =  data.readInt8(15);
        // 16 // spazio di 12
        this.info.hasTags =  data.readInt8(28);
        this.info.codePage =  data.readInt8(29);
        // 30 // spazio di 2
        /** @type {dbfColInfo[]} */
        this.colInfos = [];
        var nCol = (this.info.headerLen>>5)-1;
        var off = 1;
        for(var colId=0;colId<nCol;colId++) {
            /** @type {dbfColInfo} */
            var colInfo = {};
            var idx = 32+(colId<<5);
            colInfo.name = data.toString("ascii",idx,idx+10).replace(/\0+/,"");
            colInfo.type= String.fromCharCode(data.readUInt8(idx+11));
            //12 // spazio di 4
            colInfo.len = data.readInt8(idx+16);
            colInfo.dec = data.readInt8(idx+17);
            colInfo.flags = data.readInt8(idx+18);
            colInfo.counter = data.readInt32LE(idx+19);
            colInfo.step  = data.readInt8(idx+23);
            // 24 // spazio di 7
            colInfo.tag = data.readInt8(idx+31);
            // calculated value
            colInfo.offset = off;
            off+=colInfo.len;

            this.colInfos.push(colInfo);
        }
        this.ready = true;
        this.onReady(this);
    }


    readRows(start,end) {
        var off = this.info.headerLen + this.info.recordLen * (start - 1)
        var recordBuff = Buffer.alloc(this.info.recordLen);
        var idx=start;
        if(this.sortedIdx) {
            off=this.info.headerLen + this.info.recordLen * (this.sortedIdx[idx] - 1)
        }
        fs.open(this.uri.fsPath,'r', (err,fd)=>{
            var cb = (err,nByte,buff)=>{
                this.readRowFromBuffer(idx,buff);
                idx++;
                if(this.sortedIdx) {
                    off=this.info.headerLen + this.info.recordLen * (this.sortedIdx[idx] - 1)
                } else off+=this.info.recordLen;
                if(idx<=end)
                    fs.read(fd,recordBuff,0,this.info.recordLen,off,cb);
                else
                    fs.close(fd);
            };
            fs.read(fd,recordBuff,0,this.info.recordLen,off,cb);
        });
    }

    /**
     *
     * @param {Buffer} data
     * @param {Number} off
     * @param {dbfColInfo} col
     * @param {Boolean} cmpMode If true the value returned is readed faster and is easer to compare.
     */
    readValueFromBuffer(data,off,col, cmpMode) {
        var str = data.toString("ascii",off,off+col.len).replace(/\0+/,"");
        switch (col.type) {
            case "C": return str;
            case "N":
                // if(cmpMode) return str;
                if(str.trim().length==0)
                    return 0;
                else
                    return parseFloat(str);
            case "L":
                return str =='T';
            case "D":
                return cmpMode? str : new Date(str.substr(0,4),str.substr(4,2)-1,str.substr(6,2));
            case "T":
                if((col.flags & 4) == 0)
                    throw "da fare";
                if(cmpMode) return data.readInt32LE(off);
                var val = new Date(0,0,1);
                val.setFullYear(0);
                val.setMilliseconds(data.readInt32LE(off));
                return val;
            case "@":
                var val=new Date(0,0,0);
                if(cmpMode) return {days:data.readInt32LE(off), msec: data.readInt32LE(off+4)};
                val.setDate(data.readInt32LE(off)-2414989)
                val.setMilliseconds(data.readInt32LE(off+4));
                return val;
            default:
                if(cmpMode) return 0;
                return col.type + "unsupported";
        }
    }

    /**
     *
     * @param {Number} idx
     * @param {Buffer} data
     */
    readRowFromBuffer(idx,data) {
        var ret = [];
        ret.recNo = idx;
        if(this.sortedIdx)
            ret.ordNo = this.sortedIdx[idx];
        else
            ret.ordNo = idx;
        ret.deleted = String.fromCharCode(data.readInt8(0)) == '*';
        var off = 1;
        for (let i = 0; i < this.colInfos.length; i++) {
            const col = this.colInfos[i];
            ret.push(th.readValueFromBuffer(data,off,col));
            off += col.len;
        }
        this.onRow(ret);
    }

    /**
     *
     * @param {dbfColInfo} col
     */
    getCmpFunc(col) {
        switch (col.type) {
            case "C":
            case "D": // returns a string so as not to waste time creating a Date object
                return (a,b) => a<b? -1 : a>b? 1 : 0;
            case "N":
            case "T":  // returns a number so as not to waste time creating a Date object
                return (a,b) => a-b;
            case "L":
                return (a,b) => a==b? 0 : a? 1 : -1;
            case "@": // {days, msec}
                return (a,b) => a[0]!=b[0]? a[0]-b[0] : a[1]-b[1];
            default:
                break;
        }
    }

    sort(colId,desc) {
        if(typeof(colId)=="undefined") {
            // remove sort
        }
        // parameters validation
        if(typeof(colId)=="string") {
            var colname = colId;
            colId = this.colInfos.findIndex((v) => v.name == colname );
            if(codId<0) throw colName+" not found";
        }
        if(typeof(colId)!="number") throw "invalid parameter";
        if(colId<0) {
            if(this.sorted) {
                this.sorted = undefined;
                this.sortedIdx = undefined;
                this.sorting = false;
                this.onSorted();
            }
            return;
        }
        this.sorted = colId;
        this.sorted_desc = Boolean(desc);
        this.sorting = true;
        // read values
        var colInfo = this.colInfos[colId];
        var colData = Array(this.info.nRecord);
        var off = this.info.headerLen + colInfo.offset;
        var recordBuff = Buffer.alloc(colInfo.len);
        var idx=1;
        var readed;
        fs.open(this.uri.fsPath,'r', (err,fd)=>{
            var cb = (err,nByte,buff)=>{
                colData[idx-1] = this.readValueFromBuffer(buff,0,colInfo, true);
                idx++;
                off+=this.info.recordLen;
                if(idx<this.info.nRecord)
                    fs.read(fd,recordBuff,0,colInfo.len,off,cb);
                else {
                    fs.close(fd);
                    readed();
                }
            };
            fs.read(fd,recordBuff,0,colInfo.len,off,cb);
        });
        // all record readed
        readed = () => {
            this.sortedIdx = Array.from({length: this.info.nRecord}, (_, i) => i + 1);
            var sortFn = this.getCmpFunc(colInfo);
            if(this.sorted_desc) sortFn = (a,b) => -sortFn(); // brain-fuck
            this.sortedIdx.sort(sortFn);
            this.sorted();
        }

    }
}
exports.dbfDocument = dbfDocument;

