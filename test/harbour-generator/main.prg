request DBFCDX, HB_CODEPAGE_UTF8EX

proc main()
    string()
    varString()
return

proc string()
    local txt
    field simple,long, unicode
    HB_CDPSELECT("UTF8EX")
    if File("TestString.dbf")
        FErase("TestString.dbf")
    endif
    dbCreate("TestString", {;
        {"SIMPLE","C",30,0}, ;
        {"LONG","C",300,0}, ;
        {"UNICODE","C:U",30,0} ; //Unicode
    },"DBFCDX",.T.)
    dbAppend()
    field->simple := "first row"
    field->long := "a very long text"
    txt := "ナルト うずまき"
    field->unicode := txt
    ? txt,field->unicode
    dbAppend()
    field->simple := "second row"
    field->long := "Nel mezzo del cammin di nostra vita \"+;
            " mi ritrovai per una selva oscura, \"+;
            " che la diritta via era smarrita.  \"+;
            " Ahi quanto a dir qual era e' cosa dura \"+;
            " esta selva selvaggia e aspra e forte \"+;
            " che nel pensier rinova la paura!"
    txt := "神曲"
    field->unicode := txt
    ? txt,field->unicode
    dbAppend()
    field->simple := "third  row"
    field->long := "It is not important"
    txt := "تم حذف الخط"
    field->unicode := txt
    ? txt,field->unicode
    dbDelete()
return

proc varString()
    Local txt
    field simple,long, unicode
    HB_CDPSELECT("UTF8EX")
    if File("TestVarString.dbf")
        FErase("TestVarString.dbf")
    endif
    dbCreate("TestVarString", {;
        {"SIMPLE","Q",30,0}, ;
        {"LONG","Q",300,0}, ;
        {"UNICODE","Q:U",30,0} ; //Unicode
    },"DBFCDX",.T.)
    dbAppend()
    field->simple := "first row"
    field->long := "a very long text"
    txt := "ナルト うずまき"
    field->unicode := txt
    ? txt,field->unicode
    dbAppend()
    field->simple := "second row"
    field->long := "Nel mezzo del cammin di nostra vita \"+;
            " mi ritrovai per una selva oscura, \"+;
            " che la diritta via era smarrita.  \"+;
            " Ahi quanto a dir qual era e' cosa dura \"+;
            " esta selva selvaggia e aspra e forte \"+;
            " che nel pensier rinova la paura!"
    txt := "神曲"
    field->unicode := txt
    ? txt,field->unicode
    dbAppend()
    field->simple := "third  row"
    field->long := "It is not important"
    txt := "تم حذف الخط"
    field->unicode := txt
    ? txt,field->unicode
    dbDelete()
return
