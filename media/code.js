/* eslint-env browser */
const vscode = acquireVsCodeApi();

var dbfInfo, dbfCols;
var selRow=1, selCol=1;

window.addEventListener("message", ev => {
    switch(ev.data.command) {
        case "info":
            dbfInfo = ev.data.data;
            dbfCols = ev.data.cols;
            info();
            break;
        case "row":
            row(ev.data.recno, ev.data.data, ev.data.deleted)
            break;
        case "goto":
            goto(ev.data.data);
            break;
        }
});

function info() {
    // set up information on right
    var dest = document.getElementById("info-cnt");
    var txt = "<h1>DBF Informations</h1>";
    txt+=`<p><b>version:</b> ${dbfInfo.version}</p>`
    txt+=`<p><b>last modified date:</b> ${dbfInfo.year+1900}-${dbfInfo.month}-${dbfInfo.day}</p>`
    txt+=`<p><b># records:</b> ${dbfInfo.nRecord}</p>`
    txt+= "<h2>Columns</h2>";
    for (let i = 0; i < dbfCols.length; i++) {
        const colInfo = dbfCols[i];
        if(colInfo.type=="N")
            txt+=`<p><b class="nCol">${colInfo.name}</b>(${colInfo.type}:${colInfo.len}.${colInfo.dec})</p>`
        else
            txt+=`<p><b class="${colInfo.type.toLowerCase()}Col">${colInfo.name}</b>(${colInfo.type}:${colInfo.len})</p>`
    }
    dest.innerHTML = txt;
    // set up columns
    header(dbfCols);
    // setup  rows
    setupRows(dbfCols,dbfInfo);
    // setup scrolling
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.onscroll = onScroll
    onScroll();
}

function header(data) {
    var dest = document.getElementsByTagName("thead");
    dest = dest[0].children[0];

    var cell = document.createElement("th");
    cell.className = "noborder";
    dest.appendChild(cell);

    for (let id = 0; id < data.length; id++) {
        /** @type {HTMLElement} */
        var cell = document.createElement("th");
        cell.textContent = data[id].name;
        cell.title = data[id].name;
        cell.style.width = cell.style.maxWidth = cell.style.minWidth = data[id].len+"ch";
        cell.style.overflow = "hidden";
        switch(data[id].type) {
            case "D":
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = "10ch";
                break;
            case "T":
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = "8ch";
                break;
            case "@":
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = "22ch";
                break;
            }
        dest.appendChild(cell);
    }
}

function setupRows() {
    var body = document.getElementsByTagName("tbody")[0];
    body.innerHTML="";
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;;
    var nLine = Math.min(Math.floor(h1/h2)-2,dbfInfo.nRecord);
    document.getElementById("empty-scroll").style.height = (h2*(dbfInfo.nRecord+2)).toFixed(0)+"px";
    for(let i=0;i<nLine;i++) {
        var dest = document.createElement("tr");
        dest.id = "row"+(i+1);
        dest.className="empty";
        var cell = document.createElement("td");
        cell.textContent = (i+1)+"";
        cell.style.textAlign = "right"
        dest.appendChild(cell);
        cell = document.createElement("td");
        cell.colSpan = dbfCols.length;
        cell.className = "loading";
        dest.appendChild(cell);
        for (let id = 0; id < dbfCols.length; id++) {
            /** @type {HTMLElement} */
            var cell = document.createElement("td");
            switch(dbfCols[id].type) {
                case "C":
                    cell.style.whiteSpace = "pre";
                    cell.className = "cCol";
                    break;
                case "N":
                    cell.style.textAlign = "right"
                    cell.className = "nCol";
                    break;
                case "L":
                    cell.className = "lCol";
                    break;
                }
            dest.appendChild(cell);
        }
        body.appendChild(dest);
    }
}


function row(idx,data,deleted) {
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var id = idx-firstPos;
    var dest = document.getElementById("row"+(id));
    if(!dest) return;
    dest.classList.remove("empty");
    dest.classList.add("filled");
    if(deleted) {
        dest.classList.add("deleted");
    } else {
        dest.classList.remove("deleted");
    }
    dest.children[0].textContent = idx+"";
    for (let id = 0; id < data.length; id++) {
        if(idx==selRow && (id+1)==selCol) {
            dest.children[id+2].classList.add("selected");
        } else
            dest.children[id+2].classList.remove("selected");
        dest.children[id+2].textContent = data[id];
    }
}


function copyRow(destId, srcId) {
    var dest = document.getElementById("row"+(destId+1));
    var src = document.getElementById("row"+(srcId+1));
    if((!dest) || (!src)) return;
    if(src.classList.contains("empty")) {
        dest.classList.add("empty");
        dest.classList.remove("filled");
        return;
    }
    dest.classList.remove("empty");
    dest.classList.add("filled");
    if(src.classList.contains("deleted")) {
        dest.classList.add("deleted");
    } else {
        dest.classList.remove("deleted");
    }
    for (let id = 1; id < dest.children.length; id++) {
        dest.children[id].textContent = src.children[id].textContent;
    }
}

function askRows() {
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight
    var nRows = Math.floor(h1/h2)-2;
    var tableCnt = document.getElementById("table-cnt");
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var min=dbfInfo.nRecord, max = 1;
    for(let i=0;i<nRows;i++) {
        var dest = document.getElementById("row"+(i+1));
        if(dest && dest.classList.contains("empty")) {
            var n = (i+1+firstPos);
            if(min>n) min=n;
            if(max<n) max=n;
        }
    }
    vscode.postMessage({"command": "rows", "min":min, "max": max});
}

var scrollTimeout, lastTop = -10000;
function onScroll() {
    var tableCnt = document.getElementById("table-cnt");
    if(tableCnt.scrollTop==lastTop)
        return;
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight;

    var maxTop = ((dbfInfo.nRecord+3)*h2)-h1;
    tableCnt.children[0].style.top=Math.max(0,Math.min(maxTop,tableCnt.scrollTop))+"px";

    var nRows = Math.floor(h1/h2)-2;
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var oldFirst = Math.floor(lastTop / h2);
    if(oldFirst==firstPos) return;
    lastTop = tableCnt.scrollTop;
    var minEmpty = 0, maxEmpty = nRows;
    if(firstPos==3)
        firstPos=firstPos;
    if(oldFirst<firstPos && oldFirst>firstPos-nRows) {
        var delta = firstPos - oldFirst;
        for(let i=0;i<nRows-delta;i++) copyRow(i, i+delta)
        minEmpty=nRows-delta;
    } else if(oldFirst>firstPos && oldFirst<firstPos+nRows) {
        var delta = oldFirst - firstPos;
        for(let i=nRows-1;i>=delta;i--) copyRow(i, i-delta)
        maxEmpty=delta;
    }
    for(let i=minEmpty;i<maxEmpty;i++) {
        var dest = document.getElementById("row"+(i+1));
        if(dest) {
            dest.classList.remove("filled");
            dest.classList.add("empty");
            dest.children[0].textContent = (i+1+firstPos)+"";
        }
    }
    if(scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout=setTimeout(askRows, 100);
}

function goto(line) {
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.scrollTop = line*h2 - h1/2;
    onScroll();

}