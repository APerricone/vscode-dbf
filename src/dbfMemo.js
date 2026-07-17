const fs = require('fs');
const path = require('path');

/** Never return more than this many bytes for a single memo */
const MAX_MEMO_LEN = 1 << 20;

/**
 * Reader for the memo file (.FPT FoxPro / .DBT dBase) that accompanies a .DBF.
 *
 * FPT layout: 512 byte header, block size as UInt16BE at offset 6.
 *   Each block starts with UInt32BE type (0=picture, 1=text, 2=object)
 *   followed by UInt32BE data length.
 * DBT layout: 512 byte header, block size as UInt16LE at offset 20 (dBase IV,
 *   0 means dBase III fixed 512). dBase IV blocks start with FF FF 08 00 and
 *   UInt32LE length (including the 8 byte header), dBase III memos are
 *   terminated by 0x1A.
 */
class dbfMemoFile {
    /**
     * Locate and open the memo file matching a dbf path.
     * The match is case insensitive so it also works on
     * case sensitive file systems.
     * @param {String} dbfPath path of the .dbf file
     * @returns {dbfMemoFile|undefined}
     */
    static open(dbfPath) {
        try {
            var dir = path.dirname(dbfPath);
            var base = path.basename(dbfPath).replace(/\.[^.]*$/, "").toLowerCase();
            var names = fs.readdirSync(dir);
            var entry = names.find((n) => {
                var m = n.toLowerCase();
                return m == base + ".fpt" || m == base + ".dbt";
            });
            if (!entry) return undefined;
            return new dbfMemoFile(path.join(dir, entry));
        } catch (e) {
            return undefined;
        }
    }

    /**
     * @param {String} filePath path of the .fpt/.dbt file
     */
    constructor(filePath) {
        this.path = filePath;
        this.isFPT = /\.fpt$/i.test(filePath);
        this.fd = fs.openSync(filePath, 'r');
        this.fileSize = fs.fstatSync(this.fd).size;
        var header = Buffer.alloc(512);
        fs.readSync(this.fd, header, 0, 512, 0);
        if (this.isFPT) {
            this.blockSize = header.readUInt16BE(6);
            if (this.blockSize == 0) this.blockSize = 64;
        } else {
            this.blockSize = header.readUInt16LE(20);
            if (this.blockSize == 0) this.blockSize = 512;
        }
    }

    dispose() {
        if (this.fd != undefined) {
            fs.closeSync(this.fd);
            this.fd = undefined;
        }
    }

    /**
     * Read the memo stored at the given block number.
     * @param {Number} block 1 based block number from the dbf record
     * @returns {{binary: boolean, data: Buffer}|null} null when the block is invalid
     */
    read(block) {
        if (this.fd == undefined || !(block > 0)) return null;
        var pos = block * this.blockSize;
        if (pos >= this.fileSize) return null;
        try {
            if (this.isFPT) return this.readFPT(pos);
            return this.readDBT(pos);
        } catch (e) {
            return null;
        }
    }

    /** @private */
    readFPT(pos) {
        var head = Buffer.alloc(8);
        if (fs.readSync(this.fd, head, 0, 8, pos) < 8) return null;
        var type = head.readUInt32BE(0);
        var len = head.readUInt32BE(4);
        len = Math.min(len, MAX_MEMO_LEN, this.fileSize - pos - 8);
        if (len < 0) return null;
        var data = Buffer.alloc(len);
        fs.readSync(this.fd, data, 0, len, pos + 8);
        return { binary: type != 1, data: data };
    }

    /** @private */
    readDBT(pos) {
        var head = Buffer.alloc(8);
        var nRead = fs.readSync(this.fd, head, 0, 8, pos);
        if (nRead <= 0) return null;
        if (nRead >= 8 && head.readUInt32LE(0) == 0x0008FFFF) {
            // dBase IV block: length includes the 8 byte header
            var len = head.readUInt32LE(4) - 8;
            len = Math.min(len, MAX_MEMO_LEN, this.fileSize - pos - 8);
            if (len < 0) return null;
            var data = Buffer.alloc(len);
            fs.readSync(this.fd, data, 0, len, pos + 8);
            return { binary: false, data: data };
        }
        // dBase III style: text terminated by 0x1A
        var chunks = [];
        var total = 0;
        var chunk = Buffer.alloc(this.blockSize);
        var readPos = pos;
        for (;;) {
            var n = fs.readSync(this.fd, chunk, 0, this.blockSize, readPos);
            if (n <= 0) break;
            var end = chunk.subarray(0, n).indexOf(0x1A);
            if (end >= 0) {
                chunks.push(Buffer.from(chunk.subarray(0, end)));
                break;
            }
            chunks.push(Buffer.from(chunk.subarray(0, n)));
            total += n;
            readPos += n;
            if (n < this.blockSize || total >= MAX_MEMO_LEN) break;
        }
        return { binary: false, data: Buffer.concat(chunks) };
    }
}

exports.dbfMemoFile = dbfMemoFile;
