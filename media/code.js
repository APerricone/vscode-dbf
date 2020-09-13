window.addEventListener("message", ev => {
    switch(ev.data.command) {
        case "header":
            header(ev.data.data, ev.data.lens);
            break;
        case "row":
            row(ev.data.recno, ev.data.data, ev.data.deleted, ev.data.cols)
            break;
        case "info":
            info(ev.data.data);
    }
});

window.document.addEventListener("readystatechange", () => {
    window.postMessage({"command": "readystatechange", "readyState": document.readyState});
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
        cell.style = `width: ${data[id].len}ch; `
        switch(data[id].type) {
            case "D":
                cell.style = "width: 10ch;"
                break;
            case "T":
                cell.style = "width: 8ch;"
                break;
            case "@":
                cell.style = "width: 22ch;"
                break;
            }
    });
    window.postMessage({"command": "headerDone"});
}

function row(idx,data,deleted, colInfo) {
    var body = document.getElementsByTagName("tbody")[0];
    var dest = document.createElement("tr");
    var cell = document.createElement("td");
    cell.textContent = idx;
    dest.appendChild(cell);
    setRowElement(dest,data,"td",(cell,id) => {
        var st = "";
        switch(colInfo[id].type) {
            case "N":
                st = "text-align: right;"
                break;
        }
        if(deleted)
            st += "text-decoration: line-through;"
        cell.style = st;
    });
    body.appendChild(dest);
}

function info(data) {
    var dest = document.getElementById("info-cnt");
    var txt = "<h1>DBF Informations</h1>";
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            txt+=`<p><b>${key}:</b> ${data[key]}</p>`
        }
    }
    dest.innerHTML = txt;
}
