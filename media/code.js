/* eslint-env browser */

window.addEventListener("message", ev => {
    switch(ev.data.command) {
        case "header":
            header(ev.data.data, ev.data.lens);
            break;
        case "row":
            row(ev.data.recno, ev.data.data, ev.data.deleted, ev.data.cols)
            break;
        case "info":
            info(ev.data.data,ev.data.cols);
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
    window.postMessage({"command": "headerDone"});
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
    var dest = document.getElementById("recNo"+idx);
    if(!dest) return;
    if(dest.className.indexOf("empty")>=0) {
        dest.className = dest.className.replace("empty","");
        addCols(dest,colInfo);
    }
    for (let id = 0; id < data.length; id++) {
        dest.children[id+1].textContent = data[id];
    }
}

function info(data, cols) {
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

    var body = document.getElementsByTagName("tbody")[0];
    body.innerHTML="";
    for(let i=0;i<data.nRecord;i++) {
        var dest = document.createElement("tr");
        dest.id = "recNo"+(i+1);
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
}
