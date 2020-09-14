/* eslint-env browser */

const vscode = acquireVsCodeApi();

window.addEventListener("message", ev => {
    switch(ev.data.command) {
        case "row":
            row(ev.data.recno, ev.data.data, ev.data.deleted, ev.data.cols)
            break;
        case "info":
            info(ev.data.data,ev.data.cols);
            break;
        case "goto":
            goto(ev.data.data);
            break;
        }
});

function setRowElement(dest,data,type, extra) {
    for (let i = 0; i < data.length; i++) {
        /** @type {HTMLElement} */
        var cell = document.createElement(type);
        cell.textContent = data[i];
        if(extra) extra(cell,i);
        dest.appendChild(cell);
    }
}

function header(data) {
    var dest = document.getElementsByTagName("thead");
    dest = dest[0].children[0];

    var cell = document.createElement("th");
    cell.className = "noborder";
    cell.style = "width: 1ch;"
    dest.appendChild(cell);

    setRowElement(dest,data,"th", (cell,id) => {
        cell.textContent = data[id].name;
        cell.title = data[id].name;
        cell.style.width = cell.style.maxWidth = cell.style.minWidth = data[id].len+"ch";
        cell.style.overflow = "hidden";
        //`width: ${data[id].len}ch; max-width: ${data[id].len}ch; `
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
    });
}

function addCols(dest,colInfo) {
    dest.removeChild(dest.children[1]); //empty colspan cell
    for (let id = 0; id < colInfo.length; id++) {
        /** @type {HTMLElement} */
        var cell = document.createElement("td");
        switch(colInfo[id].type) {
            case "C":
                cell.style.whiteSpace = "pre";
                break;
            case "N":
                cell.style.textAlign = "right"
                break;
            }
        dest.appendChild(cell);
    }
}

function row(idx,data,deleted, colInfo) {
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.children[0].style.top=tableCnt.scrollTop+"px";
    var firstPos = Math.max(1,Math.floor(tableCnt.scrollTop / h2));
    var id = idx-firstPos;
    var dest = document.getElementById("row"+id);
    if(!dest) return;
    if(dest.className.indexOf("empty")>=0) {
        dest.className = dest.className.replace("empty","");
        addCols(dest,colInfo);
    }
    dest.children[0].textContent = idx+"";
    for (let id = 0; id < data.length; id++) {
        dest.children[id+1].textContent = data[id];
    }
}

function onScroll() {
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight
    var nRows = Math.ceil(h1/h2);
    var tableCnt = document.getElementById("table-cnt");
    var firstPos = Math.max(1,Math.floor(tableCnt.scrollTop / h2));
    vscode.postMessage({"command": "rows", "min":firstPos, "max": firstPos+nRows});
}

function info(data, cols) {
    // set up information on right
    var dest = document.getElementById("info-cnt");
    var txt = "<h1>DBF Informations</h1>";
    txt+=`<p><b>version:</b> ${data.version}</p>`
    txt+=`<p><b>last modified date:</b> ${data.year+1900}-${data.month}-${data.day}</p>`
    txt+=`<p><b># records:</b> ${data.nRecord}</p>`
    txt+= "<h2>Columns</h2>";
    for (let i = 0; i < cols.length; i++) {
        const colInfo = cols[i];
        if(colInfo.type=="N")
            txt+=`<p><b>${colInfo.name}</b>(${colInfo.type}:${colInfo.len}.${colInfo.dec})</p>`
        else
            txt+=`<p><b>${colInfo.name}</b>(${colInfo.type}:${colInfo.len})</p>`
    }
    dest.innerHTML = txt;
    // set up columns
    header(cols);
    // setup empty rows
    var body = document.getElementsByTagName("tbody")[0];
    body.innerHTML="";
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;
    var nLine = Math.min(Math.ceil(h1/h2)-2,data.nRecord);
    document.getElementById("empty-scroll").style.height = (h2*data.nRecord)+"px";
    for(let i=0;i<nLine;i++) {
        var dest = document.createElement("tr");
        dest.id = "row"+(i+1);
        dest.className="empty";
        var cell = document.createElement("td");
        cell.textContent = (i+1)+"";
        cell.style.textAlign = "right"
        dest.appendChild(cell);
        cell = document.createElement("td");
        cell.colSpan = cols.length;
        dest.appendChild(cell);
        body.appendChild(dest);
    }
    // setup scrolling
    var tableCnt = document.getElementById("table-cnt");
    var timeOut;
    tableCnt.onscroll = () => {
        tableCnt.children[0].style.top=tableCnt.scrollTop+"px";
        if(timeOut) clearTimeout(timeOut);
        timeOut=setTimeout(onScroll, 100);
    };
    timeOut=setTimeout(onScroll, 100);
}

function goto(line) {
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.scrollTop = line*h2 - h1/2;
    onScroll();

}